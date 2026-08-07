// @ts-check
/**
 * podcast-repurpose-stages - podcast-repurpose（播客转视频）流水线的自定义阶段执行器
 *
 * 用户提供音频文件（+ 可选文案）：
 *   - podcast_analyze:   ffprobe 探测音频时长；文案（params.transcript）或语音识别转写 → 按行分句成时间段
 *   - podcast_visualize: 每段文案经 AssetGenerator 生成配图（默认图片 provider）
 *   - podcast_assemble:  ffmpeg 按时间段切分音频片段 + 组装 scenes（imagePath/audioPath/duration）
 *   - render:            内置 compose 阶段（type: 'compose', inputFrom: 'assemble'）→ Story2Video 合成引擎
 *
 * 注册方式：container.setup.js 中调用 registerPodcastRepurposeStages(pipelineEngine)
 */

'use strict'

const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { findFfmpeg, findFfprobe } = require('./media-tool-paths')
const { getAllowedMediaRoots, resolveReadableMediaFile } = require('./story2video-paths')

const PODCAST_STAGE_TYPES = Object.freeze({
  ANALYZE: 'podcast_analyze',
  VISUALIZE: 'podcast_visualize',
  ASSEMBLE: 'podcast_assemble',
})

const MAX_SEGMENTS = 30

function runTool (binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 64 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).slice(0, 1200)))
      else resolve(String(stdout) + '\n' + String(stderr))
    })
  })
}

function getRunDir (runId) {
  return path.join(os.tmpdir(), 'story2video', 'podcast', String(runId || 'run'))
}

/** 按行分句，均分音频时长生成时间段（最多 MAX_SEGMENTS 段）。 */
function buildPodcastSegments (transcript, duration) {
  const lines = String(transcript || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
  if (lines.length === 0) return []
  const total = Number(duration) > 0 ? Number(duration) : 6
  const per = total / lines.length
  return lines.slice(0, MAX_SEGMENTS).map((text, index) => ({
    index,
    text,
    start: Number((index * per).toFixed(3)),
    end: Number(((index + 1) * per).toFixed(3)),
  }))
}

function getAiGenerator (pipelineEngine) {
  return pipelineEngine.aiGenerator ||
    (pipelineEngine.container && typeof pipelineEngine.container.get === 'function'
      ? pipelineEngine.container.get('aiGenerator')
      : null)
}

function getDefaultImageProviderId (aiGenerator) {
  const manager = aiGenerator && aiGenerator._modelProviderManager
  const provider = manager && typeof manager.getDefault === 'function'
    ? manager.getDefault('image')
    : null
  return provider && typeof provider.id === 'string' && provider.id.trim() ? provider.id.trim() : ''
}

/**
 * 注册 podcast-repurpose 流水线的自定义阶段执行器
 * @param {object} pipelineEngine - PipelineEngine 实例
 * @returns {{success: boolean, error?: string, registered?: string[]}}
 */
function registerPodcastRepurposeStages (pipelineEngine) {
  if (!pipelineEngine || !pipelineEngine.stageExecutor) {
    return { success: false, error: 'PipelineEngine.stageExecutor not configured (ServiceBus missing)' }
  }

  const registered = []
  const log = pipelineEngine.log

  // ----------------------------------------------------------
  // ANALYZE - 音频时长 + 文案 → 时间段
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    PODCAST_STAGE_TYPES.ANALYZE,
    async ({ params }) => {
      const audioPath = resolveReadableMediaFile(params && (params.audio || params.audioPath), {
        kind: 'audio',
        allowedRoots: getAllowedMediaRoots(),
      })
      if (!audioPath) {
        return { success: false, error: 'podcast-repurpose analyze 需要可读的本地音频（params.audio / params.audioPath）' }
      }
      const ffprobe = findFfprobe()
      if (!ffprobe) return { success: false, error: 'ffprobe 不可用，无法探测音频时长' }
      try {
        const probe = await runTool(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audioPath])
        const duration = Number(String(probe).trim())
        if (!Number.isFinite(duration) || duration <= 0) {
          return { success: false, error: '无法解析音频时长' }
        }
        let transcript = typeof params.transcript === 'string' ? params.transcript.trim() : ''
        if (!transcript) {
          const projectService = pipelineEngine.story2videoProjectService
          if (projectService && typeof projectService.transcribeFile === 'function') {
            try {
              const transcription = await projectService.transcribeFile(audioPath)
              transcript = String(transcription && transcription.text || '').trim()
            } catch (_) { transcript = '' }
          }
          if (!transcript) {
            return { success: false, error: 'podcast-repurpose 需要文案（params.transcript）或已配置可用的语音识别服务' }
          }
        }
        const segments = buildPodcastSegments(transcript, duration)
        if (segments.length === 0) {
          return { success: false, error: '未能从文案拆分出任何时间段' }
        }
        return { success: true, output: { audioPath, duration, transcript, segments } }
      } catch (error) {
        return { success: false, error: 'analyze 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(PODCAST_STAGE_TYPES.ANALYZE)

  // ----------------------------------------------------------
  // VISUALIZE - 每段文案生成配图
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    PODCAST_STAGE_TYPES.VISUALIZE,
    async ({ runId, stage, params, context }) => {
      const segments = Array.isArray(context.analyze && context.analyze.segments) ? context.analyze.segments : []
      if (segments.length === 0) {
        return { success: false, error: 'podcast-repurpose visualize 需要 context.analyze.segments' }
      }
      const serviceBus = pipelineEngine.stageExecutor && pipelineEngine.stageExecutor.serviceBus
      const assetGenerator = pipelineEngine._assetGenerator || (serviceBus && serviceBus._assetGenerator)
      if (!assetGenerator || typeof assetGenerator.generateImage !== 'function') {
        return { success: false, error: '图片生成服务不可用，请先完成模型设置' }
      }
      const imageProvider = (params && params.imageProvider)
        || (stage && stage.options && stage.options.imageProvider)
        || getDefaultImageProviderId(getAiGenerator(pipelineEngine))
      const images = []
      for (let i = 0; i < segments.length; i++) {
        try {
          const result = await assetGenerator.generateImage(segments[i].text, {
            image_provider: imageProvider,
            index: i,
            runId,
            aspect_ratio: (params && params.aspectRatio) || '16:9',
          })
          if (result && result.code === 0 && result.data && result.data.path) {
            images.push({ index: i, success: true, path: result.data.path, meta: result.data })
          } else {
            images.push({ index: i, success: false, error: (result && result.message) || '图片生成失败' })
          }
        } catch (error) {
          images.push({ index: i, success: false, error: error && error.message ? error.message : String(error) })
        }
      }
      return { success: true, output: { ...context.analyze, images } }
    },
  )
  registered.push(PODCAST_STAGE_TYPES.VISUALIZE)

  // ----------------------------------------------------------
  // ASSEMBLE - 切分音频片段 + 组装场景
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    PODCAST_STAGE_TYPES.ASSEMBLE,
    async ({ runId, context }) => {
      const segments = Array.isArray(context.visualize && context.visualize.segments) ? context.visualize.segments : []
      const images = Array.isArray(context.visualize && context.visualize.images) ? context.visualize.images : []
      const audioPath = context.visualize && context.visualize.audioPath
      if (!audioPath || segments.length === 0) {
        return { success: false, error: 'podcast-repurpose assemble 需要 context.visualize（音频 + 时间段 + 配图）' }
      }
      const ffmpeg = findFfmpeg()
      if (!ffmpeg) return { success: false, error: 'ffmpeg 不可用，无法切分音频' }
      const runDir = getRunDir(runId)
      try { fs.mkdirSync(runDir, { recursive: true }) } catch (_) { /* 目录创建失败由后续切分报错 */ }
      const scenes = []
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]
        const image = images[i]
        if (!segment || !image || image.success !== true || !image.path) continue
        const clipPath = path.join(runDir, 'seg_' + String(i).padStart(4, '0') + '.m4a')
        try {
          await runTool(ffmpeg, [
            '-y', '-i', audioPath,
            '-ss', String(segment.start),
            '-to', String(segment.end),
            '-c:a', 'aac', '-b:a', '128k',
            clipPath,
          ])
          if (!fs.existsSync(clipPath) || fs.statSync(clipPath).size <= 0) continue
          scenes.push({
            index: i,
            text: segment.text,
            imagePath: image.path,
            audioPath: clipPath,
            duration: Number((segment.end - segment.start).toFixed(3)),
          })
        } catch (error) {
          log.warn('PodcastRepurpose', 'segment ' + i + ' audio cut failed: ' + (error && error.message ? error.message : String(error)))
        }
      }
      if (scenes.length === 0) {
        return { success: false, error: '未能切分任何可用的音频片段（请检查音频文件与文案）' }
      }
      return { success: true, output: { scenes } }
    },
  )
  registered.push(PODCAST_STAGE_TYPES.ASSEMBLE)

  return { success: true, registered }
}

module.exports = {
  PODCAST_STAGE_TYPES,
  buildPodcastSegments,
  registerPodcastRepurposeStages,
}
