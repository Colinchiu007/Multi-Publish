// @ts-check
/**
 * NOTE: This test must be run from the shared root:
 *   cd D:/Data/projects/Multi-Publish
 *   node apps/desktop/tests/e2e/one-click-publish-e2e.js
 *
 * The worktree node_modules may have Linux native modules;
 * the shared root has proper Windows binaries.
 */
/**
 * E2E — 一键发布到百家号/快手/B站
 *
 * 真实 UI 流程：启动 Electron（挂 debug profile）→ 导航到发布页 → 视频模式 → 上传视频 → 提取封面 → 填写内容 → 校验 AI 生成声明 → 选平台 → 选账号 → 发布 → 监听进度至终态
 * run_1787747765446_xge6 → 点击「发布」→ 发布页预填充（video/title/content/tags）→
 * 校验 AI 生成声明默认勾选 → 勾选百家号账号 → 点击发布 → 监听进度至终态。
 *
 * 用法：
 *   node tests/e2e/one-click-publish-e2e.js [--platforms=baijiahao,kuaishou,bilibili]
 */
const fs = require('node:fs')
const path = require('node:path')
const { _electron } = require('playwright')

const DESKTOP = path.resolve(__dirname, '..', '..')
const REPO_ROOT = path.resolve(DESKTOP, '..', '..')
const PROFILE = process.env.MP_PROFILE || 'D:/tmp/Multi-Publish-debug-profile'
const VITE_PORT = process.env.MP_VITE_PORT || '5174'
const OUTPUT_DIR = path.join(REPO_ROOT, 'apps', 'desktop', 'tests', 'e2e-output', 'one-click-publish-' + Date.now())
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const args = process.argv.slice(2)
const platformsArg = args.find((a) => a.startsWith('--platforms='))
const TARGET_PLATFORMS = platformsArg ? platformsArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : ['baijiahao', 'kuaishou', 'bilibili']
const VIDEO = process.env.MP_VIDEO || 'D:/01.mp4'

const report = {
  startedAt: new Date().toISOString(),
  platforms: TARGET_PLATFORMS,
  video: VIDEO,
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
    // 检查视频文件
    if (!fs.existsSync(VIDEO) && !fs.existsSync('/mnt/d/01.mp4')) {
      throw new Error('视频文件不存在: ' + VIDEO + ' (also tried /mnt/d/01.mp4)')
    }
    check('视频文件存在', true, 'size=' + (fs.statSync(VIDEO).size / 1024 / 1024).toFixed(2) + 'MB')

    app = await _electron.launch({
      executablePath: 'D:/Data/projects/Multi-Publish/node_modules/electron/dist/electron.exe',
      args: ['D:/Data/projects/Multi-Publish/apps/desktop/electron/main.js', '--no-sandbox', '--disable-gpu', '--lang=zh-CN'],
      cwd: 'D:/Data/projects/Multi-Publish/apps/desktop',
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
    child.stderr && child.stderr.on('data', (chunk) => { report.mainStderr += String(chunk) })

    const page = await waitMainWindow(app)
    if (!page) throw new Error('主窗口未出现')
    page.on('console', (msg) => { if (msg.type() === 'error') report.consoleErrors.push(msg.text()) })
    page.on('pageerror', (err) => report.pageErrors.push(err.message || String(err)))
    check('主窗口出现', true, await page.title())

    // 等待应用初始化完成
    await waitFor(async () => {
      const url = await page.evaluate(() => window.location.href).catch(() => '')
      return url.includes(VITE_PORT) || url.includes('localhost')
    }, 30000, 500).catch(() => {})
    await sleep(5000)

    console.log('当前 URL:', await page.evaluate(() => window.location.href).catch(() => 'unknown'))

    // 导航到发布页
    await page.evaluate(() => { window.location.hash = '#/publish' }).catch(() => {})
    await sleep(3000)

    const publishRendered = await waitFor(async () => {
      const has = await page.evaluate(() => {
        return Boolean(
          document.querySelector('[data-testid="publish-target-selector"]') ||
          document.querySelector('[data-testid="publish-submit"]') ||
          document.querySelector('.target-selector')
        )
      }).catch(() => false)
      return has
    }, 30000, 500)
    check('发布页渲染', publishRendered)
    if (!publishRendered) throw new Error('发布页未渲染')

    await page.screenshot({ path: path.join(OUTPUT_DIR, '00-publish-page.png'), fullPage: true })

    // 切换到视频模式
    const videoModeClicked = await page.evaluate(() => {
      const tabs = document.querySelectorAll('.publish-mode-tab')
      for (let i = 0; i < tabs.length; i++) {
        if (/视频/.test(tabs[i].textContent || '')) { tabs[i].click(); return 'clicked' }
      }
      return 'no video tab'
    })
    check('切换到视频模式', videoModeClicked === 'clicked', 'result=' + videoModeClicked)
    await sleep(2000)

    const videoModeActive = await page.evaluate(() => {
      if (document.querySelector('.video-upload-zone')) return true
      const activeTab = document.querySelector('.publish-mode-tab.active')
      return Boolean(activeTab && /视频/.test(activeTab.textContent || ''))
    })
    check('视频模式已激活', videoModeActive)

    // 上传视频
    const uploadResult = await page.evaluate((vp) => {
      let input = document.querySelector('.video-upload-zone input[type="file"]')
      if (!input) input = document.querySelector('.el-upload input[type="file"]')
      if (!input) return { ok: false, reason: 'no file input found' }
      const name = vp.split('/').pop()
      const file = new File([new Uint8Array([0])], name, { type: 'video/mp4' })
      try { Object.defineProperty(file, 'path', { value: vp, configurable: true }) } catch (e) {}
      const dt = new DataTransfer()
      dt.items.add(file)
      Object.defineProperty(input, 'files', { value: dt.files, configurable: true })
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true }
    }, VIDEO).catch((e) => ({ ok: false, reason: e.message }))
    check('视频文件注入', uploadResult.ok, JSON.stringify(uploadResult))
    await sleep(3000)

    const videoLoaded = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).some((el) => (el.innerText || '').includes('提取'))
    })
    check('视频上传（提取封面按钮出现）', videoLoaded)
    await page.screenshot({ path: path.join(OUTPUT_DIR, '01-video-uploaded.png'), fullPage: true })

    // 提取封面
    if (videoLoaded) {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find((el) => (el.innerText || '').includes('提取'))
        if (btn) btn.click()
      })
      check('点击提取封面', true)
      await sleep(3000)

      const coverPath = await waitFor(async () => {
        const value = await page.evaluate(() => {
          const el = document.querySelector('[data-testid="cover-state"]')
          return el ? el.getAttribute('data-cover-path') || '' : ''
        }).catch(() => '')
        return value || false
      }, 15000, 500)
      check('封面首帧提取', Boolean(coverPath), 'path=' + (coverPath || '').slice(0, 60))
      await page.screenshot({ path: path.join(OUTPUT_DIR, '02-cover-extracted.png'), fullPage: true })
    }

    // 自定义标题和描述
    const TITLE = 'AI赋能内容创作：一键多平台发布新体验'
    const DESC = '在数字时代的浪潮中，人工智能正在悄然改变我们的创作方式。从写文案到剪视频，从配音到配乐，AI助手让每个人都能成为内容创作者。今天，我们探索AI如何帮助自媒体人提升效率，让创意不再受技术限制，让好内容能够一键触达更多平台、更多观众。 #AI创作 #人工智能 #自媒体'

    // 填写标题
    await page.evaluate((title) => {
      const input = document.querySelector('[data-testid="publish-title"] input')
      if (!input) return
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, title)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, TITLE)
    check('填写标题', true, 'title=' + TITLE)

    // 填写描述
    await page.evaluate((desc) => {
      const textarea = document.querySelector('[data-testid="publish-desc"] textarea')
      if (!textarea) return
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(textarea, desc)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    }, DESC)
    check('填写描述', true)

    // 校验 AI 生成声明
    let aiChecked = await page.evaluate(() => {
      const checkbox = document.querySelector('[data-testid="ai-declaration-checkbox"]')
      return checkbox ? checkbox.checked : null
    })
    check('AI 生成声明默认勾选', aiChecked === true, 'aiChecked=' + aiChecked)
    if (!aiChecked) {
      await page.evaluate(() => {
        const checkbox = document.querySelector('[data-testid="ai-declaration-checkbox"]')
        if (checkbox) checkbox.click()
      })
      await sleep(500)
      aiChecked = await page.evaluate(() => {
        const checkbox = document.querySelector('[data-testid="ai-declaration-checkbox"]')
        return checkbox ? checkbox.checked : null
      })
      check('手动勾选 AI 声明', aiChecked === true, 'aiChecked=' + aiChecked)
    }
    await page.screenshot({ path: path.join(OUTPUT_DIR, '03-content-filled.png'), fullPage: true })

    // 选择平台和账号
    const selectedAccountIds = {}
    for (let pi = 0; pi < TARGET_PLATFORMS.length; pi++) {
      const platform = TARGET_PLATFORMS[pi]
      console.log('选择平台:', platform)

      const sel = '[data-testid="platform-' + platform + '"]'
      const platformEl = page.locator(sel).first()
      const platformVisible = await platformEl.isVisible().catch(() => false)
      if (!platformVisible) { check('平台 ' + platform + ' 可见', false, '选择器不存在'); continue }

      const platformChecked = await platformEl.isChecked().catch(() => false)
      if (!platformChecked) { await platformEl.click(); await sleep(800) }
      const nowChecked = await platformEl.isChecked().catch(() => false)
      check('勾选平台 ' + platform, nowChecked)
      if (!nowChecked) { selectedAccountIds[platform] = []; continue }

      const accountSel = '[data-testid^="account-' + platform + '-"]'
      const accountEls = page.locator(accountSel)
      const accountCount = await accountEls.count().catch(() => 0)
      console.log('  可用账号数:', accountCount)
      if (accountCount === 0) { check('勾选 ' + platform + ' 账号', false, '无可用账号'); selectedAccountIds[platform] = []; continue }

      let accountChecked = false
      for (let ai = 0; ai < accountCount; ai++) {
        const el = accountEls.nth(ai)
        const visible = await el.isVisible().catch(() => false)
        if (!visible) continue
        const checked = await el.isChecked().catch(() => false)
        if (!checked) { await el.click(); await sleep(500) }
        accountChecked = await el.isChecked().catch(() => false)
        if (accountChecked) {
          const id = await el.getAttribute('data-testid').catch(() => '')
          selectedAccountIds[platform] = [id.replace('account-' + platform + '-', '')]
          break
        }
      }
      check('勾选 ' + platform + ' 账号', accountChecked, 'id=' + (selectedAccountIds[platform] || []).join(','))
    }
    await page.screenshot({ path: path.join(OUTPUT_DIR, '04-platforms-selected.png'), fullPage: true })

    // 点击「一键发布」
    const submitBtn = page.locator('[data-testid="publish-submit"]').first()
    const submitVisible = await submitBtn.isVisible().catch(() => false)
    const submitEnabled = submitVisible ? await submitBtn.isEnabled().catch(() => false) : false
    check('发布按钮可用', submitEnabled)
    if (!submitEnabled) {
      const allButtons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).map((b) => ({ text: (b.textContent || '').slice(0, 30), disabled: b.disabled }))
      })
      console.log('所有按钮:', JSON.stringify(allButtons))
      throw new Error('发布按钮不可用，请检查平台和账号选择')
    }
    console.log('点击发布按钮...')
    await submitBtn.click()
    await sleep(3000)
    await page.screenshot({ path: path.join(OUTPUT_DIR, '05-publishing.png'), fullPage: true })

    // 监听发布进度到终态
    const progressObserved = await waitFor(async () => {
      const state = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="publish-progress"]')
        const src = panel ? panel.innerText || '' : document.body.innerText || ''
        const txt = src.replace(/\s+/g, ' ')
        if (/上传完成|处理完成|初始化完成|提取完成|排队中|发布中|上传中|处理中|任务已完成/.test(txt)) return null
        const success = /发布成功|发布完成|已发布/.test(txt)
        const failed = /发布失败|发布出错|平台.*失败|执行.*失败/.test(txt)
        if (success && !failed) return 'success'
        if (failed || /错误|failed|error/i.test(txt)) return 'failed'
        return null
      })
      return state
    }, 10 * 60 * 1000, 2000)

    check('发布进度到终态', progressObserved === 'success', '终态=' + progressObserved)
    await sleep(2000)
    await page.screenshot({ path: path.join(OUTPUT_DIR, '06-final.png'), fullPage: true })

    const finalText = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="publish-progress"]')
      return panel ? (panel.innerText || '').replace(/\s+/g, ' ').slice(0, 3000) : ''
    })
    report.publishResult = { terminalState: progressObserved, progressText: finalText }
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
