// @ts-check
/**
 * scheduler-store — 定时任务功能域 mixin
 */

module.exports = {
  addScheduledTask (task, ownerSubject) {
    if (!this._ready) return null
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner || !task || typeof task !== 'object' || !task.platform) return null
    const id = String(task.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)))
    const result = this.db.prepare(`
      INSERT OR REPLACE INTO scheduled_tasks (
        owner_subject, id, platform, article, publish_time, status, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      owner,
      id,
      task.platform,
      JSON.stringify(task.article || {}),
      task.publish_time || '',
      task.status || 'pending',
    )
    return result.error || result.changes === 0 ? null : id
  },

  listScheduledTasks (ownerSubject) {
    if (!this._ready) return []
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return []
    return this.db.prepare(
      'SELECT * FROM scheduled_tasks WHERE owner_subject = ? ORDER BY publish_time ASC',
    ).all(owner).map(row => ({ ...row, article: this._safeJson(row.article) }))
  },

  getPendingTasks (ownerSubject) {
    if (!this._ready) return []
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return []
    return this.db.prepare(
      "SELECT * FROM scheduled_tasks WHERE owner_subject = ? AND status = 'pending' AND publish_time <= datetime('now') ORDER BY publish_time ASC",
    ).all(owner).map(row => ({ ...row, article: this._safeJson(row.article) }))
  },

  updateTaskStatus (id, status, ownerSubject) {
    if (!this._ready) return false
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return false
    const result = this.db.prepare(
      'UPDATE scheduled_tasks SET status = ? WHERE owner_subject = ? AND id = ?',
    ).run(status, owner, String(id))
    return !result.error && result.changes !== 0
  },

  deleteTask (id, ownerSubject) {
    if (!this._ready) return false
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return false
    const result = this.db.prepare('DELETE FROM scheduled_tasks WHERE owner_subject = ? AND id = ?')
      .run(owner, String(id))
    return !result.error && result.changes !== 0
  },
}
