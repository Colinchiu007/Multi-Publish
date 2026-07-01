/**
 * 发布频率控制 — 同账号发布间隔限制
 *
 * 功能：
 * - 检查指定平台+账号是否允许发布（间隔 >= minInterval）
 * - 记录发布时间
 * - 查询还需等待多久
 * - 可插拔存储（默认 InMemoryStore，可替换为 SQLite/Redis）
 */
class InMemoryStore {
  constructor () {
    this._data = new Map()
  }

  get (key) {
    return this._data.get(key) ?? null
  }

  set (key, value) {
    this._data.set(key, value)
  }

  /** 返回所有存储的 key（用于调试/测试） */
  keys () {
    return Array.from(this._data.keys())
  }
}

class PublishIntervalGuard {
  /**
   * @param {object} [options]
   * @param {number} [options.minInterval] - 最小发布间隔 (ms)，默认 5 分钟
   * @param {object} [options.store] - 外部存储 { get(key), set(key, value) }
   */
  constructor (options = {}) {
    this._minInterval = options.minInterval || 5 * 60 * 1000  // 默认 5 分钟
    this._store = options.store || new InMemoryStore()
  }

  /**
   * 内部 key：platform + accountId 组合
   */
  _key (platform, accountId) {
    return `${platform}:${accountId}`
  }

  /**
   * 检查是否允许发布
   * @param {string} platform - 平台标识
   * @param {string} accountId - 账号 ID
   * @returns {boolean}
   */
  canPublish (platform, accountId) {
    const lastTime = this._store.get(this._key(platform, accountId))
    if (!lastTime) return true
    return (Date.now() - lastTime) >= this._minInterval
  }

  /**
   * 记录发布时间
   * @param {string} platform - 平台标识
   * @param {string} accountId - 账号 ID
   * @param {number} [timestamp] - 时间戳 (ms)，默认 Date.now()
   */
  recordPublish (platform, accountId, timestamp) {
    this._store.set(this._key(platform, accountId), timestamp ?? Date.now())
  }

  /**
   * 获取还需等待时间
   * @param {string} platform - 平台标识
   * @param {string} accountId - 账号 ID
   * @returns {number} 剩余等待时间 (ms)，0 表示可以发布
   */
  getRemainingWait (platform, accountId) {
    const lastTime = this._store.get(this._key(platform, accountId))
    if (!lastTime) return 0
    const elapsed = Date.now() - lastTime
    return Math.max(0, this._minInterval - elapsed)
  }
}

PublishIntervalGuard.InMemoryStore = InMemoryStore
module.exports = PublishIntervalGuard
