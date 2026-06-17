/**
 * @multi-publish/rpa-engine — Playwright 浏览器管理
 * 无 Electron 依赖，browserDataDir 通过参数注入
 */
const { chromium } = require('playwright')
const path = require('path')

let browser = null
let context = null

/**
 * 启动 Chromium 浏览器
 * @param {string} [userDataDir] - 浏览器数据目录。Electron 环境传 app.getPath('userData')+'/browser-data'
 * @returns {Promise<import('playwright').Browser>}
 */
async function launchBrowser (userDataDir) {
  if (browser) return browser

  const dataDir = userDataDir || path.join(process.cwd(), '.browser-data')

  console.log(`[Playwright] Launching Chromium, userDataDir: ${dataDir}`)

  context = await chromium.launchPersistentContext(dataDir, {
    headless: false,
    viewport: { width: 1920, height: 1080 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars'
    ],
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai'
  })

  browser = context.browser()
  console.log('[Playwright] Chromium instance started')
  return browser
}

async function getContext () {
  if (!context) {
    throw new Error('Browser not launched. Call launchBrowser() first.')
  }
  return context
}

async function newPage () {
  const ctx = await getContext()
  const page = await ctx.newPage()

  // 反检测：伪造 navigator.webdriver
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

  // 随机延迟助手
  page.waitForRandom = (min = 1000, max = 3000) => {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min
    return page.waitForTimeout(delay)
  }

  return page
}

async function closeBrowser () {
  if (context) {
    try { await context.close() } catch (e) { /* ignore */ }
    context = null
  }
  browser = null
  console.log('[Playwright] Chromium closed')
}

module.exports = {
  launchBrowser,
  getContext,
  newPage,
  closeBrowser
}