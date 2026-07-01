/**
 * DataSyncService — 数据同步系统
 *
 * 从各平台拉取发布数据（阅读/粉丝/评论等），
 * 缓存到 SQLite，供 Dashboard 展示。
 *
 * 同步方式：
 *   - API 模式：直接调平台内部 API（抖音/B站）
 *   - Playwright 模式：登录后抓取数据页（微信/小红书/视频号）
 *
 * 文件位置: packages/shared-utils/src/data-sync.js
 */
const TTL_DEFAULT = 60 * 60 * 1000  // 1 小时

// 支持数据同步的平台
const SYNC_PLATFORMS = ['douyin', 'bilibili', 'xiaohongshu', 'tencent_video', 'wechat_mp']

class DataSyncService {
  /**
   * @param {object} store - Store 实例（需有 getSetting/setSetting）
   * @param {object} [options]
   * @param {number} [options.cacheTTL] - 缓存有效期 (ms)
   */
  constructor (store, options = {}) {
    this._store = store
    this._cacheTTL = options.cacheTTL || TTL_DEFAULT

    // 注册同步器
    this._syncers = {}
    for (const platform of SYNC_PLATFORMS) {
      const methodName = `_sync_${platform}`
      if (typeof this[methodName] === 'function') {
        this._syncers[platform] = this[methodName].bind(this)
      }
    }
  }

  // ─── 公开接口 ─────────────────────────────

  /**
   * 同步所有支持的平台
   * @returns {Promise<Array<{platform, syncedAt, data?, error?}>>}
   */
  async syncAll () {
    const platforms = Object.keys(this._syncers)
    const results = await Promise.allSettled(
      platforms.map(p => this._syncOne(p))
    )
    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value
      return this._makeErrorResult(platforms[i], r.reason?.message || '同步失败')
    })
  }

  /**
   * 同步单个平台
   * @param {string} platform
   * @returns {Promise<object>}
   */
  async syncPlatform (platform) {
    return this._syncOne(platform)
  }

  /**
   * 获取缓存的同步数据
   * @param {string} platform
   * @returns {object|null}
   */
  getCachedData (platform) {
    if (!this._store) return null
    const raw = this._store.getSetting(`sync_data_${platform}`)
    if (!raw) return null
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      // 检查是否过期
      if (Date.now() - new Date(parsed.syncedAt).getTime() > this._cacheTTL) {
        return null
      }
      return parsed
    } catch (e) {
      return null
    }
  }

  /**
   * 获取所有缓存的同步数据（用于 Dashboard）
   * @returns {Array<object>}
   */
  getAllCachedData () {
    return SYNC_PLATFORMS
      .map(p => this.getCachedData(p))
      .filter(Boolean)
  }

  /**
   * 获取支持的平台列表
   * @returns {string[]}
   */
  getSupportedPlatforms () {
    return [...SYNC_PLATFORMS]
  }

  // ─── 内部方法 ─────────────────────────────

  async _syncOne (platform) {
    const syncer = this._syncers[platform]
    if (!syncer) {
      return this._makeErrorResult(platform, `不支持的平台: ${platform}`)
    }
    try {
      const data = await syncer()
      const result = this._makeSyncResult(platform, data)
      this._cacheData(platform, result)
      return result
    } catch (e) {
      const result = this._makeErrorResult(platform, e.message)
      return result
    }
  }

  _makeSyncResult (platform, data) {
    return {
      platform,
      syncedAt: new Date().toISOString(),
      ...data,
    }
  }

  _makeErrorResult (platform, error) {
    return {
      platform,
      syncedAt: new Date().toISOString(),
      error,
    }
  }

  _cacheData (platform, data) {
    if (this._store) {
      this._store.setSetting(`sync_data_${platform}`, JSON.stringify(data))
    }
  }

  // ─── 各平台同步器 ─────────────────────────
  // 当前为 mock 实现，后续通过 Playwright/API 真实抓取

  async _sync_douyin () {
    // TODO: 通过 API 或 Playwright 拉取抖音数据
    return {
      articles: 0, views: 0, comments: 0, likes: 0, followers: 0,
      _note: '待接入真实数据源',
    }
  }

  async _sync_bilibili () {
    // TODO: 通过 B站 API 拉取数据
    return {
      articles: 0, views: 0, comments: 0, likes: 0, followers: 0,
      _note: '待接入真实数据源',
    }
  }

  async _sync_xiaohongshu () {
    // TODO: Playwright 抓取小红书数据页
    return {
      articles: 0, views: 0, comments: 0, likes: 0, followers: 0,
      _note: '待接入真实数据源',
    }
  }

  async _sync_tencent_video () {
    // TODO: Playwright 抓取视频号数据页
    return {
      articles: 0, views: 0, comments: 0, likes: 0, followers: 0,
      _note: '待接入真实数据源',
    }
  }

  async _sync_wechat_mp () {
    // TODO: Playwright 抓取公众号数据页
    return {
      articles: 0, views: 0, comments: 0, likes: 0, followers: 0,
      _note: '待接入真实数据源',
    }
  }
}

module.exports = DataSyncService
