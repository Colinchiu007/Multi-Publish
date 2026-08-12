#!/usr/bin/env node
/**
 * 视频克隆分析 CLI（一条命令出报告）
 * 用法：
 *   node scripts/video-clone-analyze.js <https-url|本地视频路径> [--out <dir>] [--max-duration 1800]
 *   npm run analyze -- <url> [--out ./video-clone-output]
 * 产物（outDir 默认 ./video-clone-output）：
 *   report.json   CloneReport（7 层，可编辑/可复用）
 *   summary.txt   人类可读摘要
 *   <media>       下载的源视频（URL 输入；本地文件不复制）
 * 退出码：0=成功，1=业务失败（打印错误码），2=用法错误
 */
const path = require('node:path')
const fs = require('node:fs')
const { createUrlIngest } = require('../src/adapters/ingest-url')
const { createLocalFileIngest } = require('../src/adapters/ingest-local')
const { createFfprobeAnalyze } = require('../src/adapters/analyze-ffprobe')
const { emptyReport, validateCloneReport } = require('../src/clone-report')

function parseArgs(argv) {
  const args = argv.slice(2)
  const input = args.find((a) => !a.startsWith('--'))
  const outIdx = args.indexOf('--out')
  const maxIdx = args.indexOf('--max-duration')
  return {
    input,
    outDir: outIdx >= 0 ? path.resolve(args[outIdx + 1] || '') : path.resolve(process.cwd(), 'video-clone-output'),
    maxDurationSec: maxIdx >= 0 ? Number(args[maxIdx + 1]) : 1800,
  }
}

async function main() {
  const { input, outDir, maxDurationSec } = parseArgs(process.argv)
  if (!input) {
    console.error('用法: node scripts/video-clone-analyze.js <https-url|本地视频路径> [--out <dir>] [--max-duration 1800]')
    process.exit(2)
  }
  const isUrl = /^https:\/\//i.test(input)
  if (!isUrl && !fs.existsSync(input)) {
    console.error('ERROR: 本地文件不存在: ' + input)
    process.exit(2)
  }
  fs.mkdirSync(outDir, { recursive: true })

  const ctx = { request: { source: isUrl ? { type: 'url', url: input } : { type: 'local', path: input } }, report: emptyReport(), artifacts: {} }
  const t0 = Date.now()
  try {
    if (isUrl) await createUrlIngest({ tmpDir: outDir }).run(ctx)
    else await createLocalFileIngest().run(ctx)
    await createFfprobeAnalyze({ maxDurationSec, sceneThreshold: 0.3 }).run(ctx)

    const r = ctx.report
    const media = ctx.artifacts.media
    const reportPath = path.join(outDir, 'report.json')
    const summaryPath = path.join(outDir, 'summary.txt')
    fs.writeFileSync(reportPath, JSON.stringify(r, null, 2))
    const v = validateCloneReport(r)
    const lines = [
      '源: ' + input,
      '媒体: ' + media.path + (media.sizeBytes ? ' (' + (media.sizeBytes / 1048576).toFixed(2) + 'MB)' : ''),
      '时长: ' + r.meta.durationSec + 's | 分辨率: ' + (r.meta.resolution || '未知') + ' | 画幅: ' + r.platformParams.aspect,
      '镜头数: ' + r.visual.shots.length + ' | 场景方法: ' + ((ctx.artifacts.analysis.scene || {}).method || 'n/a'),
      '报告校验: ' + (v.ok ? 'OK' : 'FAIL ' + v.errors.join(';')),
      '文案(ASR): ' + (r.script.fullText ? '已转写 ' + r.script.lines.length + ' 句' : '未转写（未注入 sttRunner，可后续编辑报告补充）'),
      '耗时: ' + (Date.now() - t0) + 'ms',
      '',
      '产物:',
      '  报告: ' + reportPath,
      '  摘要: ' + summaryPath,
    ]
    fs.writeFileSync(summaryPath, lines.join('\n') + '\n')
    console.log(lines.join('\n'))
    process.exit(v.ok ? 0 : 1)
  } catch (e) {
    console.log('ERROR code=' + (e.code || e.message) + ' phase=' + (e.phase || '') + ' retryable=' + e.retryable)
    process.exit(1)
  }
}

main()
