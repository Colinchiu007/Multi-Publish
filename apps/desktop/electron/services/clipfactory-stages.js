// @ts-check
/**
 * clipfactory-stages - clip-factory（视频切片工厂）流水线的自定义阶段执行器
 *
 * 全部使用本地 FFmpeg/ffprobe 完成，不依赖外部模型：
 *   - clipfactory_analyze:   场景检测 + 时长分析 → 片段列表
 *   - clipfactory_extract:   逐段剪辑（libx264 + aac）
 *   - clipfactory_caption:   片段元数据校验/透传（预留 LLM 标题增强位）
 *   - clipfactory_export:    concat 合并 → 输出 mp4
 *
 * 注册方式：container.setup.js 中调用 registerClipFactoryStages(pipelineEngine)
 */

'use strict'

const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { findFfmpeg, findFfprobe } = require('./media-tool-paths')
const { getAllowedMediaRoots, resolveReadableMediaFile } = require('./story2video-paths')

const CLIPFACTORY_STAGE_TYPES = {
  ANALYZE: 'clipfactory_analyze',
  EXTRACT: 'clipfactory_extract',
  CAPTION: 'clipfactory_caption',
  EXPORT: 'clipfactory_export',
}

const MAX_SEGMENTS = 8
const MIN_SEGMENT_SECONDS = 2
const MAX_TOTAL_SECONDS = 60
const SCENE_THRESHOLD = 0.3

function runTool (binary, args) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).slice(0, 1200)))
      // ffmpeg 的 metadata=print / 日志走 stderr，成功时也要一并返回供解析
      else resolve(String(stdout) + '\n' + String(stderr))
    })
  })
}

function getRunDir (runId) {
  // 输出到 story2video 临时根（getAllowedMediaRoots 白名单内），保证 saveRun 可复制持久化
  return path.join(os.tmpdir(), 'story2video', 'clipfactory', String(runId || 'run'))
}

function parseSceneTimes (output) {
  const times = []
  for (const line of output.split('\n')) {
    const match = line.match(/pts_time:\s*([0-9.]+)/)
    if (match) {
      const value = Number(match[1])
      if (Number.isFinite(value) && value > 0) times.push(value)
    }
  }
  return times
}

function buildSegments (duration, sceneTimes) {
  const boundaries = [0, ...sceneTimes, duration]
    .filter((value, index, array) => Number.isFinite(value) && (index === 0 || value > array[index - 1]))
    .sort((a, b) => a - b)
  const segments = []
  for (let index = 0; index < boundaries.length - 1 && segments.length < MAX_SEGMENTS; index++) {
    const start = boundaries[index]
    const end = boundaries[index + 1]
    if (end - start < MIN_SEGMENT_SECONDS) continue
    segments.push({
      index: segments.length,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      duration: Number((end - start).toFixed(3)),
      score: 1,
    })
  }
  if (segments.length === 0) {
    segments.push({ index: 0, start: 0, end: Math.min(duration, 10), duration: Math.min(duration, 10), score: 1 })
  }
  let total = 0
  const capped = []
  for (const segment of segments) {
    if (total + segment.duration > MAX_TOTAL_SECONDS) break
    capped.push(segment)
    total += segment.duration
  }
  return capped.length > 0 ? capped : [segments[0]]
}

async function analyzeVideo (inputPath) {
  const ffprobe = findFfprobe()
  const ffmpeg = findFfmpeg()
  if (!ffmpeg || !ffprobe) {
    throw new Error('FFmpeg/ffprobe 不可用，无法分析视频')
  }
  const probeOutput = await runTool(ffprobe, [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', inputPath,
  ])
  const duration = Number(probeOutput.trim())
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('无法读取视频时长：' + inputPath)
  }
  const detectionOutput = await runTool(ffmpeg, [
    '-i', inputPath,
    '-vf', "select='gt(scene," + SCENE_THRESHOLD + ")',metadata=print",
    '-an', '-f', 'null', '-',
  ])
  const segments = buildSegments(duration, parseSceneTimes(detectionOutput))
  return { inputPath, duration: Number(duration.toFixed(3)), segments }
}

function toForwardSlashes (value) {
  return String(value || '').split(path.sep).join('/')
}

async function extractSegments (inputPath, segments, outputDir, ffmpeg) {
  fs.mkdirSync(outputDir, { recursive: true })
  const clips = []
  const listLines = []
  for (const segment of segments) {
    const clipPath = path.join(outputDir, 'clip_' + String(segment.index).padStart(4, '0') + '.mp4')
    await runTool(ffmpeg, [
      '-y', '-ss', String(segment.start), '-i', inputPath,
      '-t', String(segment.duration),
      '-c:v', 'libx264', '-preset', 'veryfast',
      '-c:a', 'aac',
      clipPath,
    ])
    clips.push({ index: segment.index, path: clipPath, start: segment.start, duration: segment.duration })
    listLines.push("file '" + toForwardSlashes(clipPath) + "'")
  }
  const concatList = path.join(outputDir, 'concat.txt')
  fs.writeFileSync(concatList, listLines.join('\n'), 'utf8')
  return { clips, concatList }
}

async function exportVideo (concatList, outputPath, ffmpeg) {
  await runTool(ffmpeg, [
    '-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', outputPath,
  ])
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
    throw new Error('导出视频为空或不存在：' + outputPath)
  }
  return outputPath
}

/**
 * 注册 clip-factory 流水线的自定义阶段执行器
 * @param {object} pipelineEngine - PipelineEngine 实例
 * @returns {{success: boolean, error?: string, registered?: string[]}}
 */
function registerClipFactoryStages (pipelineEngine) {
  if (!pipelineEngine || !pipelineEngine.stageExecutor) {
    return { success: false, error: 'PipelineEngine.stageExecutor not configured (ServiceBus missing)' }
  }

  const registered = []
  const log = pipelineEngine.log

  pipelineEngine.registerStageExecutor(
    CLIPFACTORY_STAGE_TYPES.ANALYZE,
    async ({ params }) => {
      const rawVideo = params && (params.video || params.videoPath)
      const inputPath = resolveReadableMediaFile(rawVideo, {
        kind: 'video',
        allowedRoots: getAllowedMediaRoots(),
      })
      if (!inputPath) {
        return { success: false, error: 'clip-factory analyze 需要可读的本地视频（params.video）' }
      }
      try {
        const analysis = await analyzeVideo(inputPath)
        return { success: true, output: analysis }
      } catch (error) {
        return { success: false, error: 'clip-factory analyze 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(CLIPFACTORY_STAGE_TYPES.ANALYZE)

  pipelineEngine.registerStageExecutor(
    CLIPFACTORY_STAGE_TYPES.EXTRACT,
    async ({ runId, context }) => {
      const analysis = context.analyze
      if (!analysis || !Array.isArray(analysis.segments) || analysis.segments.length === 0) {
        return { success: false, error: 'clip-factory extract 需要 context.analyze' }
      }
      const ffmpeg = findFfmpeg()
      if (!ffmpeg) return { success: false, error: 'FFmpeg 不可用，无法提取片段' }
      try {
        const output = await extractSegments(analysis.inputPath, analysis.segments, getRunDir(runId), ffmpeg)
        return { success: true, output }
      } catch (error) {
        return { success: false, error: 'clip-factory extract 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(CLIPFACTORY_STAGE_TYPES.EXTRACT)

  pipelineEngine.registerStageExecutor(
    CLIPFACTORY_STAGE_TYPES.CAPTION,
    async ({ context }) => {
      const extract = context.extract
      const clips = extract && Array.isArray(extract.clips) ? extract.clips : []
      if (clips.length === 0) {
        return { success: false, error: 'clip-factory caption 需要 context.extract' }
      }
      const captioned = clips.map(clip => ({ ...clip, title: '精彩片段 ' + (clip.index + 1) }))
      return { success: true, output: { ...extract, clips: captioned } }
    },
  )
  registered.push(CLIPFACTORY_STAGE_TYPES.CAPTION)

  pipelineEngine.registerStageExecutor(
    CLIPFACTORY_STAGE_TYPES.EXPORT,
    async ({ runId, context }) => {
      const extract = context.caption || context.extract
      if (!extract || typeof extract.concatList !== 'string' || !fs.existsSync(extract.concatList)) {
        return { success: false, error: 'clip-factory export 需要有效的 concat 列表' }
      }
      const ffmpeg = findFfmpeg()
      if (!ffmpeg) return { success: false, error: 'FFmpeg 不可用，无法导出视频' }
      try {
        const runDir = getRunDir(runId)
        const outputPath = path.join(runDir, 'clipfactory_output.mp4')
        await exportVideo(extract.concatList, outputPath, ffmpeg)
        const clips = extract.clips || []
        return {
          success: true,
          output: {
            videoPath: outputPath,
            segments: clips.map((clip, index) => ({
              index,
              text: clip.title || '精彩片段 ' + (index + 1),
              videoPath: clip.path,
              duration: clip.duration,
            })),
          },
        }
      } catch (error) {
        return { success: false, error: 'clip-factory export 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(CLIPFACTORY_STAGE_TYPES.EXPORT)

  return { success: true, registered }
}

module.exports = {
  CLIPFACTORY_STAGE_TYPES,
  buildSegments,
  parseSceneTimes,
  registerClipFactoryStages,
  runTool,
}
