// @ts-check
/**
 * 视频克隆真实桌面 E2E 验收（切片 4e）
 * 用法：node scripts/video-clone-e2e.js [--exe <path>] [--out <png>]
 * 流程：ffmpeg 生成样例视频 → 启动打包应用 → #/video-clone → 填路径 → 开始分析
 *      → 等待报告/相似度卡 → 校验 runs 落库 → 截图。
 */
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { spawnSync } = require('node:child_process')
const { _electron } = require('playwright')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const DESKTOP = path.join(ROOT, 'apps', 'desktop')
const args = process.argv.slice(2)
const exeArg = args.indexOf('--exe') >= 0 ? args[args.indexOf('--exe') + 1] : null
const outArg = args.indexOf('--out') >= 0 ? args[args.indexOf('--out') + 1] : null

const EXE = exeArg || path.join(DESKTOP, 'dist-electron', 'win-unpacked', 'Multi-Publish.exe')
const OUT = outArg || path.join(ROOT, '01-docs', 'evidence', 'video-clone-e2e.png')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function makeSample(dir) {
  const out = path.join(dir, 'vc-sample.mp4')
  const ffmpeg = process.env.VC_FFMPEG_PATH || process.env.FFMPEG_PATH || 'ffmpeg'
  const r = spawnSync(ffmpeg, [
    '-y', '-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x240:rate=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out,
  ], { encoding: 'utf8' })
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error('样例生成失败: ' + (r.stderr || '').slice(0, 200))
  return out
}

async function main() {
  if (!fs.existsSync(EXE)) throw new Error('打包应用不存在: ' + EXE)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-e2e-'))
  const sample = makeSample(dir)
  const profile = path.join(dir, 'profile')
  fs.mkdirSync(path.join(ROOT, '01-docs', 'evidence'), { recursive: true })

  const app = await _electron.launch({
    executablePath: EXE,
    args: [],
    cwd: DESKTOP,
    env: { ...process.env, ELECTRON_USER_DATA_DIR: profile },
    timeout: 120000,
  })
  console.log('APP_LAUNCHED')

  let win = null
  const deadline = Date.now() + 60000
  while (Date.now() < deadline && !win) {
    for (const w of app.windows()) {
      const t = await w.title().catch(() => '')
      if (t && t !== 'DevTools') { win = w; break }
    }
    if (!win) await sleep(1500)
  }
  if (!win) throw new Error('主窗口未出现')
  win.on('console', (msg) => { const t = msg.type(); if (['error','warning'].includes(t)) console.log('APP_CONSOLE[' + t + '] ' + msg.text().slice(0, 300)) })
  win.on('pageerror', (e) => console.log('APP_PAGEERROR ' + String(e && e.message).slice(0, 300)))
  console.log('WINDOW_TITLE=' + (await win.title()))

  await win.evaluate(() => { window.location.hash = '#/video-clone' })
  await sleep(2500)

  // 填文件路径（el-input → 内部 input）
  await win.locator('.video-clone-view .vc-input input').first().fill(sample)
  await sleep(500)
  console.log('INPUT_VALUE=' + (await win.locator('.video-clone-view .vc-input input').first().inputValue()))
  // 点击「开始分析」
  await win.getByRole('button', { name: '开始分析' }).click()
  console.log('RUN_STARTED')

  // 轮询：报告卡 / 错误 toast / 失败阶段
  let ok = false
  let toast = ''
  let failedStages = ''
  const dl2 = Date.now() + 150000
  while (Date.now() < dl2 && !ok) {
    if (await win.locator('.vc-meta').first().isVisible().catch(() => false)) { ok = true; break }
    const toasts = await win.locator('.el-message--error').allTextContents().catch(() => [])
    if (toasts.length) { toast = toasts.join(' | '); break }
    const st = await win.locator('.vc-stage.is-failed').allTextContents().catch(() => [])
    if (st.length) { failedStages = st.join(' | '); break }
    await sleep(2000)
  }
  console.log('REPORT_CARD=' + (ok ? 'VISIBLE' : 'NOT_FOUND') + (toast ? ' TOAST=' + toast : '') + (failedStages ? ' FAILED_STAGES=' + failedStages : ''))
  if (ok) {
    const meta = await win.locator('.vc-meta').first().textContent()
    console.log('REPORT_META=' + (meta || '').replace(/\s+/g, ' ').trim())
  }
  // 等待相似度卡
  await win.locator('.vc-sim').first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {})
  const sim = await win.locator('.vc-sim').first().textContent().catch(() => '')
  console.log('SIMILARITY=' + (sim || '').replace(/\s+/g, ' ').trim())

  await win.screenshot({ path: OUT })
  console.log('SCREENSHOT=' + OUT)

  // 校验 runs 落库（store baseDir = os.tmpdir()）
  const runsDir = path.join(os.tmpdir(), 'runs')
  let runs = []
  try { runs = fs.readdirSync(runsDir).filter((f) => f.startsWith('vc-') && f.endsWith('.json')).sort().reverse() } catch { }
  console.log('RUNS_DIR=' + runsDir + ' COUNT=' + runs.length + ' LATEST=' + (runs[0] || ''))

  await app.close().catch(() => {})
  fs.rmSync(dir, { recursive: true, force: true })
  if (!ok) process.exit(1)
}

main().then(() => console.log('E2E_DONE')).catch((e) => { console.error('E2E_FAILED', e && e.stack || e); process.exit(1) })
