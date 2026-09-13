// @ts-check
/**
 * PatternAttributionService — 模式效果归因重算
 *
 * 从「performance_snapshot ⋈ tracked_content ⋈ rewrite_history.knowledge_refs ⋈ viral_pattern_cards」
 * 纯重算四维模式效果（hook_type / emotion_curve / narrative_structure / cta_style），
 * 写入 pattern_performance（全量替换，幂等）。
 *
 * 触发：每日回采巡检结束后 + IPC 手动触发。
 * engagement_score = avg_likes + avg_comments + avg_favorites × 2（首版启发式，常量区可调）。
 */
const log = require('./logger')

const DIMENSIONS = ['hook_type', 'emotion_curve', 'narrative_structure', 'cta_style']

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
      //    聚合容器：dimension → value → { samples: [{views,likes,comments,favorites}] }
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

        for (const vid of viralIds) {
          const card = this._getCard(vid)
          if (!card || card.status !== 'done') continue
          linkedCount++
          for (const dim of DIMENSIONS) {
            const value = card[dim]
            if (!value) continue
            if (!agg[dim]) agg[dim] = {}
            if (!agg[dim][value]) agg[dim][value] = { views: 0, likes: 0, comments: 0, favorites: 0, count: 0 }
            const bucket = agg[dim][value]
            bucket.views += Number(snap.views) || 0
            bucket.likes += Number(snap.likes) || 0
            bucket.comments += Number(snap.comments) || 0
            bucket.favorites += Number(snap.favorites) || 0
            bucket.count++
          }
        }
      }

      // 3. 展开为 pattern_performance 行
      const rows = []
      for (const [dim, values] of Object.entries(agg)) {
        for (const [value, bucket] of Object.entries(values)) {
          const n = Math.max(1, bucket.count)
          rows.push({
            dimension: dim,
            value,
            platform: '', // 首版不分平台（样本量小；扩展路线按平台分桶）
            sampleCount: bucket.count,
            avgViews: bucket.views / n,
            avgLikes: bucket.likes / n,
            avgComments: bucket.comments / n,
            avgFavorites: bucket.favorites / n,
          })
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
