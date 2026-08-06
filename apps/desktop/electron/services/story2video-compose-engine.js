// @ts-check
/**
 * Story2VideoComposeEngine — 基于 ffmpeg 的视频合成引擎
 *
 * 职责：
 *   - 接收 assetManifest（图片 + TTS 音频 + 字幕）
 *   - 用 ffmpeg 将每张图片配对应音频合成视频片段
 *   - 拼接所有片段为最终视频
 *
 * 设计意图：
 *   替代 ServiceBus 中的占位响应，让 story2video-compose 流水线真正产出视频。
 *   不依赖 Remotion/Canvas，纯 Node.js + ffmpeg 子进程。
 */
'use strict'

const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { promisify } = require('util')
const {
  MAX_INPUT_FILE_BYTES,
  MAX_INPUT_TOTAL_BYTES,
  getAllowedMediaRoots,
  isPathWithin,
  resolveReadableMediaFile,
} = require('./story2video-paths')
const { findFfmpeg, findFfprobe } = require('./media-tool-paths')
const {
  buildSubtitleTimeline,
  splitSubtitleBlocks,
} = require('./story2video-segmentation')

const execFileAsync = promisify(execFile)
const DEFAULT_MAX_DURATION_SECONDS = 10 * 60
const DEFAULT_MAX_AUDIO_DURATION_SECONDS = 15 * 60
const DEFAULT_MAX_SEGMENT_DURATION_SECONDS = 3 * 60
const DEFAULT_MAX_OUTPUT_PIXELS = 7680 * 4320

const FFMPEG = findFfmpeg()
const FFPROBE = findFfprobe()

/**
 * 转义 ffmpeg drawtext 滤镜中的字幕文本
 *
 * ffmpeg drawtext 的 text 参数在单引号上下文中，以下字符需转义：
 *   - \  必须最先转义（否则后续转义符 \ 会被二次转义）
 *   - :  滤镜参数分隔符
 *   - '  单引号字符串结束符
 *   - ,  滤镜链分隔符
 *   - %  避免 %{...} 函数扩展（如 %{n} 帧号）
 *   - { } 避免 ${...} 变量扩展
 *
 * @param {string} text - 原始字幕文本
 * @returns {string} 转义后的文本，可直接用于 drawtext=text='...'
 */
function escapeSubtitleText (text) {
  if (!text) return ''
  return String(text)
    .replace(/\\/g, '\\\\')  // 1. 反斜杠最先转义（\ → \\）
    .replace(/:/g, '\\:')    // 2. 冒号
    .replace(/'/g, "\\'")    // 3. 单引号
    .replace(/,/g, '\\,')    // 4. 逗号
    .replace(/%/g, '\\%')    // 5. 百分号
    .replace(/\{/g, '\\{')   // 6. 左花括号
    .replace(/\}/g, '\\}')   // 7. 右花括号
}

const TRANSITION_NAMES = {
  fade: 'fade',
  'slide-left': 'slideleft',
  'slide-right': 'slideright',
  'slide-up': 'slideup',
  'slide-down': 'slidedown',
}

function clampNumber (value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function parseResolution (value) {
  const match = String(value || '').match(/^(\d{2,5})x(\d{2,5})$/i)
  if (!match) return { width: 1280, height: 720 }
  return {
    width: clampNumber(match[1], 160, 7680, 1280),
    height: clampNumber(match[2], 160, 7680, 720),
  }
}

function validateResolution (value, maxPixels) {
  if (value === undefined || value === null || value === '') return null
  const match = String(value).match(/^(\d{2,5})x(\d{2,5})$/i)
  if (!match) return 'Invalid output resolution'
  const width = Number(match[1])
  const height = Number(match[2])
  if (width < 160 || height < 160 || width > 7680 || height > 7680) {
    return 'Output resolution is outside the allowed range'
  }
  if (width * height > maxPixels) return 'Output resolution exceeds the pixel limit'
  return null
}

function positiveLimit (value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function buildScaleFilter (width, height) {
  const safeWidth = Math.max(160, Math.round(Number(width) || 1280))
  const safeHeight = Math.max(160, Math.round(Number(height) || 720))
  return 'scale=' + safeWidth + ':' + safeHeight + ':force_original_aspect_ratio=decrease,' +
    'pad=' + safeWidth + ':' + safeHeight + ':(ow-iw)/2:(oh-ih)/2:color=black'
}

function normalizeComposeScenes (assetManifest) {
  if (!assetManifest || typeof assetManifest !== 'object') return []
  const sentences = Array.isArray(assetManifest.sentences) ? assetManifest.sentences : []
  const images = Array.isArray(assetManifest.images) ? assetManifest.images : []
  const audio = Array.isArray(assetManifest.audio) ? assetManifest.audio : []
  const sourceScenes = Array.isArray(assetManifest.scenes) && assetManifest.scenes.length > 0
    ? assetManifest.scenes
    : Array.from({ length: Math.max(images.length, audio.length) }, (_, index) => ({
        index,
        imagePath: images[index]?.path || images[index]?.imagePath,
        audioPath: audio[index]?.path || audio[index]?.audioPath,
        duration: audio[index]?.duration,
        text: sentences[index]?.text || sentences[index]?.content || '',
      }))

  return sourceScenes.map((scene, position) => {
    const index = Number.isInteger(scene?.index) && scene.index >= 0 ? scene.index : position
    const image = images[index] || images[position]
    const sound = audio[index] || audio[position]
    const sentence = sentences[index] || sentences[position]
    return {
      index,
      imagePath: scene?.imagePath || scene?.image?.path || image?.path || image?.imagePath || null,
      audioPath: scene?.audioPath || scene?.audio?.path || sound?.path || sound?.audioPath || null,
      duration: clampNumber(scene?.duration ?? sound?.duration, 0, 3600, null),
      text: scene?.text || scene?.content || sentence?.text || sentence?.content || '',
      prompt: scene?.prompt || '',
      imageMeta: scene?.imageMeta || image?.meta || null,
      audioMeta: scene?.audioMeta || sound?.meta || null,
      subtitleBlocks: Array.isArray(scene?.subtitleBlocks)
        ? [...scene.subtitleBlocks]
        : (Array.isArray(sentence?.subtitleBlocks) ? [...sentence.subtitleBlocks] : []),
      subtitleTimeline: Array.isArray(scene?.subtitleTimeline) ? [...scene.subtitleTimeline] : [],
      sceneSource: scene?.sceneSource || sentence?.sceneSource || null,
      subtitleSource: scene?.subtitleSource || sentence?.subtitleSource || null,
      degraded: scene?.degraded === true || sentence?.degraded === true,
      fallbackReason: scene?.fallbackReason || sentence?.fallbackReason || null,
    }
  })
}

function buildImageEffectFilter (effect, width, height, fps, durationFrames) {
  const safeWidth = Math.max(160, Math.round(Number(width) || 1280))
  const safeHeight = Math.max(160, Math.round(Number(height) || 720))
  const safeFps = Math.max(1, Math.min(120, Math.round(Number(fps) || 30)))
  // 关键修复：zoompan 需要 d=输出总帧数（=时长×帧率）才能产生连续动画。
  // 此前 d=1 且输入为 -loop 1 静态图时，每一输入帧只产出一帧，zoom 状态不累积，
  // 导致「慢慢放大」等动效在成片中完全不可见。
  const totalFrames = Math.max(safeFps, Math.round(Number(durationFrames) || safeFps * 3))
  const zoompan = (zoom, x, y) =>
    "zoompan=z='" + zoom + "':x='" + x + "':y='" + y + "':d=" + totalFrames +
    ':s=' + safeWidth + 'x' + safeHeight + ':fps=' + safeFps

  switch (effect) {
    case 'zoom-in':
      return zoompan('min(zoom+0.0015,1.25)', 'iw/2-(iw/zoom/2)', 'ih/2-(ih/zoom/2)')
    case 'zoom-out':
      return zoompan('if(eq(on,1),1.25,max(zoom-0.0015,1))', 'iw/2-(iw/zoom/2)', 'ih/2-(ih/zoom/2)')
    case 'pan-left':
      return zoompan('1.12', '(iw-iw/zoom)*on/' + totalFrames, 'ih/2-(ih/zoom/2)')
    case 'pan-right':
      return zoompan('1.12', '(iw-iw/zoom)*(1-on/' + totalFrames + ')', 'ih/2-(ih/zoom/2)')
    case 'pan-up':
      return zoompan('1.12', 'iw/2-(iw/zoom/2)', '(ih-ih/zoom)*on/' + totalFrames)
    case 'pan-down':
      return zoompan('1.12', 'iw/2-(iw/zoom/2)', '(ih-ih/zoom)*(1-on/' + totalFrames + ')')
    case 'zoom-pan':
      return zoompan('min(zoom+0.001,1.15)', '(iw-iw/zoom)*on/' + totalFrames, 'ih/2-(ih/zoom/2)')
    case 'rotate':
      return "rotate='0.02*sin(2*PI*t/4)':fillcolor=black@0"
    case 'blur-in':
      return 'boxblur=2:1'
    default:
      return ''
  }
}

function buildSubtitleFilter (textOrTimeline, style) {
  const entries = Array.isArray(textOrTimeline)
    ? textOrTimeline
      .map(item => (typeof item === 'string' ? { text: item } : item))
      .filter(item => item && item.text)
    : (textOrTimeline ? [{ text: textOrTimeline }] : [])
  if (entries.length === 0) return ''
  const config = typeof style === 'string' ? { style } : (style || {})
  const sizeMap = {
    size1: 16, size2: 20, size3: 24, size4: 28, size5: 32, size6: 40,
    sm: 18, md: 24, lg: 32, xl: 40,
  }
  const fontSize = Math.round(clampNumber(config.fontSize || sizeMap[config.size], 12, 96, 24))
  const color = /^#[0-9a-f]{3,8}$/i.test(String(config.color || ''))
    ? String(config.color)
    : 'white'
  const borderWidth = config.style === 'style3' ? 4 : 2
  const box = config.style === 'style2' ? ':box=1:boxcolor=black@0.55:boxborderw=10' : ''
  return entries.map(item => {
    const startTime = Number(item.startTime)
    const endTime = Number(item.endTime)
    const enable = Number.isFinite(startTime) && Number.isFinite(endTime) && endTime > startTime
      ? ":enable='gte(t," + Math.max(0, startTime).toFixed(3) + ')*lt(t,' + endTime.toFixed(3) + ")'"
      : ''
    return "drawtext=text='" + escapeSubtitleText(item.text) + "':fontcolor=" + color +
      ':fontsize=' + fontSize + ':borderw=' + borderWidth + ':bordercolor=black' +
      box + ':x=(w-text_w)/2:y=h-th-40' + enable
  }).join(',')
}

function normalizeSceneSubtitleBlocks (scene) {
  if (Array.isArray(scene?.subtitleBlocks) && scene.subtitleBlocks.length > 0) {
    return scene.subtitleBlocks
      .map(item => String(typeof item === 'string' ? item : item?.text || '').trim())
      .filter(Boolean)
  }
  if (Array.isArray(scene?.subtitleTimeline) && scene.subtitleTimeline.length > 0) {
    return scene.subtitleTimeline
      .map(item => String(item?.text || '').trim())
      .filter(Boolean)
  }
  return splitSubtitleBlocks(scene?.text || '')
}

function buildWatermarkFilter (options) {
  const config = options && typeof options.watermark === 'object'
    ? options.watermark
    : (options && options.watermarkConfig) || {}
  const enabled = config.enabled === true || options?.watermark === true
  const text = options?.watermarkText || config.text || ''
  if (!enabled || !text) return ''
  const fontSize = Math.round(clampNumber(config.fontSize, 10, 96, 24))
  const opacity = clampNumber(config.opacity, 0, 1, 0.6).toFixed(2)
  const rawColor = String(config.color || 'white')
  const color = /^#[0-9a-f]{3,8}$/i.test(rawColor) || /^[a-z]+$/i.test(rawColor) ? rawColor : 'white'
  const positions = {
    'top-left': 'x=20:y=40',
    'top-right': 'x=w-text_w-20:y=40',
    'bottom-left': 'x=20:y=h-20',
    'bottom-right': 'x=w-text_w-20:y=h-20',
    center: 'x=(w-text_w)/2:y=(h+text_h)/2',
  }
  const position = positions[config.position] || positions['bottom-right']
  return "drawtext=text='" + escapeSubtitleText(text) + "':fontcolor=" + color + '@' + opacity +
    ':fontsize=' + fontSize + ':' + position
}

function hasUsableFile (filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false
  try {
    const stat = fs.statSync(filePath)
    return stat.isFile() && stat.size > 0
  } catch {
    return false
  }
}

/**
 * 根据实际片段时长生成安全的转场计划。
 * xfade 的 duration 必须小于相邻两个输入的时长，不能直接使用用户配置值。
 */
function buildTransitionPlan (segmentDurations, requestedDuration) {
  const durations = Array.isArray(segmentDurations)
    ? segmentDurations.map(value => {
        const number = Number(value)
        return Number.isFinite(number) && number > 0 ? number : null
      })
    : []
  const total = durations.reduce((sum, value) => sum + (value || 0), 0)
  if (durations.length < 2 || durations.some(value => value === null)) {
    return { enabled: false, durations, transitions: [], totalDuration: total }
  }

  const requested = clampNumber(requestedDuration, 0.1, 1.5, 0.4)
  const transitions = []
  let elapsed = durations[0]
  let previous = durations[0]
  for (let index = 1; index < durations.length; index++) {
    const current = durations[index]
    // 留出 20% 的余量，避免 duration 等于输入边界导致 ffmpeg 拒绝滤镜。
    const duration = Math.min(requested, previous * 0.8, current * 0.8)
    if (!Number.isFinite(duration) || duration < 0.01 || elapsed <= duration) {
      return { enabled: false, durations, transitions: [], totalDuration: total }
    }
    transitions.push({ duration, offset: elapsed - duration })
    elapsed += current - duration
    previous = current
  }
  return { enabled: true, durations, transitions, totalDuration: elapsed }
}

class Story2VideoComposeEngine {
  /**
   * @param {object} [opts]
   * @param {string} [opts.outputDir] - 输出目录（默认 os.tmpdir）
   * @param {object} [opts.log] - 日志模块
   * @param {number} [opts.maxSessionAgeMs] - 历史 sessionDir 最大保留时间 ms（默认 24h）
   * @param {string[]} [opts.allowedMediaRoots] - 允许读取媒体的根目录
   */
  constructor (opts) {
    opts = opts || {}
    this.outputDir = path.resolve(opts.outputDir || path.join(os.tmpdir(), 'story2video'))
    this.log = opts.log || require('./logger')
    this.maxSessionAgeMs = opts.maxSessionAgeMs || 24 * 60 * 60 * 1000
    this.allowedMediaRoots = Array.isArray(opts.allowedMediaRoots) && opts.allowedMediaRoots.length > 0
      ? opts.allowedMediaRoots.map(root => path.resolve(root))
      : getAllowedMediaRoots([this.outputDir, process.cwd()])
    this.maxInputFileBytes = positiveLimit(opts.maxInputFileBytes, MAX_INPUT_FILE_BYTES)
    this.maxInputTotalBytes = positiveLimit(opts.maxInputTotalBytes, MAX_INPUT_TOTAL_BYTES)
    this.maxDurationSeconds = positiveLimit(opts.maxDurationSeconds, DEFAULT_MAX_DURATION_SECONDS)
    this.maxAudioDurationSeconds = positiveLimit(opts.maxAudioDurationSeconds, DEFAULT_MAX_AUDIO_DURATION_SECONDS)
    this.maxSegmentDurationSeconds = positiveLimit(opts.maxSegmentDurationSeconds, DEFAULT_MAX_SEGMENT_DURATION_SECONDS)
    this.maxOutputPixels = positiveLimit(opts.maxOutputPixels, DEFAULT_MAX_OUTPUT_PIXELS)
    this._segmentSeq = 0
  }

  /**
   * 合成视频
   * @param {object} assetManifest - generate_assets 阶段的输出
   * @param {object} [options] - 合成选项
   * @returns {Promise<{code: number, data?: object, message?: string}>}
   */
  async compose (assetManifest, options) {
    if (!FFMPEG) {
      return { code: -1, message: 'ffmpeg not found' }
    }

    let scenes = normalizeComposeScenes(assetManifest)
    if (scenes.length === 0) {
      return { code: -1, message: 'Invalid assetManifest: missing scenes or image/audio pairs' }
    }

    const resolutionError = validateResolution(options?.resolution, this.maxOutputPixels)
    if (resolutionError) return { code: -1, message: resolutionError }

    const requestedBgmPath = options?.bgmPath || assetManifest.bgmPath || assetManifest.bgm?.path
    let totalInputBytes = 0
    const accountInput = (filePath) => {
      const stat = fs.statSync(filePath)
      totalInputBytes += stat.size
      return totalInputBytes <= this.maxInputTotalBytes
    }
    const preparedScenes = []
    for (let index = 0; index < scenes.length; index++) {
      const scene = scenes[index]
      const imagePath = resolveReadableMediaFile(scene?.imagePath, {
        kind: 'image',
        allowedRoots: this.allowedMediaRoots,
        maxBytes: this.maxInputFileBytes,
      })
      const audioPath = resolveReadableMediaFile(scene?.audioPath, {
        kind: 'audio',
        allowedRoots: this.allowedMediaRoots,
        maxBytes: this.maxInputFileBytes,
      })
      if (!imagePath || !audioPath) {
        return { code: -1, message: 'Scene media path is not allowed or unreadable at index ' + index }
      }
      if (!accountInput(imagePath) || !accountInput(audioPath)) {
        return { code: -1, message: 'Input media exceeds the total size limit' }
      }
      preparedScenes.push({ ...scene, imagePath, audioPath })
    }
    scenes = preparedScenes

    let bgmPath = null
    if (requestedBgmPath) {
      bgmPath = resolveReadableMediaFile(requestedBgmPath, {
        kind: 'bgm',
        allowedRoots: this.allowedMediaRoots,
        maxBytes: this.maxInputFileBytes,
      })
      if (!bgmPath) return { code: -1, message: 'BGM path is not allowed or unreadable' }
      if (!accountInput(bgmPath)) return { code: -1, message: 'Input media exceeds the total size limit' }
    }

    const probedAudioDurations = []
    let totalAudioDuration = 0
    for (let index = 0; index < scenes.length; index++) {
      const audioDuration = await this._probeMediaDuration(scenes[index].audioPath)
      probedAudioDurations.push(audioDuration)
      if (!audioDuration) continue
      if (scenes.length > 1 && audioDuration > this.maxSegmentDurationSeconds) {
        return { code: -1, message: '单段旁白时长不能超过 3 分钟' }
      }
      totalAudioDuration += audioDuration
    }
    if (totalAudioDuration > this.maxAudioDurationSeconds) {
      return { code: -1, message: '旁白音频总时长不能超过 15 分钟' }
    }
    if (totalAudioDuration > this.maxDurationSeconds) {
      return { code: -1, message: '成片总时长不能超过 10 分钟' }
    }
    const effectiveRequestedDuration = scenes.reduce((total, scene, index) => (
      total + (probedAudioDurations[index] || Number(scene.duration) || 0)
    ), 0)
    if (effectiveRequestedDuration > this.maxDurationSeconds) {
      return { code: -1, message: 'Requested video duration exceeds the allowed limit' }
    }

    // 确保输出目录存在
    fs.mkdirSync(this.outputDir, { recursive: true })

    // P2-7: 启动时清理历史残留 sessionDir（超过 maxSessionAgeMs）
    this._cleanupOldSessions()

    const sessionId = 's2v_' + Date.now() + '_' + (++this._segmentSeq)
    const sessionDir = path.join(this.outputDir, sessionId)
    fs.mkdirSync(sessionDir, { recursive: true })

    const transition = options?.transition || 'fade'
    const subtitleEnabled = options?.subtitleEnabled !== false
    const resolution = parseResolution(options?.resolution)
    const fps = clampNumber(options?.fps, 1, 120, 30)
    const defaultSceneDuration = clampNumber(options?.defaultSceneDuration, 1, 60, 6)
    const voiceVolume = clampNumber(options?.voiceVolume, 0, 2, 1)
    const outputFormat = options?.format === 'webm' ? 'webm' : 'mp4'

    this.log.info('Story2VideoCompose', 'Composing video: ' +
      scenes.length + ' scenes')

    // 1. 为每个图片+音频对创建视频片段
    const segments = []
    const segmentRecords = []
    const segmentDurations = []
    let accumulatedDuration = 0

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      const segPath = path.join(sessionDir, 'seg_' + String(i).padStart(4, '0') + '.mp4')
      const reportedDuration = scene.duration === null || scene.duration === undefined
        ? null
        : clampNumber(scene.duration, 0.1, 3600, null)
      const audioDuration = probedAudioDurations[i]
      // scene.duration 是 TTS 提供方上报的非权威元数据，不是剪辑上限；裁剪由 trim API 负责。
      // ffprobe 成功时以真实音频时长为准，避免旁白被截断；缺少上报值时由 -shortest 跟随音频。
      const duration = reportedDuration && audioDuration ? audioDuration : reportedDuration
      const subtitleBlocks = normalizeSceneSubtitleBlocks(scene)
      const subtitleDuration = audioDuration || duration || defaultSceneDuration
      const subtitleTimeline = buildSubtitleTimeline(subtitleBlocks, subtitleDuration)

      try {
        await this._createSegment(scene.imagePath, scene.audioPath, segPath, {
          duration,
          subtitleText: subtitleEnabled ? scene.text : '',
          subtitleTimeline: subtitleEnabled ? subtitleTimeline : [],
          transition,
          imageEffect: options?.imageEffect || 'none',
          subtitleStyle: options?.subtitleStyle,
          watermark: options?.watermark,
          watermarkText: options?.watermarkText,
          watermarkConfig: options?.watermarkConfig,
          voiceVolume,
          width: resolution.width,
          height: resolution.height,
          fps,
        })
        segments.push(segPath)
        const actualDuration = await this._probeMediaDuration(segPath)
        const segmentDuration = actualDuration || duration || audioDuration || defaultSceneDuration
        accumulatedDuration += segmentDuration
        if (accumulatedDuration > this.maxDurationSeconds) {
          this._cleanupSession(sessionDir)
          return { code: -1, message: 'Composed video duration exceeds the allowed limit' }
        }
        segmentDurations.push(segmentDuration)
        segmentRecords.push({
          ...scene,
          duration: segmentDuration,
          subtitleBlocks,
          subtitleTimeline: buildSubtitleTimeline(subtitleBlocks, segmentDuration),
          videoPath: segPath,
          status: 'completed',
        })
        this.log.info('Story2VideoCompose', 'Segment ' + i + ' created: ' + path.basename(segPath))
      } catch (e) {
        this.log.warn('Story2VideoCompose', 'Segment ' + i + ' failed: ' + e.message)
        this._cleanupSession(sessionDir)
        return { code: -1, message: 'Segment ' + i + ' failed to create: ' + e.message }
      }
    }

    if (segments.length === 0) {
      // P2-7: 失败时清理 sessionDir
      this._cleanupSession(sessionDir)
      return { code: -1, message: 'All segments failed to create' }
    }

    // 2. 拼接所有片段
    const outputPath = path.join(sessionDir, 'output.mp4')
    try {
      if (segments.length === 1) {
        fs.copyFileSync(segments[0], outputPath)
      } else {
        await this._concatSegments(segments, outputPath, sessionDir, {
          transition,
          transitionDuration: options?.transitionDuration,
          segmentDurations,
        })
      }
    } catch (e) {
      // P2-7: 拼接失败时清理 sessionDir
      this._cleanupSession(sessionDir)
      throw e
    }

    // 3. 将所有分段旁白合并为独立音频，结果页可播放和下载完整旁白。
    const narrationPath = path.join(sessionDir, 'narration.m4a')
    try {
      await this._concatNarrationAudio(scenes.map(scene => scene.audioPath), narrationPath, sessionDir, voiceVolume)
    } catch (e) {
      this._cleanupSession(sessionDir)
      return { code: -1, message: 'Narration concat failed: ' + e.message }
    }

    // 4. 可选 BGM 混音（仅接受已下载的本地文件，避免在主进程隐式发起网络请求）
    let composedPath = outputPath
    if (bgmPath) {
      const mixedPath = path.join(sessionDir, 'mixed.mp4')
      try {
        await this._mixBgm(composedPath, bgmPath, mixedPath, options?.bgmVolume)
        composedPath = mixedPath
      } catch (e) {
        this._cleanupSession(sessionDir)
        return { code: -1, message: 'BGM mix failed: ' + e.message }
      }
    }

    if (outputFormat === 'webm') {
      const webmPath = path.join(sessionDir, 'output.webm')
      try {
        await this._transcodeWebm(composedPath, webmPath)
        composedPath = webmPath
      } catch (e) {
        this._cleanupSession(sessionDir)
        return { code: -1, message: 'WebM transcode failed: ' + e.message }
      }
    }

    // 5. 验证输出：非空 + ffmpeg 可解码
    if (!hasUsableFile(composedPath)) {
      this._cleanupSession(sessionDir)
      return { code: -1, message: 'Output file not created' }
    }
    if (options?.validateOutput !== false) {
      try {
        await this._validateOutput(composedPath)
      } catch (e) {
        this._cleanupSession(sessionDir)
        return { code: -1, message: 'Output validation failed: ' + e.message }
      }
    }

    const measuredOutputDuration = await this._probeMediaDuration(composedPath)
    const calculatedOutputDuration = segmentDurations.reduce((sum, duration) => sum + duration, 0)
      - (transition !== 'none'
        ? buildTransitionPlan(segmentDurations, options?.transitionDuration).transitions
          .reduce((sum, item) => sum + item.duration, 0)
        : 0)
    const outputDuration = measuredOutputDuration || Math.max(0, calculatedOutputDuration)

    // 6. 成功后，将成片、完整旁白和分段视频移到 outputDir 根目录。
    const finalPath = path.join(this.outputDir, sessionId + '_output.' + outputFormat)
    try {
      fs.copyFileSync(composedPath, finalPath)
    } catch (e) {
      // 移动失败则保留原路径（output.mp4 仍在 sessionDir 内）
      this.log.warn('Story2VideoCompose', 'Failed to move output to final path, keeping in sessionDir: ' + e.message)
       const stat = fs.statSync(composedPath)
      return {
        code: 0,
        data: {
          videoPath: composedPath,
          fileSize: stat.size,
          segmentCount: segments.length,
          duration: outputDuration,
          format: outputFormat,
          audioPath: narrationPath,
          segments: segmentRecords,
        },
      }
    }
    const finalNarrationPath = path.join(this.outputDir, sessionId + '_narration.m4a')
    const finalSegmentDir = path.join(this.outputDir, sessionId + '_segments')
    let finalSegments
    try {
      fs.copyFileSync(narrationPath, finalNarrationPath)
      fs.mkdirSync(finalSegmentDir, { recursive: true })
      finalSegments = segmentRecords.map((segment, index) => {
        const videoPath = path.join(finalSegmentDir, 'segment_' + String(index).padStart(4, '0') + '.mp4')
        fs.copyFileSync(segment.videoPath, videoPath)
        return { ...segment, videoPath }
      })
    } catch (e) {
      try { fs.rmSync(finalSegmentDir, { recursive: true, force: true }) } catch (_) { /* ignore */ }
      try { fs.unlinkSync(finalNarrationPath) } catch (_) { /* ignore */ }
      try { fs.unlinkSync(finalPath) } catch (_) { /* ignore */ }
      this._cleanupSession(sessionDir)
      return { code: -1, message: 'Failed to persist compose artifacts: ' + e.message }
    }
    // 成功移到 finalPath 后清理 sessionDir
    this._cleanupSession(sessionDir)

    const stat = fs.statSync(finalPath)
    if (!stat || stat.size <= 0) {
      return { code: -1, message: 'Final output file is empty' }
    }
    this.log.info('Story2VideoCompose', 'Video composed: ' + finalPath + ' (' + Math.round(stat.size / 1024) + 'KB)')

    return {
      code: 0,
      data: {
        videoPath: finalPath,
        fileSize: stat.size,
        segmentCount: segments.length,
        duration: outputDuration,
        bgmApplied: Boolean(bgmPath),
        format: outputFormat,
        audioPath: finalNarrationPath,
        segments: finalSegments,
      },
    }
  }

  /** 重新渲染一个分段，供结果页单段重试使用。 */
  async renderSegment (scene, options = {}, destinationPath) {
    if (!FFMPEG) return { code: -1, message: 'ffmpeg not found' }
    if (!scene || typeof scene !== 'object' || typeof destinationPath !== 'string' || !path.isAbsolute(destinationPath)) {
      return { code: -1, message: 'Invalid segment render request' }
    }
    const imagePath = resolveReadableMediaFile(scene.imagePath, {
      kind: 'image', allowedRoots: this.allowedMediaRoots, maxBytes: this.maxInputFileBytes,
    })
    const audioPath = resolveReadableMediaFile(scene.audioPath, {
      kind: 'audio', allowedRoots: this.allowedMediaRoots, maxBytes: this.maxInputFileBytes,
    })
    if (!imagePath || !audioPath) return { code: -1, message: 'Segment media path is not allowed or unreadable' }
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
    const audioDuration = await this._probeMediaDuration(audioPath)
    const reportedDuration = Number(scene.duration) || null
    const duration = reportedDuration && audioDuration ? audioDuration : reportedDuration
    const subtitleBlocks = normalizeSceneSubtitleBlocks(scene)
    const subtitleDuration = audioDuration || duration || clampNumber(options.defaultSceneDuration, 1, 60, 6)
    const subtitleTimeline = buildSubtitleTimeline(subtitleBlocks, subtitleDuration)
    try {
      await this._createSegment(imagePath, audioPath, destinationPath, {
        duration,
        subtitleText: options.subtitleEnabled === false ? '' : (scene.text || ''),
        subtitleTimeline: options.subtitleEnabled === false ? [] : subtitleTimeline,
        transition: options.transition || 'none',
        imageEffect: options.imageEffect || 'none',
        subtitleStyle: options.subtitleStyle,
        watermark: options.watermark,
        watermarkText: options.watermarkText,
        watermarkConfig: options.watermarkConfig,
        voiceVolume: clampNumber(options.voiceVolume, 0, 2, 1),
        ...parseResolution(options.resolution),
        fps: clampNumber(options.fps, 1, 120, 30),
      })
      const measuredDuration = await this._probeMediaDuration(destinationPath)
      const finalDuration = measuredDuration || audioDuration || duration
      return {
        code: 0,
        data: {
          videoPath: destinationPath,
          duration: finalDuration,
          subtitleBlocks,
          subtitleTimeline: buildSubtitleTimeline(subtitleBlocks, finalDuration),
        },
      }
    } catch (error) {
      try { fs.unlinkSync(destinationPath) } catch (_) { /* ignore */ }
      return { code: -1, message: error.message }
    }
  }

  /**
   * 清理单个 sessionDir（删除目录及所有内容）
   *
   * 注意：fs.rmSync({ recursive: true }) 在部分 Windows 环境静默失败（不抛错但未删除），
   * 改用手动递归删除（unlinkSync + rmdirSync）确保跨平台可靠。
   *
   * @param {string} sessionDir - session 目录路径
   * @private
   */
  _cleanupSession (sessionDir) {
    try {
      if (!fs.existsSync(sessionDir)) return
      const target = path.resolve(sessionDir)
      const outputRoot = path.resolve(this.outputDir)
      const canonicalTarget = fs.realpathSync.native(target)
      if (target === outputRoot || !isPathWithin(target, [outputRoot]) ||
          !isPathWithin(canonicalTarget, [outputRoot])) {
        this.log.warn('Story2VideoCompose', 'Refused to cleanup path outside outputDir: ' + target)
        return
      }
      this._rmSyncRecursive(sessionDir)
      this.log.info('Story2VideoCompose', 'Cleaned sessionDir: ' + path.basename(sessionDir))
    } catch (e) {
      this.log.warn('Story2VideoCompose', 'Failed to cleanup sessionDir: ' + e.message)
    }
  }

  /**
   * 递归删除目录（跨平台可靠实现）
   *
   * fs.rmSync({ recursive: true, force: true }) 在部分 Windows 环境静默失败，
   * 此方法手动遍历并删除每个文件再删除目录，确保删除生效。
   *
   * @param {string} dirPath - 要删除的目录
   * @private
   */
  _rmSyncRecursive (dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        this._rmSyncRecursive(fullPath)
      } else {
        fs.unlinkSync(fullPath)
      }
    }
    fs.rmdirSync(dirPath)
  }

  /**
   * 清理历史残留的 sessionDir（超过 maxSessionAgeMs 的 s2v_* 目录）
   * @param {number} [maxAgeMs] - 最大保留时间 ms（默认使用 this.maxSessionAgeMs）
   * @returns {number} 清理的目录数
   * @private
   */
  _cleanupOldSessions (maxAgeMs) {
    const maxAge = maxAgeMs || this.maxSessionAgeMs
    const now = Date.now()
    let cleaned = 0
    try {
      const entries = fs.readdirSync(this.outputDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (!entry.name.startsWith('s2v_')) continue
        const dirPath = path.join(this.outputDir, entry.name)
        try {
          const stat = fs.statSync(dirPath)
          if (now - stat.mtimeMs > maxAge) {
            this._cleanupSession(dirPath)
            if (!fs.existsSync(dirPath)) cleaned++
          }
        } catch (e) {
          // 单个目录清理失败不中断其他清理
          this.log.warn('Story2VideoCompose', 'Failed to stat/cleanup old session ' + entry.name + ': ' + e.message)
        }
      }
      if (cleaned > 0) {
        this.log.info('Story2VideoCompose', 'Cleaned ' + cleaned + ' old sessionDir(s)')
      }
    } catch (e) {
      this.log.warn('Story2VideoCompose', 'Failed to scan outputDir for old sessions: ' + e.message)
    }
    return cleaned
  }

  /**
   * 读取媒体真实时长；探测失败时返回 null，由调用方选择保守回退策略。
   * @private
   */
  async _probeMediaDuration (filePath) {
    if (!FFPROBE || !hasUsableFile(filePath)) return null
    try {
      const { stdout } = await execFileAsync(FFPROBE, [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath,
      ], { timeout: 30000, maxBuffer: 128 * 1024 })
      const duration = Number.parseFloat(String(stdout || '').trim())
      return Number.isFinite(duration) && duration > 0 ? duration : null
    } catch (e) {
      this.log.warn('Story2VideoCompose', 'Failed to probe media duration: ' + e.message)
      return null
    }
  }

  /**
   * 创建单个视频片段（图片 + 音频 + 可选字幕）
   * @private
   */
  async _createSegment (imagePath, audioPath, outputPath, opts) {
    const args = ['-y']

    // 动效帧数 = 时长 × 帧率；zoompan 需要 d=总帧数 才能产生连续动画
    const segmentFps = clampNumber(opts.fps, 1, 120, 30)
    const segmentDuration = Number(opts.duration) > 0
      ? Number(opts.duration)
      : clampNumber(opts.defaultSceneDuration, 1, 60, 6)
    const totalFrames = Math.max(1, Math.round(segmentDuration * segmentFps))
    const imageEffect = buildImageEffectFilter(opts.imageEffect, opts.width, opts.height, opts.fps, totalFrames)

    // 输入：有动效时用单帧图片输入（zoompan 自行生成 d 帧，-loop 1 会破坏帧计数）；
    // 无动效时保持图片循环（配合 fade/shortest 生成静态片段）。
    if (imageEffect) {
      args.push('-i', imagePath, '-i', audioPath)
    } else {
      args.push('-loop', '1', '-i', imagePath, '-i', audioPath)
    }

    // 字幕滤镜
    // 抖动修复：zoompan 亚像素采样会造成画面跳动。先把输入上采样到 2x 工作分辨率，
    // 在 2x 画布上执行 zoompan（s=2x 尺寸），再下采样回目标分辨率，帧间运动平滑。
    const filters = []
    if (imageEffect) {
      const workWidth = clampNumber(opts.width, 160, 4096) * 2
      const workHeight = clampNumber(opts.height, 160, 4096) * 2
      filters.push(buildScaleFilter(workWidth, workHeight))
      filters.push(buildImageEffectFilter(opts.imageEffect, workWidth, workHeight, opts.fps, totalFrames))
      filters.push(buildScaleFilter(opts.width, opts.height))
    } else {
      filters.push(buildScaleFilter(opts.width, opts.height))
    }
    const subtitleFilter = buildSubtitleFilter(
      Array.isArray(opts.subtitleTimeline) && opts.subtitleTimeline.length > 0
        ? opts.subtitleTimeline
        : opts.subtitleText,
      opts.subtitleStyle,
    )
    if (subtitleFilter) filters.push(subtitleFilter)
    const watermarkFilter = buildWatermarkFilter(opts)
    if (watermarkFilter) filters.push(watermarkFilter)

    // 单片段淡入；滑动转场由 concat 阶段的 xfade 处理。
    if (opts.transition === 'fade') {
      filters.push('fade=t=in:st=0:d=0.5')
    }

    if (filters.length > 0) {
      args.push('-vf', filters.join(','))
    }

    // 时长
    if (opts.duration && Number(opts.duration) > 0) {
      args.push('-t', String(clampNumber(opts.duration, 0.1, 3600, 3)))
    }

    const voiceVolume = clampNumber(opts.voiceVolume, 0, 2, 1)
    if (voiceVolume !== 1) args.push('-af', 'volume=' + voiceVolume.toFixed(3))

    // 编码
    args.push('-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p')
    args.push('-c:a', 'aac', '-b:a', '128k')
    args.push('-shortest', '-r', String(clampNumber(opts.fps, 1, 120, 30)))

    // 输出
    args.push(outputPath)

    const { stderr } = await execFileAsync(FFMPEG, args, { timeout: 30000, maxBuffer: 1024 * 1024 })
    if (!hasUsableFile(outputPath)) {
      throw new Error('ffmpeg did not produce output: ' + (stderr || '').slice(-200))
    }
  }

  /**
   * 拼接视频片段
   * @private
   */
  async _concatSegments (segments, outputPath, sessionDir, options) {
    const transition = options?.transition || 'none'
    const transitionName = TRANSITION_NAMES[transition]
    if (transitionName && segments.length > 1) {
      const durations = Array.isArray(options?.segmentDurations) ? options.segmentDurations : []
      const plan = buildTransitionPlan(durations, options?.transitionDuration)
      if (!plan.enabled) {
        this.log.warn('Story2VideoCompose', 'Segment durations are too short or unknown; falling back to concat without transition')
      } else {
      const inputArgs = []
      for (const segment of segments) inputArgs.push('-i', segment)

      const filterParts = []
      let currentVideo = '[0:v]'
      for (let index = 1; index < segments.length; index++) {
        const transitionStep = plan.transitions[index - 1]
        const nextVideo = '[v' + index + ']'
        filterParts.push(currentVideo + '[' + index + ':v]xfade=transition=' + transitionName +
          ':duration=' + transitionStep.duration.toFixed(3) + ':offset=' + transitionStep.offset.toFixed(3) + nextVideo)
        currentVideo = nextVideo
      }

      let currentAudio = '[0:a]'
      for (let index = 1; index < segments.length; index++) {
        const transitionStep = plan.transitions[index - 1]
        const nextAudio = '[a' + index + ']'
        filterParts.push(currentAudio + '[' + index + ':a]acrossfade=d=' +
          transitionStep.duration.toFixed(3) + ':c1=tri:c2=tri' + nextAudio)
        currentAudio = nextAudio
      }
      filterParts.push(currentAudio + 'anull[aout]')
      const args = ['-y', ...inputArgs, '-filter_complex', filterParts.join(';'),
        '-map', currentVideo, '-map', '[aout]',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', outputPath]
      const { stderr } = await execFileAsync(FFMPEG, args, { timeout: 120000, maxBuffer: 2 * 1024 * 1024 })
      if (!hasUsableFile(outputPath)) {
        throw new Error('ffmpeg xfade did not produce output: ' + (stderr || '').slice(-200))
      }
      return
      }
    }

    // 使用 concat demuxer
    const listFile = path.join(sessionDir, 'concat_list.txt')
    const listContent = segments.map(s => "file '" + s.replace(/\\/g, '/').replace(/'/g, "'\\''") + "'").join('\n')
    fs.writeFileSync(listFile, listContent, 'utf-8')

    const args = [
      '-y', '-f', 'concat', '-safe', '0',
      '-i', listFile,
      '-c', 'copy',
      outputPath,
    ]

    const { stderr } = await execFileAsync(FFMPEG, args, { timeout: 60000, maxBuffer: 1024 * 1024 })
    if (!hasUsableFile(outputPath)) {
      throw new Error('ffmpeg concat did not produce output: ' + (stderr || '').slice(-200))
    }
  }

  /** 将所有旁白解码后顺序拼接，避免旧实现只保留第一段音频。 */
  async _concatNarrationAudio (audioPaths, outputPath, _sessionDir, voiceVolume) {
    if (!Array.isArray(audioPaths) || audioPaths.length === 0) throw new Error('No narration audio')
    const inputs = []
    const labels = []
    for (let index = 0; index < audioPaths.length; index++) {
      inputs.push('-i', audioPaths[index])
      labels.push('[' + index + ':a]')
    }
    const normalizedVolume = clampNumber(voiceVolume, 0, 2, 1)
    const filter = labels.join('') + 'concat=n=' + audioPaths.length + ':v=0:a=1[concat]' +
      (normalizedVolume === 1 ? ';[concat]anull[aout]' : ';[concat]volume=' + normalizedVolume.toFixed(3) + '[aout]')
    const { stderr } = await execFileAsync(FFMPEG, [
      '-y', ...inputs,
      '-filter_complex', filter,
      '-map', '[aout]', '-c:a', 'aac', '-b:a', '128k',
      outputPath,
    ], { timeout: 120000, maxBuffer: 2 * 1024 * 1024 })
    if (!hasUsableFile(outputPath)) {
      throw new Error((stderr || 'ffmpeg did not produce narration audio').slice(-300))
    }
  }

  /** 将 BGM 按指定音量混入成片，BGM 不足时循环到视频结束。 */
  async _mixBgm (videoPath, bgmPath, outputPath, volume) {
    let level = Number(volume)
    if (level > 1) level /= 10
    level = clampNumber(level, 0, 1, 0.3)
    const filter = '[1:a]volume=' + level.toFixed(3) + '[bgm];' +
      '[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]'
    const { stderr } = await execFileAsync(FFMPEG, [
      '-y', '-i', videoPath, '-stream_loop', '-1', '-i', bgmPath,
      '-filter_complex', filter,
      '-map', '0:v:0', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-shortest', outputPath,
    ], { timeout: 120000, maxBuffer: 2 * 1024 * 1024 })
    if (!hasUsableFile(outputPath)) {
      throw new Error((stderr || 'ffmpeg did not produce mixed output').slice(-300))
    }
  }

  /** 将最终 MP4 中间产物转码为 WebM，保持 UI format 选项与输出一致。 */
  async _transcodeWebm (inputPath, outputPath) {
    const { stderr } = await execFileAsync(FFMPEG, [
      '-y', '-i', inputPath,
      '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0',
      '-c:a', 'libopus', '-b:a', '128k',
      outputPath,
    ], { timeout: 180000, maxBuffer: 2 * 1024 * 1024 })
    if (!hasUsableFile(outputPath)) {
      throw new Error((stderr || 'ffmpeg did not produce WebM output').slice(-300))
    }
  }

  /** 用 ffmpeg 解码检查输出是否为可播放视频。 */
  async _validateOutput (filePath) {
    if (!hasUsableFile(filePath)) throw new Error('file is missing or empty')
    const { stderr } = await execFileAsync(FFMPEG, [
      '-v', 'error', '-i', filePath, '-map', '0:v:0', '-f', 'null', '-',
    ], { timeout: 60000, maxBuffer: 512 * 1024 })
    if (stderr && stderr.trim()) throw new Error(stderr.trim().slice(-400))
  }
}

module.exports = {
  Story2VideoComposeEngine,
  findFfmpeg,
  findFfprobe,
  escapeSubtitleText,
  normalizeComposeScenes,
  buildTransitionPlan,
  buildImageEffectFilter,
  buildSubtitleFilter,
  buildWatermarkFilter,
  buildScaleFilter,
  parseResolution,
}
