// @ts-check
/**
 * scheduler-store — 定时任务功能域 mixin
 *
 * 依赖：BaseStore._safeJson（基类提供）
 */

module.exports = {
  addScheduledTask (task) {
    if (!this._ready) return null
    const id = task.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6))
    this.db.prepare(`
      INSERT OR REPLACE INTO scheduled_tasks (id, platform, article, publish_time, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, task.platform, JSON.stringify(task.article || {}), task.publish_time, task.status || 'pending')
    return id
  },

  listScheduledTasks () {
    if (!this._ready) return []
    return this.db.prepare('SELECT * FROM scheduled_tasks ORDER BY publish_time ASC').all().map(r => ({
      ...r,
      article: this._safeJson(r.article),
    }))
  },

  getPendingTasks () {
    if (!this._ready) return []
    return this.db.prepare(
      "SELECT * FROM scheduled_tasks WHERE status = 'pending' AND publish_time <= datetime('now') ORDER BY publish_time ASC"
    ).all().map(r => ({ ...r, article: this._safeJson(r.article) }))
  },

  updateTaskStatus (id, status) {
    if (!this._ready) return false
    this.db.prepare('UPDATE scheduled_tasks SET status = ? WHERE id = ?').run(status, id)
    return true
  },

  deleteTask (id) {
    if (!this._ready) return false
    this.db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id)
    return true
  },
}
