// @ts-check
/**
 * batch-store — 批量任务功能域 mixin
 *
 * 依赖：store-schema.sanitizeUpdateFields / safeJsonParse / buildUpdateQuery
 */
const { sanitizeUpdateFields, safeJsonParse, buildUpdateQuery } = require('../store-schema')

module.exports = {
  addBatchJob (job, ownerSubject) {
    if (!this._ready) return false
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner || !job || !job.id) return false
    this.db.prepare(`
      INSERT OR REPLACE INTO batch_jobs (owner_subject, id, name, articles, total, completed, failed, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(owner, String(job.id), job.name, JSON.stringify(job.articles || []), job.total || 0, job.completed || 0, job.failed || 0, job.status || 'pending')
    return true
  },

  getBatchJob (id, ownerSubject) {
    if (!this._ready) return null
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return null
    const row = this.db.prepare('SELECT * FROM batch_jobs WHERE owner_subject = ? AND id = ?').get(owner, String(id))
    if (!row) return null
    row.articles = safeJsonParse(row.articles, [])
    return row
  },

  listBatchJobs (ownerSubject) {
    if (!this._ready) return []
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return []
    return this.db.prepare('SELECT * FROM batch_jobs WHERE owner_subject = ? ORDER BY created_at DESC').all(owner).map(r => {
      // eslint-disable-next-line no-unused-vars
      try { r.articles = JSON.parse(r.articles) } catch (e) { r.articles = [] }
      return r
    })
  },

  updateBatchJob (id, fields, ownerSubject) {
    if (!this._ready) return false
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return false
    // 安全：字段名白名单过滤，防止 SQL 注入
    const safeFields = sanitizeUpdateFields('batch_jobs', fields)
    if (Object.keys(safeFields).length === 0) return false
    const { sets, vals } = buildUpdateQuery(safeFields);
    vals.push(owner, String(id))
    const result = this.db.prepare(`UPDATE batch_jobs SET ${sets.join(', ')} WHERE owner_subject = ? AND id = ?`).run(...vals)
    return !result.error && result.changes !== 0
  },

  deleteBatchJob (id, ownerSubject) {
    if (!this._ready) return false
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return false
    const result = this.db.prepare('DELETE FROM batch_jobs WHERE owner_subject = ? AND id = ?').run(owner, String(id))
    return !result.error && result.changes !== 0
  },
}
