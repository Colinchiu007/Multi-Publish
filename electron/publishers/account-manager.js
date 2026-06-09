/**
 * 账号管理器
 * 负责通过 Playwright 捕获平台 Cookie，并通过 Python API 持久化
 */
const path = require('path')
const playwrightManager = require('../playwright-manager')
const pythonBridge = require('../python-bridge')

// 平台登录 URL 映射
const PLATFORM_LOGIN_URLS = {
  wechat_mp: 'https://mp.weixin.qq.com/',
  zhihu: 'https://www.zhihu.com/signin',
  weibo: 'https://weibo.com/login',
  douyin: 'https://www.douyin.com/',
}

/**
 * 等待页面出现特定选择器，表示登录成功
 */
const PLATFORM_LOGIN_SUCCESS_SELECTORS = {
  wechat_mp: '.weui-desktop-account__name',  // 公众号后台顶部账号名称
  zhihu: '.AppHeader-profile',
  weibo: '.gn_nickname',
  douyin: '.bd3c35b6',  // 抖音首页登录后特征
}

/**
 * 获取平台显示名称
 */
function getPlatformName (platform) {
  const names = {
    wechat_mp: '微信公众号',
    zhihu: '知乎',
    weibo: '微博',
    douyin: '抖音',
  }
  return names[platform] || platform
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
      await page.waitForTimeout(3000)
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

    return { cookies, name: accountName }
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
  const { cookies, name } = await captureCookies(platform)

  // 通过 Python API 保存
  const result = await pythonBridge.requestBackend('POST', '/api/accounts', {
    platform,
    name,
    cookies,
  })

  if (result.code !== 0) {
    throw new Error(result.message || '保存账号失败')
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

module.exports = {
  addAccount,
  deleteAccount,
  listAccounts,
  checkLoginStatus,
  captureCookies,
  PLATFORM_LOGIN_URLS,
}
