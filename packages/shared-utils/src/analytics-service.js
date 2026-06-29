/**
 * AnalyticsService — 平台数据分析服务
 *
 * 统一获取各平台数据统计。设计为 provider 模式：
 * - 核心类负责调度、归一化、事件
 * - 各平台 provider 实现具体 HTTP 请求逻辑
 *
 * 数据模型:
 * {
 *   platform: string,
 *   period: 'day' | 'week' | 'month',
 *   metrics: { fans, likes, collects, comments, shares, views },
 *   trend: [{ date, value }]
 * }
 */
const EventEmitter = require('events')

const DEFAULT_METRICS = {
  fans: 0,
  likes: 0,
  collects: 0,
  comments: 0,
  shares: 0,
  views: 0,
}

class AnalyticsService extends EventEmitter {
  constructor (options = {}) {
    super()
    this._providers = new Map()

    if (options.providers) {
      for (const [platform, provider] of Object.entries(options.providers)) {
        this._providers.set(platform, provider)
      }
    }
  }

  /**
   * 注册平台数据提供者
   * @param {string} platform - 平台标识 (xiaohongshu, douyin, ...)
   * @param {Function} providerFn - async (platform, credentials) => { platform, metrics, trend }
   */
  registerProvider (platform, providerFn) {
    this._providers.set(platform, providerFn)
    this.emit('provider:registered', { platform })
  }

  /**
   * 获取已注册的 provider 函数
   * @param {string} platform
   * @returns {Function|undefined}
   */
  getProvider (platform) {
    return this._providers.get(platform)
  }

  /**
   * 移除平台 provider
   * @param {string} platform
   */
  removeProvider (platform) {
    this._providers.delete(platform)
    this.emit('provider:removed', { platform })
  }

  /**
   * 获取所有已注册平台
   * @returns {string[]}
   */
  getRegisteredPlatforms () {
    return Array.from(this._providers.keys())
  }

  /**
   * 获取单个平台数据
   * @param {string} platform
   * @param {object} [credentials] - 平台凭证 (cookies, tokens)
   * @returns {Promise<object>}
   */
  async fetchPlatformData (platform, credentials = {}) {
    const provider = this._providers.get(platform)
    if (!provider) {
      const err = new Error(`No provider registered for platform: ${platform}`)
      this.emit('data:error', { platform, error: err.message })
      throw err
    }

    try {
      const raw = await provider(platform, credentials)
      const normalized = {
        platform: raw.platform || platform,
        period: raw.period || 'day',
        metrics: AnalyticsService.normalizeMetrics(raw.metrics || {}),
        trend: AnalyticsService.normalizeTrend(raw.trend || []),
      }
      this.emit('data:fetched', normalized)
      return normalized
    } catch (err) {
      this.emit('data:error', { platform, error: err.message })
      throw err
    }
  }

  /**
   * 批量获取多平台数据（并行）
   * @param {string[]} platforms
   * @param {object} [credentialsMap] - { platform -> credentials }
   * @returns {Promise<Array>}
   */
  async fetchOverview (platforms, credentialsMap = {}) {
    if (!platforms || platforms.length === 0) return []

    const promises = platforms.map(async (platform) => {
      try {
        const data = await this.fetchPlatformData(platform, credentialsMap[platform] || {})
        return data
      } catch (err) {
        return { platform, error: err.message, metrics: { ...DEFAULT_METRICS }, trend: [] }
      }
    })

    return Promise.all(promises)
  }

  /**
   * 归一化指标数据 — 确保所有字段存在
   * @param {object} raw
   * @returns {object}
   */
  static normalizeMetrics (raw) {
    return {
      fans: typeof raw.fans === 'number' ? raw.fans : 0,
      likes: typeof raw.likes === 'number' ? raw.likes : 0,
      collects: typeof raw.collects === 'number' ? raw.collects : 0,
      comments: typeof raw.comments === 'number' ? raw.comments : 0,
      shares: typeof raw.shares === 'number' ? raw.shares : 0,
      views: typeof raw.views === 'number' ? raw.views : 0,
    }
  }

  /**
   * 归一化趋势数据
   * @param {Array} raw
   * @returns {Array<{date, value}>}
   */
  static normalizeTrend (raw) {
    if (!Array.isArray(raw)) return []
    return raw.map(item => ({
      date: item.date || '',
      value: typeof item.value === 'number' ? item.value : 0,
    }))
  }
}

module.exports = AnalyticsService
