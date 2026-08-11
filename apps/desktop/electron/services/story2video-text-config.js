// @ts-check
'use strict'

const { getLanguageBaseWordsPerSecond } = require('./story2video-voice-estimate')
const {
  PROMPT_ENGINE_PLATFORMS,
  PROMPT_ENGINE_STYLES,
  normalizePromptEnginePlatform,
  normalizePromptEngineStyle,
  assertNoSensitiveContext,
} = require('./prompt-engine-contract')

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
    targetCharsPerScene: 20,
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
    platform: 'generic',
    style: 'realistic',
    creativeLevel: 5,
    maxLength: 500,
    numCandidates: 1,
    autoDetectStyle: true,
    negativePrompt: '',
    context: '',
  }),
  // 场景上下文增强中间层（2026-08-11）：分句 → 提示词优化之间的故事背景上下文
  scene_context: Object.freeze({
    enabled: true,
    maxSummaryLength: 300,
    maxAnchors: 8,
    includeNegativeAnchors: true,
    contextBlockMaxChars: 400,
  }),
  image: Object.freeze({
    provider: '',
    model: '',
    style: 'cinematic',
    effect: 'zoom-in',
    aspectRatio: '9:16',
  }),
  // 视频+图片轮播混合模式（2026-08-11）：默认 off 保持纯图片轮播；fixed=前段固定比例 AI 视频；
  // ai-judged=LLM 按精彩度选择场景，总时长占比落在 [minRatio, maxRatio]。
  video: Object.freeze({
    mode: 'off',
    provider: '',
    model: '',
    fixedRatio: 25,
    minRatio: 20,
    maxRatio: 40,
    maxScenes: 3,
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
  transition: 'fade',
  sceneDurationMode: 'follow-audio',
  minSceneDuration: 6,
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
const SCENE_DURATION_MODES = new Set(['follow-audio', 'min-duration'])
const VIDEO_MODES = new Set(['off', 'fixed', 'ai-judged'])
const SPLIT_MODES = new Set(['fast', 'balanced', 'precise'])
const LANGUAGES = new Set(['auto', 'zh', 'en'])
const SUBTITLE_TIMINGS = new Set(['proportional', 'equal'])
const OUTPUT_FORMATS = new Set(['mp4', 'webm'])
const CONTENT_TYPES = new Set(['general', 'history'])
const CHECKPOINT_POLICIES = new Set(['guided', 'manual_all', 'auto_noncreative', 'none'])
// 图片提示词目标平台/风格：单一来源为 prompt-engine-contract（防多处漂移）
const STORY2VIDEO_IMAGE_PLATFORMS = PROMPT_ENGINE_PLATFORMS
const STORY2VIDEO_PROMPT_STYLES = PROMPT_ENGINE_STYLES
const ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4'])
const MAX_STORY2VIDEO_TEXT_UNICODE_CHARS = 6000
const STORY2VIDEO_TEXT_TOO_LONG_ERROR_CODE = 'story2video.text_too_long'
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
  const sceneContextInput = objectValue(suppliedConfig.scene_context)
  const imageInput = objectValue(suppliedConfig.image)
  const voiceInput = objectValue(suppliedConfig.voice)
  const subtitleInput = objectValue(suppliedConfig.subtitle)
  const bgmInput = objectValue(suppliedConfig.bgm)
  const watermarkInput = objectValue(suppliedConfig.watermark)
  const outputInput = objectValue(suppliedConfig.output)
  const videoInput = objectValue(suppliedConfig.video)
  const publishInput = objectValue(suppliedConfig.publish)

  // 先归一化语言（后续 split 对象内引用，避免 TDZ）
  const splitLanguage = enumValue(
    firstDefined(own(splitInput, 'language'), params.language),
    DEFAULT_STORY2VIDEO_TEXT_CONFIG.split.language,
    'split.language',
    LANGUAGES,
  )
  const split = {
    language: splitLanguage,
    mode: enumValue(firstDefined(own(splitInput, 'mode'), params.splitMode), 'balanced', 'split.mode', SPLIT_MODES),
    maxSentenceLength: numberValue(own(splitInput, 'maxSentenceLength'), 200, 'split.maxSentenceLength', 20, 1000, true),
    targetSeconds: numberValue(own(splitInput, 'targetSeconds'), 6, 'split.targetSeconds', 1, 60),
    // 语言感知基准语速（三层模型①，Batch 5a）：显式 baseWordsPerSecond 优先（renderer 已按语言下发），
    // 缺省时按语言选择（zh 4.5 / en 2.8 / 其余 3.3），旧配置自动兼容。
    baseWordsPerSecond: numberValue(own(splitInput, 'baseWordsPerSecond'), getLanguageBaseWordsPerSecond(splitLanguage), 'split.baseWordsPerSecond', 0.5, 10),
    // speechRate 单一来源（三层模型 P1，Batch 2）：由 voice.speed 派生，不再校验/接受独立值
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
  // 分镜字数主控（三层模型①）与 speechRate 单一来源在 voice 构建后计算（见下），
  // 使切分估算使用实际 TTS 语速。

  const optimizeContext = firstDefined(own(optimizeInput, 'context'), params.optimizeContext)
  const normalizeOptimizeContext = (value) => {
    if (value === undefined || value === null || value === '') return ''
    if (typeof value === 'string') {
      if (value.length > 20000) throw new Error('Story2Video optimize.context 超过 20000 字符')
      return value
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      assertNoSensitiveContext(value, 'optimize.context')
      return value
    }
    throw new Error('Story2Video optimize.context 必须是字符串或对象')
  }
  const optimize = {
    // 平台/风格与运行层一致：契约别名归一 + 非法回退默认（generic/realistic），旧值兼容不抛错
    platform: normalizePromptEnginePlatform(firstDefined(own(optimizeInput, 'platform'), params.promptPlatform)),
    style: normalizePromptEngineStyle(firstDefined(own(optimizeInput, 'style'), params.promptStyle, params.style)),
    creativeLevel: numberValue(firstDefined(own(optimizeInput, 'creativeLevel'), params.creativeLevel), 5, 'optimize.creativeLevel', 1, 10),
    maxLength: numberValue(firstDefined(own(optimizeInput, 'maxLength'), params.maxPromptLength), 500, 'optimize.maxLength', 50, 2000, true),
    numCandidates: numberValue(firstDefined(own(optimizeInput, 'numCandidates'), params.numCandidates), 1, 'optimize.numCandidates', 1, 5, true),
    autoDetectStyle: booleanValue(firstDefined(own(optimizeInput, 'autoDetectStyle'), params.autoDetectStyle), true),
    negativePrompt: textValue(own(optimizeInput, 'negativePrompt'), '', 'optimize.negativePrompt', 500),
    context: normalizeOptimizeContext(optimizeContext),
  }

  const sceneContext = {
    enabled: booleanValue(firstDefined(own(sceneContextInput, 'enabled'), params.sceneContextEnabled), true),
    maxSummaryLength: numberValue(firstDefined(own(sceneContextInput, 'maxSummaryLength'), params.sceneContextMaxSummaryLength), 300, 'scene_context.maxSummaryLength', 50, 1000, true),
    maxAnchors: numberValue(firstDefined(own(sceneContextInput, 'maxAnchors'), params.sceneContextMaxAnchors), 8, 'scene_context.maxAnchors', 1, 20, true),
    includeNegativeAnchors: booleanValue(firstDefined(own(sceneContextInput, 'includeNegativeAnchors'), params.sceneContextIncludeNegativeAnchors), true),
    contextBlockMaxChars: numberValue(firstDefined(own(sceneContextInput, 'contextBlockMaxChars'), params.sceneContextContextBlockMaxChars), 400, 'scene_context.contextBlockMaxChars', 50, 1000, true),
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

  // speechRate 单一来源（三层模型 P1，Batch 2）：切分估算与实际 TTS 语速一致，
  // 消除“切分按 1x、播报按 1.5x”脱节；voice.speed 已按 0.5..2 校验。
  split.speechRate = voice.speed
  // 分镜字数主控（三层模型①）：显式 targetCharsPerScene 优先；缺省时由 targetSeconds
  // （× baseWordsPerSecond × speechRate）换算并夹在 [max(minWords,1), min(maxWords,200)]
  // （与 1..200 契约一致，防止 maxWords 配到 500 时突破契约）。旧配置自动兼容。
  const computedTargetChars = Math.round(split.targetSeconds * split.baseWordsPerSecond * split.speechRate)
  const explicitChars = own(splitInput, 'targetCharsPerScene') !== undefined
    ? numberValue(own(splitInput, 'targetCharsPerScene'), DEFAULT_STORY2VIDEO_TEXT_CONFIG.split.targetCharsPerScene, 'split.targetCharsPerScene', 1, 200, true)
    : null
  if (explicitChars !== null && (explicitChars < split.minWords || explicitChars > split.maxWords)) {
    throw new Error('Story2Video split.targetCharsPerScene 必须在 [minWords=' + split.minWords + ', maxWords=' + split.maxWords + '] 范围内')
  }
  split.targetCharsPerScene = explicitChars !== null
    ? explicitChars
    : Math.min(Math.min(split.maxWords, 200), Math.max(Math.max(split.minWords, 1), computedTargetChars))
  // 统一以最终 targetCharsPerScene 反推 target_duration（= chars ÷ (bps × speechRate)，取整 1..60）：
  // 使主控经现有 8002 通道生效，且首次运行与保存重载一致（幂等）。
  split.targetSeconds = Math.min(60, Math.max(1, Math.round(split.targetCharsPerScene / (split.baseWordsPerSecond * split.speechRate))))

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

  // 视频+图片轮播混合模式（2026-08-11）：默认 off；fixed 用 fixedRatio（前段占比），
  // ai-judged 用 [minRatio, maxRatio] 约束 LLM 选择结果，maxScenes 兜底控制成本/耗时。
  const videoConfig = {
    mode: enumValue(firstDefined(own(videoInput, 'mode'), params.videoMode), 'off', 'video.mode', VIDEO_MODES),
    provider: idValue(firstDefined(own(videoInput, 'provider'), params.videoProvider), '', 'video.provider'),
    model: idValue(firstDefined(own(videoInput, 'model'), params.videoModel), '', 'video.model'),
    fixedRatio: numberValue(own(videoInput, 'fixedRatio'), 25, 'video.fixedRatio', 10, 50, true),
    minRatio: numberValue(own(videoInput, 'minRatio'), 20, 'video.minRatio', 5, 80, true),
    maxRatio: numberValue(own(videoInput, 'maxRatio'), 40, 'video.maxRatio', 5, 80, true),
    maxScenes: numberValue(own(videoInput, 'maxScenes'), 3, 'video.maxScenes', 1, 12, true),
  }
  if (videoConfig.minRatio > videoConfig.maxRatio) {
    throw new Error('Story2Video video.minRatio 不能大于 video.maxRatio')
  }

  // defaultSceneDuration 仅作为 compose 无可用音频时长时的回退与动效归一化兜底，不再暴露为可配置项。
  // 优先级：顶层运行参数 params.defaultSceneDuration > story2videoTextConfig 内嵌字段
  // （新保存的 story2videoTextConfig 已不含该字段，项目恢复走 _safeOptions 顶层通道）。
  const defaultSceneDuration = numberValue(
    firstDefined(params.defaultSceneDuration, own(suppliedConfig, 'defaultSceneDuration')),
    6,
    'defaultSceneDuration',
    1,
    60,
  )
  const transition = enumValue(firstDefined(own(suppliedConfig, 'transition'), params.transition), 'fade', 'transition', TRANSITIONS)
  // 场景时长模式（三层模型③）：follow-audio 跟随旁白（默认）；min-duration 以静音补齐到 minSceneDuration。
  const sceneDurationMode = enumValue(firstDefined(own(suppliedConfig, 'sceneDurationMode'), params.sceneDurationMode), 'follow-audio', 'sceneDurationMode', SCENE_DURATION_MODES)
  const minSceneDuration = numberValue(firstDefined(own(suppliedConfig, 'minSceneDuration'), params.minSceneDuration), 6, 'minSceneDuration', 1, 60)
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
    scene_context: sceneContext,
    image,
    video: videoConfig,
    voice,
    subtitle,
    bgm,
    transition,
    sceneDurationMode,
    minSceneDuration,
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
      // 仅供本地 fallback 切分直接消费；8002 经 _buildStorySplitterOptions 白名单不会收到该键。
      target_chars_per_scene: split.targetCharsPerScene,
      enforce_sentence_boundary: split.enforceSentenceBoundary,
      overflow_to_next: split.overflowToNext,
      subtitle_min_chars: split.subtitleMinChars,
      subtitle_max_chars: split.subtitleMaxChars,
      subtitle_timing: split.subtitleTiming,
    },
    domain_enrich: { contentType },
    scene_context: {
      enabled: sceneContext.enabled,
      max_summary_length: sceneContext.maxSummaryLength,
      max_anchors: sceneContext.maxAnchors,
      include_negative_anchors: sceneContext.includeNegativeAnchors,
      context_block_max_chars: sceneContext.contextBlockMaxChars,
    },
    optimize: {
      platform: optimize.platform,
      style: optimize.style,
      creative_level: optimize.creativeLevel,
      max_length: optimize.maxLength,
      num_candidates: optimize.numCandidates,
      auto_detect_style: optimize.autoDetectStyle,
      negative_prompt: optimize.negativePrompt,
      context: optimize.context || undefined,
    },
    generate_assets: {
      concurrency,
      imageStyle: image.style,
      imageProvider: image.provider || null,
      imageModel: image.model || null,
      aspectRatio: image.aspectRatio,
      videoMode: videoConfig.mode,
      video: {
        provider: videoConfig.provider || null,
        model: videoConfig.model || null,
        maxScenes: videoConfig.maxScenes,
      },
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
    select_video_scenes: {
      video: {
        mode: videoConfig.mode,
        provider: videoConfig.provider || null,
        model: videoConfig.model || null,
        fixedRatio: videoConfig.fixedRatio,
        minRatio: videoConfig.minRatio,
        maxRatio: videoConfig.maxRatio,
        maxScenes: videoConfig.maxScenes,
      },
    },
    compose: {
      transition,
      sceneDurationMode,
      minSceneDuration,
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
      defaultSceneDuration,
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
    background: params.background === true,
    checkpointPolicy: enumValue(params.checkpointPolicy, 'guided', 'checkpointPolicy', CHECKPOINT_POLICIES),
    mode: 'text',
    inputMode: 'text',
    text: prompt,
    images: [],
    audio: [],
    video: null,
    videoMode: videoConfig.mode,
    videoConfig,
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
    defaultSceneDuration,
    sceneDurationMode,
    minSceneDuration,
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

