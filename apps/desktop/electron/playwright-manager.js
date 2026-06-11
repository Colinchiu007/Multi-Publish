const { chromium } = require('playwright')
const path = require('path')
const log = require('../logger')
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

  log.info('Playwright', 'Chromium instance started')

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
  log.info('Playwright', 'Chromium closed')
}

/**
 * 智能等待 - 优先等待选择器，回退到随机等待
 * @param {import('playwright').Page} page
 * @param {string} selector - 目标选择器
 * @param {number} [timeout=10000]
 */
async function smartWait(page, selector, timeout) {
  timeout = timeout || 10000;
  if (selector) {
    try { await page.waitForSelector(selector, { timeout: Math.min(timeout, 5000) }); return; }
    catch (e) { /* 回退到时间等待 */ }
  }
  var delay = Math.floor(Math.random() * 1500) + 500;
  await page.waitForTimeout(delay);
}

module.exports = {,
  smartWait,
  getContext,
  newPage,
  closeBrowser,
  getBrowserDataDir
}
