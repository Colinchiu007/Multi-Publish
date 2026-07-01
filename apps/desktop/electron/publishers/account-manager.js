/**
 * 账号管理器
 * 负责通过 Playwright 捕获平台 Cookie，并通过 Python API 持久化
 */
const path = require('path')
const log = require('../logger')
const playwrightManager = require('../playwright-manager')
const pythonBridge = require('../python-bridge')
const accountStateRestorer = require('../account-state-restorer')
const credentialStore = require('../credential-store')
const { PLATFORM_LOGIN_URLS, PLATFORM_NAMES, PLATFORM_LOGIN_SUCCESS_SELECTORS, getPlatformName } = require('@multi-publish/shared-utils/src/platform-definitions')

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

  console.log(`[AccountManager] 开始捕获 ${platformName} Cookie`)
  console.log(`[AccountManager] 打开登录页面: ${loginUrl}`)

  // 获取 Playwright 上下文
  const context = await playwrightManager.getContext()
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
        console.log(`[AccountManager] ${platformName} 已登录，直接捕获 Cookie`)
      } catch {
        console.log(`[AccountManager] 等待用户在 ${platformName} 登录...`)
      }
    }

    if (!loggedIn) {
      // 等待用户手动登录 — 检测到成功选择器或 Cookie 变化
      console.log(`[AccountManager] 请在弹出的浏览器窗口中登录 ${platformName}`)
      console.log(`[AccountManager] 超时时间: ${Math.round(timeout / 1000 / 60)} 分钟`)

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
    console.log(`[AccountManager] 捕获到 ${cookies.length} 个 Cookie`)

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
 * @returns {Promise<Object>} 保存后的账号信息
 */
async function addAccount (platform) {
  const { cookies, name, localStorage: localStorageData, accountInfo } = await captureCookies(platform)

  // 通过 Python API 保存
  const result = await pythonBridge.requestBackend('POST', '/api/accounts', {
    platform,
    name,
    cookies,
  })

  if (result.code !== 0) {
    throw new Error(result.message || '保存账号失败')
  }

  // 本地持久化：localStorage + accountInfo + accountStateRecord
  const accountId = result.data?.accountId || result.data?.id || platform + '-' + Date.now()
  try {
    const platformLoginUrl = PLATFORM_LOGIN_URLS[platform] || loginUrl
    accountStateRestorer.saveAccountRecord({
      accountId,
      platform,
      platformAccountId: accountInfo?.platformAccountId || '',
      cookies,
      localStorage: localStorageData,
      accountInfo,
      timestamp: Date.now(),
    })
    log.info('AccountManager', `Saved account state record for ${platform}:${accountId}`)
  } catch (e) {
    log.warn('AccountManager', `Failed to save account state record: ${e.message}`)
  }

  try {
    credentialStore.saveCredential(accountId, {
      localStorage: localStorageData,
      accountInfo,
    }, process.env.ELECTRON_USER_DATA_DIR || '.')
    log.info('AccountManager', `Saved credential store for account ${accountId}`)
  } catch (e) {
    log.warn('AccountManager', `Failed to save credential: ${e.message}`)
  }

  console.log(`[AccountManager] 账号添加成功: ${name} (${platform})`)
  return result.data
}

/**
 * 删除账号
 * @param {string} accountId
 * @returns {Promise<boolean>}
 */
async function deleteAccount (accountId) {
  const result = await pythonBridge.requestBackend('DELETE', `/api/accounts/${accountId}`)
  if (result.code !== 0) {
    throw new Error(result.message || '删除账号失败')
  }
  console.log(`[AccountManager] 账号已删除: ${accountId}`)
  return true
}

/**
 * 获取账号列表
 * @returns {Promise<Array>}
 */
async function listAccounts () {
  const result = await pythonBridge.requestBackend('GET', '/api/accounts')
  if (result.code !== 0) {
    throw new Error(result.message || '获取账号列表失败')
  }
  return result.data || []
}

/**
 * 检查账号登录状态 — 通过加载 Cookie 并访问平台主页来判断
 * @param {string} platform - 平台标识
 * @param {string} accountId - 账号 ID
 * @returns {Promise<{valid: boolean, message: string}>}
 */
async function checkLoginStatus (platform, accountId) {
  try {
    // 从 Python API 获取已保存的 Cookie
    const result = await pythonBridge.requestBackend('GET', `/api/accounts/${accountId}/cookies`)
    if (result.code !== 0 || !result.data || !result.data.cookies || result.data.cookies.length === 0) {
      return { valid: false, message: '未配置 Cookie' }
    }

    const cookies = result.data.cookies
    const loginUrl = PLATFORM_LOGIN_URLS[platform]
    const successSelector = PLATFORM_LOGIN_SUCCESS_SELECTORS[platform]

    if (!loginUrl) {
      return { valid: false, message: `不支持的平台: ${platform}` }
    }

    // 创建临时 context 加载 Cookie 进行验证
    const browser = await playwrightManager.getContext()
    const page = await browser.newPage()

    try {
      // 注入 Cookie
      await page.context().addCookies(cookies)

      // 访问平台页面
      await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 })

      // 检查登录状态选择器
      if (successSelector) {
        try {
          await page.waitForSelector(successSelector, { timeout: 10000 })
          return { valid: true, message: 'Cookie 有效，登录正常' }
        } catch {
          return { valid: false, message: 'Cookie 已过期，请重新登录' }
        }
      }

      // 无特定选择器时，检查 URL 是否跳离登录页
      const currentUrl = page.url()
      if (currentUrl.includes('login') || currentUrl.includes('signin')) {
        return { valid: false, message: 'Cookie 已过期，请重新登录' }
      }

      return { valid: true, message: 'Cookie 似乎有效' }
    } finally {
      await page.close().catch(() => {})
    }
  } catch (e) {
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
  
  const sets = items.map(([key, value]) => {
    const escapedKey = String(key).replace(/'/g, "\\'")
    const escapedValue = String(value).replace(/'/g, "\\'")
    return `localStorage.setItem('${escapedKey}', '${escapedValue}')`
  }).join('\n')
  
  return webContents.executeJavaScript(sets).catch(() => {})
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
  const { mainWindow, session } = opts
  
  // 从本地存储加载完整凭证
  const credentialData = credentialStore.loadCredential(accountId, process.env.ELECTRON_USER_DATA_DIR || '.')
  const accountRecord = accountStateRestorer.getAccountRecord(platform, accountId)
  
  if (!credentialData && !accountRecord) {
    log.info('AccountManager', `No saved credentials for ${platform}:${accountId}`)
    return { isLoggedIn: false }
  }
  
  const localStorageData = credentialData?.localStorage || accountRecord?.localStorage || {}
  const cookies = accountRecord?.cookies || []
  const accountInfo = credentialData?.accountInfo || accountRecord?.accountInfo || {}
  const baseUrl = PLATFORM_LOGIN_URLS[platform] || ''
  
  if (!session) {
    log.info('AccountManager', `Restoring credentials for ${platform}:${accountId}`)
    return { isLoggedIn: true, accountInfo, localStorageData }
  }
  
  // 有 session 时恢复 cookies
  try {
    await restoreCookies(session, cookies, baseUrl)
  } catch (e) {
    log.warn('AccountManager', `restoreCookies failed: ${e.message}`)
  }
  
  return { isLoggedIn: true, accountInfo, localStorageData }
}

/**
 * 检查本地是否有账号凭证
 */
function checkLocalCredentials (platform, accountId) {
  return credentialStore.hasCredential(accountId, process.env.ELECTRON_USER_DATA_DIR || '.') ||
         !!accountStateRestorer.getAccountRecord(platform, accountId)
}

module.exports = {
  addAccount,
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
  openSavedAccount,
  checkLocalCredentials,
  accountStateRestorer,
  credentialStore,
}
