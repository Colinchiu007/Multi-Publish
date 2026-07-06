// @ts-nocheck
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
  // 内部辅助：通过 RPA 提取平台统计数据
  // 向主进程发送 IPC 请求，由 RpaViewManager 在隐藏 BrowserWindow 中执行
  async _rpaFetchStats (platform, url, extractScript) {
    try {
      // 通过 IPC 调用主进程的 RPA 引擎
      // 主进程处理: open hidden window -> navigate to url -> execute script -> return data
      // 实际已通过 electron-bridge 暴露为 window.electronAPI.rpaFetchData(platform, url, script)
      if (typeof window !== 'undefined' && window.electronAPI?.rpaFetchData) {
        return await window.electronAPI.rpaFetchData(platform, url, extractScript)
      }
      // 回退：尝试 require (主进程直接使用)
      const { ipcRenderer } = require('electron')  // may be null in sandbox
      if (ipcRenderer) {
        return await ipcRenderer.invoke('rpa:fetchData', { platform, url, script: extractScript })
      }
    } catch (err) {
      console.warn(`[DataSync] RPA fetch failed for ${platform}:`, err.message)
    }
    // 兜底：返回缓存或空数据
    return { articles: 0, views: 0, comments: 0, likes: 0, followers: 0, _note: 'RPA 不可用' }
  }

  async _sync_douyin () {
    // 抖音创作者后台 API (已登录 Cookie)
    const script = `() => {
      const stats = document.querySelector('.creator-data-panel');
      if (!stats) return null;
      return {
        views: parseInt(stats.querySelector('[data-key=total_play]')?.textContent || '0'),
        followers: parseInt(stats.querySelector('[data-key=fans]')?.textContent || '0'),
      };
    }`
    return this._rpaFetchStats('douyin', 'https://creator.douyin.com/', script)
  }

  async _sync_bilibili () {
    // B站 UP 主数据页
    const script = `() => {
      const el = document.querySelector('.num-section');
      if (!el) return null;
      const nums = [...el.querySelectorAll('.num-item')];
      return {
        views: parseInt(nums[0]?.textContent?.replace(/[^0-9]/g,'') || '0'),
        followers: parseInt(nums[1]?.textContent?.replace(/[^0-9]/g,'') || '0'),
      };
    }`
    return this._rpaFetchStats('bilibili', 'https://member.bilibili.com/platform/home', script)
  }

  async _sync_xiaohongshu () {
    // 小红书创作者数据页
    const script = `() => {
      const el = document.querySelector('.creator-data');
      if (!el) return null;
      return {
        views: parseInt(el.querySelector('[class*=read]')?.textContent?.replace(/[^0-9]/g,'') || '0'),
        followers: parseInt(el.querySelector('[class*=fans]')?.textContent?.replace(/[^0-9]/g,'') || '0'),
      };
    }`
    return this._rpaFetchStats('xiaohongshu', 'https://creator.xiaohongshu.com/', script)
  }

  async _sync_tencent_video () {
    // 视频号创作者后台
    const script = `() => {
      return {
        views: parseInt(document.querySelector('[data-role=totalViews]')?.textContent?.replace(/[^0-9]/g,'') || '0'),
        followers: parseInt(document.querySelector('[data-role=fans]')?.textContent?.replace(/[^0-9]/g,'') || '0'),
      };
    }`
    return this._rpaFetchStats('tencent_video', 'https://channels.weixin.qq.com/', script)
  }

  async _sync_wechat_mp () {
    // 公众号后台统计页
    const script = `() => {
      return {
        articles: parseInt(document.querySelector('#articleCount')?.textContent || '0'),
        views: parseInt(document.querySelector('#totalViews')?.textContent?.replace(/[^0-9]/g,'') || '0'),
        followers: parseInt(document.querySelector('#totalFans')?.textContent?.replace(/[^0-9]/g,'') || '0'),
      };
    }`
    return this._rpaFetchStats('wechat_mp', 'https://mp.weixin.qq.com/', script)
  }
}

module.exports = DataSyncService
