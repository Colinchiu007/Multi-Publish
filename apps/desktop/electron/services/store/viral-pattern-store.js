// @ts-check
/**
 * viral-pattern-store — 模式卡片功能域 mixin
 *
 * 表：viral_pattern_cards（与 viral_library 一对一）
 * 生命周期：pending（入库即建）→ done（LLM 提取成功）/ failed（attempts >= 3）
 * 依赖：logger
 */
const log = require('../logger')

const PATTERN_STATUS = new Set(['pending', 'done', 'failed'])
const HOOK_TYPES = new Set(['suspense', 'conflict', 'counterintuitive', 'question', 'story', 'data', 'empathy', 'other'])
const EMOTION_CURVES = new Set(['rise', 'fall', 'rise_fall', 'fall_rise', 'wave', 'flat'])
const NARRATIVE_STRUCTURES = new Set(['total_subtotal', 'problem_solution', 'chronological', 'contrast', 'list', 'story_lesson'])
const CTA_STYLES = new Set(['question', 'challenge', 'resource', 'follow', 'comment', 'none'])

function parseCardRow (row) {
  if (!row) return null
  const copy = { ...row }
  try { copy.golden_quotes = JSON.parse(copy.golden_quotes || '[]') } catch { copy.golden_quotes = [] }
  return copy
}

module.exports = {
  PATTERN_STATUS, HOOK_TYPES, EMOTION_CURVES, NARRATIVE_STRUCTURES, CTA_STYLES,

  /**
   * 确保卡片存在（入库后置钩子调用；幂等——已存在不重置状态）
   */
  ensurePatternCard (viralItemId) {
    if (!this._ready) return false
    if (!viralItemId) return false
    const now = new Date().toISOString()
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO viral_pattern_cards
          (viral_item_id, status, attempts, schema_version, created_at, updated_at)
        VALUES (?, 'pending', 0, 1, ?, ?)
      `).run(String(viralItemId), now, now)
      return true
    } catch (e) {
      log.warn('Store', 'ensurePatternCard failed: ' + e.message)
      return false
    }
  },

  getPatternCard (viralItemId) {
    if (!this._ready) return null
    try {
      const row = this.db.prepare('SELECT * FROM viral_pattern_cards WHERE viral_item_id = ?').get(String(viralItemId))
      return parseCardRow(row) || null
    } catch (e) {
      log.warn('Store', 'getPatternCard failed: ' + e.message)
      return null
    }
  },

  /**
   * 更新卡片字段（枚举校验：非法值落空/other；金句截断至 3 条）
   */
  updatePatternCard (viralItemId, updates) {
    if (!this._ready) return false
    if (!viralItemId || !updates || typeof updates !== 'object') return false
    const now = new Date().toISOString()
    const sets = []
    const params = []

    if (updates.status !== undefined) {
      const status = PATTERN_STATUS.has(String(updates.status)) ? String(updates.status) : 'pending'
      sets.push('status = ?')
      params.push(status)
    }
    if (updates.attempts !== undefined) {
      sets.push('attempts = ?')
      params.push(Math.max(0, Number(updates.attempts) || 0))
    }
    if (updates.hook_type !== undefined) {
      const v = String(updates.hook_type || '')
      sets.push('hook_type = ?')
      params.push(HOOK_TYPES.has(v) ? v : (v ? 'other' : ''))
    }
    if (updates.hook_analysis !== undefined) {
      sets.push('hook_analysis = ?')
      params.push(String(updates.hook_analysis || '').slice(0, 2000))
    }
    if (updates.emotion_curve !== undefined) {
      const v = String(updates.emotion_curve || '')
      sets.push('emotion_curve = ?')
      params.push(EMOTION_CURVES.has(v) ? v : '')
    }
    if (updates.narrative_structure !== undefined) {
      const v = String(updates.narrative_structure || '')
      sets.push('narrative_structure = ?')
      params.push(NARRATIVE_STRUCTURES.has(v) ? v : '')
    }
    if (updates.cta_style !== undefined) {
      const v = String(updates.cta_style || '')
      sets.push('cta_style = ?')
      params.push(CTA_STYLES.has(v) ? v : '')
    }
    if (updates.golden_quotes !== undefined) {
      let quotes = updates.golden_quotes
      if (typeof quotes === 'string') {
        try { quotes = JSON.parse(quotes) } catch { quotes = [] }
      }
      if (!Array.isArray(quotes)) quotes = []
      quotes = quotes.filter(q => typeof q === 'string' && q.trim()).slice(0, 3)
      sets.push('golden_quotes = ?')
      params.push(JSON.stringify(quotes))
    }
    if (updates.title_formula !== undefined) {
      sets.push('title_formula = ?')
      params.push(String(updates.title_formula || '').slice(0, 500))
    }
    if (updates.extracted_at !== undefined) {
      sets.push('extracted_at = ?')
      params.push(String(updates.extracted_at || ''))
    }
    if (updates.last_error !== undefined) {
      sets.push('last_error = ?')
      params.push(String(updates.last_error || '').slice(0, 1000))
    }

    if (sets.length === 0) return false
    sets.push('updated_at = ?')
    params.push(now)
    params.push(String(viralItemId))

    try {
      const result = this.db.prepare(
        'UPDATE viral_pattern_cards SET ' + sets.join(', ') + ' WHERE viral_item_id = ?'
      ).run(...params)
      return (result.changes || 0) > 0
    } catch (e) {
      log.warn('Store', 'updatePatternCard failed: ' + e.message)
      return false
    }
  },

  /**
   * 记录一次提取尝试（attempts +1，写错误信息；attempts >= 3 时标记 failed）
   */
  recordPatternAttempt (viralItemId, errorMessage) {
    if (!this._ready) return false
    const card = this.getPatternCard(viralItemId)
    if (!card) return false
    const attempts = (Number(card.attempts) || 0) + 1
    const status = attempts >= 3 ? 'failed' : card.status === 'done' ? 'done' : 'pending'
    return this.updatePatternCard(viralItemId, {
      attempts,
      status: status === 'done' ? 'done' : (attempts >= 3 ? 'failed' : 'pending'),
      last_error: errorMessage || '',
    })
  },

  /**
   * 待提取队列：pending 或 attempts < 3 的 failed（可重试）
   */
  listPendingPatternCards (limit = 20) {
    if (!this._ready) return []
    try {
      return this.db.prepare(`
        SELECT * FROM viral_pattern_cards
        WHERE (status = 'pending' OR (status = 'failed' AND attempts < 3))
        ORDER BY created_at ASC
        LIMIT ?
      `).all(Math.max(1, Math.min(100, Number(limit) || 20))).map(parseCardRow)
    } catch (e) {
      log.warn('Store', 'listPendingPatternCards failed: ' + e.message)
      return []
    }
  },

  listPatternCards (opts = {}) {
    if (!this._ready) return { items: [], total: 0 }
    const page = Math.max(1, Number(opts.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20))
    const conditions = []
    const params = []
    if (opts.status && PATTERN_STATUS.has(String(opts.status))) {
      conditions.push('status = ?')
      params.push(String(opts.status))
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
    try {
      const countRow = this.db.prepare('SELECT COUNT(*) AS n FROM viral_pattern_cards ' + where).get(...params)
      const total = countRow ? Number(countRow.n) || 0 : 0
      const rows = this.db.prepare(
        'SELECT * FROM viral_pattern_cards ' + where + ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
      ).all(...params, pageSize, (page - 1) * pageSize)
      return { items: rows.map(parseCardRow), total }
    } catch (e) {
      log.warn('Store', 'listPatternCards failed: ' + e.message)
      return { items: [], total: 0 }
    }
  },

  /**
   * 重置卡片为 pending（重新分析按钮）
   */
  resetPatternCard (viralItemId) {
    return this.updatePatternCard(viralItemId, {
      status: 'pending',
      attempts: 0,
      last_error: '',
    })
  },

  deletePatternCard (viralItemId) {
    if (!this._ready) return false
    try {
      const result = this.db.prepare('DELETE FROM viral_pattern_cards WHERE viral_item_id = ?').run(String(viralItemId))
      return (result.changes || 0) > 0
    } catch (e) {
      log.warn('Store', 'deletePatternCard failed: ' + e.message)
      return false
    }
  },
}
