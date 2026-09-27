/**
 * account-session-restore.js — 账号「会话凭证恢复」侧
 *
 * 从 publishers/account-manager.js 拆出，两条理由（对齐同目录 account-name-write.js 的先例）：
 * 1) 关注点不同：本模块回答「已保存的 Cookie / localStorage 怎么注回 session 与 webContents、
 *    账号分区里现在有哪些 Cookie」；account-manager 回答「怎么登录、怎么检测、怎么发布」。
 * 2) 门禁：account-manager.js 在 .github/scripts/max-lines-baseline.json 挂账且余量已耗尽，
 *    能力继续内联会撞 check-max-lines 增长容差。
 *
 * 依赖注入约定：`isSafePathSegment` 由调用方在调用点注入（照 account-name-write.js）。本模块
 * **禁止** require('./account-manager') —— CJS 循环 require 会拿到半初始化的导出对象，症状是
 * 只在加载顺序变化时偶发的 `is not a function`。
 */
const log = require('../services/logger')
const { isPlatformCookieDomain } = require('@multi-publish/shared-utils/src/platform-definitions')

/**
 * 恢复 Cookie 到 Electron session
 * 基于参考产品逆向分析 restoreCookies
 */
function restoreCookies (session, cookies, baseUrl) {
  let _restoreFailed = 0
  const promises = cookies.map(cookie => {
    try {
      const { name, value, domain, path, secure, httpOnly, expirationDate, sameSite } = cookie
      return session.cookies.set({
        url: baseUrl || `https://${domain || 'localhost'}`,
        name: name || '',
        value: value || '',
        domain: domain || undefined,
        path: path || '/',
        secure: secure !== false,
        httpOnly: httpOnly || false,
        expirationDate: expirationDate || undefined,
        sameSite: sameSite || 'Unspecified',
      }).catch(e => {
        _restoreFailed += 1
        log.warn('AccountManager', 'restoreCookies: cookie set failed name=' + (name || '') + ' err=' + (e && e.message))
      })
    } catch {
      return Promise.resolve()
    }
  })
  return Promise.all(promises).then(results => {
    if (_restoreFailed > 0) log.warn('AccountManager', 'restoreCookies: ' + _restoreFailed + '/' + cookies.length + ' cookies failed to restore')
    return results
  })
}

/**
 * 恢复 localStorage 到 webContents
 * 基于参考产品逆向分析 restoreLocalStorage
 */
function restoreLocalStorage (webContents, localStorageObj) {
  if (!localStorageObj || typeof localStorageObj !== 'object') return Promise.resolve()
  
  const items = Object.entries(localStorageObj)
  if (items.length === 0) return Promise.resolve()

  // 安全修复：原 escape 顺序错误（先替换单引号导致 \'; 注入）
  // 改用 JSON.stringify 整体序列化，杜绝字符串拼接注入
  const script = buildLocalStorageRestoreScript(Object.fromEntries(items))

  return webContents.executeJavaScript(script).catch(() => {})
}

function buildLocalStorageRestoreScript (localStorageObj) {
  const json = JSON.stringify(localStorageObj || {})
  return `(function(){var d=${json};Object.keys(d).forEach(function(k){try{localStorage.setItem(k,d[k])}catch(e){}})})()`
}

/**
 * 延迟获取 Electron session 模块（便于测试注入，缺 mock 时安全降级为 null）。
 */
function _electronSession () {
  try {
    const electron = require('electron')
    return electron && electron.session && typeof electron.session.fromPartition === 'function' ? electron.session : null
  } catch (_) {
    return null
  }
}

/**
 * 读取账号 session 分区（persist:account-{id}）中属于该平台的 Cookie。
 * 这是「用户在内嵌浏览器登录后、加密凭证尚未回写」时唯一的登录态证据来源。
 * Electron 的 Session.cookies 只有 get/set/remove/flush（**没有 getAll**）。
 * @param {string} platform
 * @param {string} accountId
 * @returns {Promise<Array>} 读取失败返回空数组（由调用方按三态处理，不臆断结论）
 */
async function getAccountPartitionCookies (platform, accountId, deps = {}) {
  const isSafePathSegment = deps.isSafePathSegment
  if (typeof isSafePathSegment !== 'function' || !isSafePathSegment(accountId)) return []
  const ses = _electronSession()
  if (!ses) return []
  try {
    const viewSession = ses.fromPartition('persist:account-' + accountId)
    if (!viewSession || !viewSession.cookies || typeof viewSession.cookies.get !== 'function') return []
    const all = await viewSession.cookies.get({})
    if (!Array.isArray(all)) return []
    return typeof isPlatformCookieDomain === 'function' && platform
      ? all.filter(cookie => isPlatformCookieDomain(platform, cookie?.domain))
      : all
  } catch (e) {
    log.warn('AccountManager', 'getAccountPartitionCookies failed ' + platform + ':' + accountId + ' ' + (e && e.message ? e.message : String(e)))
    return []
  }
}

function mergeCookies (primary, extra) {
  const seen = new Set()
  const merged = []
  for (const list of [primary, extra]) {
    for (const cookie of (Array.isArray(list) ? list : [])) {
      const key = String((cookie && cookie.name) || '') + '@' + String((cookie && cookie.domain) || '')
      if (!cookie || !cookie.name || seen.has(key)) continue
      seen.add(key)
      merged.push(cookie)
    }
  }
  return merged
}

module.exports = {
  restoreCookies,
  restoreLocalStorage,
  buildLocalStorageRestoreScript,
  getAccountPartitionCookies,
  mergeCookies,
}
