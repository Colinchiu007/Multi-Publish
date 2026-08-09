// 真实 Electron 验证：未登录打开「视频创作 → 历史记录」
// 1) 不弹「历史记录暂时无法加载」 2) 显示「本地模式」提示条 3) 空态「暂无创作记录」
const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')

const desktopDir = 'D:/Data/projects/Multi-Publish/apps/desktop'
const rootDir = 'D:/Data/projects/Multi-Publish'
const electronBin = path.join(rootDir, 'node_modules/electron/dist/electron.exe')
const viteBin = path.join(rootDir, 'node_modules/vite/bin/vite.js')
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-verify-e2e-'))
const { _electron } = require(path.join(rootDir, 'node_modules/playwright'))

async function main () {
  // 起 Vite（strictPort 5174；端口必须空闲）
  const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { cwd: desktopDir, stdio: 'ignore' })
  const ready = await new Promise((resolve) => {
    const t0 = Date.now()
    const timer = setInterval(() => {
      const http = require('http')
      http.get('http://127.0.0.1:5174/', (res) => { if (res.statusCode < 500) { clearInterval(timer); resolve(true) } }).on('error', () => { if (Date.now() - t0 > 60000) { clearInterval(timer); resolve(false) } })
    }, 1000)
  })
  if (!ready) throw new Error('Vite 未就绪')
  console.log('[vite] ready on 5174')

  const app = await _electron.launch({
    executablePath: electronBin,
    args: ['.', '--no-sandbox', '--disable-gpu'],
    cwd: desktopDir,
    env: { ...process.env, ELECTRON_USER_DATA_DIR: userData },
    timeout: 90000,
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded', { timeout: 30000 })
  console.log('[electron] window title:', await win.title())

  // IPC 探测：列出 electronAPI 方法并直接调用两个历史通道
  const ipcProbe = await win.evaluate(async () => {
    const keys = Object.keys(window.electronAPI || {}).filter(k => /list.?projects|history|pipeline/i.test(k))
    const out = { keys }
    try {
      const api = window.electronAPI
      const listProjects = api.story2videoListProjects || api['story2video:list-projects'] || keys.find(k => /list.*projects/i.test(k))
      if (listProjects) out.listProjects = await (typeof listProjects === 'function' ? listProjects() : listProjects)
    } catch (e) { out.listProjectsError = String(e && e.message || e) }
    try {
      const api = window.electronAPI
      const history = api.pipelineHistory || api['pipeline:history'] || keys.find(k => /history/i.test(k))
      if (history) out.pipelineHistory = await (typeof history === 'function' ? history() : history)
    } catch (e) { out.pipelineHistoryError = String(e && e.message || e) }
    return out
  })
  console.log('[ipcProbe]', JSON.stringify(ipcProbe, null, 2).slice(0, 1200))

  // 导航到 CreateView
  await win.goto('http://127.0.0.1:5174/?__e2e_reset=1#/create/pipeline', { timeout: 30000 }).catch(() => {})
  await win.waitForTimeout(4000)

  // 点击「历史记录」tab
  const clicked = await win.evaluate(() => {
    // CreateView 顶部「历史记录」tab（class=view-tab），精确匹配避免误点侧边导航
    const target = Array.from(document.querySelectorAll('button.view-tab'))
      .find(el => el.textContent.trim() === '历史记录')
    if (target) { target.click(); return true }
    return false
  })
  console.log('[history] tab clicked:', clicked)
  // 轮询等待历史视图渲染（本地模式提示条 / 空态 / 列表 / 错误弹窗任一出即稳定）
  await win.waitForTimeout(1500)
  for (let i = 0; i < 30; i++) {
    const settled = await win.evaluate(() => {
      const banner = document.querySelector('[data-testid="history-local-mode-banner"]')
      const empty = document.querySelector('.empty-state')
      const list = document.querySelector('.history-list, .history-item')
      const loading = document.querySelector('.loading-state')
      const dialog = document.querySelector('.story2video-error-dialog-message')
      return { done: Boolean(banner || empty || list || dialog), loading: Boolean(loading), dialog: Boolean(dialog) }
    })
    if (settled.done && !settled.loading) break
    await win.waitForTimeout(500)
  }

  const state = await win.evaluate(() => {
    const bodyText = document.body.innerText || ''
    const errorDialog = document.querySelector('.story2video-error-dialog-message')
    const localBanner = document.querySelector('[data-testid="history-local-mode-banner"]')
    const empty = Array.from(document.querySelectorAll('.empty-state')).map(el => el.textContent.trim())
    return {
      hasErrorDialog: Boolean(errorDialog),
      errorDialogText: errorDialog ? errorDialog.textContent.trim().slice(0, 80) : '',
      hasLocalModeBanner: Boolean(localBanner),
      localModeText: localBanner ? localBanner.textContent.trim() : '',
      emptyStates: empty,
      hasCannotLoadText: bodyText.includes('历史记录暂时无法加载'),
      hasNoRecords: bodyText.includes('暂无创作记录'),
    }
  })
  console.log('[verify]', JSON.stringify(state, null, 2))

  await win.screenshot({ path: 'C:/tmp/ccg-image-prompts/history-verify.png' })
  const bodyPreview = await win.evaluate(() => (document.body.innerText || '').replace(/\n+/g, ' | ').slice(0, 600))
  console.log('[body]', bodyPreview)
  console.log('[screenshot] saved')

  await app.close()
  vite.kill()
  console.log('VERIFY_DONE', JSON.stringify(state))
  process.exit(0)
}

main().catch((e) => { console.error('VERIFY_FAIL', e); process.exit(1) })
