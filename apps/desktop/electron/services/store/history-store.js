// @ts-check
/**
 * history-store — 发布历史功能域 mixin
 *
 * 依赖：BaseStore._safeJson（基类提供）
 */

module.exports = {
  addPublishRecord (record) {
    if (!this._ready) return null
    const id = record.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6))
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO publish_history (id, platform, title, content, task_id, status, result, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      id,
      record.platform || '',
      record.title || '',
      record.content || '',
      record.task_id || '',
      record.status || 'pending',
      JSON.stringify(record.result || {}),
      record.error || '',
    )
    return id
  },

  listPublishHistory (opts = {}) {
    if (!this._ready) return { total: 0, records: [] }
    const { platform, limit = 50, offset = 0 } = opts
    let sql = 'SELECT * FROM publish_history'
    let countSql = 'SELECT COUNT(*) AS total FROM publish_history'
    const params = []

    if (platform) {
      sql += ' WHERE platform = ?'
      countSql += ' WHERE platform = ?'
      params.push(platform)
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const total = this.db.prepare(countSql).get(...(platform ? [platform] : [])).total
    const records = this.db.prepare(sql).all(...params)
    return { total, records: records.map(r => ({ ...r, result: this._safeJson(r.result) })) }
  },

  getPublishStats () {
    if (!this._ready) return { total: 0, success: 0, failed: 0, byPlatform: {} }
    const all = this.db.prepare('SELECT platform, status FROM publish_history').all()
    const stats = { total: all.length, success: 0, failed: 0, byPlatform: {} }

    for (const r of all) {
      if (r.status === 'success') stats.success++
      if (r.status === 'failed') stats.failed++
      if (!stats.byPlatform[r.platform]) stats.byPlatform[r.platform] = { total: 0, success: 0, failed: 0 }
      stats.byPlatform[r.platform].total++
      if (r.status === 'success') stats.byPlatform[r.platform].success++
      if (r.status === 'failed') stats.byPlatform[r.platform].failed++
    }
    return stats
  },
}
