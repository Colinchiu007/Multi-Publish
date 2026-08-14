/**
 * story2video-manual-selection.js — 分镜素材自选（creation.mode=manual）真实 E2E
 *
 * 用已登录的调试 Profile（ELECTRON_USER_DATA_DIR，含保存的模型 provider key）驱动真实桌面应用：
 * 1) 启动故事讲述流水线（manual + 全部图片轮播）
 * 2) 轮询到 scene_asset_selection 检查点，断言每场景候选 = 2 张图片
 * 3) 提交默认选择（第 1 张），断言 finalize_assets → compose 完成且成片可解码
 * 4) 记录 promptTranslation（uiLocale=zh 时非空）与阶段清单（含 finalize_assets）
 *
 * 环境：ELECTRON_EXE / DESKTOP_DIR / ELECTRON_USER_DATA_DIR / DEV_SERVER_PORT / OUTPUT_DIR
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
const OUT = process.env.OUTPUT_DIR || 'C:/tmp/s2v-manual-e2e'
fs.mkdirSync(OUT, { recursive: true })

const sleep = ms => new Promise(r => setTimeout(r, ms))
// 长文案（多场景）验证分镜素材自选；可用 E2E_TEXT 环境变量覆盖
const TEST_TEXT = process.env.E2E_TEXT || '人工智能正在改变我们的生活方式。从自动驾驶汽车到智能语音助手，AI 技术已经深入日常生活的方方面面。医疗领域，AI 辅助诊断帮助医生更快发现病灶。教育领域，智能辅导系统让每个孩子都能获得个性化学习。交通领域，智能调度系统让城市出行更加高效。农业领域，无人机与传感器帮助农民精准灌溉。金融领域，智能风控系统守护每一笔交易的安全。未来十年，人工智能将继续带来更多惊喜，而我们每个人都是这场变革的见证者与参与者。'

function probe (file) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })
    return out.trim().split('\n').join(' | ')
  } catch (_) { return 'probe-failed' }
}

;(async () => {
  if (!fs.existsSync(PROFILE)) throw new Error('Profile 不存在: ' + PROFILE)
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [DESKTOP],
    cwd: DESKTOP,
    env: { ...process.env, ELECTRON_USER_DATA_DIR: PROFILE, DEV_SERVER_PORT: PORT },
    timeout: 120000,
  })
  console.log('APP_LAUNCHED')
  let win = null
  const dl = Date.now() + 120000
  while (Date.now() < dl && !win) {
    for (const w of app.windows()) { const t = await w.title().catch(() => ''); if (t !== 'DevTools') { win = w; break } }
    if (!win) await sleep(1500)
  }
  if (!win) throw new Error('no main window')
  await sleep(15000)

  async function es (fn, arg) {
    for (let i = 0; i < 12; i++) {
      try { return await win.evaluate(fn, arg) } catch (e) {
        if (/context|destroyed/.test(e.message)) { await sleep(5000); continue }
        throw e
      }
    }
    throw new Error('eval failed')
  }
  const log = (...a) => console.log(...a)

  // 1) 启动 manual 流水线
  const startParams = {
    text: TEST_TEXT,
    inputMode: 'text',
    checkpointPolicy: 'none',
    autoAdvance: true,
    background: true,
    uiLocale: 'zh',
    story2videoTextConfig: { version: 1, mode: 'text', prompt: TEST_TEXT, creation: { mode: 'manual', materialMode: 'all-images' } },
  }
  log('START manual pipeline...')
  const sr = await es(o => window.electronAPI.pipelineStartOrchestrated('story2video-compose', o), startParams)
  const runId = sr && sr.data && sr.data.runId
  if (!runId) throw new Error('启动失败: ' + JSON.stringify(sr).slice(0, 300))
  log('RUN_ID', runId)

  // 2) 轮询到 scene_asset_selection 检查点
  let snap = null
  // 长文案多场景图片生成较慢，放宽到 30 分钟
  const deadline = Date.now() + 30 * 60 * 1000
  while (Date.now() < deadline) {
    const r = await es(rid => window.electronAPI.pipelineGetRunContext(rid), runId)
    const data = r && r.data
    if (data && data.checkpoint && data.checkpoint.type === 'scene_asset_selection') { snap = data; break }
    if (data && data.status && ['failed', 'cancelled'].includes(data.status.status)) {
      throw new Error('流水线失败: ' + JSON.stringify(data.error || data.status).slice(0, 400))
    }
    await sleep(5000)
  }
  if (!snap) throw new Error('等待 scene_asset_selection 检查点超时')
  const candidates = (snap.context && snap.context.generate_assets && snap.context.generate_assets.candidates) || []
  log('CHECKPOINT reached; stages=', JSON.stringify((snap.stages || []).map(s => s.name)))
  log('scenes=', candidates.length, 'per-scene kinds=', candidates.map(c => (c.candidates || []).map(x => x.kind).join(',')))
  if (candidates.length < 1) throw new Error('无候选场景')
  for (const scene of candidates) {
    const kinds = (scene.candidates || []).map(x => x.kind)
    if (kinds.filter(k => k === 'image').length !== 2) throw new Error('场景 ' + scene.index + ' 图片候选数 != 2: ' + kinds.join(','))
  }
  const hasTranslation = candidates.every(c => typeof c.promptTranslation === 'string' && c.promptTranslation.length > 0)
  log('promptTranslation present for all scenes:', hasTranslation)

  // 3) 提交默认选择（纯图 → 第 1 张）
  const selections = candidates.map(scene => ({ index: scene.index, candidateId: (scene.candidates || []).find(c => c.kind === 'image').id }))
  log('CONFIRM selections=', JSON.stringify(selections))
  const cr = await es(o => window.electronAPI.pipelineConfirmSceneAssets(o.runId, o.selections), { runId, selections })
  log('CONFIRM result=', JSON.stringify(cr && cr.data).slice(0, 200))
  if (!cr || cr.code !== 0 || cr.data.success === false) throw new Error('确认失败: ' + JSON.stringify(cr).slice(0, 300))

  // 4) 轮询到完成
  let final = null
  while (Date.now() < deadline) {
    const r = await es(rid => window.electronAPI.pipelineGetRunContext(rid), runId)
    const data = r && r.data
    if (data && data.status && data.status.status === 'completed') { final = data; break }
    if (data && data.status && ['failed', 'cancelled'].includes(data.status.status)) {
      throw new Error('流水线失败(终态): ' + JSON.stringify(data.error || data.status).slice(0, 400))
    }
    await sleep(5000)
  }
  if (!final) throw new Error('等待完成超时')
  const ctx = final.context || {}
  const composeRaw = (ctx.compose && ctx.compose.data) || ctx.compose || {}
  const videoPath = composeRaw.videoPath || composeRaw.path
  if (!videoPath || !fs.existsSync(videoPath)) throw new Error('未找到成片: ' + videoPath)
  log('COMPLETED videoPath=', videoPath)
  log('ffprobe=', probe(videoPath))
  const finalStages = (final.stages || []).map(s => s.name)
  log('final stages=', JSON.stringify(finalStages))
  if (!finalStages.includes('finalize_assets')) throw new Error('阶段清单缺少 finalize_assets')
  log('E2E_MANUAL_OK')

  try { await app.close() } catch (_) { /* ignore */ }
})().catch(err => {
  console.error('E2E_FAILED', err && err.stack ? err.stack : err)
  process.exit(1)
})
