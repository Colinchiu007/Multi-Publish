const { chromium } = require('playwright')
const path = require('path')
const { app } = require('electron')

let browser = null
let context = null
let browserDataDir = null

function getBrowserDataDir () {
  if (!browserDataDir) {
    browserDataDir = path.join(app.getPath('userData'), 'browser-data')
  }
  return browserDataDir
}

async function launchBrowser () {
  if (browser) return browser

  const userDataDir = getBrowserDataDir()

  console.log(`[Playwright] Launching Chromium, userDataDir: ${userDataDir}`)

  context = await chromium.launchPersistentContext(userDataDir, {
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
    await launchBrowser()
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
  closeBrowser,
  getBrowserDataDir
}
