// @ts-check
/**
 * talkinghead-stages - talking-head（口播视频）流水线的自定义阶段执行器
 *
 * 用户提供口播视频 + 文案（推荐）时全程本地完成：
 *   - talkinghead_upload:     视频与文案校验 + 时长探测
 *   - talkinghead_transcribe: 有文案则透传分句；无文案则 fail closed（提示配置语音识别）
 *   - talkinghead_captions:   生成 SRT 字幕
 *   - talkinghead_render:     FFmpeg 烧录字幕输出 mp4
 *
 * 注册方式：container.setup.js 中调用 registerTalkingHeadStages(pipelineEngine)
 */

'use strict'

const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { findFfmpeg, findFfprobe } = require('./media-tool-paths')
const { getAllowedMediaRoots, resolveReadableMediaFile } = require('./story2video-paths')

const TALKINGHEAD_STAGE_TYPES = {
  UPLOAD: 'talkinghead_upload',
  TRANSCRIBE: 'talkinghead_transcribe',
  CAPTIONS: 'talkinghead_captions',
  RENDER: 'talkinghead_render',
}

const MAX_SEGMENTS = 20

function runTool (binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 32 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).slice(0, 1200)))
      else resolve(String(stdout) + '\n' + String(stderr))
    })
  })
}

function getRunDir (runId) {
  return path.join(os.tmpdir(), 'story2video', 'talkinghead', String(runId || 'run'))
}

function toSrtTimestamp (seconds) {
  const totalMs = Math.max(0, Math.round(Number(seconds) * 1000))
  const ms = totalMs % 1000
  const totalSeconds = Math.floor(totalMs / 1000)
  const s = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const m = totalMinutes % 60
  const h = Math.floor(totalMinutes / 60)
  const pad = (n, width = 2) => String(n).padStart(width, '0')
  return pad(h) + ':' + pad(m) + ':' + pad(s) + ',' + String(ms).padStart(3, '0')
}

function buildSegments (script, duration) {
  const lines = String(script || '')
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

function buildSrt (segments) {
  return segments.map((segment, index) => {
    return [
      String(index + 1),
      toSrtTimestamp(segment.start) + ' --> ' + toSrtTimestamp(segment.end),
      segment.text,
      '',
    ].join('\n')
  }).join('\n')
}

/**
 * 注册 talking-head 流水线的自定义阶段执行器
 * @param {object} pipelineEngine - PipelineEngine 实例
 * @returns {{success: boolean, error?: string, registered?: string[]}}
 */
function registerTalkingHeadStages (pipelineEngine) {
  if (!pipelineEngine || !pipelineEngine.stageExecutor) {
    return { success: false, error: 'PipelineEngine.stageExecutor not configured (ServiceBus missing)' }
  }

  const registered = []

  pipelineEngine.registerStageExecutor(
    TALKINGHEAD_STAGE_TYPES.UPLOAD,
    async ({ params }) => {
      const rawVideo = params && (params.video || params.videoPath)
      const videoPath = resolveReadableMediaFile(rawVideo, {
        kind: 'video',
        allowedRoots: getAllowedMediaRoots(),
      })
      if (!videoPath) {
        return { success: false, error: 'talking-head upload 需要可读的本地视频（params.video）' }
      }
      const script = typeof params.text === 'string' ? params.text.trim() : ''
      if (!script) {
        return { success: false, error: 'talking-head upload 需要口播文案（params.text）' }
      }
      const ffprobe = findFfprobe()
      if (!ffprobe) return { success: false, error: 'ffprobe 不可用，无法探测视频' }
      try {
        const probe = await runTool(ffprobe, [
          '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath,
        ])
        const duration = Number(probe.trim())
        return {
          success: true,
          output: {
            videoPath,
            script,
            duration: Number.isFinite(duration) && duration > 0 ? duration : null,
          },
        }
      } catch (error) {
        return { success: false, error: 'talking-head upload 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(TALKINGHEAD_STAGE_TYPES.UPLOAD)

  pipelineEngine.registerStageExecutor(
    TALKINGHEAD_STAGE_TYPES.TRANSCRIBE,
    async ({ context }) => {
      const upload = context.upload
      if (!upload || typeof upload.script !== 'string' || !upload.script) {
        return { success: false, error: 'talking-head transcribe 需要 context.upload（含文案）' }
      }
      const segments = buildSegments(upload.script, upload.duration)
      if (segments.length === 0) {
        return { success: false, error: 'talking-head transcribe 无法从文案生成分句' }
      }
      return { success: true, output: { script: upload.script, segments } }
    },
  )
  registered.push(TALKINGHEAD_STAGE_TYPES.TRANSCRIBE)

  pipelineEngine.registerStageExecutor(
    TALKINGHEAD_STAGE_TYPES.CAPTIONS,
    async ({ runId, context }) => {
      const transcribe = context.transcribe
      const segments = transcribe && Array.isArray(transcribe.segments) ? transcribe.segments : []
      if (segments.length === 0) {
        return { success: false, error: 'talking-head captions 需要 context.transcribe' }
      }
      const runDir = getRunDir(runId)
      fs.mkdirSync(runDir, { recursive: true })
      const srtPath = path.join(runDir, 'subs.srt')
      fs.writeFileSync(srtPath, buildSrt(segments), 'utf8')
      return { success: true, output: { srtPath, segments } }
    },
  )
  registered.push(TALKINGHEAD_STAGE_TYPES.CAPTIONS)

  pipelineEngine.registerStageExecutor(
    TALKINGHEAD_STAGE_TYPES.RENDER,
    async ({ runId, context }) => {
      const upload = context.upload
      const captions = context.captions
      if (!upload || typeof upload.videoPath !== 'string') {
        return { success: false, error: 'talking-head render 需要 context.upload' }
      }
      if (!captions || typeof captions.srtPath !== 'string' || !fs.existsSync(captions.srtPath)) {
        return { success: false, error: 'talking-head render 需要有效的字幕文件' }
      }
      const ffmpeg = findFfmpeg()
      if (!ffmpeg) return { success: false, error: 'FFmpeg 不可用，无法渲染' }
      const runDir = getRunDir(runId)
      fs.mkdirSync(runDir, { recursive: true })
      const outputPath = path.join(runDir, 'talkinghead_output.mp4')
      try {
        // cwd=runDir 使 subtitles=subs.srt 使用相对路径，规避 Windows 路径转义
        await runTool(ffmpeg, [
          '-y', '-i', upload.videoPath,
          '-vf', 'subtitles=subs.srt',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
          '-c:a', 'aac',
          outputPath,
        ], { cwd: runDir })
        if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
          throw new Error('渲染产物为空')
        }
        return {
          success: true,
          output: {
            videoPath: outputPath,
            segments: captions.segments.map((segment, index) => ({
              index,
              text: segment.text,
              videoPath: outputPath,
              duration: Number((segment.end - segment.start).toFixed(3)),
            })),
          },
        }
      } catch (error) {
        return { success: false, error: 'talking-head render 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(TALKINGHEAD_STAGE_TYPES.RENDER)

  return { success: true, registered }
}

module.exports = {
  TALKINGHEAD_STAGE_TYPES,
  buildSegments,
  buildSrt,
  registerTalkingHeadStages,
  toSrtTimestamp,
}
