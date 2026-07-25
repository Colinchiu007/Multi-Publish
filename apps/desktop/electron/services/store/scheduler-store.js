// @ts-check
/**
 * scheduler-store — 定时任务功能域 mixin
 *
 * 依赖：BaseStore._safeJson（基类提供）
 */

const { LEGACY_OWNER_SUBJECT } = require('../store-schema')

function resolveOwner (store, explicitOwner) {
  if (typeof store._resolveOwnerSubject === 'function') return store._resolveOwnerSubject(explicitOwner)
  if (explicitOwner === undefined) return LEGACY_OWNER_SUBJECT
  if (typeof explicitOwner !== 'string' || !explicitOwner.trim()) return null
  return explicitOwner.trim()
}

module.exports = {
  addScheduledTask (task, ownerSubject) {
    if (!this._ready) return null
    if (!task || typeof task !== 'object' || Array.isArray(task)) return null
    const owner = resolveOwner(this, ownerSubject)
    if (!owner || typeof task.platform !== 'string' || !task.platform.trim()) return null
    const id = String(task.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)))
    try {
      const result = this.db.prepare(`
        INSERT OR REPLACE INTO scheduled_tasks (owner_subject, id, platform, article, publish_time, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(owner, id, task.platform, JSON.stringify(task.article || {}), task.publish_time ?? null, task.status || 'pending')
      return result && !result.error ? id : null
    } catch (_) {
      return null
    }
  },

  listScheduledTasks (ownerSubject) {
    if (!this._ready) return []
    const owner = resolveOwner(this, ownerSubject)
    if (!owner) return []
    return this.db.prepare('SELECT * FROM scheduled_tasks WHERE owner_subject = ? ORDER BY publish_time ASC').all(owner).map(r => ({
      ...r,
      article: this._safeJson(r.article),
    }))
  },

  getPendingTasks (ownerSubject) {
    if (!this._ready) return []
    const owner = resolveOwner(this, ownerSubject)
    if (!owner) return []
    return this.db.prepare(
      "SELECT * FROM scheduled_tasks WHERE owner_subject = ? AND status = 'pending' AND publish_time <= datetime('now') ORDER BY publish_time ASC"
    ).all(owner).map(r => ({ ...r, article: this._safeJson(r.article) }))
  },

  updateTaskStatus (id, status, ownerSubject) {
    if (!this._ready) return false
    const owner = resolveOwner(this, ownerSubject)
    if (!owner) return false
    const result = this.db.prepare('UPDATE scheduled_tasks SET status = ? WHERE owner_subject = ? AND id = ?').run(status, owner, String(id))
    return Boolean(result && !result.error && result.changes > 0)
  },

  deleteTask (id, ownerSubject) {
    if (!this._ready) return false
    const owner = resolveOwner(this, ownerSubject)
    if (!owner) return false
    const result = this.db.prepare('DELETE FROM scheduled_tasks WHERE owner_subject = ? AND id = ?').run(owner, String(id))
    return Boolean(result && !result.error && result.changes > 0)
  },
}
