// @ts-check
/**
 * batch-store — 批量任务功能域 mixin
 *
 * 依赖：store-schema.sanitizeUpdateFields / safeJsonParse / buildUpdateQuery
 */
const { sanitizeUpdateFields, safeJsonParse, buildUpdateQuery } = require('../store-schema')

module.exports = {
  addBatchJob (job) {
    if (!this._ready) return false
    this.db.prepare(`
      INSERT OR REPLACE INTO batch_jobs (id, name, articles, total, completed, failed, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(job.id, job.name, JSON.stringify(job.articles || []), job.total, job.completed || 0, job.failed || 0, job.status || 'pending')
    return true
  },

  getBatchJob (id) {
    if (!this._ready) return null
    const row = this.db.prepare('SELECT * FROM batch_jobs WHERE id = ?').get(id)
    if (!row) return null
    row.articles = safeJsonParse(row.articles, [])
    return row
  },

  listBatchJobs () {
    if (!this._ready) return []
    return this.db.prepare('SELECT * FROM batch_jobs ORDER BY created_at DESC').all().map(r => {
      // eslint-disable-next-line no-unused-vars
      try { r.articles = JSON.parse(r.articles) } catch (e) { r.articles = [] }
      return r
    })
  },

  updateBatchJob (id, fields) {
    if (!this._ready) return false
    // 安全：字段名白名单过滤，防止 SQL 注入
    const safeFields = sanitizeUpdateFields('batch_jobs', fields)
    if (Object.keys(safeFields).length === 0) return false
    const { sets, vals } = buildUpdateQuery(safeFields);
    vals.push(id)
    this.db.prepare(`UPDATE batch_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return true
  },

  deleteBatchJob (id) {
    if (!this._ready) return false
    this.db.prepare('DELETE FROM batch_jobs WHERE id = ?').run(id)
    return true
  },
}
