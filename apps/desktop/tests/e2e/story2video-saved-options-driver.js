/**
 * story2video-saved-options-driver.js
 *
 * 用已登录调试 profile 的「保存好的选项」驱动的真实故事讲述（story2video-compose）E2E。
 * 连接已运行的 Electron（CDP），走真实 UI：进入「视频创作」→ 选择「故事讲述」→
 * 仅填入文案 → 点击「启动流水线」，不改动任何已保存选项；随后轮询至终态并校验真实 mp4。
 *
 * 环境变量：
 *   E2E_CDP_URL        CDP 端点（默认 http://127.0.0.1:11038）
 *   E2E_VITE_ORIGIN    renderer 源（默认 http://127.0.0.1:6990）
 *   E2E_LABEL          本次运行标签（输出文件名前缀）
 *   E2E_TEXT           要生成的文案（必填）
 *   E2E_OUT_DIR        成片与报告输出目录（默认 C:/tmp/s2v-real-20260821）
 */
'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { chromium } = require(process.env.PLAYWRIGHT_REQUIRE || 'playwright')

const CDP_URL = process.env.E2E_CDP_URL || 'http://127.0.0.1:11038'
const VITE_ORIGIN = process.env.E2E_VITE_ORIGIN || 'http://127.0.0.1:6990'
const LABEL = process.env.E2E_LABEL || 's2v'
const TEXT = process.env.E2E_TEXT || ''
const OUT_DIR = process.env.E2E_OUT_DIR || 'C:/tmp/s2v-real-20260821'
const PIPELINE = 'story2video-compose'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function probe (file) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=codec_name,width,height,avg_frame_rate',
      '-show_entries', 'format=duration,size,bit_rate',
      '-of', 'json', file,
    ], { encoding: 'utf8' })
    return JSON.parse(out)
  } catch (err) {
    return { probeFailed: err && err.message ? err.message : String(err) }
  }
}

function findOutput (node, depth, sources) {
  if (!node || typeof node !== 'object' || depth > 12) return null
  for (const key of ['videoPath', 'outputPath']) {
    const value = node[key]
    if (typeof value === 'string' && value && fs.existsSync(value)) {
      let real = null
      try { real = fs.realpathSync.native(value) } catch (_) {}
      if (!sources || !sources.has(real)) return value
    }
  }
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (value && typeof value === 'object') {
      const found = findOutput(value, depth + 1, sources)
      if (found) return found
    }
  }
  return null
}

;(async () => {
  if (!TEXT) throw new Error('E2E_TEXT 未提供')
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const report = {
    label: LABEL,
    pipeline: PIPELINE,
    textChars: Array.from(TEXT).length,
    textStart: TEXT.slice(0, 40),
    startedAt: new Date().toISOString(),
    savedOptions: null,
  }
  const browser = await chromium.connectOverCDP(CDP_URL)
  const page = browser.contexts()
    .flatMap((ctx) => ctx.pages())
    .find((p) => p.url().startsWith(VITE_ORIGIN))
  if (!page) throw new Error('未找到 renderer 页面: ' + VITE_ORIGIN)

  await page.evaluate(() => {
    window.__s2vCaptured = null
    const original = window.electronAPI && window.electronAPI.pipelineStartOrchestrated
    if (typeof original !== 'function') return
    window.electronAPI.pipelineStartOrchestrated = async (...args) => {
      const result = await original(...args)
      if (args[0] === 'story2video-compose' && result && result.data && result.data.runId) {
        window.__s2vCaptured = { runId: result.data.runId, raw: result }
        console.log('[s2v-driver] captured runId=', result.data.runId)
      }
      return result
    }
  })

  await page.goto(VITE_ORIGIN + '/#/', { waitUntil: 'domcontentloaded' })
  await page.goto(VITE_ORIGIN + '/#/create', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.pipeline-card', { timeout: 60000 })
  const card = page.locator(`.pipeline-card[data-pipeline-id="${PIPELINE}"]`).first()
  await card.click()
  await page.waitForSelector('textarea[placeholder*="输入视频文案"]', { timeout: 60000 })
  await page.locator('textarea[placeholder*="输入视频文案"]').fill(TEXT)

  const start = page.locator('[data-testid="start-story2video"]').first()
  await page.waitForSelector('[data-testid="start-story2video"]', { timeout: 60000 })
  // 等待按钮可用（保存选项回填 / provider 就绪后的可启动状态）
  for (let i = 0; i < 30; i++) {
    const disabled = await start.isDisabled().catch(() => true)
    if (!disabled) break
    await sleep(1000)
  }
  const stillDisabled = await start.isDisabled().catch(() => true)
  if (stillDisabled) throw new Error('启动流水线按钮未在 30s 内可用')
  const startedBefore = Date.now() - 1000
  await start.click()

  // 等待流水线创建 run：优先捕获，兜底从 history 取启动后新建的运行
  const captureDeadline = Date.now() + 90000
  let runId = null
  while (Date.now() < captureDeadline && !runId) {
    const captured = await page.evaluate(() => window.__s2vCaptured)
    if (captured && captured.runId) {
      runId = captured.runId
      break
    }
    runId = await page.evaluate((since) => window.electronAPI.pipelineHistory()
      .then((h) => { const rows = (h && h.data) || []; return rows
        .filter(r => r.pipeline === 'story2video-compose' && new Date(r.createdAt).getTime() >= since)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null })
      .then(first => first ? first.id : null), startedBefore)
    if (!runId) await sleep(1500)
  }
  if (!runId) throw new Error('启动流水线后未找到新 run（capture 与 history 均失败）')
  report.runId = runId

  const deadline = Date.now() + 60 * 60 * 1000
  let final = null
  let lastStage = null
  while (Date.now() < deadline) {
    const data = await page.evaluate(
      (rid) => window.electronAPI.pipelineGetRunContext(rid).then((r) => (r && r.data) || null),
      runId,
    ).catch(() => null)
    if (data) {
      const status = data.status && data.status.status
      const current = (data.stages || []).filter((s) => s.status === 'running').map((s) => s.name).join(',') || 'idle'
      if (current !== lastStage) {
        lastStage = current
        console.log('[s2v-driver] stage=', current, 'status=', status)
      }
      if (['completed', 'failed', 'cancelled'].includes(status)) {
        final = data
        break
      }
    }
    await sleep(8000)
  }
  if (!final) throw new Error('等待流水线终态超时')

  const status = final.status && final.status.status
  report.finishedAt = new Date().toISOString()
  report.finalStatus = status
  report.error = String((final.error && (final.error.message || JSON.stringify(final.error))) || (final.status && final.status.error) || '')
  report.stages = (final.stages || []).map((s) => ({ name: s.name, status: s.status }))

  const context = final.context || {}
  const videoPath = findOutput(context, 0, new Set())
  report.rawVideoPath = videoPath || null
  if (!videoPath) throw new Error('流水线已完成但未找到成片路径; 状态=' + status + ' 错误=' + report.error.slice(0, 300))

  const dest = path.join(OUT_DIR, LABEL + '.mp4')
  fs.copyFileSync(videoPath, dest)
  report.outputPath = dest
  report.outputBytes = fs.statSync(videoPath).size
  report.probe = probe(videoPath)
  report.provenance = ((context.generate_assets && context.generate_assets.segments) || (final.segments || [])).map((s) => ({
    index: s.index,
    sceneSource: s.sceneSource,
    subtitleSource: s.subtitleSource,
    degraded: !!s.degraded,
    imageProvider: s.imageMeta && s.imageMeta.provider,
    audioProvider: s.audioMeta && s.audioMeta.provider,
  }))
  try {
    const saved = await page.evaluate(
      (rid) => window.electronAPI.pipelineGetRunContext(rid).then(() => null),
      runId,
    )
    if (saved) report.savedOptionsExtra = saved
  } catch (_) {}

  fs.writeFileSync(path.join(OUT_DIR, LABEL + '-report.json'), JSON.stringify(report, null, 2))
  console.log('REPORT_DIR=' + OUT_DIR)
  console.log('RUN_ID=' + runId)
  console.log('STATUS=' + status)
  console.log('VIDEO=' + dest)
  console.log('FFPROBE=' + JSON.stringify(report.probe))
  console.log('E2E_OK')

  await browser.close()
})().catch((err) => {
  console.error('E2E_FAILED ' + (err && err.stack ? err.stack : err))
  process.exit(1)
})
