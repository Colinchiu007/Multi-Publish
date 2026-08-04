// @ts-check
'use strict'

const STORY2VIDEO_TEXT_CONFIG_VERSION = 1
const STORY2VIDEO_PIPELINE = 'story2video-compose'

const DEFAULT_STORY2VIDEO_TEXT_CONFIG = Object.freeze({
  version: STORY2VIDEO_TEXT_CONFIG_VERSION,
  mode: 'text',
  prompt: '',
  size: '720x1280',
  contentType: 'general',
  split: Object.freeze({
    language: 'auto',
    mode: 'balanced',
    maxSentenceLength: 200,
    targetSeconds: 6,
    baseWordsPerSecond: 3.3,
    speechRate: 1,
    minWords: 10,
    maxWords: 50,
    enforceSentenceBoundary: true,
    overflowToNext: true,
    subtitleMinChars: 8,
    subtitleMaxChars: 15,
    subtitleTiming: 'proportional',
  }),
  optimize: Object.freeze({
    style: 'realistic',
    creativeLevel: 5,
    negativePrompt: '',
  }),
  image: Object.freeze({
    provider: '',
    model: '',
    style: 'cinematic',
    effect: 'zoom-in',
    aspectRatio: '9:16',
  }),
  voice: Object.freeze({
    provider: '',
    model: '',
    id: 'default',
    speed: 1,
    volume: 1,
    pitch: 0,
    emotion: 'default',
  }),
  subtitle: Object.freeze({
    enabled: false,
    font: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    size: 'size3',
    style: 'style1',
    color: 'white',
  }),
  bgm: Object.freeze({ enabled: false, path: '', volume: 5 }),
  perImageDuration: 6,
  transition: 'fade',
  templateId: '',
  concurrency: 3,
  watermark: Object.freeze({
    enabled: false,
    text: '',
    position: 'bottom-right',
    fontSize: 24,
    opacity: 0.6,
    color: 'white',
  }),
  output: Object.freeze({ fps: 30, format: 'mp4' }),
  publish: Object.freeze({
    enabled: false,
    platforms: Object.freeze([]),
    title: '',
    content: '',
    tags: Object.freeze([]),
    coverUrl: '',
  }),
})

const IMAGE_EFFECTS = new Set([
  'none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down',
  'zoom-pan', 'rotate', 'blur-in',
])
const TRANSITIONS = new Set(['none', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down'])
const SPLIT_MODES = new Set(['fast', 'balanced', 'precise'])
const LANGUAGES = new Set(['auto', 'zh', 'en'])
const SUBTITLE_TIMINGS = new Set(['proportional', 'equal'])
const OUTPUT_FORMATS = new Set(['mp4', 'webm'])
const CONTENT_TYPES = new Set(['general', 'history'])
const CHECKPOINT_POLICIES = new Set(['guided', 'manual_all', 'auto_noncreative', 'none'])
const STORY2VIDEO_PROMPT_STYLES = new Set([
  'realistic', 'cartoon', 'anime', 'oil_painting', 'watercolor', 'pixel',
  'cyberpunk', 'fantasy', 'photography', '3d_render', 'minimalist', 'abstract',
  'portrait', 'landscape',
])
const STORY2VIDEO_PROMPT_STYLE_ALIASES = Object.freeze({
  cinematic: 'photography',
  '3d-render': '3d_render',
})
const ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4'])
const MAX_STORY2VIDEO_TEXT_UNICODE_CHARS = 6000
const STORY2VIDEO_TEXT_TOO_LONG_ERROR_CODE = 'story2video.text_too_long'
const SENSITIVE_CONTEXT_KEYS = new Set([
  'api_key', 'access_token', 'refresh_token', 'auth_token', 'bearer_token', 'token',
  'secret', 'secret_key', 'client_secret', 'app_secret', 'password', 'authorization',
  'credential', 'credentials', 'private_key',
])
const SUBTITLE_SIZE_MAP = Object.freeze({
  size1: 'size1', size2: 'size2', size3: 'size3', size4: 'size4', size5: 'size5', size6: 'size6',
  sm: 'sm', md: 'md', lg: 'lg', xl: 'xl',
})

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function own(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null)
}

function countStory2VideoTextCharacters(value) {
  return Array.from(String(value || '')).length
}

function story2VideoTextTooLongError() {
  /** @type {Error & { code?: string, params?: { max: number } }} */
  const error = new Error('Story2Video 文案最多 ' + MAX_STORY2VIDEO_TEXT_UNICODE_CHARS + ' 个 Unicode 字符')
  error.code = STORY2VIDEO_TEXT_TOO_LONG_ERROR_CODE
  error.params = { max: MAX_STORY2VIDEO_TEXT_UNICODE_CHARS }
  return error
}

function textValue(value, fallback, field, maxLength = 20000) {
  const result = value === undefined || value === null ? fallback : String(value)
  if (result.length > maxLength) throw new Error(`Story2Video ${field} 超过 ${maxLength} 字符`)
  return result
}

function idValue(value, fallback, field) {
  const result = textValue(value, fallback, field, 120).trim()
  if (result && !/^[a-zA-Z0-9._:@/-]+$/.test(result)) {
    throw new Error(`Story2Video ${field} 格式无效`)
  }
  return result
}

function numberValue(value, fallback, field, min, max, integer = false) {
  const candidate = value === undefined || value === null || value === '' ? fallback : Number(value)
  if (!Number.isFinite(candidate) || candidate < min || candidate > max || (integer && !Number.isInteger(candidate))) {
    throw new Error(`Story2Video ${field} 必须在 ${min}-${max} 范围内`)
  }
  return candidate
}

function booleanValue(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function enumValue(value, fallback, field, allowed) {
  const candidate = value === undefined || value === null || value === '' ? fallback : String(value)
  if (!allowed.has(candidate)) throw new Error(`Story2Video ${field} 值无效: ${candidate}`)
  return candidate
}

function promptStyleValue(value, fallback, field, allowed, aliases) {
  const candidate = idValue(value, fallback, field)
  const normalized = aliases[candidate] || candidate
  if (!allowed.has(normalized)) throw new Error(`Story2Video ${field} 不支持的视觉提示词风格: ${candidate}`)
  return normalized
}

function stringArray(value, field, maxItems = 20) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`Story2Video ${field} 必须是最多 ${maxItems} 项的数组`)
  }
  return value.map((item, index) => textValue(item, '', `${field}[${index}]`, 120).trim()).filter(Boolean)
}

function assertEmptyMediaArray(value, field) {
  if (value === undefined || value === null) return
  if (!Array.isArray(value)) throw new Error(`Story2Video ${field} 必须是数组`)
  if (value.length > 0) throw new Error('Story2Video 标准流水线只支持 text 模式')
}

function normalizedKey(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
}

function assertNoSensitiveContext(value, field, seen = new WeakSet(), depth = 0) {
  if (!value || typeof value !== 'object') return
  if (depth > 32) throw new Error(`Story2Video ${field} 层级过深`)
  if (seen.has(value)) return
  seen.add(value)
  for (const key of Object.keys(value)) {
    if (SENSITIVE_CONTEXT_KEYS.has(normalizedKey(key))) {
      throw new Error(`Story2Video ${field} 不得包含敏感凭据字段: ${key}`)
    }
    assertNoSensitiveContext(value[key], `${field}.${key}`, seen, depth + 1)
  }
}

function normalizeSize(value) {
  const size = textValue(value, DEFAULT_STORY2VIDEO_TEXT_CONFIG.size, 'size', 32).trim()
  const match = /^(\d{2,4})x(\d{2,4})$/.exec(size)
  if (!match) throw new Error('Story2Video size 必须使用 WIDTHxHEIGHT 格式')
  const width = Number(match[1])
  const height = Number(match[2])
  if (width < 160 || width > 7680 || height < 160 || height > 7680) {
    throw new Error('Story2Video size 超出 160-7680 像素范围')
  }
  return `${width}x${height}`
}

function deriveAspectRatio(size) {
  const [width, height] = size.split('x').map(Number)
  if (width === height) return '1:1'
  if (width * 9 === height * 16) return '16:9'
  if (width * 16 === height * 9) return '9:16'
  if (width * 3 === height * 4) return '4:3'
  if (width * 4 === height * 3) return '3:4'
  return `${width}:${height}`
}

function normalizeAspectRatio(value, size) {
  const derivedRatio = deriveAspectRatio(size)
  const ratio = textValue(value, derivedRatio, 'image.aspectRatio', 32).trim()
  const normalizedRatio = enumValue(ratio, derivedRatio, 'image.aspectRatio', ASPECT_RATIOS)
  if (normalizedRatio !== derivedRatio) {
    throw new Error('Story2Video image.aspectRatio 必须与输出分辨率匹配')
  }
  return derivedRatio
}

function normalizeSubtitleSize(value) {
  const key = textValue(value, DEFAULT_STORY2VIDEO_TEXT_CONFIG.subtitle.size, 'subtitle.size', 16)
  const mapped = SUBTITLE_SIZE_MAP[key]
  if (!mapped) throw new Error(`Story2Video subtitle.size 值无效: ${key}`)
  return { source: key, compose: mapped }
}

/**
 * 将 renderer 或旧扁平参数转换为唯一的 text 模式运行合同。
 * 返回值只包含白名单字段，Provider Secret 不会进入运行或项目清单。
 */
function normalizeStory2VideoTextParams(params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('Story2Video 参数必须是纯 JSON 对象')
  }
  assertNoSensitiveContext(params.initialContext, 'initialContext')
  assertNoSensitiveContext(params.context, 'context')

  const suppliedConfig = objectValue(params.story2videoTextConfig)
  const suppliedVersion = own(suppliedConfig, 'version')
  if (suppliedVersion !== undefined && suppliedVersion !== STORY2VIDEO_TEXT_CONFIG_VERSION) {
    throw new Error(`Story2Video text 配置版本不受支持: ${suppliedVersion}`)
  }
  const mode = textValue(firstDefined(own(suppliedConfig, 'mode'), params.mode, params.inputMode), 'text', 'mode', 16)
  if (mode !== 'text') throw new Error('Story2Video 标准流水线只支持 text 模式')
  assertEmptyMediaArray(own(params, 'images'), 'images')
  assertEmptyMediaArray(own(params, 'audio'), 'audio')
  const video = own(params, 'video')
  if (video !== undefined && video !== null && video !== '') {
    throw new Error('Story2Video 标准流水线只支持 text 模式')
  }

  const suppliedPrompt = own(suppliedConfig, 'prompt')
  const suppliedText = firstDefined(params.text, suppliedPrompt)
  if (countStory2VideoTextCharacters(String(suppliedText || '').trim()) > MAX_STORY2VIDEO_TEXT_UNICODE_CHARS) {
    throw story2VideoTextTooLongError()
  }
  if (suppliedPrompt !== undefined && suppliedPrompt !== null && countStory2VideoTextCharacters(String(suppliedPrompt).trim()) > MAX_STORY2VIDEO_TEXT_UNICODE_CHARS) {
    throw story2VideoTextTooLongError()
  }
  const text = textValue(suppliedText, '', 'text').trim()
  if (!text) throw new Error('Story2Video 文案不能为空')
  const prompt = suppliedPrompt === undefined || suppliedPrompt === null || String(suppliedPrompt).trim() === ''
    ? text
    : textValue(suppliedPrompt, text, 'prompt').trim()
  if (prompt !== text) throw new Error('Story2Video text 与 story2videoTextConfig.prompt 必须一致')

  const size = normalizeSize(firstDefined(own(suppliedConfig, 'size'), params.resolution, params.output?.resolution))
  const splitInput = objectValue(suppliedConfig.split)
  const optimizeInput = objectValue(suppliedConfig.optimize)
  const imageInput = objectValue(suppliedConfig.image)
  const voiceInput = objectValue(suppliedConfig.voice)
  const subtitleInput = objectValue(suppliedConfig.subtitle)
  const bgmInput = objectValue(suppliedConfig.bgm)
  const watermarkInput = objectValue(suppliedConfig.watermark)
  const outputInput = objectValue(suppliedConfig.output)
  const publishInput = objectValue(suppliedConfig.publish)

  const split = {
    language: enumValue(firstDefined(own(splitInput, 'language'), params.language), DEFAULT_STORY2VIDEO_TEXT_CONFIG.split.language, 'split.language', LANGUAGES),
    mode: enumValue(firstDefined(own(splitInput, 'mode'), params.splitMode), 'balanced', 'split.mode', SPLIT_MODES),
    maxSentenceLength: numberValue(own(splitInput, 'maxSentenceLength'), 200, 'split.maxSentenceLength', 20, 1000, true),
    targetSeconds: numberValue(own(splitInput, 'targetSeconds'), 6, 'split.targetSeconds', 1, 60),
    baseWordsPerSecond: numberValue(own(splitInput, 'baseWordsPerSecond'), 3.3, 'split.baseWordsPerSecond', 0.5, 10),
    speechRate: numberValue(own(splitInput, 'speechRate'), 1, 'split.speechRate', 0.5, 2),
    minWords: numberValue(own(splitInput, 'minWords'), 10, 'split.minWords', 1, 200, true),
    maxWords: numberValue(own(splitInput, 'maxWords'), 50, 'split.maxWords', 1, 500, true),
    enforceSentenceBoundary: booleanValue(own(splitInput, 'enforceSentenceBoundary'), true),
    overflowToNext: booleanValue(own(splitInput, 'overflowToNext'), true),
    subtitleMinChars: numberValue(own(splitInput, 'subtitleMinChars'), 8, 'split.subtitleMinChars', 1, 100, true),
    subtitleMaxChars: numberValue(own(splitInput, 'subtitleMaxChars'), 15, 'split.subtitleMaxChars', 1, 200, true),
    subtitleTiming: enumValue(own(splitInput, 'subtitleTiming'), 'proportional', 'split.subtitleTiming', SUBTITLE_TIMINGS),
  }
  if (split.minWords > split.maxWords) throw new Error('Story2Video split.minWords 不能大于 split.maxWords')
  if (split.subtitleMinChars > split.subtitleMaxChars) {
    throw new Error('Story2Video split.subtitleMinChars 不能大于 subtitleMaxChars')
  }

  const optimize = {
    style: promptStyleValue(
      firstDefined(own(optimizeInput, 'style'), params.promptStyle, params.style),
      'realistic', 'optimize.style', STORY2VIDEO_PROMPT_STYLES, STORY2VIDEO_PROMPT_STYLE_ALIASES,
    ),
    creativeLevel: numberValue(firstDefined(own(optimizeInput, 'creativeLevel'), params.creativeLevel), 5, 'optimize.creativeLevel', 1, 10),
    negativePrompt: textValue(own(optimizeInput, 'negativePrompt'), '', 'optimize.negativePrompt', 500),
  }

  const image = {
    provider: idValue(firstDefined(own(imageInput, 'provider'), params.imageProvider), '', 'image.provider'),
    model: idValue(firstDefined(own(imageInput, 'model'), params.imageModel), '', 'image.model'),
    style: idValue(firstDefined(own(imageInput, 'style'), params.imageStyle), 'cinematic', 'image.style'),
    effect: enumValue(firstDefined(own(imageInput, 'effect'), params.imageEffect), 'zoom-in', 'image.effect', IMAGE_EFFECTS),
    aspectRatio: normalizeAspectRatio(firstDefined(own(imageInput, 'aspectRatio'), params.aspectRatio), size),
  }

  const voice = {
    provider: idValue(firstDefined(own(voiceInput, 'provider'), params.voiceProvider), '', 'voice.provider'),
    model: idValue(firstDefined(own(voiceInput, 'model'), params.voiceModel), '', 'voice.model'),
    id: idValue(firstDefined(own(voiceInput, 'id'), params.voiceId), DEFAULT_STORY2VIDEO_TEXT_CONFIG.voice.id, 'voice.id'),
    speed: numberValue(firstDefined(own(voiceInput, 'speed'), params.voiceSpeed), 1, 'voice.speed', 0.5, 2),
    volume: numberValue(firstDefined(own(voiceInput, 'volume'), params.voiceVolume), 1, 'voice.volume', 0, 2),
    pitch: numberValue(firstDefined(own(voiceInput, 'pitch'), params.voicePitch), 0, 'voice.pitch', -12, 12),
    emotion: idValue(firstDefined(own(voiceInput, 'emotion'), params.voiceEmotion), 'default', 'voice.emotion'),
  }

  const subtitleSize = normalizeSubtitleSize(firstDefined(own(subtitleInput, 'size'), params.subtitleStyle?.size))
  const subtitle = {
    enabled: booleanValue(firstDefined(own(subtitleInput, 'enabled'), params.subtitleEnabled), false),
    font: textValue(firstDefined(own(subtitleInput, 'font'), params.subtitleStyle?.font), DEFAULT_STORY2VIDEO_TEXT_CONFIG.subtitle.font, 'subtitle.font', 240),
    size: subtitleSize.source,
    style: idValue(firstDefined(own(subtitleInput, 'style'), params.subtitleStyle?.style), 'style1', 'subtitle.style'),
    color: textValue(firstDefined(own(subtitleInput, 'color'), params.subtitleStyle?.color), 'white', 'subtitle.color', 32),
  }

  const hasNestedBgm = Object.keys(bgmInput).length > 0
  const legacyBgmVolume = params.bgmVolume === undefined ? undefined : Number(params.bgmVolume) * 10
  const bgm = {
    enabled: booleanValue(own(bgmInput, 'enabled'), Boolean(firstDefined(own(bgmInput, 'path'), params.bgmPath))),
    path: textValue(firstDefined(own(bgmInput, 'path'), params.bgmPath), '', 'bgm.path', 4096),
    volume: numberValue(firstDefined(own(bgmInput, 'volume'), hasNestedBgm ? undefined : legacyBgmVolume), 5, 'bgm.volume', 0, 10),
  }

  const perImageDuration = numberValue(
    firstDefined(own(suppliedConfig, 'perImageDuration'), params.defaultSceneDuration),
    6,
    'perImageDuration',
    1,
    60,
  )
  const transition = enumValue(firstDefined(own(suppliedConfig, 'transition'), params.transition), 'fade', 'transition', TRANSITIONS)
  const contentType = enumValue(firstDefined(own(suppliedConfig, 'contentType'), params.contentType), 'general', 'contentType', CONTENT_TYPES)
  const templateId = idValue(firstDefined(own(suppliedConfig, 'templateId'), params.templateId), '', 'templateId')
  const concurrency = numberValue(firstDefined(own(suppliedConfig, 'concurrency'), params.concurrency), 3, 'concurrency', 1, 8, true)
  const watermark = {
    enabled: booleanValue(firstDefined(own(watermarkInput, 'enabled'), params.watermark), false),
    text: textValue(firstDefined(own(watermarkInput, 'text'), params.watermarkText), '', 'watermark.text', 200),
    position: idValue(firstDefined(own(watermarkInput, 'position'), params.watermarkConfig?.position), 'bottom-right', 'watermark.position'),
    fontSize: numberValue(firstDefined(own(watermarkInput, 'fontSize'), params.watermarkConfig?.fontSize), 24, 'watermark.fontSize', 10, 96),
    opacity: numberValue(firstDefined(own(watermarkInput, 'opacity'), params.watermarkConfig?.opacity), 0.6, 'watermark.opacity', 0, 1),
    color: textValue(firstDefined(own(watermarkInput, 'color'), params.watermarkConfig?.color), 'white', 'watermark.color', 32),
  }
  const output = {
    fps: numberValue(firstDefined(own(outputInput, 'fps'), params.fps, params.output?.fps), 30, 'output.fps', 1, 120, true),
    format: enumValue(firstDefined(own(outputInput, 'format'), params.format, params.output?.format), 'mp4', 'output.format', OUTPUT_FORMATS),
  }
  const publish = {
    enabled: booleanValue(firstDefined(own(publishInput, 'enabled'), params.publishEnabled), false),
    platforms: stringArray(firstDefined(own(publishInput, 'platforms'), params.platforms), 'publish.platforms'),
    title: textValue(firstDefined(own(publishInput, 'title'), params.title), '', 'publish.title', 200),
    content: textValue(firstDefined(own(publishInput, 'content'), params.content), prompt, 'publish.content', 20000),
    tags: stringArray(firstDefined(own(publishInput, 'tags'), params.tags), 'publish.tags', 30),
    coverUrl: textValue(own(publishInput, 'coverUrl'), '', 'publish.coverUrl', 4096),
  }

  const config = {
    version: STORY2VIDEO_TEXT_CONFIG_VERSION,
    mode: 'text',
    prompt,
    size,
    contentType,
    split,
    optimize,
    image,
    voice,
    subtitle,
    bgm,
    perImageDuration,
    transition,
    templateId,
    concurrency,
    watermark,
    output,
    publish,
  }

  const normalizedBgmVolume = bgm.volume / 10
  const subtitleStyle = {
    font: subtitle.font,
    size: subtitleSize.compose,
    style: subtitle.style,
    color: subtitle.color,
  }
  const stageOptions = {
    split: {
      language: split.language,
      mode: split.mode,
      max_sentence_length: split.maxSentenceLength,
      target_duration: split.targetSeconds,
      base_words_per_second: split.baseWordsPerSecond,
      speech_rate: split.speechRate,
      min_words: split.minWords,
      max_words: split.maxWords,
      enforce_sentence_boundary: split.enforceSentenceBoundary,
      overflow_to_next: split.overflowToNext,
      subtitle_min_chars: split.subtitleMinChars,
      subtitle_max_chars: split.subtitleMaxChars,
      subtitle_timing: split.subtitleTiming,
    },
    domain_enrich: { contentType },
    optimize: {
      style: optimize.style,
      creative_level: optimize.creativeLevel,
      negative_prompt: optimize.negativePrompt,
    },
    generate_assets: {
      concurrency,
      imageStyle: image.style,
      imageProvider: image.provider || null,
      imageModel: image.model || null,
      aspectRatio: image.aspectRatio,
      voiceId: voice.id,
      voiceProvider: voice.provider || null,
      voiceModel: voice.model || null,
      voiceSpeed: voice.speed,
      voicePitch: voice.pitch,
      voiceEmotion: voice.emotion,
      contentType,
      inputMode: 'text',
      templateId: templateId || null,
    },
    compose: {
      transition,
      imageEffect: image.effect,
      subtitleEnabled: subtitle.enabled,
      subtitleStyle,
      bgmPath: bgm.enabled && bgm.path ? bgm.path : null,
      bgmVolume: normalizedBgmVolume,
      watermark: watermark.enabled && Boolean(watermark.text),
      watermarkText: watermark.text,
      watermarkConfig: watermark,
      voiceVolume: voice.volume,
      templateId: templateId || null,
      resolution: size,
      fps: output.fps,
      format: output.format,
      defaultSceneDuration: perImageDuration,
    },
    publish: {
      publishEnabled: publish.enabled || publish.platforms.length > 0,
      platforms: publish.platforms,
      title: publish.title,
      content: publish.content,
      tags: publish.tags,
      coverUrl: publish.coverUrl,
    },
  }

  return {
    initialContext: params.initialContext,
    context: params.context,
    autoAdvance: params.autoAdvance === true,
    checkpointPolicy: enumValue(params.checkpointPolicy, 'guided', 'checkpointPolicy', CHECKPOINT_POLICIES),
    mode: 'text',
    inputMode: 'text',
    text: prompt,
    images: [],
    audio: [],
    video: null,
    size,
    contentType,
    splitMode: split.mode,
    language: split.language,
    promptStyle: optimize.style,
    creativeLevel: optimize.creativeLevel,
    imageStyle: image.style,
    imageProvider: image.provider || null,
    imageModel: image.model || null,
    aspectRatio: image.aspectRatio,
    voiceId: voice.id,
    voiceProvider: voice.provider || null,
    voiceModel: voice.model || null,
    voiceSpeed: voice.speed,
    voicePitch: voice.pitch,
    voiceEmotion: voice.emotion,
    voiceVolume: voice.volume,
    concurrency,
    templateId: templateId || null,
    defaultSceneDuration: perImageDuration,
    perImageDuration,
    imageEffect: image.effect,
    transition,
    subtitleEnabled: subtitle.enabled,
    subtitleStyle,
    bgmPath: bgm.enabled && bgm.path ? bgm.path : null,
    bgmVolume: normalizedBgmVolume,
    watermark: watermark.enabled && Boolean(watermark.text),
    watermarkText: watermark.text,
    watermarkConfig: watermark,
    resolution: size,
    fps: output.fps,
    format: output.format,
    platforms: publish.platforms,
    publishEnabled: publish.enabled || publish.platforms.length > 0,
    title: publish.title,
    content: publish.content,
    tags: publish.tags,
    coverUrl: publish.coverUrl,
    output: { resolution: size, fps: output.fps, format: output.format },
    stageOptions,
    story2videoTextConfig: config,
  }
}

module.exports = {
  DEFAULT_STORY2VIDEO_TEXT_CONFIG,
  STORY2VIDEO_PIPELINE,
  STORY2VIDEO_TEXT_CONFIG_VERSION,
  MAX_STORY2VIDEO_TEXT_UNICODE_CHARS,
  countStory2VideoTextCharacters,
  normalizeStory2VideoTextParams,
}
