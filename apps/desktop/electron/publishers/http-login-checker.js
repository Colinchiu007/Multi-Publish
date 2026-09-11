// @ts-check
/**
 * HTTP API 登录检测 — 用保存的 Cookie 直接调用平台内部 API 判断登录态
 *
 * 参考蚁小二 checkAccountAlive 逆向：不打开浏览器窗口，纯 HTTP 请求，
 * 每次检测 <1 秒（浏览器窗口方案需 4-8 秒/平台）。
 *
 * API 端点来源：蚁小二 4.0 逆向（packages/main/dist/index.cjs）。
 * 各平台判断逻辑：
 * - douyin: GET /aweme/v1/creator/pc/user/info/ → status_code === 0 且有 user 数据
 * - toutiao: GET /mp/agw/media/get_media_info → code === 0 且有 user.id
 */
const log = require('../services/logger')

/** @type {Record<string, {url: string, headers: Record<string,string>, check: (data:any)=>boolean}>} */
const HTTP_CHECK_APIS = {
  douyin: {
    url: 'https://creator.douyin.com/aweme/v1/creator/pc/user/info/',
    headers: {
      Referer: 'https://creator.douyin.com/creator-micro/home',
      Origin: 'https://creator.douyin.com'
    },
    check: (data) => Boolean(data && data.status_code === 0 && data.data && (data.data.uid || data.data.user_id || data.data.nickname !== undefined))
  },
  toutiao: {
    url: 'https://mp.toutiao.com/mp/agw/media/get_media_info',
    headers: {
      Referer: 'https://mp.toutiao.com/profile_v4/graphic/publish'
    },
    check: (data) => Boolean(data && data.code === 0 && data.data && data.data.user && data.data.user.id)
  }
}

/** 超时（毫秒）——HTTP API 检测应远快于浏览器窗口 */
const HTTP_CHECK_TIMEOUT_MS = 8000

/**
 * 将 Cookie 数组转为请求头 Cookie 字符串
 * @param {Array<{name:string, value:string}>} cookies
 * @returns {string}
 */
function cookiesToHeader (cookies) {
  if (!Array.isArray(cookies)) return ''
  return cookies.filter(c => c && c.name && c.value).map(c => c.name + '=' + c.value).join('; ')
}

/**
 * HTTP API 检测平台登录态（仅支持 HTTP_CHECK_APIS 中注册的平台）
 * @param {string} platform
 * @param {Array<{name:string, value:string}>} cookies
 * @returns {Promise<{supported: boolean, valid?: boolean, code?: string, error?: string}>}
 */
async function checkLoginViaHttpApi (platform, cookies) {
  const api = HTTP_CHECK_APIS[platform]
  if (!api) return { supported: false }

  const cookieHeader = cookiesToHeader(cookies)
  if (!cookieHeader) return { supported: true, valid: false, code: 'CHECK_LOGIN_NO_CREDENTIAL' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_CHECK_TIMEOUT_MS)
  try {
    const response = await fetch(api.url, {
      method: 'GET',
      headers: {
        ...api.headers,
        Cookie: cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: controller.signal,
      redirect: 'manual'
    })
    clearTimeout(timer)

    // 平台重定向到登录页 = Cookie 失效
    if (response.status === 301 || response.status === 302 || response.status === 303 || response.status === 307) {
      const location = response.headers.get('location') || ''
      log.info('HttpLoginChecker', platform + ': redirect to ' + location.slice(0, 80) + ' → expired')
      return { supported: true, valid: false, code: 'CHECK_LOGIN_COOKIE_EXPIRED' }
    }

    if (!response.ok) {
      log.info('HttpLoginChecker', platform + ': HTTP ' + response.status + ' → expired')
      return { supported: true, valid: false, code: 'CHECK_LOGIN_COOKIE_EXPIRED' }
    }

    const data = await response.json().catch(() => null)
    const valid = api.check(data)
    log.info('HttpLoginChecker', platform + ': API check → ' + (valid ? 'valid' : 'expired') + ' (data keys: ' + (data ? Object.keys(data).slice(0, 5).join(',') : 'null') + ')')
    return { supported: true, valid, code: valid ? 'CHECK_LOGIN_SUCCESS_HTTP_API' : 'CHECK_LOGIN_COOKIE_EXPIRED' }
  } catch (e) {
    clearTimeout(timer)
    const isAbort = e && (e.name === 'AbortError' || e.name === 'TimeoutError')
    log.warn('HttpLoginChecker', platform + ': ' + (isAbort ? 'timeout' : 'error') + ' → ' + (e && e.message ? e.message : String(e)))
    // 网络错误不判失效，返回 unknown 让调用方降级到浏览器检测
    return { supported: true, valid: undefined, code: isAbort ? 'CHECK_LOGIN_HTTP_TIMEOUT' : 'CHECK_LOGIN_HTTP_ERROR', error: e && e.message }
  }
}

/**
 * 检查平台是否支持 HTTP API 检测
 * @param {string} platform
 * @returns {boolean}
 */
function isHttpCheckSupported (platform) {
  return Boolean(HTTP_CHECK_APIS[platform])
}

/**
 * HTTP API 快速路径入口（供 checkLoginStatus 调用）。
 * 有 Cookie 且平台已注册时尝试 HTTP API 检测；返回 null 表示不适用
 * （无 Cookie/未注册）或结果不确定（网络错误），调用方降级到浏览器检测。
 * @param {string} platform
 * @param {Array<{name:string, value:string}>} cookies
 * @param {string} accountId
 * @returns {Promise<{valid:boolean, code:string}|null>}
 */
async function tryHttpLoginCheck (platform, cookies, accountId) {
  if (!cookies || cookies.length === 0 || !isHttpCheckSupported(platform)) return null
  const httpResult = await checkLoginViaHttpApi(platform, cookies)
  if (httpResult.valid === undefined) {
    log.info('HttpLoginChecker', 'inconclusive ' + platform + ':' + accountId + ' → falling back to browser check')
    return null
  }
  log.info('HttpLoginChecker', 'fast-path ' + platform + ':' + accountId + ' valid=' + httpResult.valid + ' code=' + httpResult.code)
  return { valid: httpResult.valid, code: httpResult.code }
}

module.exports = { checkLoginViaHttpApi, isHttpCheckSupported, cookiesToHeader, tryHttpLoginCheck }
