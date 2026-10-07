// 渲染端（vite dev / build）使用的 ESM 孪生文件。
// 主进程仍使用 published-content-url.js（CommonJS），避免改变 Node 端契约。
// 判据必须与 published-content-url.js 逐字同源（`source` + `flags`、规则表逐键由
// packages/shared-utils/src/__tests__/published-content-url.test.js 的 parity 回归拦截），
// 口径与存在理由（落库的 result.url 是创作者后台页而非公开内容页，点开必然是登录墙）
// 见该文件头注释与 01-docs/PRD-PUBLISH-HISTORY-PUBLIC-LINK-2026-10-07.md。
import { safeHttpUrl } from './safe-http-url.browser.js'

const WORK_ID_MAX = 128

const SYNTHETIC_ID_PREFIXES = Object.freeze(['published-', 'task_', 'tmp'])

const LITERAL_ID_VALUES = new Set(['true', 'false', 'null', 'undefined', 'nan'])

const NAV_WORDS = new Set([
  'article', 'articles', 'content', 'manage', 'video', 'edit', 'publish', 'list', 'lists',
  'page', 'media', 'photo', 'clue', 'builder', 'pcui', 'status', 'create', 'upload',
  'works', 'work', 'new', 'draft', 'detail', 'index', 'home', 'login', 'loginpage',
])

export const PUBLIC_CONTENT_URL_RULES = Object.freeze({
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
  tencent_video: Object.freeze({
    contentHosts: Object.freeze(['channels.weixin.qq.com']),
    contentPathRe: null,
    postIdRe: null,
    template: null,
  }),
})

function normalizePlatform (value) {
  if (value === null || value === undefined) return ''
  return String(value).trim().toLowerCase()
}

function hostMatches (hostname, contentHosts) {
  const host = String(hostname || '').toLowerCase()
  for (const candidate of contentHosts) {
    if (host === candidate) return true
    if (host.endsWith('.' + candidate)) return true
  }
  return false
}

function normalizeWorkId (value, postIdRe) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (value === null || (typeof value === 'number' && !Number.isFinite(value))) return null
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

export function isPublicContentUrl (platform, url) {
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

export function buildPublicContentUrl (platform, postId) {
  const rules = PUBLIC_CONTENT_URL_RULES[normalizePlatform(platform)]
  if (!rules || !rules.template) return ''
  const id = normalizeWorkId(postId, rules.postIdRe)
  if (!id) return ''
  return rules.template.replace('{id}', id)
}

export function resolvePublishedContentUrl (input) {
  const source = input && typeof input === 'object' ? input : {}
  const platform = normalizePlatform(source.platform)

  if (platform && isPublicContentUrl(platform, source.recordedUrl)) {
    return { url: String(source.recordedUrl).trim(), source: 'recorded' }
  }

  const derived = buildPublicContentUrl(platform, source.postId)
  if (derived) return { url: derived, source: 'derived' }

  return { url: '', source: 'none' }
}
