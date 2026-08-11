/**
 * video-model-pipelines.js — 视频模型流水线（character-animation / avatar-spokesperson）E2E 运行器
 *
 * 用途：注入 agnes-video + LLM Key 后，真实运行两条视频模型流水线，验证并保存最终成品。
 * 覆盖：视频模型流水线的「模型 Key 是否配置生效」+「流水线是否产出真实视频」。
 *
 * 环境变量：
 *   ELECTRON_EXE / DESKTOP_DIR / ELECTRON_USER_DATA_DIR / DEV_SERVER_PORT / OUTPUT_DIR
 *   AGNES_API_KEY  — agnes-video Key（视频生成，必填）
 *   LLM_API_KEY    — LLM Key（concept/script 阶段，必填；默认注入 minimax-multimodal）
 *   LLM_PROVIDER   — LLM provider id（默认 minimax-multimodal）
 *
 * 运行：AGNES_API_KEY=sk-... LLM_API_KEY=... node tests/e2e/video-model-pipelines.js
 *
 * 说明（2026-08-11 E2E 复盘）：character-animation 的 concept/storyboard、avatar-spokesperson 的
 * script 阶段依赖 LLM；视频生成依赖 agnes-video。两者缺一都会失败（"未找到需要的相关模型" /
 * "该流水线视频生成全部失败"）。Key 注入必须用 snake_case 字段名 `api_key`（camelCase `apiKey`
 * 会被 updateProvider 静默忽略，导致 Key 未写入）。
 */

'use strict'

const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')
const { _electron } = require(process.env.PLAYWRIGHT_REQUIRE || 'playwright')

const ELECTRON = process.env.ELECTRON_EXE || 'C:/tmp/Multi-Publish-ops-templates/node_modules/electron/dist/electron.exe'
const DESKTOP = process.env.DESKTOP_DIR || path.resolve(__dirname, '..', '..')
const PROFILE = process.env.ELECTRON_USER_DATA_DIR || 'C:/tmp/Multi-Publish-debug-profile'
const PORT = process.env.DEV_SERVER_PORT || '5202'
const OUT = process.env.OUTPUT_DIR || 'C:/tmp/all-pipeline-outputs/video-model'
const AGNES_KEY = process.env.AGNES_API_KEY || ''
const LLM_KEY = process.env.LLM_API_KEY || ''
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'minimax-multimodal'

const sleep = ms => new Promise(r => setTimeout(r, ms))
fs.mkdirSync(OUT, { recursive: true })

const CASES = [
  { n: 'char-def', p: 'character-animation', params: { text: '机器人城市行走' }, l: 'Char anim' },
  { n: 'avatar-def', p: 'avatar-spokesperson', params: { text: '数字人主播欢迎光临' }, l: 'Avatar' },
]

function findOutput (o, depth) {
  if (!o || typeof o !== 'object' || depth > 10) return null
  for (const k of ['videoPath', 'outputPath']) {
    const v = o[k]
    if (typeof v === 'string' && fs.existsSync(v)) return v
  }
  for (const k of Object.keys(o)) {
    const v = o[k]
    if (v && typeof v === 'object') { const r = findOutput(v, depth + 1); if (r) return r }
  }
  return null
}

function probe (file) {
  try {
    return execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,avg_frame_rate', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim()
  } catch (_) { return 'probe-failed' }
}

;(async () => {
  if (!AGNES_KEY || !LLM_KEY) {
    console.error('需要 AGNES_API_KEY 与 LLM_API_KEY 环境变量（char/avatar 分别依赖 agnes-video 视频生成与 LLM 概念/剧本阶段）。')
    process.exit(2)
  }

  const app = await _electron.launch({
    executablePath: ELECTRON, args: [DESKTOP], cwd: DESKTOP,
    env: { ...process.env, ELECTRON_USER_DATA_DIR: PROFILE, DEV_SERVER_PORT: PORT }, timeout: 120000,
  })
  console.log('APP_LAUNCHED')
  let win = null
  const dl = Date.now() + 90000
  while (Date.now() < dl && !win) {
    for (const w of app.windows()) { const t = await w.title().catch(() => ''); if (t !== 'DevTools') { win = w; break } }
    if (!win) await sleep(1500)
  }
  if (!win) throw new Error('no main window')
  await sleep(15000)

  async function es (fn, arg) {
    for (let i = 0; i < 10; i++) {
      try { return await win.evaluate(fn, arg) } catch (e) {
        if (/context|destroyed/.test(e.message)) { await sleep(5000); continue }
        throw e
      }
    }
    throw new Error('eval failed')
  }

  // 注入 Key（必须用 snake_case api_key）
  const up = await es(async ({ id, key }) => window.electronAPI.modelProviderUpdate(id, { api_key: key, enabled: true }), { id: 'agnes-video', key: AGNES_KEY })
  console.log('INJECT agnes-video code=' + (up && up.code))
  const up2 = await es(async ({ id, key }) => window.electronAPI.modelProviderUpdate(id, { api_key: key, enabled: true }), { id: LLM_PROVIDER, key: LLM_KEY })
  console.log('INJECT ' + LLM_PROVIDER + ' code=' + (up2 && up2.code))

  const state = await es(async () => {
    const a = await window.electronAPI.modelProviderGet('agnes-video')
    const m = await window.electronAPI.modelProviderGet(LLM_PROVIDER)
    return {
      agnes: a && a.data ? { enabled: a.data.enabled, configured: a.data.is_configured } : null,
      llm: m && m.data ? { enabled: m.data.enabled, configured: m.data.is_configured } : null,
    }
  })
  console.log('PROVIDER_STATE ' + JSON.stringify(state))

  for (const c of CASES) {
    await sleep(3000)
    console.log('=== START ' + c.n + ' ' + c.l + ' ===')
    const sr = await es(o => window.electronAPI.pipelineStartOrchestrated(o.name, { ...o.params, inputMode: 'text', checkpointPolicy: 'none', autoAdvance: true, background: true }), { name: c.p, params: c.params })
    const rid = sr && sr.data && sr.data.runId
    if (!rid) { console.log('NORID ' + JSON.stringify(sr).slice(0, 150)); continue }
    const end = Date.now() + 15 * 60 * 1000
    let ctx = null
    while (Date.now() < end) {
      const snap = await es(r => window.electronAPI.pipelineGetRunContext(r).then(x => x && x.data ? x.data : null), rid).catch(() => null)
      if (snap) {
        ctx = snap
        const st = snap.status && snap.status.status
        if (['completed', 'failed', 'cancelled'].includes(st)) { console.log('STATUS ' + c.n + ' ' + st); break }
      }
      await sleep(10000)
    }
    const vp = ctx ? findOutput(ctx.context, 0) : null
    if (vp && fs.existsSync(vp)) {
      const dest = path.join(OUT, c.n + '.mp4')
      fs.copyFileSync(vp, dest)
      console.log('OK ' + c.n + ' ' + fs.statSync(vp).size + 'b probe=' + probe(dest))
    } else {
      console.log('FAIL ' + c.n + ' ' + String(ctx && (ctx.error || '')).slice(0, 250))
    }
  }

  await app.close().catch(() => {})
  process.exit(0)
})().catch(e => { console.error('DRIVER_ERR', e.message); process.exit(1) })
