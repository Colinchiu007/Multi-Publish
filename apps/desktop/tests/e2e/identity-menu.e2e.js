'use strict'

const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:5174/'
const SCREENSHOT_DIR = process.env.IDENTITY_E2E_SCREENSHOT_DIR || path.join(
  __dirname,
  '..',
  'visual-testing',
  'screenshots',
)

const AUTHENTICATED_STATE = {
  status: 'authenticated',
  user: {
    sub: 'user-qa-1',
    name: '这是一个用于验证超长昵称省略与菜单布局的全球用户名称',
    username: 'qa-user',
    picture: '',
  },
  entitlement: { plan: 'pro', features: ['cloud_publish'] },
  error: null,
}

function installIdentityBridge(state) {
  window.electronAPI = {
    identityGetState: async () => ({ code: 0, data: state }),
    identitySignIn: async () => ({ code: 0, data: state }),
    identitySwitchAccount: async () => ({ code: 0, data: state }),
    identitySignOut: async () => ({
      code: 0,
      data: { status: 'signed_out', user: null, entitlement: null, error: null },
    }),
    onIdentityStateChanged: (callback) => {
      window.__identityStateCallback = callback
      return () => { window.__identityStateCallback = null }
    },
  }
}

function observePage(page) {
  const consoleErrors = []
  const pageErrors = []
  const failedRequests = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('requestfailed', (request) => {
    failedRequests.push({ url: request.url(), error: request.failure()?.errorText || '' })
  })
  return { consoleErrors, pageErrors, failedRequests }
}

async function openAuthenticatedPage(browser, viewport) {
  const context = await browser.newContext({ viewport })
  await context.addInitScript(installIdentityBridge, AUTHENTICATED_STATE)
  const page = await context.newPage()
  const observations = observePage(page)
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.locator('[data-testid="identity-trigger"]').waitFor({ state: 'visible' })
  return { context, observations, page }
}

async function verifyMenuBounds(page) {
  return page.locator('#identity-menu-panel').evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    }
  })
}

async function run() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const report = {}

  try {
    const desktop = await openAuthenticatedPage(browser, { width: 1440, height: 900 })
    const trigger = desktop.page.locator('[data-testid="identity-trigger"]')
    const label = desktop.page.locator('.identity-trigger-label')
    assert.equal(await trigger.getAttribute('aria-haspopup'), 'menu')
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
    assert.ok((await trigger.boundingBox()).width <= 180, '长昵称触发器不得超过 180px')
    assert.ok(
      await label.evaluate((element) => element.scrollWidth > element.clientWidth),
      '长昵称应在触发器中截断',
    )

    await trigger.click()
    const desktopPanel = desktop.page.locator('#identity-menu-panel')
    await desktopPanel.waitFor({ state: 'visible' })
    assert.equal(await desktopPanel.getAttribute('role'), 'menu')
    assert.match(await desktopPanel.innerText(), /已连接/)
    assert.match(await desktopPanel.innerText(), /切换账号/)
    assert.match(await desktopPanel.innerText(), /退出登录/)
    const desktopBounds = await verifyMenuBounds(desktop.page)
    assert.ok(desktopBounds.left >= 0 && desktopBounds.right <= desktopBounds.viewportWidth)
    await desktop.page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'identity-menu-authenticated-desktop.png'),
      fullPage: true,
    })

    await desktop.page.keyboard.press('Escape')
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
    assert.equal(await trigger.evaluate((element) => document.activeElement === element), true)
    await trigger.press('ArrowDown')
    const switchAccount = desktop.page.locator('[data-testid="identity-switch-account"]')
    assert.equal(await switchAccount.evaluate((element) => document.activeElement === element), true)
    report.desktop = { bounds: desktopBounds, observations: desktop.observations }
    await desktop.context.close()

    const narrow = await openAuthenticatedPage(browser, { width: 1024, height: 600 })
    const narrowTrigger = narrow.page.locator('[data-testid="identity-trigger"]')
    await narrowTrigger.click()
    const narrowBounds = await verifyMenuBounds(narrow.page)
    assert.ok(narrowBounds.left >= 0 && narrowBounds.right <= narrowBounds.viewportWidth)
    assert.ok(narrowBounds.top >= 0 && narrowBounds.bottom <= narrowBounds.viewportHeight)
    await narrow.page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'identity-menu-authenticated-narrow.png'),
      fullPage: true,
    })
    report.narrow = { bounds: narrowBounds, observations: narrow.observations }
    await narrow.context.close()

    for (const result of Object.values(report)) {
      assert.deepEqual(result.observations.consoleErrors, [])
      assert.deepEqual(result.observations.pageErrors, [])
      assert.deepEqual(result.observations.failedRequests, [])
    }

    process.stdout.write(`${JSON.stringify(report, null, 2)}\nIDENTITY_MENU_E2E_OK\n`)
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  console.error('身份菜单 E2E 验证失败：', error)
  process.exitCode = 1
})
