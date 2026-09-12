// @ts-check
/**
 * 平台指标解析器注册表 — 表现数据回采的统一架构
 *
 * 每平台一个 parser 插件，统一接口：
 *   { platform, resolveContentUrl(postId, resultUrl), async fetchMetrics({ url, postId }) }
 * fetchMetrics 返回 { views, likes, comments, favorites, shares, raw }
 *
 * 第一批（有真实 URL 或 postId 可构造）：zhihu / baijiahao / kuaishou / bilibili
 * 未注册平台：recrawl_status = unsupported（UI 提供手动录入兜底）
 * 新平台接入 = 新增一个 parser 文件 + 在此注册，核心零改动。
 */
const log = require('../logger')

const registry = new Map()

function registerParser(parser) {
  if (!parser || !parser.platform || typeof parser.fetchMetrics !== 'function') {
    throw new Error('invalid platform metrics parser: ' + (parser && parser.platform))
  }
  registry.set(parser.platform, parser)
}

function getParser(platform) {
  return registry.get(String(platform || '').toLowerCase()) || null
}

function supportedPlatforms() {
  return Array.from(registry.keys())
}

// ─── 第一批解析器 ───

// 知乎：API 模式发布返回真实文章 URL（/p/{aid}）；页面内 JSON-LD 含互动数
registerParser({
  platform: 'zhihu',
  resolveContentUrl(postId, resultUrl) {
    if (resultUrl && /zhihu\.com\/p\//.test(resultUrl)) return resultUrl
    if (postId) return 'https://zhihu.com/p/' + postId
    return ''
  },
  async fetchMetrics({ url, postId }) {
    const target = url || this.resolveContentUrl(postId, '')
    if (!target) throw new Error('zhihu: no content url')
    return await fetchPageMetrics(target, {
      // 知乎页面 initialData 含点赞/评论（结构随版本变化，解析失败返回零值由上层记 failed）
      likeCount: /"voteupCount":\s*(\d+)/,
      commentCount: /"commentCount":\s*(\d+)/,
      favoriteCount: /"favoritedCount"|\\"favoriteCount\\":\s*(\d+)/,
    })
  },
})

// 百家号：API/RPA 均返回真实文章 URL；页面含阅读/点赞/评论
registerParser({
  platform: 'baijiahao',
  resolveContentUrl(postId, resultUrl) {
    if (resultUrl && /baijiahao\.baidu\.com\/s\?id=/.test(resultUrl)) return resultUrl
    if (postId) return 'https://baijiahao.baidu.com/s?id=' + postId
    return ''
  },
  async fetchMetrics({ url, postId }) {
    const target = url || this.resolveContentUrl(postId, '')
    if (!target) throw new Error('baijiahao: no content url')
    return await fetchPageMetrics(target, {
      viewCount: /"readCount"|"playCount"|阅读[量数][^0-9]*(\d+)/,
      likeCount: /"likeCount"|"praiseCount"|点赞[^0-9]*(\d+)/,
      commentCount: /"commentCount"|评论[^0-9]*(\d+)/,
    })
  },
})

// 快手：RPA 模式 postId 可构造 m.gifshow.com 链接
registerParser({
  platform: 'kuaishou',
  resolveContentUrl(postId, resultUrl) {
    if (postId) return 'https://m.gifshow.com/fw/photo/' + postId
    return ''
  },
  async fetchMetrics({ url, postId }) {
    const target = url || this.resolveContentUrl(postId, '')
    if (!target) throw new Error('kuaishou: no content url')
    return await fetchPageMetrics(target, {
      viewCount: /"viewCount"|播放[^0-9]*(\d+)/,
      likeCount: /"likeCount"|点赞[^0-9]*(\d+)/,
      commentCount: /"commentCount"|评论[^0-9]*(\d+)/,
    })
  },
})

// B 站：视频/专栏页面含 view/like/reply/favorite（JSON API 可选）
registerParser({
  platform: 'bilibili',
  resolveContentUrl(postId, resultUrl) {
    if (resultUrl && /bilibili\.com\/(video|read\/cv)/.test(resultUrl)) return resultUrl
    if (postId) return 'https://www.bilibili.com/video/' + postId
    return ''
  },
  async fetchMetrics({ url, postId }) {
    const target = url || this.resolveContentUrl(postId, '')
    if (!target) throw new Error('bilibili: no content url')
    // B 站有公开 API：https://api.bilibili.com/x/web-interface/view?bvid=...
    const bvidMatch = target.match(/(BV[a-zA-Z0-9]+)/)
    if (bvidMatch) {
      try {
        const res = await httpGetJson('https://api.bilibili.com/x/web-interface/view?bvid=' + bvidMatch[1])
        const d = (res && res.data) || {}
        return {
          views: Number(d.stat && d.stat.view) || 0,
          likes: Number(d.stat && d.stat.like) || 0,
          comments: Number(d.stat && d.stat.reply) || 0,
          favorites: Number(d.stat && d.stat.favorite) || 0,
          shares: Number(d.stat && d.stat.share) || 0,
          raw: { api: 'web-interface-view' },
        }
      } catch (e) { /* API 失败回退页面解析 */ }
    }
    return await fetchPageMetrics(target, {
      viewCount: /"view":\s*(\d+)/,
      likeCount: /"like":\s*(\d+)/,
      commentCount: /"reply":\s*(\d+)/,
      favoriteCount: /"favorite":\s*(\d+)/,
    })
  },
})

// ─── 共享工具 ───

async function httpGetJson(url, timeoutMs = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function fetchPageMetrics(url, patterns) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const html = await res.text()
    const out = { views: 0, likes: 0, comments: 0, favorites: 0, shares: 0, raw: { source: 'page' } }
    const map = [
      ['views', patterns.viewCount], ['likes', patterns.likeCount],
      ['comments', patterns.commentCount], ['favorites', patterns.favoriteCount], ['shares', patterns.shareCount],
    ]
    for (const [field, pattern] of map) {
      if (!pattern) continue
      const m = html.match(pattern)
      if (m) out[field] = Number(m[1]) || 0
    }
    return out
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { registerParser, getParser, supportedPlatforms, httpGetJson, fetchPageMetrics }
