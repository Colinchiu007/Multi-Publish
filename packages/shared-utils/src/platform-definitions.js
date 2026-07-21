/**
 * Platform Definitions — 平台元数据单一数据源
 *
 * 集中管理所有平台的登录 URL、显示名称、Dashboard URL、登录检测模式/选择器。
 * 所有 Electron 主进程模块从此文件引入，消除 6+ 处重复定义。
 *
 * 覆盖 15 个平台：
 *   wechat_mp, zhihu, weibo, douyin, xiaohongshu
 *   tencent_video, kuaishou, toutiao, bilibili, baijiahao
 *   youtube, tiktok, twitter, instagram, facebook
 *
 * 新增平台时只需在此文件添加一条记录，并确保 config/platforms.yaml 有对应配置。
 * 各消费者模块无需修改。
 *
 * @see config/platforms.yaml — 平台级配置（类型、URL、尺寸限制等）
 */

// ─── 登录页 URL ────────────────────────────
// 内嵌浏览器打开登录页时使用
const PLATFORM_LOGIN_URLS = {
  wechat_mp: 'https://mp.weixin.qq.com/',
  zhihu: 'https://www.zhihu.com/signin',
  weibo: 'https://weibo.com/login',
  douyin: 'https://www.douyin.com/',
  xiaohongshu: 'https://creator.xiaohongshu.com/',
  tencent_video: 'https://channels.weixin.qq.com/',
  kuaishou: 'https://cp.kuaishou.com/',
  toutiao: 'https://mp.toutiao.com/',
  bilibili: 'https://passport.bilibili.com/login',
  baijiahao: 'https://baijiahao.baidu.com/',
  youtube: 'https://studio.youtube.com/',
  tiktok: 'https://www.tiktok.com/upload/',
  twitter: 'https://twitter.com/i/flow/login',
  instagram: 'https://www.instagram.com/accounts/login/',
  facebook: 'https://www.facebook.com/login/',
}

// ─── 创作者后台/Dashboard URL（分屏监控用）───
const PLATFORM_DASHBOARD_URLS = {
  wechat_mp: 'https://mp.weixin.qq.com/',
  zhihu: 'https://www.zhihu.com/',
  weibo: 'https://weibo.com/',
  douyin: 'https://creator.douyin.com/',
  xiaohongshu: 'https://creator.xiaohongshu.com/',
  tencent_video: 'https://channels.weixin.qq.com/',
  kuaishou: 'https://cp.kuaishou.com/',
  toutiao: 'https://mp.toutiao.com/',
  bilibili: 'https://www.bilibili.com/',
  baijiahao: 'https://baijiahao.baidu.com/',
  youtube: 'https://studio.youtube.com/',
  tiktok: 'https://www.tiktok.com/',
  twitter: 'https://twitter.com/home',
  instagram: 'https://www.instagram.com/',
  facebook: 'https://www.facebook.com/',
}

// ─── 登录成功后 URL 特征（URL 包含检测）──────
// auth-view-manager 使用 URL 变化检测登录完成
const PLATFORM_LOGIN_SUCCESS_PATTERNS = {
  wechat_mp: ['cgi-bin/home', 'cgi-bin/appmsg'],
  zhihu: ['zhihu.com/people', 'zhihu.com/home', 'zhuanlan.zhihu.com', 'www.zhihu.com/creator'],
  weibo: ['weibo.com/home', 'weibo.com/u/'],
  douyin: ['douyin.com'],
  xiaohongshu: ['creator.xiaohongshu.com'],
  tencent_video: ['channels.weixin.qq.com'],
  kuaishou: ['cp.kuaishou.com'],
  toutiao: ['mp.toutiao.com'],
  bilibili: ['www.bilibili.com/'],
  baijiahao: ['baijiahao.baidu.com'],
  youtube: ['studio.youtube.com'],
  tiktok: ['tiktok.com/upload'],
  twitter: ['twitter.com/home', 'twitter.com/explore'],
  instagram: ['instagram.com/'],
  facebook: ['facebook.com/'],
}

// 登录完成判定和凭证提取共用的可信域名边界。
// 只允许明确的创作者/平台域名，避免把 query/hash 中伪造的成功路径当成登录完成。
const PLATFORM_AUTH_HOSTS = {
  wechat_mp: ['mp.weixin.qq.com'],
  zhihu: ['www.zhihu.com', 'zhihu.com', 'zhuanlan.zhihu.com'],
  weibo: ['weibo.com', 'www.weibo.com'],
  douyin: ['www.douyin.com', 'creator.douyin.com'],
  xiaohongshu: ['creator.xiaohongshu.com'],
  tencent_video: ['channels.weixin.qq.com'],
  kuaishou: ['cp.kuaishou.com'],
  toutiao: ['mp.toutiao.com'],
  bilibili: ['www.bilibili.com', 'bilibili.com'],
  baijiahao: ['baijiahao.baidu.com'],
  youtube: ['studio.youtube.com'],
  tiktok: ['www.tiktok.com', 'tiktok.com'],
  twitter: ['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com'],
  instagram: ['www.instagram.com', 'instagram.com'],
  facebook: ['www.facebook.com', 'facebook.com'],
}

// 平台可能使用父域 Cookie；仍然限定在对应平台的根域内。
const PLATFORM_COOKIE_DOMAINS = {
  wechat_mp: ['mp.weixin.qq.com', 'weixin.qq.com'],
  tencent_video: ['channels.weixin.qq.com', 'weixin.qq.com'],
  zhihu: ['zhihu.com'],
  weibo: ['weibo.com', 'sina.com.cn'],
  douyin: ['douyin.com'],
  xiaohongshu: ['xiaohongshu.com'],
  kuaishou: ['kuaishou.com'],
  toutiao: ['toutiao.com'],
  bilibili: ['bilibili.com'],
  baijiahao: ['baijiahao.baidu.com', 'passport.baidu.com'],
  youtube: ['youtube.com', 'studio.youtube.com', 'accounts.google.com'],
  tiktok: ['tiktok.com'],
  twitter: ['twitter.com', 'x.com'],
  instagram: ['instagram.com'],
  facebook: ['facebook.com'],
}

function normalizeHost (value) {
  return String(value || '').trim().toLowerCase().replace(/^\.+/, '').replace(/\.$/, '')
}

/**
 * @param {string} platform
 * @param {string} hostname
 * @returns {boolean}
 */
function isPlatformAuthHost (platform, hostname) {
  const normalized = normalizeHost(hostname)
  return (PLATFORM_AUTH_HOSTS[platform] || []).some(host => normalizeHost(host) === normalized)
}

/**
 * @param {string} platform
 * @param {string} rawUrl
 * @returns {boolean}
 */
function isPlatformLoginSuccessUrl (platform, rawUrl) {
  let parsed
  try { parsed = new URL(String(rawUrl)) } catch (_) { return false }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false
  if (!isPlatformAuthHost(platform, parsed.hostname)) return false
  try {
    const loginUrl = new URL(PLATFORM_LOGIN_URLS[platform])
    const normalizePath = pathname => pathname.replace(/\/+$/, '') || '/'
    if (
      parsed.origin === loginUrl.origin &&
      normalizePath(parsed.pathname) === normalizePath(loginUrl.pathname)
    ) return false
  } catch (_) { /* 未配置登录页时由下方模式匹配决定 */ }
  const haystack = `${parsed.hostname}${parsed.pathname}${parsed.search}`.toLowerCase()
  return (PLATFORM_LOGIN_SUCCESS_PATTERNS[platform] || [])
    .some(pattern => haystack.includes(String(pattern).toLowerCase()))
}

/**
 * 判断 Cookie domain 是否属于指定平台，允许平台配置的父域。
 * @param {string} platform
 * @param {string} domain
 * @returns {boolean}
 */
function isPlatformCookieDomain (platform, domain) {
  const normalized = normalizeHost(domain)
  if (!normalized) return false
  return (PLATFORM_COOKIE_DOMAINS[platform] || []).some(host => {
    const candidate = normalizeHost(host)
    return normalized === candidate || normalized.endsWith(`.${candidate}`)
  })
}

// ─── 登录成功 CSS 选择器（DOM 检测）──────────
// 用于 Playwright / RPA 引擎页面内检测登录状态
const PLATFORM_LOGIN_SUCCESS_SELECTORS = {
  wechat_mp: ['.index_main', '.menu_box', 'a[href*="cgi-bin/home"]'],
  zhihu: ['.AppHeader-profileAvatar', '.ProfileHeader-avatar', 'img[alt="avatar"]', '[class*="ProfileHeader"]'],
  weibo: ['.gn_name', '.Avatar', '[node-type="userInfo"]'],
  douyin: ['.user-info', '.account-info', '.creator-header'],
  xiaohongshu: ['[class*="avatar"]', '[class*="userInfo"]', '.user-avatar'],
  tencent_video: ['.channel-header', '.creator-header', '[class*="weixinChannel"]'],
  kuaishou: ['.user-info', '.profile-avatar', '[class*="creator-header"]'],
  toutiao: ['.user-avatar', '.header-avatar', '[class*="avatar"]', '.nickname'],
  bilibili: [],
  baijiahao: ['.user-info', '.user-avatar', '.nickname', '[class*="user"]'],
  youtube: ['#avatar-btn', 'ytcp-avatar', '[class*="avatar"]'],
  tiktok: ['[data-testid="user-avatar"]', '[class*="avatar"]', '.user-avatar'],
  twitter: ['div[data-testid="primaryColumn"]', 'div[data-testid="SideNav_AccountSwitcher_Button"]', 'header[role="banner"]'],
  instagram: ['svg[aria-label="Home"]', 'nav[role="navigation"]', 'section main article', 'a[href="/direct/inbox/"]'],
  facebook: ['a[aria-label*="profile"]', 'a[aria-label*="Profile"]', 'div[aria-label*="Account"]', 'div[data-pagelet*="root"]'],
}

// ─── 平台显示名称 ───────────────────────────
const PLATFORM_NAMES = {
  wechat_mp: '微信公众号',
  zhihu: '知乎',
  weibo: '微博',
  douyin: '抖音',
  xiaohongshu: '小红书',
  tencent_video: '视频号',
  kuaishou: '快手',
  toutiao: '今日头条',
  bilibili: 'B站',
  baijiahao: '百家号',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  twitter: 'Twitter/X',
  instagram: 'Instagram',
  facebook: 'Facebook',
}


// ─── 平台图标（展示用）────────────────────────
const PLATFORM_ICONS = {
  wechat_mp: '💬',
  zhihu: '❓',
  weibo: '✧',
  douyin: '🎵',
  xiaohongshu: '📕',
  tencent_video: '▶',
  kuaishou: '🎬',
  toutiao: '📰',
  bilibili: '📺',
  baijiahao: '📖',
  youtube: '▶',
  tiktok: '♪',
  twitter: '✕',
  instagram: '📷',
  facebook: '👍',
}

// ─── 支持二维码登录的平台列表 ─────────────────
const QR_CODE_PLATFORMS = ['wechat_mp', 'tencent_video', 'zhihu', 'weibo', 'toutiao']

/**
 * 获取平台显示名称
 * @param {string} platform
 * @returns {string}
 */
function getPlatformName(platform) {
  return PLATFORM_NAMES[platform] || platform
}

module.exports = {
  PLATFORM_LOGIN_URLS,
  PLATFORM_DASHBOARD_URLS,
  PLATFORM_LOGIN_SUCCESS_PATTERNS,
  PLATFORM_AUTH_HOSTS,
  PLATFORM_COOKIE_DOMAINS,
  isPlatformAuthHost,
  isPlatformLoginSuccessUrl,
  isPlatformCookieDomain,
  PLATFORM_LOGIN_SUCCESS_SELECTORS,
  PLATFORM_NAMES,
  PLATFORM_ICONS,
  QR_CODE_PLATFORMS,
  getPlatformName,
}
