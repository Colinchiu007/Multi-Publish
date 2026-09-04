'use strict'
/**
 * 视频克隆真实环境 E2E（URL 来源 → 本地源 → 动态源画面复用克隆）
 *
 * 背景：离线 E2E 默认 assetGenerator 生成静态占位图，compose 按图片循环合成 → 成品静态。
 * 本脚本改为「源画面复用」：
 *   1) yt-dlp 下载 URL 到 live-source.mp4
 *   2) assetGenerator 用 ffmpeg 按 plan 镜头 t0/duration 从源视频裁剪真实动态片段
 *   3) compose 用自定义 ffmpeg concat 把动态片段拼成 clone.mp4（不经过引擎图片循环逻辑）
 * 成品画面来自源视频，结构/时长按克隆 plan，动态正常。
 *
 * 用法：node e2e-live-clone.js [videoUrl|localPath] [L0|L1|L2]
 */
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const ROOT = path.resolve(__dirname, '..', '..', '..')
const engine = require(path.join(ROOT, 'apps', 'desktop', 'node_modules', '@multi-publish', 'video-clone-engine'))
const { resolveBinary, runCommand } = engine
const {
  createLocalFileIngest,
  createFfprobeAnalyze,
  createScriptPlan,
  createGenerateAssets,
  createPublish,
  createVideoClonePipeline,
} = engine

const TASK_DIR = __dirname
const ARG = process.argv[2] || 'https://download.samplelib.com/mp4/sample-30s.mp4'
const LEVEL = process.argv[3] || undefined
const IS_URL = /^https:\/\//.test(ARG)
const SOURCE_LOCAL = path.join(TASK_DIR, 'live-source.mp4')
const OUT_DIR = path.join(TASK_DIR, 'run-output-live-' + Date.now().toString(36))
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(path.join(OUT_DIR, 'assets'), { recursive: true })

async function downloadSource() {
  if (!IS_URL) return path.resolve(ARG)
  const bin = resolveBinary('VC_YTDLP_PATH', 'YTDLP_PATH', 'yt-dlp')
  console.log('DOWNLOAD_SOURCE=' + ARG)
  await runCommand(bin, ['--no-playlist', '-f', 'mp4', '-o', SOURCE_LOCAL, ARG], { timeoutMs: 10 * 60 * 1000 })
  if (!fs.existsSync(SOURCE_LOCAL)) throw new Error('源视频下载失败：' + SOURCE_LOCAL)
  console.log('SOURCE_LOCAL=' + SOURCE_LOCAL)
  return SOURCE_LOCAL
}

/** 从源视频按镜头裁剪动态片段（真实画面复用） */
function createSourceClipAssetGenerator(srcPath) {
  return async (spec, report) => {
    const out = path.join(OUT_DIR, 'assets', 'shot_' + spec.index + '.mp4')
    const t0 = Number(spec.t0) || 0
    const dur = Math.max(0.5, Number(spec.durationSec) || 1)
    const ffmpeg = resolveBinary('VC_FFMPEG_PATH', 'FFMPEG_PATH', 'ffmpeg')
    await runCommand(ffmpeg, [
      '-y', '-ss', String(t0), '-t', String(dur), '-i', srcPath,
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out,
    ], { timeoutMs: 120000 })
    return { path: out, kind: 'video', source: srcPath, degraded: false }
  }
}

/** 自定义 compose：直接 concat 动态片段（不经过引擎图片循环逻辑） */
function createLiveCompose({ outputDir = null, fps = 24 } = {}) {
  return {
    id: 'compose',
    async run(ctx) {
      const assets = ctx.artifacts.assets || {}
      const scenes = assets.scenes || []
      if (!scenes.length) throw new Error('no scenes for compose')
      const dir = outputDir || os.tmpdir()
      const outputPath = path.join(dir, 'clone.mp4')
      const listFile = path.join(dir, 'concat.txt')
      const lines = scenes.map((s) => "file '" + String(s.path).replace(/'/g, "'\\''") + "'")
      fs.writeFileSync(listFile, lines.join('\n'))
      const ffmpeg = resolveBinary('VC_FFMPEG_PATH', 'FFMPEG_PATH', 'ffmpeg')
      await runCommand(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', outputPath], { timeoutMs: 600000 })

      let meta = null
      let probeOk = false
      try {
        const ffprobe = resolveBinary('VC_FFPROBE_PATH', 'FFPROBE_PATH', 'ffprobe')
        const r = await runCommand(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', outputPath])
        meta = JSON.parse(r.stdout)
        probeOk = true
      } catch { /* 回退 */ }
      const v = meta && meta.streams ? (meta.streams.find((s) => s.codec_type === 'video') || {}) : {}
      const dur = meta && meta.format && Number(meta.format.duration) > 0
        ? Number(meta.format.duration)
        : scenes.reduce((a, s) => a + (Number(s.durationSec) || 0), 0)
      ctx.artifacts.output = {
        path: outputPath,
        durationSec: dur,
        width: v.width || null,
        height: v.height || null,
        fps: v.avg_frame_rate ? Number(String(v.avg_frame_rate).split('/')[0]) / Number(String(v.avg_frame_rate).split('/')[1]) || null : null,
        sizeBytes: fs.existsSync(outputPath) ? fs.statSync(outputPath).size : null,
        probeOk,
        shots: [{ t0: 0, t1: dur }],
        sceneMethod: 'live-concat',
      }
      return 'compose'
    },
  }
}

async function main() {
  const srcPath = await downloadSource()
  const source = { type: 'local', path: srcPath }
  const events = []
  const adapters = {
    ingest: createLocalFileIngest(),
    analyze: createFfprobeAnalyze(),
    plan: createScriptPlan(),
    generate: createGenerateAssets({ assetGenerator: createSourceClipAssetGenerator(srcPath) }),
    compose: createLiveCompose({ outputDir: OUT_DIR, fps: 24 }),
    publish: createPublish(),
  }
  const pipeline = createVideoClonePipeline(adapters, {
    eventSink: (e) => { events.push(e); console.log('[stage]', JSON.stringify(e)) },
  })

  console.log('SOURCE=' + JSON.stringify(source) + ' LEVEL=' + (LEVEL || 'auto'))
  const t0 = Date.now()
  const result = await pipeline.run({
    source,
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
    fs.writeFileSync(path.join(TASK_DIR, 'evidence-live.json'), JSON.stringify({ url: ARG, elapsedMs, events, result, checks }, null, 2))
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
    const r = await runCommand(probeBin, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', out.path])
    const meta = JSON.parse(r.stdout)
    const v = (meta.streams || []).find((s) => s.codec_type === 'video')
    assert('clone.mp4 has video stream', !!v, v && v.codec_name)
    assert('clone.mp4 playable duration > 0', Number(meta.format && meta.format.duration) > 0, meta.format && meta.format.duration)
    console.log('CLONE_FILE=' + out.path)
    console.log('CLONE_CODEC=' + (v && v.codec_name) + ' DURATION=' + (meta.format && meta.format.duration))
  }

  const srcDur = Number(rep.meta && rep.meta.durationSec) || 0
  const outDur = out && out.durationSec
  assert('duration within tolerance (<2s)', typeof outDur === 'number' && Math.abs(outDur - srcDur) < 2, { source: srcDur, clone: outDur })

  const evidence = { url: ARG, source, level: LEVEL || 'auto', elapsedMs, events, checks, runId: result.runId, report: rep, similarity: result.similarity, artifacts: result.artifacts, publishResult: result.publishResult }
  fs.writeFileSync(path.join(TASK_DIR, 'evidence-live.json'), JSON.stringify(evidence, null, 2))
  console.log('EVIDENCE=' + path.join(TASK_DIR, 'evidence-live.json'))
  const failed = checks.filter((c) => !c.pass)
  console.log(failed.length === 0 ? 'E2E_LIVE_ALL_PASS' : 'E2E_LIVE_FAILED_COUNT=' + failed.length)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((e) => { console.error('E2E_LIVE_CRASH', e && e.stack || e); process.exit(1) })
