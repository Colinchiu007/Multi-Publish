// @ts-check
/**
 * 账号管理器
 * 负责通过 Playwright 捕获平台凭证；Python 后端只保存公开元数据，凭证保留在主进程加密存储。
 */
// eslint-disable-next-line no-unused-vars
const path = require('path')
const os = require('os')
const { app } = require('electron')
const log = require('../services/logger')
const playwrightManager = require('../services/playwright-manager')
const pythonBridge = require('../services/python-bridge')
const accountStateRestorer = require('../services/account-state-restorer')
const credentialStore = require('../services/credential-store')

let ownerSubjectProvider = null
const OWNER_CHANGED_MESSAGE = '登录用户已变更，请重新发起登录'

function setOwnerSubjectProvider (provider) {
  if (provider !== null && provider !== undefined && typeof provider !== 'function') {
    throw new TypeError('owner subject provider must be a function or null')
  }
  ownerSubjectProvider = provider || null
}

function resolveOwnerSubject () {
  if (!ownerSubjectProvider) return undefined
  let owner
  try { owner = ownerSubjectProvider() } catch (_) { owner = null }
  if (typeof owner !== 'string' || !owner.trim()) throw new Error('登录会话缺少用户标识')
  return owner.trim()
}

function ownerChangedError () {
  const error = new Error(OWNER_CHANGED_MESSAGE)
  error.code = 'AUTH_OWNER_CHANGED'
  return error
}

function resolveAttemptOwner (expectedOwnerSubject) {
  if (expectedOwnerSubject === undefined) return resolveOwnerSubject()
  if (typeof expectedOwnerSubject !== 'string' || !expectedOwnerSubject.trim()) throw ownerChangedError()
  const owner = expectedOwnerSubject.trim()
  if (resolveOwnerSubject() !== owner) throw ownerChangedError()
  return owner
}

function assertAttemptOwner (owner) {
  if (owner !== undefined && resolveOwnerSubject() !== owner) throw ownerChangedError()
}

function requestBackendForOwner (method, requestPath, body, timeout, owner) {
  if (owner === undefined) {
    if (timeout === undefined) {
      if (body === undefined) return pythonBridge.requestBackend(method, requestPath)
      return pythonBridge.requestBackend(method, requestPath, body)
    }
    return pythonBridge.requestBackend(method, requestPath, body, timeout)
  }
  return pythonBridge.requestBackend(method, requestPath, body === undefined ? null : body, timeout === undefined ? 30000 : timeout, owner)
}

async function rollbackBackendAccount (accountId, owner) {
  try {
    await requestBackendForOwner('DELETE', `/api/accounts/${accountId}`, undefined, undefined, owner)
  } catch (error) {
    log.warn('AccountManager', `Failed to roll back account metadata: ${error.message}`)
  }
}

// 安全：凭证写入路径使用 Electron userData 目录，而非当前工作目录
function getUserDataDir () {
  try { return app.getPath('userData') } catch { return path.join(os.homedir(), '.multi-publish') }
}

function isSafePathSegment (value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value)
}
const {
  PLATFORM_LOGIN_URLS,
  PLATFORM_NAMES,
  PLATFORM_LOGIN_SUCCESS_SELECTORS,
  getPlatformName,
  isPlatformCookieDomain,
} = require('@multi-publish/shared-utils/src/platform-definitions')

// 平台登录 URL / 名称 / 选择器 → @multi-publish/shared-utils/src/platform-definitions

/**
 * Smart wait: navigate to URL then wait for selector or timeout
 * @param {object} page
 * @param {string|null} successSelector
 * @param {number} fallbackMs
 * @returns {Promise<void>}
 */
async function smartWait (page, successSelector, fallbackMs = 3000) {
  if (successSelector) {
    try {
      await page.waitForSelector(successSelector, { timeout: fallbackMs })
    } catch {
      // Selector not found — just wait a bit
      await new Promise(r => setTimeout(r, fallbackMs))
    }
  } else {
    await new Promise(r => setTimeout(r, fallbackMs))
  }
}

/**
 * 打开 Playwright 页面，让用户登录平台，捕获 Cookie
 * @param {string} platform - 平台标识 (wechat_mp, zhihu, etc.)
 * @param {number} timeout - 等待登录超时时间（毫秒，默认 5 分钟）
 * @returns {Promise<{cookies: Array, name: string}>}
 */
async function captureCookies (platform, timeout = 300000) {
  if (!PLATFORM_LOGIN_URLS[platform]) {
    throw new Error(`不支持的平台: ${platform}`)
  }

  const loginUrl = PLATFORM_LOGIN_URLS[platform]
  const platformName = getPlatformName(platform)
  const successSelector = PLATFORM_LOGIN_SUCCESS_SELECTORS[platform]

  log.info('AccountManager', ` 开始捕获 ${platformName} Cookie`)
  log.info('AccountManager', ` 打开登录页面: ${loginUrl}`)

  // 获取 Playwright 上下文
  const context = await playwrightManager.getContext({ show: true })
  const page = await context.newPage()

  // 反检测
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

  try {
    // 导航到登录页
    await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 })

    // 如果是公众号，先检查是否已经有登录态
    let loggedIn = false
    if (successSelector) {
      try {
        await page.waitForSelector(successSelector, { timeout: 5000 })
        loggedIn = true
        log.info('AccountManager', ` ${platformName} 已登录，直接捕获 Cookie`)
      } catch {
        log.info('AccountManager', ` 等待用户在 ${platformName} 登录...`)
      }
    }

    if (!loggedIn) {
      // 等待用户手动登录 — 检测到成功选择器或 Cookie 变化
      log.info('AccountManager', ` 请在弹出的浏览器窗口中登录 ${platformName}`)
      log.info('AccountManager', ` 超时时间: ${Math.round(timeout / 1000 / 60)} 分钟`)

      const loginDetected = await Promise.race([
        // 方式1: 等待成功选择器出现
        (async () => {
          if (successSelector) {
            try {
              await page.waitForSelector(successSelector, { timeout })
              return true
            } catch {
              return false
            }
          }
          return false
        })(),
        // 方式2: 等待 URL 变化（非登录页）
        (async () => {
          try {
            await page.waitForFunction(
              (loginHost) => window.location.host !== loginHost,
              new URL(loginUrl).host,
              { timeout, polling: 2000 }
            )
            return true
          } catch {
            return false
          }
        })(),
      ])

      if (!loginDetected) {
        throw new Error(`${platformName} 登录超时（${Math.round(timeout / 1000 / 60)} 分钟）`)
      }

      // 额外等待页面稳定
      await smartWait(page, successSelector, 3000)
    }

    // 获取所有 Cookie
    const cookies = await context.cookies()
    log.info('AccountManager', ` 捕获到 ${cookies.length} 个 Cookie`)

    // 尝试从页面获取账号名称
    let accountName = platformName
    try {
      if (platform === 'wechat_mp') {
        const nameEl = await page.$('.weui-desktop-account__name')
        if (nameEl) {
          accountName = await nameEl.textContent()
          accountName = accountName.trim() || platformName
        }
      }
    } catch {
      // 忽略名称获取失败
    }

    // Also extract localStorage and account info
    let localStorageData = {}
    let accountInfo = {}
    try {
      localStorageData = await page.evaluate(() => {
        const result = {}
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          result[key] = localStorage.getItem(key)
        }
        return result
      })
    } catch { /* ignore localStorage errors */ }

    try {
      accountInfo = await extractAccountInfo(page)
    } catch { /* ignore account info errors */ }

    return { cookies, name: accountName, localStorage: localStorageData, accountInfo }
  } finally {
    // 关闭页面，但保留浏览器上下文（其他页面可能还在用）
    await page.close().catch(() => {})
  }
}

/**
 * 添加账号 — 通过 Playwright 捕获 Cookie 后调用 Python API 保存
 * @param {string} platform - 平台标识
 * @param {string|undefined} expectedOwnerSubject - 登录开始时绑定的用户标识
 * @returns {Promise<Object>} 保存后的账号信息
 */
async function addAccount (platform, expectedOwnerSubject) {
  const { cookies, name, localStorage: localStorageData, accountInfo } = await captureCookies(platform)

  return saveCapturedAccount(platform, {
    cookies,
    name,
    localStorage: localStorageData,
    accountInfo,
  }, expectedOwnerSubject)
}

/**
 * 保存已由浏览器或扫码流程捕获的账号凭证。
 * 凭证只在主进程流转，渲染进程只接收后端返回的脱敏账号信息。
 * @param {string} platform
 * @param {{cookies?: Array, name?: string, localStorage?: object, indexedDB?: object, accountInfo?: object}} captured
 * @param {string|undefined} expectedOwnerSubject - 登录开始时绑定的用户标识
 * @returns {Promise<object>}
 */
async function saveCapturedAccount (platform, captured, expectedOwnerSubject) {
  if (!PLATFORM_LOGIN_URLS[platform]) throw new Error(`不支持的平台: ${platform}`)
  const owner = resolveAttemptOwner(expectedOwnerSubject)
  const source = captured && typeof captured === 'object' ? captured : {}
  const cookies = Array.isArray(source.cookies)
    ? source.cookies.filter(cookie => isPlatformCookieDomain(platform, cookie?.domain))
    : []
  const localStorageData = source.localStorage && typeof source.localStorage === 'object' && !Array.isArray(source.localStorage)
    ? source.localStorage
    : {}
  const indexedDB = source.indexedDB && typeof source.indexedDB === 'object' && !Array.isArray(source.indexedDB)
    ? source.indexedDB
    : {}
  if (cookies.length === 0 && Object.keys(localStorageData).length === 0 && Object.keys(indexedDB).length === 0) {
    throw new Error('未捕获到有效登录凭证')
  }
  const name = typeof source.name === 'string' && source.name.trim()
    ? source.name.trim()
    : getPlatformName(platform)
  const accountInfo = source.accountInfo && typeof source.accountInfo === 'object' && !Array.isArray(source.accountInfo)
    ? source.accountInfo
    : {}

  // 后端只保存公开元数据，避免在 accounts.json 中重复落盘凭证。
  const result = await requestBackendForOwner('POST', '/api/accounts', {
    platform,
    name,
  }, undefined, owner)

  if (result.code !== 0) {
    throw new Error(result.message || '保存账号失败')
  }

  const accountId = result.data?.accountId || result.data?.id
  if (!accountId) throw new Error('保存账号后未返回账号 ID')
  if (!isSafePathSegment(accountId)) throw new Error('保存账号后返回了非法账号 ID')
  try {
    assertAttemptOwner(owner)
  } catch (error) {
    await rollbackBackendAccount(accountId, owner)
    throw error
  }

  const userDataDir = getUserDataDir()
  const credentialData = {
    platform,
    cookies,
    localStorage: localStorageData,
    indexedDB,
    accountInfo,
  }
  const credentialSaved = owner === undefined
    ? credentialStore.saveCredential(accountId, credentialData, userDataDir)
    : credentialStore.saveCredential(accountId, credentialData, userDataDir, owner)
  assertAttemptOwner(owner)
  if (!credentialSaved) {
    await rollbackBackendAccount(accountId, owner)
    throw new Error('加密凭证保存失败，账号创建已回滚')
  }
  log.info('AccountManager', `Saved credential store for account ${accountId}`)

  // 状态记录仅含公开元数据，用于列表恢复和删除清理。
  try {
    assertAttemptOwner(owner)
    const stateRecord = {
      accountId,
      platform,
      platformAccountId: accountInfo?.platformAccountId || '',
      accountInfo,
      timestamp: Date.now(),
    }
    const stateSaved = owner === undefined
      ? accountStateRestorer.saveAccountRecord(stateRecord)
      : accountStateRestorer.saveAccountRecord(stateRecord, owner, userDataDir)
    if (stateSaved) log.info('AccountManager', `Saved account state record for ${platform}:${accountId}`)
    else log.warn('AccountManager', `Failed to save account state record for ${platform}:${accountId}`)
  } catch (e) {
    if (e && e.code === 'AUTH_OWNER_CHANGED') throw e
    log.warn('AccountManager', `Failed to save account state record: ${e.message}`)
  }

  assertAttemptOwner(owner)
  log.info('AccountManager', ` 账号添加成功: ${name} (${platform})`)
  return result.data
}

/**
 * 删除账号
 * @param {string} accountId
 * @param {string|undefined} expectedOwnerSubject - 删除开始时绑定的用户标识
 * @returns {Promise<boolean>}
 */
async function deleteAccount (accountId, expectedOwnerSubject) {
  if (!accountId || typeof accountId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(accountId)) {
    throw new Error('缺少或非法账号 ID')
  }
  const owner = resolveAttemptOwner(expectedOwnerSubject)
  const userDataDir = getUserDataDir()
  let platform = ''
  try {
    const current = await requestBackendForOwner('GET', `/api/accounts/${accountId}`, undefined, undefined, owner)
    if (current?.code === 0 && typeof current.data?.platform === 'string') platform = current.data.platform
  } catch (_) { /* 删除仍可继续，凭证清理使用本地记录回退 */ }

  assertAttemptOwner(owner)

  const result = await requestBackendForOwner('DELETE', `/api/accounts/${accountId}`, undefined, undefined, owner)
  assertAttemptOwner(owner)
  const alreadyDeleted = result && result.code === undefined && result.detail === '账号不存在'
  if (result.code !== 0 && !alreadyDeleted) {
    throw new Error(result.message || '删除账号失败')
  }
  if (!platform) {
    assertAttemptOwner(owner)
    try {
      const records = owner === undefined
        ? accountStateRestorer.listLoggedInAccounts()
        : accountStateRestorer.listLoggedInAccounts(owner, userDataDir)
      const record = records.find(item => item.accountId === accountId)
      platform = record?.platform || ''
    } catch (e) {
      log.warn('AccountManager', `查找账号本地状态失败: ${e.message}`)
    }
  }
  try {
    assertAttemptOwner(owner)
    const hadCredential = owner === undefined
      ? credentialStore.hasCredential(accountId, userDataDir)
      : credentialStore.hasCredential(accountId, userDataDir, owner)
    const deletedCredential = owner === undefined
      ? credentialStore.deleteCredential(accountId, userDataDir)
      : credentialStore.deleteCredential(accountId, userDataDir, owner)
    if (hadCredential && !deletedCredential) throw new Error('加密凭据文件删除失败')
  } catch (e) {
    if (e && e.code === 'AUTH_OWNER_CHANGED') throw e
    throw new Error(`账号元数据已删除，但清理本地加密凭据失败: ${e.message}`)
  }
  try {
    assertAttemptOwner(owner)
    if (owner === undefined && typeof accountStateRestorer.deleteAccountRecordsById === 'function') {
      accountStateRestorer.deleteAccountRecordsById(accountId)
    } else if (platform && typeof accountStateRestorer.deleteAccountRecord === 'function') {
      accountStateRestorer.deleteAccountRecord(platform, accountId, owner, owner === undefined ? undefined : userDataDir)
    } else if (typeof accountStateRestorer.deleteAccountRecordsById === 'function') {
      accountStateRestorer.deleteAccountRecordsById(accountId, owner, userDataDir)
    }
  } catch (e) {
    if (e && e.code === 'AUTH_OWNER_CHANGED') throw e
    log.warn('AccountManager', `清理账号本地状态失败: ${e.message}`)
  }
  log.info('AccountManager', ` 账号已删除: ${accountId}`)
  return true
}

/**
 * 获取账号列表
 * @param {string|undefined} expectedOwnerSubject - 查询开始时绑定的用户标识
 * @returns {Promise<Array>}
 */
async function listAccounts (expectedOwnerSubject) {
  const owner = resolveAttemptOwner(expectedOwnerSubject)
  const result = await requestBackendForOwner('GET', '/api/accounts', undefined, undefined, owner)
  assertAttemptOwner(owner)
  if (result.code !== 0) {
    throw new Error(result.message || '获取账号列表失败')
  }
  return result.data || []
}

/**
 * 检查账号登录状态 — 通过加载 Cookie 并访问平台主页来判断
 * @param {string} platform - 平台标识
 * @param {string} accountId - 账号 ID
 * @param {string|undefined} expectedOwnerSubject - 校验开始时绑定的用户标识
 * @returns {Promise<{valid: boolean, message: string}>}
 */
async function checkLoginStatus (platform, accountId, expectedOwnerSubject) {
  if (!isSafePathSegment(platform) || !isSafePathSegment(accountId)) {
    return { valid: false, message: '缺少或非法平台/账号参数' }
  }

  const loginUrl = PLATFORM_LOGIN_URLS[platform]
  const successSelector = PLATFORM_LOGIN_SUCCESS_SELECTORS[platform]
  if (!loginUrl) return { valid: false, message: `不支持的平台: ${platform}` }
  const owner = resolveAttemptOwner(expectedOwnerSubject)

  try {
    const credentials = loadSavedCredentials(accountId, platform, owner)
    assertAttemptOwner(owner)
    const cookies = Array.isArray(credentials?.cookies) ? credentials.cookies : []
    const localStorageData = credentials?.localStorage && typeof credentials.localStorage === 'object' && !Array.isArray(credentials.localStorage)
      ? credentials.localStorage
      : {}
    if (!credentials || (cookies.length === 0 && Object.keys(localStorageData).length === 0)) {
      return { valid: false, message: '未配置 Cookie' }
    }

    // 创建临时 context 加载 Cookie 进行验证
    const browser = await playwrightManager.getContext({ show: false })
    assertAttemptOwner(owner)
    const page = await browser.newPage()
    assertAttemptOwner(owner)

    try {
      // 注入 Cookie
      if (cookies.length > 0) {
        await page.context().addCookies(cookies)
        assertAttemptOwner(owner)
      }
      if (Object.keys(localStorageData).length > 0) {
        await page.addInitScript(buildLocalStorageRestoreScript(localStorageData))
        assertAttemptOwner(owner)
      }

      // 访问平台页面
      await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 })
      assertAttemptOwner(owner)

      // 检查登录状态选择器
      if (successSelector) {
        try {
          await page.waitForSelector(successSelector, { timeout: 10000 })
          assertAttemptOwner(owner)
          return { valid: true, message: 'Cookie 有效，登录正常' }
        } catch {
          assertAttemptOwner(owner)
          return { valid: false, message: 'Cookie 已过期，请重新登录' }
        }
      }

      // 无特定选择器时，检查 URL 是否跳离登录页
      const currentUrl = page.url()
      assertAttemptOwner(owner)
      if (currentUrl.includes('login') || currentUrl.includes('signin')) {
        return { valid: false, message: 'Cookie 已过期，请重新登录' }
      }

      return { valid: true, message: 'Cookie 似乎有效' }
    } finally {
      await page.close().catch(() => {})
    }
  } catch (e) {
    if (e && e.code === 'AUTH_OWNER_CHANGED') throw e
    return { valid: false, message: `检查失败: ${e.message}` }
  }
}

/**
 * 从页面提取账号信息（昵称、头像、平台ID）
 * 基于蚁小二逆向工程
 */
async function extractAccountInfo (page) {
  try {
    return await page.evaluate(() => {
      const info = {}
      // 尝试多种常见的账号信息选择器
      const selectors = [
        '[class*="nickname"]',
        '[class*="username"]',
        '[class*="account"]',
        '[class*="user-name"]',
        '.user-info',
        '.profile-name',
        '#nickname',
        '#username',
      ]
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el && el.textContent && el.textContent.trim()) {
          info.nickName = el.textContent.trim()
          break
        }
      }
      // 头像
      const avatarEl = document.querySelector('[class*="avatar"] img, .avatar img, [class*="avatar-img"]')
      if (avatarEl) {
        info.avatar = avatarEl.src || avatarEl.getAttribute('data-src') || ''
      }
      // 平台用户ID
      info.platformAccountId = document.querySelector('[data-user-id], [data-account-id], [data-user]')?.getAttribute('data-user-id') || ''
      return info
    })
  } catch {
    return {}
  }
}

/**
 * 恢复 Cookie 到 Electron session
 * 基于蚁小二逆向工程 restoreCookies
 */
function restoreCookies (session, cookies, baseUrl) {
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
      }).catch(() => {})
    } catch {
      return Promise.resolve()
    }
  })
  return Promise.all(promises)
}

/**
 * 恢复 localStorage 到 webContents
 * 基于蚁小二逆向工程 restoreLocalStorage
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
 * 从主进程本地存储读取账号凭证，禁止通过 preload 暴露给渲染进程。
 * @param {string} accountId
 * @param {string} platform
 * @param {string|undefined} expectedOwnerSubject - 读取开始时绑定的用户标识
 * @returns {{cookies: Array, localStorage: object, indexedDB: object, accountInfo: object}|null}
 */
function loadSavedCredentials (accountId, platform, expectedOwnerSubject) {
  const owner = resolveAttemptOwner(expectedOwnerSubject)
  const userDataDir = getUserDataDir()
  const credentialData = owner === undefined
    ? credentialStore.loadCredential(accountId, userDataDir)
    : credentialStore.loadCredential(accountId, userDataDir, owner)
  const accountRecord = owner === undefined
    ? accountStateRestorer.getAccountRecord(platform, accountId)
    : accountStateRestorer.getAccountRecord(platform, accountId, owner, userDataDir)
  assertAttemptOwner(owner)
  if (!credentialData) return null
  const credentialPlatform = typeof credentialData.platform === 'string' ? credentialData.platform : ''
  const recordPlatform = typeof accountRecord?.platform === 'string' ? accountRecord.platform : ''
  if (credentialPlatform && credentialPlatform !== platform) return null
  if (recordPlatform && recordPlatform !== platform) return null
  if (!credentialPlatform && !recordPlatform) return null

  return {
    cookies: Array.isArray(credentialData.cookies)
      ? credentialData.cookies.filter(cookie => isPlatformCookieDomain(platform, cookie?.domain))
      : [],
    localStorage: credentialData.localStorage || {},
    indexedDB: credentialData.indexedDB || {},
    accountInfo: credentialData.accountInfo || accountRecord?.accountInfo || {},
  }
}

/**
 * 打开已保存的账号（恢复登录状态）
 * 基于蚁小二逆向工程 openSavedAccount
 * 
 * @param {string} accountId - 账号ID
 * @param {string} platform - 平台
 * @param {object} opts - { mainWindow?, session? }
 * @returns {Promise<{view?, isLoggedIn: boolean}>}
 */
async function openSavedAccount (accountId, platform, opts = {}) {
  // eslint-disable-next-line no-unused-vars
  const { mainWindow, session, webContents, ownerSubject } = opts
  const owner = resolveAttemptOwner(ownerSubject)
  
  // 从本地存储加载完整凭证
  const credentials = loadSavedCredentials(accountId, platform, owner)
  assertAttemptOwner(owner)

  if (!credentials) {
    log.info('AccountManager', `No saved credentials for ${platform}:${accountId}`)
    return { isLoggedIn: false }
  }

  const { localStorage: localStorageData, cookies, accountInfo } = credentials
  const baseUrl = PLATFORM_LOGIN_URLS[platform] || ''
  
  if (!session) {
    assertAttemptOwner(owner)
    log.info('AccountManager', `Restoring credentials for ${platform}:${accountId}`)
    return { isLoggedIn: true, accountInfo, localStorageData }
  }
  
  // 有 session 时恢复 cookies
  try {
    await restoreCookies(session, cookies, baseUrl)
    assertAttemptOwner(owner)
  } catch (e) {
    if (e && e.code === 'AUTH_OWNER_CHANGED') throw e
    log.warn('AccountManager', `restoreCookies failed: ${e.message}`)
  }
  if (webContents && localStorageData && Object.keys(localStorageData).length > 0) {
    await restoreLocalStorage(webContents, localStorageData)
    assertAttemptOwner(owner)
  }
  
  return { isLoggedIn: true, accountInfo, localStorageData }
}

/**
 * 检查本地是否有账号凭证
 */
function checkLocalCredentials (platform, accountId, expectedOwnerSubject) {
  const owner = resolveAttemptOwner(expectedOwnerSubject)
  const userDataDir = getUserDataDir()
  const hasCredential = owner === undefined
    ? credentialStore.hasCredential(accountId, userDataDir)
    : credentialStore.hasCredential(accountId, userDataDir, owner)
  if (!hasCredential) return false
  return Boolean(loadSavedCredentials(accountId, platform, owner))
}

module.exports = {
  addAccount,
  saveCapturedAccount,
  deleteAccount,
  listAccounts,
  checkLoginStatus,
  captureCookies,
  PLATFORM_LOGIN_URLS,
  PLATFORM_NAMES,
  PLATFORM_LOGIN_SUCCESS_SELECTORS,
  extractAccountInfo,
  restoreCookies,
  restoreLocalStorage,
  loadSavedCredentials,
  openSavedAccount,
  checkLocalCredentials,
  setOwnerSubjectProvider,
  accountStateRestorer,
  credentialStore,
}
