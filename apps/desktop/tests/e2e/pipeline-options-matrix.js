/**
 * pipeline-options-matrix.js — 全流水线选项枚举 E2E 运行器（除图片轮播）
 *
 * 用途：对每条流水线的每个选项的每个枚举值跑真实 E2E，验证选项是否影响最终产物。
 * 产物统一落到 <OUTPUT_DIR>/<case>.mp4|webm，并在末尾输出 ffprobe 元数据表。
 *
 * 环境要求（与 apps/desktop/tests/e2e/helpers/e2e-preflight.js 对齐）：
 *   ELECTRON_EXE    — Electron 可执行文件（默认 C:/tmp/Multi-Publish-model-scheduler/node_modules/electron/dist/electron.exe）
 *   DESKTOP_DIR     — apps/desktop 目录（默认相对脚本位置向上 3 级）
 *   ELECTRON_USER_DATA_DIR — 测试 profile（需已配置模型 provider 与身份）
 *   DEV_SERVER_PORT — Vite dev server 端口（默认 5202）
 *   OUTPUT_DIR      — 产物目录（默认 C:/tmp/all-pipeline-outputs/options-matrix）
 *
 * 运行：node tests/e2e/pipeline-options-matrix.js
 * 说明：用例较多（imageEffect 10 + transition 6 + 其他），每例真实调用图片/TTS/视频 API，耗时长。
 */

'use strict'

const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')
const { _electron } = require(process.env.PLAYWRIGHT_REQUIRE || 'playwright')

const ELECTRON = process.env.ELECTRON_EXE || 'C:/tmp/Multi-Publish-model-scheduler/node_modules/electron/dist/electron.exe'
const DESKTOP = process.env.DESKTOP_DIR || path.resolve(__dirname, '..', '..')
const PROFILE = process.env.ELECTRON_USER_DATA_DIR || 'C:/tmp/Multi-Publish-debug-profile'
const PORT = process.env.DEV_SERVER_PORT || '5202'
const OUT = process.env.OUTPUT_DIR || 'C:/tmp/all-pipeline-outputs/options-matrix'
const INPUTS = process.env.E2E_INPUTS || path.join(require('os').tmpdir(), 'story2video', 'e2e-inputs')

const sleep = ms => new Promise(r => setTimeout(r, ms))
fs.mkdirSync(OUT, { recursive: true })

const MULTI_SCENE_TEXT = '春眠不觉晓处处闻啼鸟。夜来风雨声花落知多少。'
const SHORT_TEXT = '春眠不觉晓处处闻啼鸟'

// ─── 用例定义：每个用例覆盖一个选项的一个枚举值 ───
const CASES = [
  // imageEffect 全枚举（S2V compose）
  ...['none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'zoom-pan', 'rotate', 'blur-in']
    .map(v => ({ n: 's2v-eff-' + v.replace(/-/g, ''), p: 'story2video-compose', params: { text: SHORT_TEXT, imageStyle: 'cinematic', resolution: '720x1280', fps: 30, imageEffect: v }, l: 'imageEffect=' + v })),

  // transition 全枚举（S2V compose，多场景文案才能体现转场）
  ...['none', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down']
    .map(v => ({ n: 's2v-trans-' + v.replace(/-/g, ''), p: 'story2video-compose', params: { text: MULTI_SCENE_TEXT, imageStyle: 'cinematic', resolution: '720x1280', fps: 30, transition: v }, l: 'transition=' + v })),

  // 其他 S2V 选项枚举
  { n: 's2v-fmt-webm', p: 'story2video-compose', params: { text: SHORT_TEXT, imageStyle: 'cinematic', resolution: '720x1280', fps: 30, format: 'webm' }, l: 'format=webm' },
  { n: 's2v-mindur', p: 'story2video-compose', params: { text: SHORT_TEXT, imageStyle: 'cinematic', resolution: '720x1280', fps: 30, sceneDurationMode: 'min-duration', minSceneDuration: 8 }, l: 'min-duration=8s' },
  { n: 's2v-subtitle', p: 'story2video-compose', params: { text: SHORT_TEXT, imageStyle: 'cinematic', resolution: '720x1280', fps: 30, subtitleEnabled: true }, l: 'subtitle=on' },
  { n: 's2v-watermark', p: 'story2video-compose', params: { text: SHORT_TEXT, imageStyle: 'cinematic', resolution: '720x1280', fps: 30, watermark: true, watermarkText: 'TEST-WM' }, l: 'watermark=on' },

  // clip-factory 选项枚举
  { n: 'clip-t01', p: 'clip-factory', params: { video: path.join(INPUTS, 'clipfactory-long.mp4'), sceneThreshold: 0.1 }, l: 'sceneThreshold=0.1' },
  { n: 'clip-t05', p: 'clip-factory', params: { video: path.join(INPUTS, 'clipfactory-long.mp4'), sceneThreshold: 0.5 }, l: 'sceneThreshold=0.5' },
  { n: 'clip-max2', p: 'clip-factory', params: { video: path.join(INPUTS, 'clipfactory-long.mp4'), maxSegments: 2 }, l: 'maxSegments=2' },
  { n: 'clip-max4', p: 'clip-factory', params: { video: path.join(INPUTS, 'clipfactory-long.mp4'), maxSegments: 4 }, l: 'maxSegments=4' },
  { n: 'clip-total30', p: 'clip-factory', params: { video: path.join(INPUTS, 'clipfactory-long.mp4'), maxTotalSeconds: 30 }, l: 'maxTotalSeconds=30' },

  // cinematic 分辨率枚举
  { n: 'cin-720', p: 'cinematic', params: { video: path.join(INPUTS, 'cinematic-source.mp4'), resolution: '720x1280' }, l: 'cin=720x1280' },
  { n: 'cin-1080', p: 'cinematic', params: { video: path.join(INPUTS, 'cinematic-source.mp4'), resolution: '1920x1080' }, l: 'cin=1920x1080' },

  // localization 语言枚举
  { n: 'loc-en', p: 'localization-dub', params: { video: path.join(INPUTS, 'localization-source.mp4'), text: '大家好。测试台词。', targetLanguage: 'en' }, l: 'loc=en' },
  { n: 'loc-ja', p: 'localization-dub', params: { video: path.join(INPUTS, 'localization-source.mp4'), text: '大家好。测试台词。', targetLanguage: 'ja' }, l: 'loc=ja' },
]

// ─── 工具：在 run context 中找首个非输入源视频路径 ───
function sourcePaths (params) {
  const set = new Set()
  for (const k of ['video', 'audio']) {
    const v = params[k]
    if (typeof v === 'string' && v) { try { set.add(fs.realpathSync.native(v)) } catch (_) {} }
  }
  return set
}
function findOutput (o, depth, sources) {
  if (!o || typeof o !== 'object' || depth > 10) return null
  for (const k of ['videoPath', 'outputPath']) {
    const v = o[k]
    if (typeof v === 'string' && fs.existsSync(v)) {
      try { if (!sources.has(fs.realpathSync.native(v))) return v } catch (_) {}
    }
  }
  for (const k of Object.keys(o)) {
    const v = o[k]
    if (v && typeof v === 'object') { const r = findOutput(v, depth + 1, sources); if (r) return r }
  }
  return null
}

function probe (file) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,avg_frame_rate', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })
    return out.trim().split('\n').join(' | ')
  } catch (_) { return 'probe-failed' }
}

;(async () => {
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [DESKTOP],
    cwd: DESKTOP,
    env: { ...process.env, ELECTRON_USER_DATA_DIR: PROFILE, DEV_SERVER_PORT: PORT },
    timeout: 120000,
  })
  console.log('APP_LAUNCHED')
  let win = null
  const dl = Date.now() + 90000
  while (Date.now() < dl && !win) {
    for (const w of app.windows()) { const t = await w.title().catch(() => ''); if (t !== 'DevTools') { win = w; break } }
    if (!win) await sleep(1500)
  }
  if (!win) throw new Error('no main window')
  await sleep(20000)

  async function es (fn, arg) {
    for (let i = 0; i < 10; i++) {
      try { return await win.evaluate(fn, arg) } catch (e) {
        if (/context|destroyed/.test(e.message)) { await sleep(5000); continue }
        throw e
      }
    }
    throw new Error('eval failed')
  }

  const results = []
  for (const c of CASES) {
    await sleep(3000)
    const t0 = Date.now()
    console.log('=== START', c.n, c.l, '===')
    let sr
    try {
      sr = await es(o => window.electronAPI.pipelineStartOrchestrated(o.name, { ...o.params, inputMode: 'text', checkpointPolicy: 'none', autoAdvance: true, background: true }), { name: c.p, params: c.params })
    } catch (e) { results.push({ n: c.n, ok: false, err: 'start:' + e.message }); continue }
    const rid = sr && sr.data && sr.data.runId
    if (!rid) { results.push({ n: c.n, ok: false, err: String(sr && (sr.message || sr)).slice(0, 200) }); continue }

    const end = Date.now() + (c.p === 'animated-explainer' || c.p === 'documentary-montage' ? 20 : 8) * 60 * 1000
    let ctx = null
    while (Date.now() < end) {
      const snap = await es(r => window.electronAPI.pipelineGetRunContext(r).then(x => x && x.data ? x.data : null), rid).catch(() => null)
      if (snap) {
        ctx = snap
        const st = snap.status && snap.status.status
        if (['completed', 'failed', 'cancelled'].includes(st)) break
      }
      await sleep(8000)
    }

    const vp = ctx ? findOutput(ctx.context, 0, sourcePaths(c.params)) : null
    const err = ctx ? String(ctx.error || (ctx.status && ctx.status.error) || '') : ''
    if (vp && fs.existsSync(vp)) {
      const ext = c.params.format === 'webm' ? 'webm' : 'mp4'
      const dest = path.join(OUT, c.n + '.' + ext)
      fs.copyFileSync(vp, dest)
      results.push({ n: c.n, ok: true, dest, size: fs.statSync(vp).size, probe: probe(dest), ms: Date.now() - t0 })
      console.log('OK', c.n, fs.statSync(vp).size + 'b')
    } else {
      results.push({ n: c.n, ok: false, err: err.slice(0, 300), ms: Date.now() - t0 })
      console.log('FAIL', c.n, err.slice(0, 200))
    }
  }

  console.log('RESULTS_JSON ' + JSON.stringify(results))
  console.log('\n=== ffprobe 元数据表 ===')
  for (const r of results) console.log(r.n + '\t' + (r.ok ? 'OK' : 'FAIL') + '\t' + (r.probe || r.err))
  await app.close().catch(() => {})
  process.exit(0)
})().catch(e => { console.error('DRIVER_ERR', e.message); process.exit(1) })
