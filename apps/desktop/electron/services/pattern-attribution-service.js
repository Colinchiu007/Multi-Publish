// @ts-check
/**
 * PatternAttributionService — 模式效果归因重算
 *
 * 从「performance_snapshot ⋈ tracked_content ⋈ rewrite_history.knowledge_refs ⋈ viral_pattern_cards」
 * 纯重算四维模式效果（hook_type / emotion_curve / narrative_structure / cta_style），
 * 写入 pattern_performance（全量替换，幂等）。
 *
 * 触发（P2-6d 起两条都真实存在，此前只有手动那一条，注释与代码漂了整整一轮）：
 *  ① 回采巡检收口 —— PerformanceRecrawlService.processRound 在**本轮处理过 ≥1 条到期内容**时
 *     经 setAfterRound 回调触发（接线见 bootstrap/phase3-services.js）；0 到期不触发，
 *     否则每天白做一次全表 DELETE+INSERT，还把 computed_at 刷成"刚更新过"的假象；
 *  ② IPC 手动触发 —— performance:recompute-attribution（效果洞察页的重算按钮）。
 * 聚合桶的键是 (归属, 维度, 取值)：两个账号的同模式样本绝不平均成一行。
 * engagement_score = avg_likes + avg_comments + avg_favorites × 2（首版启发式，常量区可调）。
 */
const log = require('./logger')
const { LEGACY_OWNER_SUBJECT } = require('./store-schema')

const DIMENSIONS = ['hook_type', 'emotion_curve', 'narrative_structure', 'cta_style']

/**
 * 归属归桶：与存储层 `_ownerPredicate`（performance-loop-store.js:48）同一套三态语义 ——
 * NULL / 空串 / `__legacy__` 折成同一个 legacy 桶。
 * 不归一的后果：同一个人的数据因写入年代不同散在三个桶里，legacy 读档只能捞回其中一种，
 * 榜上的 sample_count 静默偏低，而"偏低"在界面上与"确实只有这些作品"完全同形。
 * @param {string|null|undefined} value
 * @returns {string} 归一后的桶键（legacy 返回 LEGACY_OWNER_SUBJECT）
 */
function _ownerBucket (value) {
  if (value === undefined || value === null) return LEGACY_OWNER_SUBJECT
  const s = String(value).trim()
  return s ? s : LEGACY_OWNER_SUBJECT
}

class PatternAttributionService {
  constructor(opts) {
    opts = opts || {}
    this._store = opts.store || null
  }

  setStore(store) { this._store = store }

  /**
   * 全量重算归因（纯函数式：每次从快照重算，天然支持未来按时间窗分版本）
   * @returns {{ code: number, data?: object, message?: string }}
   */
  recomputeAll() {
    if (!this._store) return { code: -1, message: 'store 未注入' }
    try {
      // 1. 取全部 tracked_content（带 rewrite_history_id）
      const tracked = this._listAllTracked()
      // 空数据也要清空聚合表（幂等语义：重算后表内容 = 当前事实）
      if (tracked.length === 0) {
        this._store.replacePatternPerformance([])
        return { code: 0, data: { dimensions: 0, rows: 0 } }
      }

      // 2. 逐条关联：rewrite_history.knowledge_refs → viral_library id → pattern_card
      //    聚合容器：**归属 → dimension → value → 桶**。归属必须在最外层：
      //    两个账号的同模式样本若进同一个桶，界面上呈现为"一行看着合理的平均值"，
      //    谁也不会发现那是别人的数据（QM-6 归属口径；读侧按 owner_subject 筛）。
      const agg = {}
      let linkedCount = 0
      for (const t of tracked) {
        if (!t.rewrite_history_id) continue
        const history = this._store.getRewriteHistory(t.rewrite_history_id)
        if (!history || !Array.isArray(history.knowledge_refs)) continue
        const viralIds = history.knowledge_refs
          .filter(r => r && r.table === 'viral_library' && r.id)
          .map(r => String(r.id))
        if (viralIds.length === 0) continue

        // 取最新快照作为该内容的表现
        const snap = this._store.getLatestSnapshot(t.id)
        if (!snap) continue

        const ownerKey = _ownerBucket(t.owner_subject)
        if (!agg[ownerKey]) agg[ownerKey] = {}
        const byDim = agg[ownerKey]

        for (const vid of viralIds) {
          const card = this._getCard(vid)
          if (!card || card.status !== 'done') continue
          linkedCount++
          for (const dim of DIMENSIONS) {
            const value = card[dim]
            if (!value) continue
            if (!byDim[dim]) byDim[dim] = {}
            if (!byDim[dim][value]) byDim[dim][value] = { views: 0, likes: 0, comments: 0, favorites: 0, count: 0 }
            const bucket = byDim[dim][value]
            bucket.views += Number(snap.views) || 0
            bucket.likes += Number(snap.likes) || 0
            bucket.comments += Number(snap.comments) || 0
            bucket.favorites += Number(snap.favorites) || 0
            bucket.count++
          }
        }
      }

      // 3. 展开为 pattern_performance 行（每个归属各一组；行数上界 = 归属数 × 维度 × 取值）
      const rows = []
      for (const [ownerKey, byDim] of Object.entries(agg)) {
        for (const [dim, values] of Object.entries(byDim)) {
          for (const [value, bucket] of Object.entries(values)) {
            const n = Math.max(1, bucket.count)
            rows.push({
              dimension: dim,
              value,
              platform: '', // 首版不分平台（样本量小；扩展路线按平台分桶）
              // 归属桶回填：legacy 桶写成 null（与 tracked_content 的缺席形态一致，
              // 且 _ownerPredicate 的三态判据能同时捞到 NULL / '' / __legacy__）
              ownerSubject: ownerKey === LEGACY_OWNER_SUBJECT ? null : ownerKey,
              sampleCount: bucket.count,
              avgViews: bucket.views / n,
              avgLikes: bucket.likes / n,
              avgComments: bucket.comments / n,
              avgFavorites: bucket.favorites / n,
            })
          }
        }
      }

      this._store.replacePatternPerformance(rows)
      log.info('PatternAttribution', 'recomputed: ' + rows.length + ' rows from ' + linkedCount + ' links')
      return { code: 0, data: { dimensions: Object.keys(agg).length, rows: rows.length } }
    } catch (e) {
      log.warn('PatternAttribution', 'recompute failed: ' + e.message)
      return { code: -2, message: e.message }
    }
  }

  _listAllTracked() {
    try {
      return this._store.db
        ? this._store.db.prepare('SELECT * FROM tracked_content WHERE rewrite_history_id IS NOT NULL').all()
        : []
    } catch { return [] }
  }

  _getCard(viralItemId) {
    try {
      return this._store.getPatternCard ? this._store.getPatternCard(viralItemId) : null
    } catch { return null }
  }
}

module.exports = { PatternAttributionService, ATTRIBUTION_DIMENSIONS: DIMENSIONS }
