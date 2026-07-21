// @ts-check
/**
 * history-store — 发布历史功能域 mixin
 */

module.exports = {
  addPublishRecord (record, ownerSubject) {
    if (!this._ready) return null
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner || !record || typeof record !== 'object') return null
    const id = String(record.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)))
    const result = this.db.prepare(`
      INSERT OR REPLACE INTO publish_history (
        owner_subject, id, platform, title, content, task_id, article_id,
        status, result, error, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      owner,
      id,
      record.platform || '',
      record.title || '',
      record.content || '',
      record.task_id || '',
      record.article_id || '',
      record.status || 'pending',
      JSON.stringify(record.result || {}),
      record.error || '',
    )
    return result.error || result.changes === 0 ? null : id
  },

  listPublishHistory (opts = {}, ownerSubject) {
    if (!this._ready) return { total: 0, records: [] }
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return { total: 0, records: [] }
    const { platform, limit = 50, offset = 0 } = opts || {}
    let sql = 'SELECT * FROM publish_history WHERE owner_subject = ?'
    let countSql = 'SELECT COUNT(*) AS total FROM publish_history WHERE owner_subject = ?'
    const filterParams = [owner]

    if (platform) {
      sql += ' AND platform = ?'
      countSql += ' AND platform = ?'
      filterParams.push(platform)
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    const total = this.db.prepare(countSql).get(...filterParams).total
    const records = this.db.prepare(sql).all(...filterParams, limit, offset)
    return { total, records: records.map(row => ({ ...row, result: this._safeJson(row.result) })) }
  },

  getPublishStats (ownerSubject) {
    if (!this._ready) return { total: 0, success: 0, failed: 0, byPlatform: {} }
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return { total: 0, success: 0, failed: 0, byPlatform: {} }
    const all = this.db.prepare('SELECT platform, status FROM publish_history WHERE owner_subject = ?').all(owner)
    const stats = { total: all.length, success: 0, failed: 0, byPlatform: {} }

    for (const row of all) {
      if (row.status === 'success') stats.success++
      if (row.status === 'failed') stats.failed++
      if (!stats.byPlatform[row.platform]) stats.byPlatform[row.platform] = { total: 0, success: 0, failed: 0 }
      stats.byPlatform[row.platform].total++
      if (row.status === 'success') stats.byPlatform[row.platform].success++
      if (row.status === 'failed') stats.byPlatform[row.platform].failed++
    }
    return stats
  },
}
