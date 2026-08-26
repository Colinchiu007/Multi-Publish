'use strict'
/**
 * 视频克隆真实环境 E2E（URL 来源，headless 引擎级）
 * 装配与桌面端生产一致：createSlice3Pipeline + AssetGenerator（离线占位）+ 无发布路由
 * 用法：node e2e-real-clone.js [videoUrl]
 */
const path = require('node:path')
const fs = require('node:fs')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const engine = require(path.join(ROOT, 'apps', 'desktop', 'node_modules', '@multi-publish', 'video-clone-engine'))
const { AssetGenerator } = require(path.join(ROOT, 'apps', 'desktop', 'electron', 'services', 'asset-generator.js'))
const { createVideoCloneAssetGenerator } = require(path.join(ROOT, 'apps', 'desktop', 'electron', 'services', 'video-clone', 'asset-generator.js'))
const { resolveBinary, runCommand } = engine

const ARG = process.argv[2] || 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4'
const LEVEL = process.argv[3] || undefined
const IS_URL = /^https:\/\//.test(ARG)
const SOURCE = IS_URL ? { type: 'url', url: ARG } : { type: 'local', path: path.resolve(ARG) }
const URL = IS_URL ? ARG : null
if (LEVEL && !['L0', 'L1', 'L2'].includes(LEVEL)) throw new Error('非法层级 ' + LEVEL)
const TASK_DIR = __dirname
const OUT_DIR = path.join(TASK_DIR, 'run-output-' + Date.now().toString(36))
fs.mkdirSync(OUT_DIR, { recursive: true })

async function main() {
  const events = []
  const assetGenerator = createVideoCloneAssetGenerator({
    assetGenerator: new AssetGenerator({ outputDir: path.join(OUT_DIR, 'assets'), log: { info() {}, warn() {}, error() {} } }),
  })
  const pipeline = engine.createSlice3Pipeline({
    assetGenerator,
    outputDir: OUT_DIR,
    fps: 24,
    executorOptions: {
      eventSink: (e) => { events.push(e); console.log('[stage]', JSON.stringify(e)) },
    },
  })

  console.log('SOURCE=' + JSON.stringify(SOURCE) + ' LEVEL=' + (LEVEL || 'auto'))
  const t0 = Date.now()
  const result = await pipeline.run({
    source: SOURCE,
    options: Object.assign({ mode: 'structure', target: 'P1', failOnLowSimilarity: false }, LEVEL ? { replicationLevel: LEVEL } : {}),
  })
  const elapsedMs = Date.now() - t0
  console.log('ELAPSED_MS=' + elapsedMs)

  const checks = []
  function assert(name, cond, detail) {
    checks.push({ name, pass: !!cond, detail: detail === undefined ? null : detail })
    console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail !== undefined ? ' | ' + JSON.stringify(detail) : ''))
  }

  assert('pipeline.ok', result.ok === true, result.ok ? null : result.error)
  if (!result.ok) {
    fs.writeFileSync(path.join(TASK_DIR, 'evidence.json'), JSON.stringify({ url: URL, elapsedMs, events, result, checks }, null, 2))
    process.exit(1)
  }

  const rep = result.report
  assert('report.meta.durationSec > 0', Number(rep.meta && rep.meta.durationSec) > 0, rep.meta && rep.meta.durationSec)
  assert('report.visual.shots non-empty', Array.isArray(rep.visual && rep.visual.shots) && rep.visual.shots.length > 0, rep.visual && rep.visual.shots && rep.visual.shots.length)
  assert('report.replication.level valid', ['L0', 'L1', 'L2'].includes(rep.replication && rep.replication.level), rep.replication)
  assert('similarity verdict present', !!(result.similarity && result.similarity.verdict), result.similarity && result.similarity.verdict)
  assert('publish skipped (no router)', result.publishResult && result.publishResult.status === 'skipped', result.publishResult)

  const out = result.artifacts && result.artifacts.output
  assert('output artifact exists', !!(out && out.path && fs.existsSync(out.path)), out)
  if (out && out.path && fs.existsSync(out.path)) {
    const probeBin = resolveBinary('VC_FFPROBE_PATH', 'FFPROBE_PATH', 'ffprobe')
    try {
      const r = await runCommand(probeBin, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', out.path])
      const meta = JSON.parse(r.stdout)
      const v = (meta.streams || []).find((s) => s.codec_type === 'video')
      const a = (meta.streams || []).some((s) => s.codec_type === 'audio')
      assert('clone.mp4 has video stream', !!v, v && v.codec_name)
      assert('clone.mp4 playable duration > 0', Number(meta.format && meta.format.duration) > 0, meta.format && meta.format.duration)
      assert('clone.mp4 sizeBytes matches report', Math.abs((out.sizeBytes || 0) - fs.statSync(out.path).size) < 1024, out.sizeBytes)
      console.log('CLONE_FILE=' + out.path)
      console.log('CLONE_CODEC=' + (v && v.codec_name) + ' AUDIO=' + a + ' DURATION=' + (meta.format && meta.format.duration))
    } catch (e) {
      assert('clone.mp4 ffprobe', false, String(e && e.message))
    }
  }

  const srcDur = Number(rep.meta && rep.meta.durationSec) || 0
  const outDur = out && out.durationSec
  assert('duration within tolerance (<2s)', typeof outDur === 'number' && Math.abs(outDur - srcDur) < 2, { source: srcDur, clone: outDur })

  const evidence = { url: URL, source: SOURCE, level: LEVEL || 'auto', elapsedMs, events, checks, runId: result.runId, report: rep, reportSource: result.reportSource, similarity: result.similarity, artifacts: result.artifacts, publishResult: result.publishResult }
  fs.writeFileSync(path.join(TASK_DIR, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log('EVIDENCE=' + path.join(TASK_DIR, 'evidence.json'))

  const failed = checks.filter((c) => !c.pass)
  console.log(failed.length === 0 ? 'E2E_ALL_PASS' : 'E2E_FAILED_COUNT=' + failed.length)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((e) => { console.error('E2E_CRASH', e && e.stack || e); process.exit(1) })
