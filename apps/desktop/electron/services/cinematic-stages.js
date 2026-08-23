// @ts-check
/**
 * cinematic-stages - cinematic（电影感短片）流水线的自定义阶段执行器
 *
 * 全部使用本地 FFmpeg/ffprobe 完成，不依赖外部模型：
 *   - cinematic_ingest:   输入视频校验 + 参数探测
 *   - cinematic_grade:    调色（eq 对比度/亮度/饱和度）
 *   - cinematic_compose:  淡入淡出 + 目标分辨率缩放/加黑边
 *   - cinematic_render:   最终编码输出 mp4
 *
 * 注册方式：container.setup.js 中调用 registerCinematicStages(pipelineEngine)
 */

'use strict'

const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { findFfmpeg, findFfprobe } = require('./media-tool-paths')
const { getAllowedMediaRoots, resolveReadableMediaFile } = require('./story2video-paths')
const { emitStageStart, emitStageComplete } = require('./stage-progress')

const CINEMATIC_STAGE_TYPES = {
  INGEST: 'cinematic_ingest',
  GRADE: 'cinematic_grade',
  COMPOSE: 'cinematic_compose',
  RENDER: 'cinematic_render',
}

const DEFAULT_RESOLUTION = '1920x1080'

function runTool (binary, args) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).slice(0, 1200)))
      else resolve(String(stdout) + '\n' + String(stderr))
    })
  })
}

function getRunDir (runId) {
  return path.join(os.tmpdir(), 'story2video', 'cinematic', String(runId || 'run'))
}

function parseProbe (output) {
  const durationMatch = String(output).match(/duration=([0-9.]+)/i)
  const widthMatch = String(output).match(/width=(\d+)/i)
  const heightMatch = String(output).match(/height=(\d+)/i)
  const fpsMatch = String(output).match(/avg_frame_rate=([0-9.]+)/i)
  return {
    duration: durationMatch ? Number(durationMatch[1]) : null,
    width: widthMatch ? Number(widthMatch[1]) : null,
    height: heightMatch ? Number(heightMatch[1]) : null,
    fps: fpsMatch ? Number(fpsMatch[1]) : null,
  }
}

async function probeVideo (inputPath) {
  const ffprobe = findFfprobe()
  if (!ffprobe) throw new Error('ffprobe 不可用，无法探测视频')
  const output = await runTool(ffprobe, [
    '-v', 'error', '-show_entries', 'format=duration', '-show_entries', 'stream=width,height,avg_frame_rate',
    '-of', 'default=nw=1', inputPath,
  ])
  const meta = parseProbe(output)
  if (!Number.isFinite(meta.duration) || meta.duration <= 0) {
    throw new Error('无法读取视频时长：' + inputPath)
  }
  return meta
}

/**
 * 注册 cinematic 流水线的自定义阶段执行器
 * @param {object} pipelineEngine - PipelineEngine 实例
 * @returns {{success: boolean, error?: string, registered?: string[]}}
 */
function registerCinematicStages (pipelineEngine) {
  if (!pipelineEngine || !pipelineEngine.stageExecutor) {
    return { success: false, error: 'PipelineEngine.stageExecutor not configured (ServiceBus missing)' }
  }

  const registered = []

  pipelineEngine.registerStageExecutor(
    CINEMATIC_STAGE_TYPES.INGEST,
    async ({ params, onProgress }) => {
      const rawVideo = params && (params.video || params.videoPath)
      const inputPath = resolveReadableMediaFile(rawVideo, {
        kind: 'video',
        allowedRoots: getAllowedMediaRoots(),
      })
      if (!inputPath) {
        return { success: false, error: 'cinematic ingest 需要可读的本地视频（params.video）' }
      }
      try {
        emitStageStart(onProgress, { messageKey: 'stageProgress.cinematicIngest' })
        const meta = await probeVideo(inputPath)
        emitStageComplete(onProgress, {
          messageKey: 'stageProgress.cinematicIngestComplete',
          summaryKey: 'stageProgress.cinematicIngestSummary',
          detail: { done: 1, total: 1, kind: 'video' },
        })
        return { success: true, output: { inputPath, ...meta } }
      } catch (error) {
        return { success: false, error: 'cinematic ingest 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(CINEMATIC_STAGE_TYPES.INGEST)

  pipelineEngine.registerStageExecutor(
    CINEMATIC_STAGE_TYPES.GRADE,
    async ({ runId, context, onProgress }) => {
      const ingest = context.ingest
      if (!ingest || typeof ingest.inputPath !== 'string') {
        return { success: false, error: 'cinematic grade 需要 context.ingest' }
      }
      const ffmpeg = findFfmpeg()
      if (!ffmpeg) return { success: false, error: 'FFmpeg 不可用，无法调色' }
      const runDir = getRunDir(runId)
      fs.mkdirSync(runDir, { recursive: true })
      const gradedPath = path.join(runDir, 'graded.mp4')
      try {
        emitStageStart(onProgress, { messageKey: 'stageProgress.cinematicGrade' })
        await runTool(ffmpeg, [
          '-y', '-i', ingest.inputPath,
          '-vf', 'eq=contrast=1.1:brightness=0.02:saturation=1.2',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
          '-c:a', 'aac',
          gradedPath,
        ])
        emitStageComplete(onProgress, {
          messageKey: 'stageProgress.cinematicGradeComplete',
          summaryKey: 'stageProgress.cinematicGradeSummary',
          detail: { done: 1, total: 1, kind: 'video' },
        })
        return { success: true, output: { gradedPath, duration: ingest.duration } }
      } catch (error) {
        return { success: false, error: 'cinematic grade 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(CINEMATIC_STAGE_TYPES.GRADE)

  pipelineEngine.registerStageExecutor(
    CINEMATIC_STAGE_TYPES.COMPOSE,
    async ({ runId, stage, context, onProgress }) => {
      const grade = context.grade
      if (!grade || typeof grade.gradedPath !== 'string') {
        return { success: false, error: 'cinematic compose 需要 context.grade' }
      }
      const ffmpeg = findFfmpeg()
      if (!ffmpeg) return { success: false, error: 'FFmpeg 不可用，无法合成' }
      const resolution = stage.options?.resolution || DEFAULT_RESOLUTION
      const runDir = getRunDir(runId)
      const composedPath = path.join(runDir, 'composed.mp4')
      const duration = Number(grade.duration) || 6
      const fadeIn = Math.min(1, duration / 4)
      const fadeOut = Math.min(1, duration / 4)
      const fadeOutStart = Math.max(0, duration - fadeOut)
      try {
        emitStageStart(onProgress, { messageKey: 'stageProgress.cinematicCompose' })
        // 注意：捆绑 FFmpeg 用 x 语法（1920x1080）组合 pad 会解析失败，
        // 必须用冒号语法（1920:1080）且 pad 偏移用字面量 0。
        const dims = String(resolution).replace('x', ':')
        await runTool(ffmpeg, [
          '-y', '-i', grade.gradedPath,
          '-vf',
          'fade=t=in:st=0:d=' + fadeIn + ',fade=t=out:st=' + fadeOutStart + ':d=' + fadeOut +
          ',scale=' + dims + ':force_original_aspect_ratio=decrease,pad=' + dims + ':0:0',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
          '-c:a', 'aac',
          composedPath,
        ])
        emitStageComplete(onProgress, {
          messageKey: 'stageProgress.cinematicComposeComplete',
          summaryKey: 'stageProgress.cinematicComposeSummary',
          detail: { done: 1, total: 1, kind: 'video' },
        })
        return { success: true, output: { composedPath, duration, resolution } }
      } catch (error) {
        return { success: false, error: 'cinematic compose 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(CINEMATIC_STAGE_TYPES.COMPOSE)

  pipelineEngine.registerStageExecutor(
    CINEMATIC_STAGE_TYPES.RENDER,
    async ({ runId, context, onProgress }) => {
      const compose = context.compose
      if (!compose || typeof compose.composedPath !== 'string' || !fs.existsSync(compose.composedPath)) {
        return { success: false, error: 'cinematic render 需要有效的合成产物' }
      }
      const runDir = getRunDir(runId)
      fs.mkdirSync(runDir, { recursive: true })
      const outputPath = path.join(runDir, 'cinematic_output.mp4')
      try {
        emitStageStart(onProgress, { messageKey: 'stageProgress.cinematicRender' })
        // 已编码；直接复制避免二次压缩
        fs.copyFileSync(compose.composedPath, outputPath)
        if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
          throw new Error('渲染产物为空')
        }
        emitStageComplete(onProgress, {
          messageKey: 'stageProgress.cinematicRenderComplete',
          summaryKey: 'stageProgress.cinematicRenderSummary',
          detail: { done: 1, total: 1, kind: 'video' },
        })
        return {
          success: true,
          output: {
            videoPath: outputPath,
            resolution: compose.resolution || DEFAULT_RESOLUTION,
            segments: [{
              index: 0,
              text: '电影感短片',
              videoPath: outputPath,
              duration: compose.duration || null,
            }],
          },
        }
      } catch (error) {
        return { success: false, error: 'cinematic render 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(CINEMATIC_STAGE_TYPES.RENDER)

  return { success: true, registered }
}

module.exports = {
  CINEMATIC_STAGE_TYPES,
  parseProbe,
  registerCinematicStages,
}
