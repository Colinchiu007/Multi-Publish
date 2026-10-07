// @ts-check
/**
 * 平台公开内容页解析 —— 「作品链接」目的地语义的单一真源（CommonJS 侧）
 *
 * 存在理由（PRD-PUBLISH-HISTORY-PUBLIC-LINK-2026-10-07）：
 * 发布链路落库的 `result.url` 是 RPA webview 的**当前页面地址**。绝大多数平台的
 * `publish_url`（config/platforms.yaml）本身就是创作者后台：
 *   xiaohongshu  https://creator.xiaohongshu.com/
 *   toutiao      https://mp.toutiao.com/
 *   bilibili     https://member.bilibili.com/platform/upload/video/frame
 *   baijiahao    https://baijiahao.baidu.com/builder/rc/edit?type=videoV2
 *   kuaishou     https://cp.kuaishou.com/article/publish/video?tabType=1
 *   tencent_video https://channels.weixin.qq.com/
 * 于是「作品链接」实际是个**登录墙**。应用内标签 / 系统浏览器都不携带平台会话 Cookie，
 * 平台把请求重定向到登录页 —— 用户点开看到的是登录页而不是作品内容页。
 *
 * 本模块在 `safeHttpUrl`（**协议**判据）**之前**补一层「目的地语义」判据：
 *   ① recorded 命中该平台公开内容页白名单 → 原样采用（source='recorded'）
 *   ② 否则用通过形态闸门的平台作品 ID 派生公开内容页（source='derived'）
 *   ③ 都不成立 → **不给链接**（source='none'）
 * 绝不用后台页兜底：给一个必然落到登录墙的链接就是本 Bug 本身。
 *
 * 三条设计口径（改动前请先读）：
 * - **正向白名单而非后台黑名单**：黑名单要穷举且必然漏（新的 /console、/workbench），
 *   白名单是封闭集合。知乎内容页与编辑页**同域不同 path**
 *   （`zhuanlan.zhihu.com/p/123` vs `zhuanlan.zhihu.com/write`），只有 path 白名单能区分。
 * - **「不给链接」优于「给错链接」**：与本仓审核状态无定论不落库、队列状态无定论记
 *   `unclassified` 而非并进成功/失败同一原则——没有证据就不给结论。
 * - **纯函数**：不读时间/随机/网络/文件系统，因此可离线穷举测试。
 *
 * 渲染端必须使用逐字同源的 ESM 孪生 `published-content-url.browser.js`；
 * 两端的 `source` + `flags` 由 `src/__tests__/published-content-url.test.js` 的 parity 拦截。
 */
'use strict'

const { safeHttpUrl } = require('./safe-http-url')

/** 作品 ID 长度上限：值来自平台响应，截断防超长内容污染历史文件与渲染。 */
const WORK_ID_MAX = 128

/**
 * 合成/占位前缀：这些值是本仓自己为「判定成功」而造的，不是平台作品 ID。
 *   `published-` —— 快手 `from=publish` URL 级成功信号用时间戳派生（rpa-view-platforms.js:781）
 *   `task_`     —— 内部任务号；`tmp` —— 临时占位
 * 用它们拼 URL 必然 404，宁可不给链接。
 */
const SYNTHETIC_ID_PREFIXES = ['published-', 'task_', 'tmp']

/** 空值/布尔字面量：网络响应里它们会顶替真实 ID，形态正则也拦不住，先显式排除。 */
const LITERAL_ID_VALUES = new Set(['true', 'false', 'null', 'undefined', 'nan'])

/**
 * 平台导航词：URL 路径段里大量出现，但它们是**页面名**不是**作品 ID**。
 * 与 `rpa-publish-id-extract.js` 的 `PUBLISH_ID_NAV_WORDS` 同族（发布成功判定侧已在用）。
 */
const NAV_WORDS = new Set([
  'article', 'articles', 'content', 'manage', 'video', 'edit', 'publish', 'list', 'lists',
  'page', 'media', 'photo', 'clue', 'builder', 'pcui', 'status', 'create', 'upload',
  'works', 'work', 'new', 'draft', 'detail', 'index', 'home', 'login', 'loginpage',
])

/**
 * 平台规则表。**判据真源**（PRD §6.3）：
 *   contentHosts  —— 内容域名（精确或 `.` 后缀匹配）；只是粗筛，path 才决定成败
 *   contentPathRe —— 公开内容页形态，作用于 `pathname + search`；null = 该平台 Web 端无公开永久链接
 *   postIdRe      —— 作品 ID 专属形态；null = 单一作品 ID 不足以定位公开页，禁止派生
 *   template      —— 公开内容页模板，`{id}` 为占位；null = 不可派生
 *
 * postIdRe=null 的平台是**结构性**不可派生（不是漏做），原因见 PRD §6.3 末列：
 *   wechat_mp     永久链接需 __biz+mid+idx+sn 四元组，发布结果只拿得到 mid
 *   tencent_video 内容仅在微信客户端内可达，Web 端无公开永久链接
 *   weibo         需 uid/mid 两个成分
 *   tiktok        需 @user + aweme_id；twitter 需 handle + status id
 *   instagram     需 username + shortcode；facebook 需 page/username 上下文
 */
const PUBLIC_CONTENT_URL_RULES = Object.freeze({
  zhihu: Object.freeze({
    contentHosts: Object.freeze(['zhihu.com']),
    contentPathRe: /^\/p\/\d{4,}\/?$/,
    postIdRe: /^\d{4,}$/,
    template: 'https://zhihu.com/p/{id}',
  }),
  baijiahao: Object.freeze({
    contentHosts: Object.freeze(['baijiahao.baidu.com']),
    contentPathRe: /^\/s\?(?:.*&)?id=\d{4,}(?:&|$)/,
    postIdRe: /^\d{4,}$/,
    template: 'https://baijiahao.baidu.com/s?id={id}',
  }),
  bilibili: Object.freeze({
    contentHosts: Object.freeze(['bilibili.com']),
    contentPathRe: /^(?:\/video\/(?:BV[0-9A-Za-z]{5,20}|av\d{4,})|\/read\/cv\d+)\/?$/,
    postIdRe: /^(?:BV[0-9A-Za-z]{5,20}|av\d{4,})$/,
    template: 'https://www.bilibili.com/video/{id}',
  }),
  kuaishou: Object.freeze({
    contentHosts: Object.freeze(['kuaishou.com', 'gifshow.com']),
    contentPathRe: /^(?:\/short-video\/\d{6,}|\/fw\/photo\/\d{6,})\/?$/,
    postIdRe: /^\d{6,}$/,
    template: 'https://m.gifshow.com/fw/photo/{id}',
  }),
  xiaohongshu: Object.freeze({
    contentHosts: Object.freeze(['xiaohongshu.com']),
    contentPathRe: /^\/(?:explore|discovery\/item)\/[0-9a-f]{16,32}\/?$/,
    postIdRe: /^[0-9a-f]{16,32}$/,
    template: 'https://www.xiaohongshu.com/explore/{id}',
  }),
  douyin: Object.freeze({
    contentHosts: Object.freeze(['douyin.com']),
    contentPathRe: /^\/(?:video\/\d{6,}|note\/[0-9a-f]{16,32})\/?$/,
    postIdRe: /^\d{6,}$/,
    template: 'https://www.douyin.com/video/{id}',
  }),
  toutiao: Object.freeze({
    contentHosts: Object.freeze(['toutiao.com']),
    contentPathRe: /^\/(?:article|w)\/\d{4,}\/?$/,
    postIdRe: /^\d{4,}$/,
    template: 'https://www.toutiao.com/article/{id}/',
  }),
  youtube: Object.freeze({
    contentHosts: Object.freeze(['youtube.com', 'youtu.be']),
    contentPathRe: /^(?:\/watch\?(?:.*&)?v=[A-Za-z0-9_-]{11}(?:&|$)|\/[A-Za-z0-9_-]{11}\/?)$/,
    postIdRe: /^[A-Za-z0-9_-]{11}$/,
    template: 'https://www.youtube.com/watch?v={id}',
  }),
  // ↓ 以下平台可识别「平台直接给出的完整公开链接」，但**不从单一作品 ID 派生**
  wechat_mp: Object.freeze({
    contentHosts: Object.freeze(['weixin.qq.com']),
    contentPathRe: /^\/s\?(?:.*&)?(?:__biz|mid)=/,
    postIdRe: null,
    template: null,
  }),
  weibo: Object.freeze({
    contentHosts: Object.freeze(['weibo.com', 'weibo.cn']),
    contentPathRe: /^\/\d{6,}\/[A-Za-z0-9]{6,}$/,
    postIdRe: null,
    template: null,
  }),
  tiktok: Object.freeze({
    contentHosts: Object.freeze(['tiktok.com']),
    contentPathRe: /^\/@[\w.-]+\/video\/\d{6,}\/?$/,
    postIdRe: null,
    template: null,
  }),
  twitter: Object.freeze({
    contentHosts: Object.freeze(['twitter.com', 'x.com']),
    contentPathRe: /^\/[\w.]+\/status\/\d{6,}\/?$/,
    postIdRe: null,
    template: null,
  }),
  instagram: Object.freeze({
    contentHosts: Object.freeze(['instagram.com']),
    contentPathRe: /^\/(?:p|reel|tv)\/[\w-]+\/?$/,
    postIdRe: null,
    template: null,
  }),
  facebook: Object.freeze({
    contentHosts: Object.freeze(['facebook.com']),
    contentPathRe: /^\/[\w.]+\/(?:posts|videos|photos|permalink)\/\d+\/?$/,
    postIdRe: null,
    template: null,
  }),
  // 视频号：内容仅在微信客户端内可达，Web 端**不存在**公开永久链接 ⇒ 无任何内容页判据
  tencent_video: Object.freeze({
    contentHosts: Object.freeze(['channels.weixin.qq.com']),
    contentPathRe: null,
    postIdRe: null,
    template: null,
  }),
})

/** 平台键归一：空串/非字符串一律返回 ''（随后查表 miss ⇒ none） */
function normalizePlatform (value) {
  if (value === null || value === undefined) return ''
  const platform = String(value).trim().toLowerCase()
  return platform
}

function hostMatches (hostname, contentHosts) {
  const host = String(hostname || '').toLowerCase()
  for (const candidate of contentHosts) {
    if (host === candidate) return true
    if (host.endsWith('.' + candidate)) return true
  }
  return false
}

/**
 * 作品 ID 归一闸门（六重判定，与 PRD §4.2 一一对应）：
 *   1) 类型  2) 非空  3) 长度 ≤128  4) 非合成前缀  5) 非空值/布尔字面量  6) 平台专属形态
 * 任一不满足返回 null（视为「没有作品 ID」），绝不宽松拼接。
 *
 * @param {unknown} value
 * @param {RegExp|null} postIdRe
 * @returns {string|null}
 */
function normalizeWorkId (value, postIdRe) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (value === null || typeof value === 'number' && !Number.isFinite(value)) return null
  const id = String(value).trim()
  if (!id || id.length > WORK_ID_MAX) return null
  const lower = id.toLowerCase()
  if (LITERAL_ID_VALUES.has(lower)) return null
  if (NAV_WORDS.has(lower)) return null
  for (const prefix of SYNTHETIC_ID_PREFIXES) {
    if (lower.startsWith(prefix)) return null
  }
  if (!postIdRe) return null
  return postIdRe.test(id) ? id : null
}

/**
 * 该 URL 是否是**该平台的公开内容页**。
 * 判据是「协议（safeHttpUrl）+ 内容域名 + 内容页 path」三者同时成立，纯正向白名单。
 * 安全默认：未登记平台 / 无 path 判据 ⇒ false。
 *
 * @param {unknown} platform
 * @param {unknown} url
 * @returns {boolean}
 */
function isPublicContentUrl (platform, url) {
  const rules = PUBLIC_CONTENT_URL_RULES[normalizePlatform(platform)]
  if (!rules || !rules.contentPathRe) return false
  const safe = safeHttpUrl(typeof url === 'string' ? url : null)
  if (!safe) return false
  let parsed
  try {
    parsed = new URL(safe)
  } catch (_) {
    return false
  }
  if (!hostMatches(parsed.hostname, rules.contentHosts)) return false
  return rules.contentPathRe.test(parsed.pathname + parsed.search)
}

/**
 * 由平台作品 ID 派生公开内容页。ID 不合法或该平台结构性不可派生时返回 ''。
 * 模板是**代码内的字面量**，ID 已过形态正则，字符集上排除了协议分隔符与 `//`，
 * 因此不可能拼出 `javascript:` 或协议相对地址。
 *
 * @param {unknown} platform
 * @param {unknown} postId
 * @returns {string}
 */
function buildPublicContentUrl (platform, postId) {
  const rules = PUBLIC_CONTENT_URL_RULES[normalizePlatform(platform)]
  if (!rules || !rules.template) return ''
  const id = normalizeWorkId(postId, rules.postIdRe)
  if (!id) return ''
  return rules.template.replace('{id}', id)
}

/**
 * 发布记录「作品链接」的统一解析入口 —— 渲染端与指标回采端共用的唯一判据。
 *
 * @param {{platform?: unknown, postId?: unknown, recordedUrl?: unknown}} [input]
 * @returns {{url: string, source: 'recorded'|'derived'|'none'}}
 *   recorded —— 平台直接给出的公开内容页，原样采用（最强证据）
 *   derived  —— 由合法作品 ID 派生
 *   none     —— 无法确定，**不给链接**（UI 须如实说明，不得拿后台页兜底）
 */
function resolvePublishedContentUrl (input) {
  const source = input && typeof input === 'object' ? input : {}
  const platform = normalizePlatform(source.platform)

  if (platform && isPublicContentUrl(platform, source.recordedUrl)) {
    return { url: String(source.recordedUrl).trim(), source: 'recorded' }
  }

  const derived = buildPublicContentUrl(platform, source.postId)
  if (derived) return { url: derived, source: 'derived' }

  return { url: '', source: 'none' }
}

module.exports = {
  PUBLIC_CONTENT_URL_RULES,
  buildPublicContentUrl,
  isPublicContentUrl,
  resolvePublishedContentUrl,
}
