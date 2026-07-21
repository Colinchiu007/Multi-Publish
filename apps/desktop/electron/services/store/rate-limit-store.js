// @ts-check
/**
 * rate-limit-store — 发布频率控制功能域 mixin
 *
 * 表：publish_timeline (key, last_publish_at)
 * key 格式："${platform}:${accountId}"
 */

module.exports = {
  /**
   * 获取指定平台+账号的最后发布时间
   * @param {string} key - "${platform}:${accountId}"
   * @returns {number|null} 时间戳(ms)，null 表示从未发布
   */
  getPublishTimeline (key, ownerSubject) {
    if (!this._ready) return null
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return null
    const row = this.db.prepare(
      'SELECT last_publish_at FROM publish_timeline WHERE owner_subject = ? AND key = ?'
    ).get(owner, key)
    return row ? row.last_publish_at : null
  },

  /**
   * 设置指定平台+账号的最后发布时间
   * @param {string} key - "${platform}:${accountId}"
   * @param {number} timestamp - 时间戳(ms)
   */
  setPublishTimeline (key, timestamp, ownerSubject) {
    if (!this._ready) return
    const owner = this._resolveOwnerSubject(ownerSubject)
    if (!owner) return
    this.db.prepare(
      'INSERT OR REPLACE INTO publish_timeline (owner_subject, key, last_publish_at) VALUES (?, ?, ?)'
    ).run(owner, key, timestamp)
  },
}
