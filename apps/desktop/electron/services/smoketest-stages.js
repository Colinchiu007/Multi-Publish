// @ts-check
/**
 * smoketest-stages - framework-smoke（框架冒烟测试）流水线的自定义阶段执行器
 *
 * 纯本地，验证视频创作基础设施并生成测试视频：
 *   - smoketest_verify:   检查 FFmpeg/ffprobe 与流水线注册表
 *   - smoketest_report:   输出环境报告 + 生成 testsrc 冒烟测试视频
 *
 * 注册方式：container.setup.js 中调用 registerSmokeTestStages(pipelineEngine)
 */

'use strict'

const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { findFfmpeg, findFfprobe } = require('./media-tool-paths')
const { emitStageStart, emitStageComplete } = require('./stage-progress')

const SMOKETEST_STAGE_TYPES = {
  VERIFY: 'smoketest_verify',
  REPORT: 'smoketest_report',
}

function runTool (binary, args) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).slice(0, 800)))
      else resolve(String(stdout) + '\n' + String(stderr))
    })
  })
}

function getRunDir (runId) {
  return path.join(os.tmpdir(), 'story2video', 'smoketest', String(runId || 'run'))
}

function toolVersion (binary, name) {
  if (!binary) return null
  try {
    const out = String(require('child_process').execFileSync(binary, ['-version'], { encoding: 'utf8' }))
    const line = out.split('\n')[0] || ''
    return line.slice(0, 80)
  } catch {
    return null
  }
}

/**
 * 注册 framework-smoke 流水线的自定义阶段执行器
 * @param {object} pipelineEngine - PipelineEngine 实例
 * @returns {{success: boolean, error?: string, registered?: string[]}}
 */
function registerSmokeTestStages (pipelineEngine) {
  if (!pipelineEngine || !pipelineEngine.stageExecutor) {
    return { success: false, error: 'PipelineEngine.stageExecutor not configured (ServiceBus missing)' }
  }

  const registered = []

  pipelineEngine.registerStageExecutor(
    SMOKETEST_STAGE_TYPES.VERIFY,
    async ({ onProgress }) => {
      emitStageStart(onProgress, { messageKey: 'stageProgress.smoketestVerify' })
      const ffmpeg = findFfmpeg()
      const ffprobe = findFfprobe()
      const pipelines = typeof pipelineEngine.listPipelines === 'function'
        ? pipelineEngine.listPipelines()
        : []
      emitStageComplete(onProgress, {
        messageKey: 'stageProgress.smoketestVerifyComplete',
        summaryKey: 'stageProgress.smoketestVerifySummary',
        detail: { done: 1, total: 1, kind: 'resource' },
      })
      return {
        success: true,
        output: {
          tools: {
            ffmpeg: Boolean(ffmpeg),
            ffmpegPath: ffmpeg || null,
            ffprobe: Boolean(ffprobe),
            ffmpegVersion: toolVersion(ffmpeg, 'ffmpeg'),
          },
          pipelineCount: pipelines.length,
          pipelines: pipelines.map(p => p.name),
          stageExecutor: Boolean(pipelineEngine.stageExecutor),
        },
      }
    },
  )
  registered.push(SMOKETEST_STAGE_TYPES.VERIFY)

  pipelineEngine.registerStageExecutor(
    SMOKETEST_STAGE_TYPES.REPORT,
    async ({ runId, stage, context, onProgress }) => {
      const verify = context.verify
      if (!verify || typeof verify !== 'object') {
        return { success: false, error: 'framework-smoke report 需要 context.verify' }
      }
      const ffmpeg = findFfmpeg()
      if (!ffmpeg) return { success: false, error: 'FFmpeg 不可用，无法生成冒烟测试视频' }
      const runDir = getRunDir(runId)
      fs.mkdirSync(runDir, { recursive: true })
      const outputPath = path.join(runDir, 'smoketest_output.mp4')
      try {
        emitStageStart(onProgress, { messageKey: 'stageProgress.smoketestReport' })
        await runTool(ffmpeg, [
          '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=24',
          '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
          '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-shortest',
          outputPath,
        ])
      } catch (error) {
        return { success: false, error: 'framework-smoke 测试视频生成失败：' + (error && error.message ? error.message : String(error)) }
      }
      const reportLines = [
        '# Framework Smoke Report',
        '',
        '- ffmpeg: ' + (verify.tools?.ffmpegPath || 'missing'),
        '- ffmpeg version: ' + (verify.tools?.ffmpegVersion || 'n/a'),
        '- ffprobe: ' + (verify.tools?.ffprobe ? 'ok' : 'missing'),
        '- stageExecutor: ' + (verify.stageExecutor ? 'ok' : 'missing'),
        '- pipelineCount: ' + verify.pipelineCount,
        '- pipelines: ' + (Array.isArray(verify.pipelines) ? verify.pipelines.join(', ') : ''),
        '',
      ].join('\n')
      const reportPath = path.join(runDir, 'report.md')
      fs.writeFileSync(reportPath, reportLines, 'utf8')
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
        return { success: false, error: 'framework-smoke 测试视频为空' }
      }
      emitStageComplete(onProgress, {
        messageKey: 'stageProgress.smoketestReportComplete',
        summaryKey: 'stageProgress.smoketestReportSummary',
        detail: { done: 1, total: 1, kind: 'video' },
      })
      return {
        success: true,
        output: {
          videoPath: outputPath,
          reportPath,
          segments: [{
            index: 0,
            text: '框架冒烟测试视频',
            videoPath: outputPath,
            duration: 2,
          }],
        },
      }
    },
  )
  registered.push(SMOKETEST_STAGE_TYPES.REPORT)

  return { success: true, registered }
}

module.exports = {
  SMOKETEST_STAGE_TYPES,
  registerSmokeTestStages,
}
