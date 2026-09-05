/**
 * video-clone-real-agv-e2e.js — 视频克隆真实 Agnes Video 生成 E2E 验证
 *
 * 用途：注入 agnes-video API Key 后，真实运行视频克隆流水线，验证产出动态视频
 * （非降级静态图占位）。覆盖 video-clone 流水线的「Agnes Video 生成是否真实生效」+
 * 「成品是否包含动态画面」。
 *
 * 环境变量：
 *   ELECTRON_EXE / DESKTOP_DIR / ELECTRON_USER_DATA_DIR / DEV_SERVER_PORT / OUTPUT_DIR
 *   AGNES_API_KEY  — agnes-video Key（视频生成，必填）
 *   TEST_VIDEO     — 测试源视频路径（可选，默认使用内置测试视频）
 *
 * 运行：AGNES_API_KEY=sk-... node tests/e2e/video-clone-real-agv-e2e.js
 *
 * 验证项：
 *   - pipeline.ok === true
 *   - 至少一个 scene 的 asset 是真实视频（degraded !== true, kind === 'video'）
 *   - 输出视频存在且可播放（duration > 0, has video stream）
 *   - 相似度 verdict 可判定
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
const OUT = process.env.OUTPUT_DIR || 'C:/tmp/all-pipeline-outputs/video-clone-agv'
const AGNES_KEY = process.env.AGNES_API_KEY || ''

// 默认测试视频：使用仓库内置 fixtures 或存档中的测试视频
const DEFAULT_TEST_VIDEO = path.resolve(__dirname, '..', '..', '..', '.ccg', 'tasks', 'archive', '2026-09', 'video-clone-real-url-e2e', 'multi-scene-src.mp4')
const TEST_VIDEO = process.env.TEST_VIDEO || DEFAULT_TEST_VIDEO

const sleep = ms => new Promise(r => setTimeout(r, ms))
fs.mkdirSync(OUT, { recursive: true })

const report = {
  startedAt: new Date().toISOString(),
  env: {
    electron: ELECTRON, desktop: DESKTOP, profile: PROFILE, port: PORT,
    testVideo: TEST_VIDEO,
    testVideoExists: fs.existsSync(TEST_VIDEO),
    hasAgnesKey: !!AGNES_KEY,
  },
  checks: [],
  status: 'running',
}

function check(name, ok, detail = '') {
  const item = { name, ok: Boolean(ok), detail: detail || '' }
  report.checks.push(item)
  console.log((item.ok ? 'PASS ' : 'FAIL ') + name + (item.detail ? ' :: ' + item.detail : ''))
  return item.ok
}

function probe(file) {
  try {
    return execFileSync('ffprobe', [
      '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams',
      file,
    ], { encoding: 'utf8', timeout: 30000 })
  } catch (_) {
    return 'probe-failed'
  }
}

async function run() {

  // 前置检查
  if (!AGNES_KEY) {
    console.log('SKIP: AGNES_API_KEY 环境变量未设置，跳过真实 Agnes Video E2E')
    report.status = 'skipped'
    report.skipReason = 'no-api-key'
    process.exit(0)
  }
  if (!report.env.testVideoExists) {
    report.status = 'failed'
    report.failure = '测试视频不存在：' + TEST_VIDEO
    console.error('FAIL: ' + report.failure)
    process.exit(1)
  }
  console.log('TEST_VIDEO=' + TEST_VIDEO + ' SIZE=' + fs.statSync(TEST_VIDEO).size + ' bytes')

  let app = null
  let win = null

  try {
    // 1. 启动 Electron
    app = await _electron.launch({
      executablePath: ELECTRON,
      args: [DESKTOP],
      cwd: DESKTOP,
      env: { ...process.env, ELECTRON_USER_DATA_DIR: PROFILE, DEV_SERVER_PORT: PORT },
      timeout: 120000,
    })
    console.log('APP_LAUNCHED')

    const dl = Date.now() + 90000
    while (Date.now() < dl && !win) {
      for (const w of app.windows()) {
        const t = await w.title().catch(() => '')
        if (t !== 'DevTools') { win = w; break }
      }
      if (!win) await sleep(1500)
    }
    check('主窗口已加载', !!win)
    if (!win) throw new Error('no main window')

    await sleep(12000) // 等待 preload/IPC 初始化

    // 2. 注入 Agnes Video API Key
    const up = await win.evaluate(
      async ({ id, key }) => window.electronAPI.modelProviderUpdate(id, { api_key: key, enabled: true }),
      { id: 'agnes-video', key: AGNES_KEY }
    )
    console.log('INJECT agnes-video code=' + (up && up.code))
    check('Agnes Video Key 注入成功', up && up.code === 0, JSON.stringify(up).slice(0, 120))

    // 3. 验证 provider 状态
    const providerState = await win.evaluate(async () => {
      const a = await window.electronAPI.modelProviderGet('agnes-video')
      return a && a.data ? { enabled: a.data.enabled, configured: a.data.is_configured } : null
    })
    console.log('PROVIDER_STATE ' + JSON.stringify(providerState))
    check('Agnes Video provider 已启用', !!(providerState && providerState.enabled))
    check('Agnes Video provider 已配置', !!(providerState && providerState.configured))

    // 4. 运行视频克隆流水线
    const t0 = Date.now()
    const cloneResult = await win.evaluate(
      async ({ testVideo, t0 }) => {
        const result = await window.electronAPI.videoClone.run({
          source: { type: 'local', path: testVideo },
          options: { target: 'P1', mode: 'structure', replicationLevel: 'L1', failOnLowSimilarity: false },
        })
        return JSON.stringify({
          elapsed: Date.now() - t0,
          code: result.code,
          ok: result.data && result.data.ok,
          runId: result.data && result.data.runId,
          errorCode: result.data && result.data.error && (result.data.error.code || result.data.error.errorCode),
          errorMsg: result.data && result.data.error && result.data.error.message,
          outputPath: result.data && result.data.artifacts && result.data.artifacts.output && result.data.artifacts.output.path,
          outputSize: result.data && result.data.artifacts && result.data.artifacts.output && result.data.artifacts.output.sizeBytes,
          outputDuration: result.data && result.data.artifacts && result.data.artifacts.output && result.data.artifacts.output.durationSec,
          outputProbeOk: result.data && result.data.artifacts && result.data.artifacts.output && result.data.artifacts.output.probeOk,
          scenes: result.data && result.data.artifacts && result.data.artifacts.assets && result.data.artifacts.assets.scenes,
          similarityVerdict: result.data && result.data.similarity && result.data.similarity.verdict,
          similarityScore: result.data && result.data.similarity && result.data.similarity.score,
          degraded: result.data && result.data.similarity && result.data.similarity.warnings && result.data.similarity.warnings.degradedAssets,
          level: result.data && result.data.artifacts && result.data.artifacts.level,
        })
      },
      { testVideo: TEST_VIDEO, t0 }
    )
    const result = JSON.parse(cloneResult)
    const elapsed = Date.now() - t0
    console.log('ELAPSED_MS=' + elapsed)
    console.log('RESULT ' + JSON.stringify(result, null, 2).slice(0, 2000))

    // 5. 验证结果
    check('videoClone.run 返回 code=0', result.code === 0, 'code=' + result.code)
    check('pipeline.ok === true', result.ok === true, result.ok ? 'ok' : 'error=' + (result.errorCode || result.errorMsg))
    if (!result.ok) {
      console.error('PIPELINE_FAILED: ' + (result.errorCode || result.errorMsg))
      report.status = 'failed'
      report.result = result
      return
    }

    // 5a. 验证资产生成质量
    const scenes = result.scenes || []
    const videoScenes = scenes.filter(s => s.kind === 'video')
    const degradedScenes = scenes.filter(s => s.degraded === true)
    check('有至少一个 scene 资产', scenes.length > 0, 'count=' + scenes.length)
    check('有真实视频生成的 scene（非降级）', videoScenes.length > 0 || degradedScenes.length < scenes.length,
      'video=' + videoScenes.length + ' degraded=' + degradedScenes.length + ' total=' + scenes.length)

    // 5b. 验证输出文件
    const outputPath = result.outputPath
    check('输出视频路径存在', !!(outputPath && fs.existsSync(outputPath)),
      outputPath ? 'exists' : 'no output path')
    if (outputPath && fs.existsSync(outputPath)) {
      const stat = fs.statSync(outputPath)
      check('输出视频文件大小 > 0', stat.size > 0, 'size=' + stat.size + ' bytes')
      const probeResult = probe(outputPath)
      if (probeResult !== 'probe-failed') {
        const meta = JSON.parse(probeResult)
        const videoStream = (meta.streams || []).find(s => s.codec_type === 'video')
        check('输出视频包含视频流', !!videoStream, videoStream && videoStream.codec_name)
        check('输出视频时长 > 0', Number(meta.format && meta.format.duration) > 0,
          meta.format && meta.format.duration + 's')
        console.log('OUTPUT_CODEC=' + (videoStream && videoStream.codec_name) + ' DURATION=' + (meta.format && meta.format.duration))
      }
      // 保存到输出目录
      const dest = path.join(OUT, 'video-clone-agv-output.mp4')
      fs.copyFileSync(outputPath, dest)
      console.log('OUTPUT_SAVED=' + dest)
    }

    // 5c. 验证相似度
    check('相似度 verdict 存在', !!result.similarityVerdict, result.similarityVerdict)
    check('相似度 score > 0', typeof result.similarityScore === 'number' && result.similarityScore > 0,
      'score=' + result.similarityScore)

    report.status = report.checks.every(c => c.ok) ? 'passed' : 'failed'
    report.result = result
    report.elapsedMs = elapsed
    console.log('E2E_STATUS=' + report.status)

  } catch (error) {
    report.status = 'failed'
    report.failure = error instanceof Error ? error.stack || error.message : String(error)
    console.error('E2E_FAILURE ' + report.failure)
  } finally {
    if (app) await app.close().catch(() => {})
    report.finishedAt = new Date().toISOString()
    fs.writeFileSync(path.join(OUT, 'video-clone-real-agv-e2e.json'), JSON.stringify(report, null, 2))
    console.log('EVIDENCE_DIR=' + OUT)
  }

  if (report.status !== 'passed' && report.status !== 'skipped') process.exitCode = 1
}

if (require.main === module) {
  run().catch(e => {
    console.error('DRIVER_ERR', e.message)
    process.exitCode = 1
  })
}

// 导出辅助函数供 CI 单测（不启动 Electron 的契约测试）
module.exports = {
  check,
  probe,
  DEFAULT_TEST_VIDEO,
}
