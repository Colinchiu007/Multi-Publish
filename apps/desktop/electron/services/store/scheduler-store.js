// @ts-check
/**
 * scheduler-store — 定时任务功能域 mixin（**SQLite scheduled_tasks 表，非定时发布真源**）
 *
 * ⛔ 2026-10-02 死路径标注（改动前必读）：
 *   定时发布的**唯一真源**是 JSONL `scheduled-tasks.jsonl`
 *   （`packages/shared-utils/src/scheduler.js`，IPC `scheduler:create/list/cancel`）
 *   与批量排期 `BatchManager`（IPC `batch:schedule/cancel/delete`）。
 *   本文件操作的 SQLite `scheduled_tasks` 表**没有任何生产读取方**：
 *   - 写入方只剩 `base-store.migrateFromJsonl`（历史 JSONL → SQLite 的一次性迁移）；
 *   - 读取方只剩 `account-store` 删除账号时的级联清理（按 owner+platform 删行）。
 *   原先对外的 3 个 IPC（store:add-scheduled-task / store:list-scheduled-tasks /
 *   store:delete-task）与 preload 桥接已于 2026-10-02 删除——它们零渲染层调用。
 *
 *   因此：**不要**把这些方法当作定时任务真源去接新功能（那会写出第二份真源，
 *   与 JSONL 必然漂移）；表本身保留仅因迁移与级联删除仍在用。
 *   完整清理（连方法一起删）需同步重写 store-snapshot / store-owner-isolation 两个测试。
 *
 * 依赖：BaseStore._safeJson（基类提供）
 */

module.exports = {
  addScheduledTask (task, ownerSubject) {
    if (!this._ready) return null
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner || !task || typeof task !== 'object' || !task.platform) return null
    const id = String(task.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)))
    const result = this.db.prepare(`
      INSERT OR REPLACE INTO scheduled_tasks (owner_subject, id, platform, article, publish_time, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(owner, id, task.platform, JSON.stringify(task.article || {}), task.publish_time || '', task.status || 'pending')
    return result && !result.error && result.changes !== 0 ? id : null
  },

  listScheduledTasks (ownerSubject) {
    if (!this._ready) return []
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return []
    return this.db.prepare(
      'SELECT * FROM scheduled_tasks WHERE owner_subject = ? ORDER BY publish_time ASC',
    ).all(owner).map(r => ({
      ...r,
      article: this._safeJson(r.article),
    }))
  },

  getPendingTasks (ownerSubject) {
    if (!this._ready) return []
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return []
    return this.db.prepare(
      "SELECT * FROM scheduled_tasks WHERE owner_subject = ? AND status = 'pending' AND publish_time <= datetime('now') ORDER BY publish_time ASC"
    ).all(owner).map(r => ({ ...r, article: this._safeJson(r.article) }))
  },

  updateTaskStatus (id, status, ownerSubject) {
    if (!this._ready) return false
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return false
    const result = this.db.prepare(
      'UPDATE scheduled_tasks SET status = ? WHERE owner_subject = ? AND id = ?',
    ).run(status, owner, String(id))
    return Boolean(result && !result.error && result.changes !== 0)
  },

  deleteTask (id, ownerSubject) {
    if (!this._ready) return false
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return false
    const result = this.db.prepare(
      'DELETE FROM scheduled_tasks WHERE owner_subject = ? AND id = ?',
    ).run(owner, String(id))
    return Boolean(result && !result.error && result.changes > 0)
  },
}
