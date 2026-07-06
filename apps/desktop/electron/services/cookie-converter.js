// @ts-check
/**
 * CookieConverter — Cookie ↔ Playwright 格式转换工具
 *
 * 适配自 MediaTrace (MIT) 的 normalizeCookieForPlaywright / parseCookieString / trySetStoredCookiesToContext。
 * 提供统一接口将 Multi-Publish 存储的凭证转换为 Playwright/BrowserWindow cookies。
 *
 * 使用场景：
 * - Cookie 字符串（ document.cookie 格式）→ Playwright cookies
 * - JSON cookies（credentials.json）→ Playwright cookies
 * - Playwright context ← restore cookies
 */

/**
 * 从 document.cookie 格式的字符串解析 Cookie 键值对
 * @param {string} cookieStr - "name1=value1; name2=value2"
 * @returns {Array<{name: string, value: string}>}
 */
function parseCookieString (cookieStr) {
  if (typeof cookieStr !== 'string' || !cookieStr.trim()) return []
  return cookieStr
    .split(';')
    .map(p => p.trim())
    .filter(Boolean)
    .map(kv => {
      const idx = kv.indexOf('=')
      if (idx < 0) return null
      return { name: kv.slice(0, idx).trim(), value: kv.slice(idx + 1).trim() }
    })
    .filter(x => Boolean(x && x.name))
}

/**
 * 将 JSON Cookie 数组（credential-store 输出）转换为 Playwright cookie 格式
 * @param {object} raw - 单个 cookie 对象（可能包含 name/value/domain/path/expires/httpOnly/secure/sameSite）
 * @param {string} [defaultDomain='.douyin.com'] - 默认 domain
 * @returns {object} Playwright 兼容的 cookie 对象
 */
function normalizeCookieForPlaywright (raw, defaultDomain) {
  if (!raw || !raw.name || raw.value === undefined) return null
  defaultDomain = defaultDomain || ''
  const cookie = {
    name: String(raw.name),
    value: String(raw.value),
    domain: raw.domain ? String(raw.domain) : defaultDomain,
    path: raw.path ? String(raw.path) : '/',
  }
  if (raw.expires !== undefined) cookie.expires = Number(raw.expires)
  if (raw.httpOnly !== undefined) cookie.httpOnly = Boolean(raw.httpOnly)
  if (raw.secure !== undefined) cookie.secure = Boolean(raw.secure)
  if (raw.sameSite !== undefined) cookie.sameSite = String(raw.sameSite)
  return cookie
}

/**
 * 将存储的 cookie（JSON 数组格式）注入到 Playwright BrowserContext
 * @param {object} context - Playwright BrowserContext
 * @param {string} stored - 存储的 cookie 数据（可能是 JSON 数组或 document.cookie 格式）
 * @param {string} [defaultUrl] - 默认 URL（如 "https://www.douyin.com"）
 */
async function trySetStoredCookiesToContext (context, stored, defaultUrl) {
  const s = String(stored || '').trim()
  if (!s) return
  defaultUrl = defaultUrl || 'https://www.douyin.com'

  // 尝试 JSON 数组格式（credential-store 存储的格式）
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cookies = parsed
          .map(c => normalizeCookieForPlaywright(c, new URL(defaultUrl).hostname))
          .filter(Boolean)
        if (cookies.length > 0) {
          await context.addCookies(cookies).catch(() => {})
          return
        }
      }
    } catch { /* 不是 JSON 数组，走字符串解析路径 */ }
  }

  // 回退：解析为 document.cookie 格式
  const list = parseCookieString(s)
  if (!list.length) return
  const cookies = list.map(c => ({
    name: c.name,
    value: c.value,
    url: defaultUrl,
  }))
  await context.addCookies(cookies).catch(() => {})
}

/**
 * 将 Playwright cookies 转换为 credential-store 兼容的 JSON 数组
 * @param {Array<object>} cookies - Playwright cookies
 * @returns {string} JSON 字符串
 */
function serializeCookiesFromContext (cookies) {
  return JSON.stringify(
    (cookies || []).map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain || '',
      path: c.path || '/',
      expires: c.expires || undefined,
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
      sameSite: c.sameSite || 'Lax',
    }))
  )
}

/**
 * 将 Cookie 字符串注入到 Electron Session
 * @param {object} session - Electron session 实例
 * @param {string} cookieStr - document.cookie 格式的字符串
 * @param {string} url - Cookie 归属的 URL
 */
async function restoreCookiesToSession (session, cookieStr, url) {
  const list = parseCookieString(cookieStr)
  for (const c of list) {
    try {
      await session.cookies.set({
        url: url,
        name: c.name,
        value: c.value,
        path: '/',
        httpOnly: false,
        secure: false,
      })
    } catch (_e) { /* ignore individual cookie failures */ }
  }
}

module.exports = {
  parseCookieString,
  normalizeCookieForPlaywright,
  trySetStoredCookiesToContext,
  serializeCookiesFromContext,
  restoreCookiesToSession,
}

