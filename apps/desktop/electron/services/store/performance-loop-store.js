// @ts-check
/**
 * performance-loop-store — 效果闭环功能域 mixin
 *
 * 表：rewrite_history / tracked_content / performance_snapshot / pattern_performance
 * 闭环：改写历史 → 发布关联（tracked_content）→ 指标回采（snapshot）→ 模式归因（pattern_performance）
 * 依赖：logger
 */
const log = require('../logger')
// 归属桶常量与 publish-history / store-schema 同源，禁止在这里第二份写死字符串
const { LEGACY_OWNER_SUBJECT } = require('../store-schema')
const { OVERVIEW_TRACKED_LIMIT, OVERVIEW_SNAPSHOT_LIMIT } = require('../performance-overview')

function _genId () {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function _parseJson (str, fallback) {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

const RECRAWL_STATUSES = new Set(['pending', 'ok', 'failed', 'unsupported', 'untrackable', 'manual'])

/**
 * 表在位性探测（看板读侧专用）。
 *
 * 为什么必须显式探而不能靠 try/catch：本仓的 sqlite 包装层对「表不存在」的查询**不抛错**，
 * `prepare()` 正常返回、`get()` 直接给 `undefined`（本机实测），于是 catch 分支永远走不到，
 * 查询失败会被渲染成「从未发布」这块空态（QM-6 后端轴 FB7）。探测成本是一次 sqlite_master 查询。
 * @param {object} db
 * @param {string} table
 */
function _tablePresent (db, table) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
  return Boolean(row)
}

/**
 * 归属过滤谓词（看板读侧）。口径与发布历史侧一致，两份卡片才不会互相打脸：
 *   - 身份可解析 → 只取该 subject；
 *   - 无身份服务（legacy 档）→ 只取「无归属桶」（NULL / 空串 / __legacy__），
 *     绝不把已归属账号的数据端给匿名态。
 * 三个条件缺一不可：sqlite 迁移写的是 '__legacy__'，旧数据是 NULL，手填可能是 ''。
 * @param {string|undefined|null} ownerSubject
 * @param {string} [alias] - 带 JOIN 时给列加前缀（如 't'）
 */
function _ownerPredicate (ownerSubject, alias) {
  const prefix = alias ? alias + '.' : ''
  const owner = typeof ownerSubject === 'string' && ownerSubject.trim() ? ownerSubject.trim() : null
  if (owner) return { sql: 'WHERE ' + prefix + 'owner_subject = ?', params: [owner] }
  return {
    sql: 'WHERE (' + prefix + 'owner_subject IS NULL OR TRIM(' + prefix + 'owner_subject) = ? OR ' + prefix + 'owner_subject = ?)',
    params: ['', LEGACY_OWNER_SUBJECT],
  }
}

module.exports = {
  // ===================== 改写历史 =====================

  addRewriteHistory (entry) {
    if (!this._ready) return null
    if (!entry || typeof entry.rewrittenContent !== 'string' || !entry.rewrittenContent.trim()) return null
    const id = String(entry.id || '') || _genId()
    const now = new Date().toISOString()
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO rewrite_history
          (id, mode, original_excerpt, rewritten_content, strategy_id, knowledge_refs, matched_keywords, owner_subject, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        String(entry.mode || '').slice(0, 50),
        String(entry.originalContent || '').slice(0, 500),
        entry.rewrittenContent,
        String(entry.strategyId || '').slice(0, 100),
        JSON.stringify(Array.isArray(entry.knowledgeRefs) ? entry.knowledgeRefs : []),
        JSON.stringify(Array.isArray(entry.matchedKeywords) ? entry.matchedKeywords : []),
        entry.ownerSubject || null,
        now,
      )
      return id
    } catch (e) {
      log.warn('Store', 'addRewriteHistory failed: ' + e.message)
      return null
    }
  },

  getRewriteHistory (id) {
    if (!this._ready) return null
    try {
      const row = this.db.prepare('SELECT * FROM rewrite_history WHERE id = ?').get(String(id))
      if (!row) return null
      row.knowledge_refs = _parseJson(row.knowledge_refs, [])
      row.matched_keywords = _parseJson(row.matched_keywords, [])
      return row
    } catch (e) {
      log.warn('Store', 'getRewriteHistory failed: ' + e.message)
      return null
    }
  },

  listRewriteHistory (opts = {}) {
    if (!this._ready) return { items: [], total: 0 }
    const page = Math.max(1, Number(opts.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20))
    try {
      const countRow = this.db.prepare('SELECT COUNT(*) AS n FROM rewrite_history').get()
      const total = countRow ? Number(countRow.n) || 0 : 0
      const rows = this.db.prepare('SELECT * FROM rewrite_history ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(pageSize, (page - 1) * pageSize)
      return { items: rows.map(r => ({ ...r, knowledge_refs: _parseJson(r.knowledge_refs, []), matched_keywords: _parseJson(r.matched_keywords, []) })), total }
    } catch (e) {
      log.warn('Store', 'listRewriteHistory failed: ' + e.message)
      return { items: [], total: 0 }
    }
  },

  // ===================== 追踪登记 =====================

  addTrackedContent (entry) {
    if (!this._ready) return null
    if (!entry || !entry.platform) return null
    const id = String(entry.id || '') || _genId()
    const status = RECRAWL_STATUSES.has(String(entry.recrawlStatus)) ? String(entry.recrawlStatus) : 'pending'
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO tracked_content
          (id, platform, post_id, url, publish_history_id, rewrite_history_id, recrawl_status, last_recrawl_at, next_recrawl_at, owner_subject, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        String(entry.platform).slice(0, 50),
        String(entry.postId || '').slice(0, 200),
        String(entry.url || '').slice(0, 2048),
        entry.publishHistoryId || null,
        entry.rewriteHistoryId || null,
        status,
        entry.lastRecrawlAt || null,
        entry.nextRecrawlAt || null,
        entry.ownerSubject || null,
        String(entry.createdAt || new Date().toISOString()),
      )
      return id
    } catch (e) {
      log.warn('Store', 'addTrackedContent failed: ' + e.message)
      return null
    }
  },

  /**
   * 待回采队列：next_recrawl_at 到期 + 7 天窗口内 + status ∈ (pending, ok, failed)
   * （failed = 单次失败待重试；连续 3 次失败由服务层转 manual 终态）
   * @param {number} nowMs - 当前时间戳
   */
  listDueForRecrawl (nowMs, opts) {
    opts = opts || {}
    if (!this._ready) return []
    const nowIso = new Date(nowMs).toISOString()
    const windowStartIso = new Date(nowMs - 7 * 24 * 3600 * 1000).toISOString()
    try {
      // force（立即回采调试入口）：忽略 next_recrawl_at 到期排期，纳入 7 天窗口内全部可回采条目；
      // 仍守 7 天窗口与状态过滤。默认路径维持 T+1h 排期语义不变。
      if (opts.force) {
        return this.db.prepare(`
          SELECT * FROM tracked_content
          WHERE recrawl_status IN ('pending', 'ok', 'failed')
            AND created_at >= ?
          ORDER BY next_recrawl_at ASC
          LIMIT 50
        `).all(windowStartIso)
      }
      return this.db.prepare(`
        SELECT * FROM tracked_content
        WHERE recrawl_status IN ('pending', 'ok', 'failed')
          AND next_recrawl_at IS NOT NULL AND next_recrawl_at <= ?
          AND created_at >= ?
        ORDER BY next_recrawl_at ASC
        LIMIT 50
      `).all(nowIso, windowStartIso)
    } catch (e) {
      log.warn('Store', 'listDueForRecrawl failed: ' + e.message)
      return []
    }
  },

  getTrackedByPlatform (platform) {
    if (!this._ready) return []
    try {
      return this.db.prepare('SELECT * FROM tracked_content WHERE platform = ? ORDER BY created_at DESC').all(String(platform))
    } catch (e) { return [] }
  },

  /**
   * 回填候选：`publish_history_id` 仍为 NULL 的 tracked 行，**按归属过滤**。
   *
   * 归属过滤放在 SQL 端而不是只靠判据层分桶，是因为候选集有 LIMIT：
   * 多用户共享同一个库时，他人的行可以把 LIMIT 占满，让我的行永远排不到
   * （单 owner 的机器上不可见，所以必须在这里就堵死）。QM-6 后端轴 B1/B2。
   *
   * `ownerSubject` 为 undefined/null/空 ⇒ 取"无身份服务时代"那一桶
   * （NULL / 空串 / LEGACY_OWNER_SUBJECT），与 publish-history 侧 matchesOwner 同口径。
   * @param {number} limit
   * @param {string|null|undefined} ownerSubject
   */
  listUnlinkedTrackedForBackfill (limit, ownerSubject) {
    if (!this._ready) return []
    const n = Math.min(Math.max(1, Number(limit) || 0), 5000)
    const owner = typeof ownerSubject === 'string' ? ownerSubject.trim() : ''
    try {
      if (owner) {
        return this.db.prepare(
          'SELECT id, platform, post_id, publish_history_id, owner_subject, created_at ' +
          'FROM tracked_content WHERE publish_history_id IS NULL AND owner_subject = ? ' +
          'ORDER BY created_at ASC LIMIT ?',
        ).all(owner, n)
      }
      return this.db.prepare(
        'SELECT id, platform, post_id, publish_history_id, owner_subject, created_at ' +
        "FROM tracked_content WHERE publish_history_id IS NULL " +
        '  AND (owner_subject IS NULL OR TRIM(owner_subject) = ? OR owner_subject = ?) ' +
        'ORDER BY created_at ASC LIMIT ?',
      ).all('', LEGACY_OWNER_SUBJECT, n)
    } catch (e) {
      log.warn('Store', 'listUnlinkedTrackedForBackfill failed: ' + e.message)
      return []
    }
  },

  /**
   * 写关联键。**WHERE 里再要一次 IS NULL** 是刻意的：判据层已经保证只补空行，
   * 但两层各守一次才能让"判据层将来被人改错"不至于变成覆盖既有数据。
   * 语义：值＝发布任务 id（task.id），不是发布历史行的 entry.id。
   *
   * 为什么不并进下面的 `updateTrackedContent`（QM-6 前端轴 F3）：那个方法是回采流程的
   * 通用更新口，允许把 recrawl_status 等字段**改成任意合法值**；关联键的契约恰恰相反——
   * 只允许"从无到有"，不允许覆盖。把两者合并会连带删掉 `IS NULL` 兜底，
   * 于是"回填"变成"每次启动都可能改写既有归属"。
   * 因此 `updateTrackedContent` 收到 `publishHistoryId` 时**必须继续忽略它**，
   * 这条不对称由 phase4-events-tracked-content.test.js 的 F3 锁钉住，不是遗漏。
   *
   * 空白值必须拒（QM-6 替代通道 B4）：`'   '` 是 truthy，旧写法会把它当合法键写进库——
   * 那种键既永远 join 不上（读侧按 taskId 查），又让 `IS NULL` 从此不成立，
   * 等于把这一行永久锁死在"无数据"，比留 NULL 更糟。
   */
  setTrackedPublishHistoryId (id, publishHistoryId) {
    if (!this._ready) return false
    const key = typeof publishHistoryId === 'string' ? publishHistoryId.trim() : ''
    const rowId = typeof id === 'string' ? id.trim() : ''
    if (!rowId || !key) return false
    try {
      const result = this.db.prepare(
        'UPDATE tracked_content SET publish_history_id = ? WHERE id = ? AND publish_history_id IS NULL',
      ).run(key, rowId)
      return (result.changes || 0) > 0
    } catch (e) {
      log.warn('Store', 'setTrackedPublishHistoryId failed: ' + e.message)
      return false
    }
  },

  updateTrackedContent (id, updates) {
    if (!this._ready || !id || !updates) return false
    const sets = []
    const params = []
    if (updates.recrawlStatus !== undefined) {
      if (!RECRAWL_STATUSES.has(String(updates.recrawlStatus))) return false
      sets.push('recrawl_status = ?')
      params.push(String(updates.recrawlStatus))
    }
    if (updates.lastRecrawlAt !== undefined) { sets.push('last_recrawl_at = ?'); params.push(updates.lastRecrawlAt || null) }
    if (updates.nextRecrawlAt !== undefined) { sets.push('next_recrawl_at = ?'); params.push(updates.nextRecrawlAt || null) }
    if (updates.rewriteHistoryId !== undefined) { sets.push('rewrite_history_id = ?'); params.push(updates.rewriteHistoryId || null) }
    if (sets.length === 0) return false
    params.push(String(id))
    try {
      const result = this.db.prepare('UPDATE tracked_content SET ' + sets.join(', ') + ' WHERE id = ?').run(...params)
      return (result.changes || 0) > 0
    } catch (e) {
      log.warn('Store', 'updateTrackedContent failed: ' + e.message)
      return false
    }
  },

  // ===================== 表现快照 =====================

  addPerformanceSnapshot (entry) {
    if (!this._ready) return null
    if (!entry || !entry.trackedContentId) return null
    const id = _genId()
    try {
      this.db.prepare(`
        INSERT INTO performance_snapshot
          (id, tracked_content_id, source, views, likes, comments, favorites, shares, raw, captured_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        String(entry.trackedContentId),
        entry.source === 'manual' ? 'manual' : 'auto',
        Math.max(0, Number(entry.views) || 0),
        Math.max(0, Number(entry.likes) || 0),
        Math.max(0, Number(entry.comments) || 0),
        Math.max(0, Number(entry.favorites) || 0),
        Math.max(0, Number(entry.shares) || 0),
        JSON.stringify(entry.raw || {}),
        new Date().toISOString(),
      )
      return id
    } catch (e) {
      log.warn('Store', 'addPerformanceSnapshot failed: ' + e.message)
      return null
    }
  },

  getLatestSnapshot (trackedContentId) {
    if (!this._ready) return null
    try {
      return this.db.prepare(
        'SELECT * FROM performance_snapshot WHERE tracked_content_id = ? ORDER BY captured_at DESC, rowid DESC LIMIT 1'
      ).get(String(trackedContentId)) || null
    } catch (e) { return null }
  },

  listSnapshots (trackedContentId) {
    if (!this._ready) return []
    try {
      return this.db.prepare(
        'SELECT * FROM performance_snapshot WHERE tracked_content_id = ? ORDER BY captured_at DESC, rowid DESC'
      ).all(String(trackedContentId))
    } catch (e) { return [] }
  },

  /**
   * 看板读侧：本归属下的作品行（列取最小集，禁止 SELECT *——宽表会让口径漂移无人察觉）。
   * 返回 total / truncated 是为了让「统计基于最近 N 条」能如实说出来，
   * 而不是把截断当全量渲染成一个偏低的数字。
   * @param {string|undefined} ownerSubject
   * @param {number} [limit]
   */
  listTrackedForOverview (ownerSubject, limit) {
    const cap = Number(limit) > 0 ? Number(limit) : OVERVIEW_TRACKED_LIMIT
    if (!this._ready) return { rows: [], total: 0, truncated: false }
    const { sql, params } = _ownerPredicate(ownerSubject)
    try {
      if (!_tablePresent(this.db, 'tracked_content')) {
        return { rows: [], total: 0, truncated: false, error: 'table missing: tracked_content' }
      }
      const countRow = this.db.prepare('SELECT COUNT(*) AS n FROM tracked_content ' + sql).get(...params)
      const total = countRow ? Number(countRow.n) || 0 : 0
      const rows = this.db.prepare(
        'SELECT id, platform, recrawl_status, created_at, last_recrawl_at FROM tracked_content ' + sql +
        ' ORDER BY created_at DESC, rowid DESC LIMIT ?'
      ).all(...params, cap)
      return { rows, total, truncated: total > rows.length }
    } catch (e) {
      log.warn('Store', 'listTrackedForOverview failed: ' + e.message)
      // 查询失败不得吞成空结果：那会让看板把「没拿到数据」渲染成「从未发布」（QM-6 后端轴 FB7）
      return { rows: [], total: 0, truncated: false, error: e.message }
    }
  },

  /**
   * 看板读侧：本归属下作品的快照（不按计划窗口过滤——日增需要前一份做基线）。
   * 排序取「最新在前」：扫描上限命中截断时，被丢掉的必须是**最旧**的快照，
   * 而不是按作品分组后每组最旧的那批（后者会让聚合层的「取最新一份」拿到旧值、总量静默偏低，
   * 且界面只看得见 truncated=true，看不出偏低的成因 —— QM-6 后端轴 FB4）。
   * 聚合层按解析后的时刻自行升序重排，不依赖这里的入参顺序。
   * orphanTotal 单独统计「关联不到任何作品」的快照，那是数据完整性信号，不能和归属过滤混成一谈。
   * @param {string|undefined} ownerSubject
   * @param {number} [limit]
   */
  listSnapshotsForOverview (ownerSubject, limit) {
    const cap = Number(limit) > 0 ? Number(limit) : OVERVIEW_SNAPSHOT_LIMIT
    if (!this._ready) return { rows: [], total: 0, truncated: false, orphanTotal: 0 }
    const { sql, params } = _ownerPredicate(ownerSubject, 't')
    try {
      if (!_tablePresent(this.db, 'performance_snapshot') || !_tablePresent(this.db, 'tracked_content')) {
        return { rows: [], total: 0, truncated: false, orphanTotal: 0, error: 'table missing: performance_snapshot/tracked_content' }
      }
      const countRow = this.db.prepare(
        'SELECT COUNT(*) AS n FROM performance_snapshot s JOIN tracked_content t ON t.id = s.tracked_content_id ' + sql
      ).get(...params)
      const total = countRow ? Number(countRow.n) || 0 : 0
      const rows = this.db.prepare(
        'SELECT s.id, s.tracked_content_id, s.views, s.likes, s.comments, s.favorites, s.shares, s.captured_at, s.rowid ' +
        'FROM performance_snapshot s JOIN tracked_content t ON t.id = s.tracked_content_id ' + sql +
        ' ORDER BY s.captured_at DESC, s.rowid DESC LIMIT ?'
      ).all(...params, cap)
      const orphanRow = this.db.prepare(
        'SELECT COUNT(*) AS n FROM performance_snapshot s ' +
        'WHERE NOT EXISTS (SELECT 1 FROM tracked_content t WHERE t.id = s.tracked_content_id)'
      ).get()
      return { rows, total, truncated: total > rows.length, orphanTotal: orphanRow ? Number(orphanRow.n) || 0 : 0 }
    } catch (e) {
      log.warn('Store', 'listSnapshotsForOverview failed: ' + e.message)
      return { rows: [], total: 0, truncated: false, orphanTotal: 0, error: e.message }
    }
  },

  // ===================== 模式归因聚合 =====================

  /**
   * 全量替换模式归因（每日重算 + 手动触发；幂等）
   * @param {Array} rows - [{ dimension, value, platform, sampleCount, avgViews, avgLikes, avgComments, avgFavorites }]
   */
  replacePatternPerformance (rows) {
    if (!this._ready || !Array.isArray(rows)) return false
    const now = new Date().toISOString()
    try {
      // 事务包裹 delete+insert（审查 W-3：防中途崩溃留下半表）
      const tx = (typeof this.db.transaction === 'function')
        ? this.db.transaction(() => this._replacePatternPerformanceInner(rows, now))
        : () => this._replacePatternPerformanceInner(rows, now)
      tx()
      return true
    } catch (e) {
      log.warn('Store', 'replacePatternPerformance failed: ' + e.message)
      return false
    }
  },

  _replacePatternPerformanceInner (rows, now) {
    this.db.prepare('DELETE FROM pattern_performance').run()
    const stmt = this.db.prepare(`
      INSERT INTO pattern_performance
        (id, dimension, value, platform, owner_subject, sample_count, avg_views, avg_likes, avg_comments, avg_favorites, engagement_score, computed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const r of rows) {
      if (!r || !r.dimension || !r.value) continue
      const avgViews = Math.max(0, Number(r.avgViews) || 0)
      const avgLikes = Math.max(0, Number(r.avgLikes) || 0)
      const avgComments = Math.max(0, Number(r.avgComments) || 0)
      const avgFavorites = Math.max(0, Number(r.avgFavorites) || 0)
      // engagement_score = avg_likes + avg_comments + avg_favorites × 2（首版启发式，常量区可调）
      // 归属原样透传（可为 null = legacy 桶）；归一由聚合层的桶负责，这里不做二次判定
      const score = avgLikes + avgComments + avgFavorites * 2
      stmt.run(_genId(), String(r.dimension), String(r.value), String(r.platform || ''),
        r.ownerSubject == null ? null : String(r.ownerSubject),
        Math.max(0, Number(r.sampleCount) || 0), avgViews, avgLikes, avgComments, avgFavorites, score, now)
    }
  },

  /**
   * 读归因榜：必须按归属筛（P2-6d）。
   *
   * 为什么归属条件要**加括号**：`_ownerPredicate` 的 legacy 档返回
   * `owner_subject IS NULL OR TRIM(...) = '' OR owner_subject = ?`，
   * 而 SQL 里 AND 的优先级高于 OR —— 不加括号再拼 `AND dimension = ?`，
   * 条件就变成了「(NULL) OR (空串 AND 维度) OR (legacy AND 维度)」，
   * 结果是别的归属的别的维度会被漏进来，而且只在 legacy 档出现（最难复现的那种红）。
   * @param {{dimension?:string, platform?:string}} [opts]
   * @param {string|null|undefined} [ownerSubject] null/undefined ⇒ legacy 桶（绝不返回别人的数据）
   */
  listPatternPerformance (opts = {}, ownerSubject) {
    if (!this._ready) return []
    const owner = _ownerPredicate(ownerSubject)
    const ownerCond = owner.sql.replace(/^WHERE\s+/, '')
    const conditions = ['(' + ownerCond + ')']
    const params = [...owner.params]
    if (opts.dimension) { conditions.push('dimension = ?'); params.push(String(opts.dimension)) }
    if (opts.platform) { conditions.push('platform = ?'); params.push(String(opts.platform)) }
    const where = 'WHERE ' + conditions.join(' AND ')
    try {
      return this.db.prepare(
        'SELECT * FROM pattern_performance ' + where + ' ORDER BY engagement_score DESC'
      ).all(...params)
    } catch (e) { return [] }
  },
}
