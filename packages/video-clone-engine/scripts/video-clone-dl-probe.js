#!/usr/bin/env node
/**
 * 视频克隆下载探针（可复用，真实网络）
 * 用法：node scripts/video-clone-dl-probe.js <video-url> [--max-duration 1800] [--out <dir>]
 * 流程：createUrlIngest（yt-dlp 下载）→ createFfprobeAnalyze（元数据/时长上限/场景检测）→ 输出摘要
 * 退出码：0=成功；1=业务失败（打印错误码）；2=用法错误
 */
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { createUrlIngest } = require('../src/adapters/ingest-url')
const { createFfprobeAnalyze } = require('../src/adapters/analyze-ffprobe')
const { emptyReport } = require('../src/clone-report')

function parseArgs(argv) {
  const args = argv.slice(2)
  const url = args.find((a) => !a.startsWith('--'))
  const maxIdx = args.indexOf('--max-duration')
  const outIdx = args.indexOf('--out')
  return {
    url,
    maxDurationSec: maxIdx >= 0 ? Number(args[maxIdx + 1]) : 1800,
    outDir: outIdx >= 0 ? args[outIdx + 1] : null,
  }
}

async function main() {
  const { url, maxDurationSec, outDir } = parseArgs(process.argv)
  if (!url || !/^https:\/\//i.test(url)) {
    console.error('用法: node scripts/video-clone-dl-probe.js <https-url> [--max-duration 1800] [--out <dir>]')
    process.exit(2)
  }
  const tmp = fs.mkdtempSync(path.join(outDir || os.tmpdir(), 'vc-probe-'))
  const ctx = { request: { source: { url } }, report: emptyReport(), artifacts: {} }
  const t0 = Date.now()
  try {
    await createUrlIngest({ tmpDir: outDir || os.tmpdir() }).run(ctx)
    const m = ctx.artifacts.media
    console.log('INGEST_OK platform=' + m.platform + ' sizeMB=' + (m.sizeBytes / 1048576).toFixed(2) + ' ext=' + m.ext)
    await createFfprobeAnalyze({ maxDurationSec, sceneThreshold: 0.3 }).run(ctx)
    const sc = ctx.artifacts.analysis.scene || {}
    console.log('ANALYZE_OK duration=' + ctx.report.meta.durationSec + 's shots=' + ctx.report.visual.shots.length + ' aspect=' + ctx.report.platformParams.aspect + ' sceneMethod=' + sc.method)
    console.log('ELAPSED_MS=' + (Date.now() - t0))
    console.log('MEDIA=' + m.path)
    process.exit(0)
  } catch (e) {
    console.log('ERROR code=' + (e.code || e.message) + ' phase=' + (e.phase || '') + ' retryable=' + e.retryable)
    process.exit(1)
  } finally {
    // 保留 MEDIA 文件以便复测；仅清理空壳（下载文件留在 outDir）
    try { fs.rmdirSync(tmp) } catch { /* 非空则保留 */ }
  }
}

main()
