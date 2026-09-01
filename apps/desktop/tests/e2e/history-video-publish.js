// @ts-check
/**
 * E2E — 历史视频一键发布到百家号
 *
 * 真实 UI 流程：启动 Electron（挂 debug profile）→ 导航历史记录 → 找到已完成项目
 * run_1787747765446_xge6 → 点击「发布」→ 发布页预填充（video/title/content/tags）→
 * 校验 AI 生成声明默认勾选 → 勾选百家号账号 → 点击发布 → 监听进度至终态。
 *
 * 用法：
 *   node tests/e2e/history-video-publish.js [--project=run_1787747765446_xge6] [--account=f5f5ce78]
 */
const fs = require('node:fs')
const path = require('node:path')
const { _electron } = require('playwright')

const DESKTOP = path.resolve(__dirname, '..', '..')
const REPO_ROOT = path.resolve(DESKTOP, '..', '..')
const PROFILE = process.env.MP_PROFILE || 'D:/tmp/Multi-Publish-debug-profile'
const VITE_PORT = process.env.MP_VITE_PORT || 5394
const OUTPUT_DIR = path.join(REPO_ROOT, 'apps', 'desktop', 'tests', 'e2e-output', 'history-publish-' + Date.now())
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const args = process.argv.slice(2)
const projectArg = args.find((a) => a.startsWith('--project='))
const accountArg = args.find((a) => a.startsWith('--account='))
const TARGET_PROJECT = projectArg ? projectArg.split('=')[1] : 'run_1787747765446_xge6'
const TARGET_ACCOUNT = accountArg ? accountArg.split('=')[1] : 'f5f5ce78'

const report = {
  startedAt: new Date().toISOString(),
  project: TARGET_PROJECT,
  account: TARGET_ACCOUNT,
  profile: PROFILE,
  outputDir: OUTPUT_DIR,
  checks: [],
  publishResult: null,
  consoleErrors: [],
  pageErrors: [],
  mainStderr: '',
  status: 'running',
}

function check(name, ok, detail = '') {
  const item = { name, ok: Boolean(ok), detail: detail || '' }
  report.checks.push(item)
  console.log((item.ok ? 'PASS ' : 'FAIL ') + name + (item.detail ? ' :: ' + item.detail : ''))
  return item.ok
}

async function waitFor(predicate, timeoutMs = 60000, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const value = await predicate()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await sleep(Math.min(intervalMs, Math.max(25, deadline - Date.now())))
  }
  if (lastError) throw lastError
  return false
}

async function waitMainWindow(app, timeoutMs = 90000) {
  return waitFor(async () => {
    for (const win of app.windows()) {
      const title = await win.title().catch(() => '')
      if (title && title !== 'DevTools') return win
    }
    return null
  }, timeoutMs, 500)
}

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  let app = null
  try {
    app = await _electron.launch({
      executablePath: path.join(REPO_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
      args: [path.join(DESKTOP, 'electron', 'main.js'), '--no-sandbox', '--disable-gpu', '--lang=zh-CN'],
      cwd: DESKTOP,
      env: {
        ...process.env,
        ELECTRON_USER_DATA_DIR: PROFILE,
        ELECTRON_DISABLE_GPU: '1',
        DEV_SERVER_PORT: String(VITE_PORT),
      },
      timeout: 120000,
    })
    check('启动 Electron 成功', true, 'pid=' + app.process().pid)
    const child = app.process()
    child.stderr?.on('data', (chunk) => { report.mainStderr += String(chunk) })

    const page = await waitMainWindow(app)
    if (!page) throw new Error('主窗口未出现')
    page.on('console', (msg) => { if (msg.type() === 'error') report.consoleErrors.push(msg.text()) })
    page.on('pageerror', (err) => report.pageErrors.push(err.message || String(err)))
    check('主窗口出现', true, await page.title())

    // 等待应用初始化完成，导航到历史记录页
    await waitFor(async () => {
      const url = await page.evaluate(() => window.location.href).catch(() => '')
      return url.includes('5394') || url.includes('5174')
    }, 30000, 500).catch(() => {})
    await sleep(3000)
    // 历史记录统一收敛到 /create?view=history
    await page.evaluate(() => { window.location.hash = '#/create?view=history' }).catch(() => {})
    await sleep(3000)

    // 等待历史列表加载（出现历史项目卡片）
    const historyLoaded = await waitFor(async () => {
      const count = await page.evaluate(() => document.querySelectorAll('.history-item').length).catch(() => 0)
      return count > 0
    }, 30000, 500)
    check('历史列表加载（存在项目卡片）', historyLoaded)
    await page.screenshot({ path: path.join(OUTPUT_DIR, '01-history-list.png'), fullPage: true })

    // 找到目标项目卡片（data-history-id = projectId）
    const targetCard = await page.evaluate((pid) => {
      const card = document.querySelector('.history-item[data-history-id="' + pid + '"]')
      if (!card) return null
      const btn = card.querySelector('[data-testid="history-publish-button"]')
      return { hasCard: true, hasPublishBtn: Boolean(btn), title: ((card.querySelector('.history-name')) || {}).textContent || '' }
    }, TARGET_PROJECT)
    check('找到目标项目卡片 ' + TARGET_PROJECT, Boolean(targetCard && targetCard.hasCard), JSON.stringify(targetCard))
    check('目标项目有「发布」按钮', Boolean(targetCard && targetCard.hasPublishBtn))
    if (!targetCard || !targetCard.hasPublishBtn) throw new Error('目标项目无发布按钮（可能未 completed 或无 videoPath）')

    // 点击「发布」按钮
    const clicked = await page.evaluate((pid) => {
      const card = document.querySelector('.history-item[data-history-id="' + pid + '"]')
      const btn = card && card.querySelector('[data-testid="history-publish-button"]')
      if (!btn) return false
      btn.click()
      return true
    }, TARGET_PROJECT)
    check('点击「发布」按钮', clicked)
    await sleep(2500)

    // 等待跳转到发布页并预填充
    const publishPage = await waitFor(async () => {
      const url = await page.evaluate(() => window.location.href).catch(() => '')
      return url.includes('/publish')
    }, 20000, 400)
    check('跳转到发布页', Boolean(publishPage))
    await sleep(2000)

    // 校验视频模式激活 + 预填充
    const prefilled = await page.evaluate(() => {
      const modeTab = document.querySelector('.publish-mode-tab.active')
      const modeText = modeTab ? (modeTab.textContent || '') : ''
      const titleInput = document.querySelector('[data-testid="publish-title"] input')
      const title = titleInput ? titleInput.value : ''
      const descArea = document.querySelector('[data-testid="publish-desc"] textarea')
      const content = descArea ? descArea.value : ''
      const aiBox = document.querySelector('[data-testid="ai-declaration-checkbox"]')
      const aiChecked = aiBox ? aiBox.checked : null
      return { modeText, title, content, aiChecked }
    })
    check('发布页为视频模式', /视频/.test(prefilled.modeText), 'mode=' + prefilled.modeText)
    check('标题已预填充', Boolean(prefilled.title), 'title=' + String(prefilled.title).slice(0, 30))
    check('内容已预填充', Boolean(prefilled.content), 'content=' + String(prefilled.content).slice(0, 30))
    check('AI 生成声明默认勾选', prefilled.aiChecked === true, 'aiChecked=' + prefilled.aiChecked)
    await page.screenshot({ path: path.join(OUTPUT_DIR, '02-publish-prefilled.png'), fullPage: true })

    // 勾选百家号平台
    const platformSel = '[data-testid="platform-baijiahao"]'
    const platformEl = page.locator(platformSel).first()
    const platformVisible = await platformEl.isVisible().catch(() => false)
    if (platformVisible) {
      const checked = await platformEl.isChecked().catch(() => false)
      if (!checked) await platformEl.click()
      await sleep(1000)
    }
    check('勾选百家号平台', platformVisible)

    // 勾选目标账号
    const accountSel = '[data-testid="account-baijiahao-' + TARGET_ACCOUNT + '"]'
    const accountEl = page.locator(accountSel).first()
    const accountVisible = await accountEl.isVisible().catch(() => false)
    let accountChecked = false
    if (accountVisible) {
      accountChecked = await accountEl.isChecked().catch(() => false)
      if (!accountChecked) await accountEl.click()
      await sleep(500)
      accountChecked = await accountEl.isChecked().catch(() => false)
    }
    check('勾选百家号账号 ' + TARGET_ACCOUNT, accountChecked, 'id=' + TARGET_ACCOUNT)
    await page.screenshot({ path: path.join(OUTPUT_DIR, '03-account-selected.png'), fullPage: true })

    // 点击「发布」
    const submitBtn = page.locator('[data-testid="publish-submit"]').first()
    const submitVisible = await submitBtn.isVisible().catch(() => false)
    const submitEnabled = submitVisible ? await submitBtn.isEnabled().catch(() => false) : false
    check('发布按钮可用', submitEnabled)
    if (submitEnabled) await submitBtn.click()
    await sleep(3000)
    await page.screenshot({ path: path.join(OUTPUT_DIR, '04-publishing.png'), fullPage: true })

    // 监听进度到终态（最长 3 分钟）
    const progressObserved = await waitFor(async () => {
      const state = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="publish-progress"]')
        const src = panel ? panel.innerText || '' : document.body.innerText || ''
        const txt = src.replace(/\s+/g, ' ')
        if (/上传完成|处理完成|初始化完成|提取完成|排队中|发布中|上传中|处理中/.test(txt)) return null
        const success = /发布成功|发布完成|已发布|publish\s*成功|已完成发布/.test(txt)
        const failed = /发布失败|发布出错|publish.*failed|平台.*失败|执行.*失败/.test(txt)
        if (success && !failed) return 'success'
        if (failed || /错误|failed|error/i.test(txt)) return 'failed'
        return null
      })
      return state
    }, 180000, 1000)
    check('发布进度到终态', progressObserved === 'success', '终态=' + progressObserved)

    // 提取进度文本
    const progressText = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="publish-progress"]')
      return panel ? (panel.innerText || '').replace(/\s+/g, ' ').slice(0, 1500) : ''
    })
    report.publishResult = { terminalState: progressObserved, progressText }
    await sleep(2000)
    await page.screenshot({ path: path.join(OUTPUT_DIR, '05-final.png'), fullPage: true })

    report.status = progressObserved === 'success' ? 'completed' : (progressObserved === 'failed' ? 'failed' : 'unknown')
  } catch (error) {
    report.status = 'failed'
    report.error = error.message || String(error)
    console.error('FAIL run :: ' + (error.message || String(error)))
  } finally {
    if (app) await app.close().catch(() => {})
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
  console.log('报告: ' + path.join(OUTPUT_DIR, 'report.json'))
  return report
}

module.exports = { run }

if (require.main === module) {
  run().then((r) => {
    const criticalOk = r.checks.filter((c) => c.name.includes('发布') || c.name.includes('勾选') || c.name.includes('预填充')).every((c) => c.ok) || r.status === 'completed'
    process.exit(criticalOk && r.status !== 'failed' ? 0 : 1)
  })
}
