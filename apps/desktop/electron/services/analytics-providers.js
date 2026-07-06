// @ts-nocheck
/**
 * analytics-providers.js — AnalyticsService 平台数据提供者
 *
 * 为 AnalyticsService 注册各平台的数据获取函数。
 * 每个 provider 使用 cookie 认证调用平台的创作者数据 API。
 *
 * 设计原则:
 * - provider 返回空数据而非 throw，确保 fetchOverview 不因为单个平台失败而中断
 * - HTTP 层使用原生 http/https 模块，零外部依赖
 * - cookie 来源：Multi-Publish 账号管理（store.listAccounts）
 *
 * 提供者:
 * - xiaohongshu — 小红书创作者数据中心
 * - douyin      — 抖音创作者数据中心
 */

const https = require('https')
const http = require('http')
const { URL } = require('url')

// ── 常量 ─────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 10000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

// ── 通用 HTTP 工具 ──────────────────────────────────────

/**
 * 带 cookie 的 HTTP GET 请求
 * @param {string} urlStr
 * @param {Array<{name, value}>} cookies
 * @param {number} [timeout]
 * @returns {Promise<object>}
 */
function httpGet (urlStr, cookies = [], timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const transport = url.protocol === 'https:' ? https : http

    const cookieStr = cookies
      .filter(c => c.name && c.value)
      .map(c => `${encodeURIComponent(c.name)}=${encodeURIComponent(c.value)}`)
      .join('; ')

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      timeout,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: url.origin + '/',
        ...(cookieStr ? { Cookie: cookieStr } : {}),
      },
    }

    const req = transport.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)) }
          catch (e) { reject(new Error(`JSON parse error: ${e.message}`)) }
        } else if (res.statusCode === 302 || res.statusCode === 301) {
          reject(new Error(`Redirect (${res.statusCode}) — cookie may be expired`))
        } else if (res.statusCode === 403 || res.statusCode === 401) {
          reject(new Error(`Auth failed (${res.statusCode}) — cookie invalid`))
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`))
        }
      })
    })

    req.on('error', (err) => reject(new Error(`Request error: ${err.message}`)))
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')) })
    req.end()
  })
}

// ── 小红书 Provider ─────────────────────────────────────

/**
 * 小红书创作者数据中心 API
 *
 * API 端点: GET /api/galaxy/creator/datacenter/note/analyze/list
 * 认证: 登录后的 web_session cookie
 *
 * @param {string} platform - 'xiaohongshu'
 * @param {object} credentials - { cookies: [{name, value}] }
 * @returns {Promise<{platform, metrics, trend}>}
 */
async function xiaohongshuProvider (platform, credentials) {
  const cookies = credentials?.cookies || []
  if (cookies.length === 0) {
    return { platform: 'xiaohongshu', period: 'day', metrics: {}, trend: [] }
  }

  try {
    // 小红书创作者数据 API（获取最近笔记统计数据）
    const data = await httpGet(
      'https://creator.xiaohongshu.com/api/galaxy/creator/datacenter/note/analyze/list?page_size=10&page=1',
      cookies
    )

    // 尝试解析响应 — 实际 API 结构可能不同，这里是根据常见电商平台设计
    const result = data?.data || data?.result || {}
    const items = result?.items || result?.list || []
    const overview = result?.overview || {}

    const metrics = {
      fans: overview.follower_count || overview.fans || 0,
      views: items.reduce((s, i) => s + (i.view_count || i.read_count || 0), 0),
      likes: items.reduce((s, i) => s + (i.like_count || i.likes || 0), 0),
      collects: items.reduce((s, i) => s + (i.collect_count || i.collects || 0), 0),
      comments: items.reduce((s, i) => s + (i.comment_count || i.comments || 0), 0),
      shares: items.reduce((s, i) => s + (i.share_count || i.shares || 0), 0),
    }

    return { platform: 'xiaohongshu', period: 'day', metrics, trend: [] }
  } catch (err) {
    // 网络/认证失败时返回空数据，避免拖垮多平台概览
    return { platform: 'xiaohongshu', period: 'day', metrics: {}, trend: [], _error: err.message }
  }
}

// ── 抖音 Provider ───────────────────────────────────────

/**
 * 抖音创作者数据中心 API
 *
 * API 端点: GET /creator/data/overview/v1/
 * 认证: 登录后的 session 相关 cookie
 *
 * @param {string} platform - 'douyin'
 * @param {object} credentials - { cookies: [{name, value}] }
 * @returns {Promise<{platform, metrics, trend}>}
 */
async function douyinProvider (platform, credentials) {
  const cookies = credentials?.cookies || []
  if (cookies.length === 0) {
    return { platform: 'douyin', period: 'day', metrics: {}, trend: [] }
  }

  try {
    // 抖音创作者数据中心（作品数据概览）
    const data = await httpGet(
      'https://creator.douyin.com/creator/data/overview/v1/?need_comparison=false',
      cookies
    )

    const overview = data?.data || data?.result || {}

    const metrics = {
      fans: overview.follower_count || overview.fans || 0,
      views: overview.total_play || overview.total_views || overview.views || 0,
      likes: overview.total_like || overview.total_likes || overview.likes || 0,
      collects: overview.total_favorite || overview.total_favorites || overview.collects || 0,
      comments: overview.total_comment || overview.total_comments || overview.comments || 0,
      shares: overview.total_share || overview.total_shares || overview.shares || 0,
    }

    // 尝试提取趋势数据
    const trend = Array.isArray(overview.trend)
      ? overview.trend.map(item => ({
          date: item.date || item.dt || '',
          value: item.value || item.count || 0,
        }))
      : []

    return { platform: 'douyin', period: 'day', metrics, trend }
  } catch (err) {
    return { platform: 'douyin', period: 'day', metrics: {}, trend: [], _error: err.message }
  }
}

// ── 导出 ─────────────────────────────────────────────────

module.exports = {
  xiaohongshuProvider,
  douyinProvider,
  httpGet,
}
