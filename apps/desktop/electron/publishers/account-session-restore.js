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

/**
 * 快照 Cookie → `session.cookies.set` 载荷。
 * 只补 `url`（Electron 用它定位宿主域）并把 Playwright 形态的 `sameSite` 归一，
 * 口径与 webview-manager/utils.js 的 `normalizeElectronCookie` 一致；没有复用它
 * 是因为该模块在 require 期就依赖 `app`/`config`，主进程服务层之外（本模块被
 * publishers 消费）引入会连带拖入窗口与配置单例。
 * 唯一有意的差异：`no_restriction` 在此**原样保留**。Electron 的 `cookies.get` 本来
 * 就返回这套词表，把它降级成 `unspecified` 会剥掉跨站会话 Cookie 必需的 SameSite=None
 * （normalizeElectronCookie 现有实现会这样降级，已记为 遗留，不在本修复里改动共享路径）。
 * @returns {object|null} 无 name 或无 domain 的记录不投喂（Electron 会静默落到 localhost）
 */
function _partitionCookiePayload (cookie) {
  if (!cookie || typeof cookie.name !== 'string' || !cookie.name) return null
  const rawDomain = String(cookie.domain || '')
  const host = rawDomain.replace(/^\.+/, '')
  if (!host) return null
  const sameSite = String(cookie.sameSite || '').toLowerCase()
  return {
    url: (cookie.secure === false ? 'http' : 'https') + '://' + host + '/',
    name: cookie.name,
    value: typeof cookie.value === 'string' ? cookie.value : (cookie.value == null ? '' : String(cookie.value)),
    domain: rawDomain,
    path: typeof cookie.path === 'string' && cookie.path ? cookie.path : '/',
    secure: cookie.secure !== false,
    httpOnly: Boolean(cookie.httpOnly),
    expirationDate: Number.isFinite(Number(cookie.expirationDate)) ? Number(cookie.expirationDate) : undefined,
    sameSite: sameSite === 'none' || sameSite === 'no_restriction' ? 'no_restriction'
      : sameSite === 'strict' ? 'strict'
        : sameSite === 'lax' ? 'lax' : 'unspecified',
  }
}

/**
 * 把「刚成功落盘的凭证」对齐进账号分区（`persist:account-{id}`）里该平台域的记录。
 *
 * 为什么必须有这一步（2026-10-09，fix-account-tab-cookie-restore）：开卡恢复已改成
 * 「分区优先、快照仅补缺」——分区里同 `name@domain` 的值不被快照覆盖。这对「快照恒旧」
 * 是对的，但**重新登录走的是独立 `persist:auth-*` 分区**，`updateCapturedAccount` 只写
 * 加密库与登录态真源、从不触碰账号分区。于是分区里那条「还没过期、但已被平台吊销」的旧
 * Cookie 会同键挡掉刚拿到的新快照，用户重新登录后开卡仍停在登录页——比原 Bug 更糟。
 * 逐 Cookie 比新鲜度在文档 API 上不成立（`electron.d.ts` 的 `interface Cookie` 只有
 * domain/expirationDate/hostOnly/httpOnly/name/path/sameSite/secure/session/value，
 * **没有 creationTime/lastAccessTime**，读它等于恒 undefined 的死探针），所以只能在
 * 「快照唯一保证是最新证据」的落盘时刻把分区对齐。
 *
 * 语义边界：① 只覆盖 `isPlatformCookieDomain` 命中的记录（与读侧、凭证落盘侧同口径），
 * 平台域之外一律不碰；② 调用点**不得 await**（会话命令可永久挂起，见 constants 里
 * LS_INJECTION_TIMEOUT_MS 的事故注释），本函数自身不 reject；③ 日志只记计数与 Cookie
 * 名，禁止记 value。
 *
 * @param {string} platform
 * @param {string} accountId
 * @param {Array} cookies 已落盘的快照 Cookie（未经平台域过滤也可，函数内部再判一次）
 * @param {{isSafePathSegment: Function}} [deps]
 * @returns {Promise<{seeded:number, skipped:number}>}
 */
async function seedAccountPartitionCookies (platform, accountId, cookies, deps = {}) {
  const result = { seeded: 0, skipped: 0 }
  const isSafePathSegment = deps.isSafePathSegment
  if (!Array.isArray(cookies) || cookies.length === 0) return result
  if (typeof isSafePathSegment !== 'function' || !accountId || !isSafePathSegment(accountId)) return result
  const ses = _electronSession()
  if (!ses) {
    log.warn('AccountManager', 'seedAccountPartitionCookies: electron session unavailable, partition left as-is ' + platform + ':' + accountId)
    return result
  }
  let viewSession = null
  try {
    viewSession = ses.fromPartition('persist:account-' + accountId)
  } catch (e) {
    log.warn('AccountManager', 'seedAccountPartitionCookies: partition open failed ' + platform + ':' + accountId + ' err=' + (e && e.message ? e.message : String(e)))
    return result
  }
  if (!viewSession || !viewSession.cookies || typeof viewSession.cookies.set !== 'function') {
    log.warn('AccountManager', 'seedAccountPartitionCookies: cookies.set unavailable ' + platform + ':' + accountId)
    return result
  }
  const targets = []
  for (const cookie of cookies) {
    if (typeof isPlatformCookieDomain !== 'function' || !isPlatformCookieDomain(platform, cookie && cookie.domain)) { result.skipped++; continue }
    const payload = _partitionCookiePayload(cookie)
    if (!payload) { result.skipped++; continue }
    targets.push(payload)
  }
  if (targets.length === 0) {
    log.info('AccountManager', 'seeded account partition ' + platform + ':' + accountId + ' seeded=0 skipped=' + result.skipped)
    return result
  }
  const settled = await Promise.all(targets.map(payload => Promise.resolve()
    .then(() => viewSession.cookies.set(payload))
    .then(() => true, (e) => {
      log.warn('AccountManager', 'seed partition cookie failed name=' + payload.name + ' err=' + (e && e.message ? e.message : String(e)))
      return false
    })))
  result.seeded = settled.filter(Boolean).length
  log.info('AccountManager', 'seeded account partition ' + platform + ':' + accountId +
    ' seeded=' + result.seeded + ' failed=' + (targets.length - result.seeded) + ' skipped=' + result.skipped)
  return result
}

module.exports = {
  restoreCookies,
  restoreLocalStorage,
  buildLocalStorageRestoreScript,
  getAccountPartitionCookies,
  mergeCookies,
  seedAccountPartitionCookies,
}
