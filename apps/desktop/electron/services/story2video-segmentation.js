// @ts-check
'use strict'

/**
 * Story2Video 双层分句合同（服务场景 + 本地字幕块）与离线降级。
 *
 * v0.15.2 起：本地分句/字幕算法统一委托 story2video-segmentation-engine（JS 镜像，
 * 逐行对齐 packages/story2video-engine/src/text-segmentation.ts，规则读 subtitle-rules.json 单源）。
 * 分句引擎（smart-sentence-splitter :8002）在线时，场景内字幕直接采用引擎返回的
 * scenes[].subtitles（subtitleSource='smart-sentence-splitter'），不再本地重切。
 */

const {
  normalizeSegmentationOptions,
  splitScenesLocally: splitScenesLocallyEngine,
  splitTextToScenes,
  splitTextToSubtitles,
} = require('./story2video-segmentation-engine')

const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
])

function finiteNumber (value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeText (value) {
  return String(value || '').replace(/\s+/gu, ' ').trim()
}

function errorMessage (error) {
  const detail = error && (error.message || error.error || error.detail)
  if (detail instanceof Error) return detail.message
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    try { return JSON.stringify(detail) } catch (_) { /* fall through */ }
  }
  return String(detail || error || '服务不可用')
}

function fallbackReason (error) {
  const code = error && typeof error.code === 'string' ? error.code : ''
  const message = errorMessage(error)
  const combined = code && !message.includes(code) ? code + ': ' + message : message
  return combined.slice(0, 300)
}

function isSplitterUnavailableError (error) {
  let current = error
  for (let depth = 0; current && depth < 4; depth++) {
    if (UNAVAILABLE_CODES.has(String(current.code || '').toUpperCase())) return true
    const message = errorMessage(current)
    if (/splitterbridge is not running/i.test(message) ||
        /splitterbridge request timeout/i.test(message) ||
        /\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EPIPE)\b/i.test(message) ||
        /socket hang up/i.test(message)) {
      return true
    }
    current = current.cause || current.innerError
  }
  return false
}

function sceneTextOf (scene) {
  if (typeof scene === 'string') return normalizeText(scene)
  if (!scene || typeof scene !== 'object') return ''
  return normalizeText(scene.text || scene.content || scene.sentence)
}

/** 引擎字幕最小覆盖率：低于该值视为残缺，回退本地分块（防静默丢内容）。 */
const ENGINE_SUBTITLE_MIN_COVERAGE = 0.6

/** 覆盖率：去空白与标点后，引擎字幕拼接长度 / 场景文本长度（0..1）。 */
function engineSubtitleCoverage (text, subtitles) {
  const clean = (value) => String(value || '').replace(/[\s。！？；，、.!?;…“”‘’（）《》【】「」『』"']+/gu, '')
  const total = clean(text).length
  if (!total) return 1
  return clean(subtitles.join('')).length / total
}

/**
 * 为场景附加字幕块与来源标记。
 * 引擎字幕优先（scenes[].subtitles[].text）；缺字幕或覆盖率不足（残缺）时回退本地 v0.15.2 分块。
 */
function withSubtitleBlocks (scene, index, source, degraded, reason, options) {
  const text = sceneTextOf(scene)
  if (!text) throw new Error('分句结果包含空场景文本，无法生成字幕')
  const sceneObj = scene && typeof scene === 'object' && !Array.isArray(scene) ? scene : {}
  const { subtitles: rawSubtitles, ...rest } = sceneObj
  const engineSubtitles = Array.isArray(rawSubtitles)
    ? rawSubtitles
      .map((item) => (item && typeof item === 'object' ? item.text : item))
      .map((value) => String(value || '').trim())
      .filter(Boolean)
    : []
  const useEngineSubtitles = engineSubtitles.length > 0 &&
    engineSubtitleCoverage(text, engineSubtitles) >= ENGINE_SUBTITLE_MIN_COVERAGE
  return {
    ...rest,
    index,
    text,
    subtitleBlocks: useEngineSubtitles ? engineSubtitles : splitSubtitleBlocks(text, options),
    sceneSource: source,
    subtitleSource: useEngineSubtitles ? 'smart-sentence-splitter' : 'local-typescript',
    degraded,
    ...(reason ? { fallbackReason: reason } : {}),
  }
}

/** 归一化分句引擎响应：场景来自引擎，字幕优先引擎返回、缺省本地 v0.15.2。 */
function normalizeServiceSplitResult (output, options = {}) {
  if (!output || typeof output !== 'object' || !Array.isArray(output.scenes) || output.scenes.length === 0) {
    throw new Error('smart-sentence-splitter 响应缺少有效 scenes 场景数组')
  }
  const scenes = output.scenes.map((scene, index) => (
    withSubtitleBlocks(scene, index, 'smart-sentence-splitter', false, '', options)
  ))
  const subtitleSource = scenes.some((scene) => scene.subtitleSource === 'smart-sentence-splitter')
    ? 'smart-sentence-splitter'
    : 'local-typescript'
  return {
    ...output,
    source: 'smart-sentence-splitter',
    sceneSource: 'smart-sentence-splitter',
    subtitleSource,
    degraded: false,
    scenes,
    sentences: Array.isArray(output.sentences) ? output.sentences : scenes.map((scene) => scene.text),
  }
}

/** 分句引擎离线降级：本地 v0.15.2 算法（与引擎 TS 镜像语义一致）。 */
function createLocalSplitResult (text, options = {}, error) {
  const split = splitScenesLocally(text, options)
  if (split.scenes.length === 0) throw new Error('本地场景分句未生成有效结果')
  const reason = fallbackReason(error)
  const scenes = split.scenes.map((scene, index) => (
    withSubtitleBlocks(scene, index, 'local-typescript-fallback', true, reason, options)
  ))
  return {
    source: 'local-typescript-fallback',
    sceneSource: 'local-typescript-fallback',
    subtitleSource: 'local-typescript',
    degraded: true,
    fallbackReason: reason,
    scenes,
    sentences: split.sentences,
  }
}

function speechWeight (text) {
  return Array.from(String(text || '')).reduce((weight, char) => {
    if (/\s/u.test(char)) return weight
    if (/[。！？!?；;]/u.test(char)) return weight + 1.8
    if (/[，,、：:]/u.test(char)) return weight + 1.35
    return weight + 1
  }, 0)
}

/** 按字幕文本权重把每个场景的真实音频时长完整、连续地分配给字幕页。 */
function buildSubtitleTimeline (blocksOrText, totalDuration, options = {}) {
  const blocks = Array.isArray(blocksOrText)
    ? blocksOrText.map(item => normalizeText(typeof item === 'string' ? item : item?.text)).filter(Boolean)
    : splitSubtitleBlocks(blocksOrText, options)
  if (blocks.length === 0) return []
  const duration = Math.max(0, finiteNumber(totalDuration, 0))
  const weights = blocks.map(speechWeight)
  const totalWeight = weights.reduce((sum, value) => sum + value, 0)
  let currentTime = 0

  return blocks.map((text, index) => {
    const blockDuration = totalWeight > 0
      ? duration * weights[index] / totalWeight
      : duration / blocks.length
    const endTime = index === blocks.length - 1 ? duration : currentTime + blockDuration
    const item = {
      index,
      text,
      startTime: currentTime,
      endTime,
      duration: endTime - currentTime,
    }
    currentTime = endTime
    return item
  })
}

/** 本地 v0.15.2 字幕分块（委托引擎镜像）。 */
function splitSubtitleBlocks (text, options = {}) {
  return splitTextToSubtitles(text, options)
}

/** 本地 v0.15.2 场景分句（委托引擎镜像）。 */
function splitScenesLocally (text, options = {}) {
  return splitScenesLocallyEngine(text, options)
}

module.exports = {
  buildSubtitleTimeline,
  createLocalSplitResult,
  isSplitterUnavailableError,
  normalizeSegmentationOptions,
  normalizeServiceSplitResult,
  splitScenesLocally,
  splitSubtitleBlocks,
  splitTextToScenes,
  splitTextToSubtitles,
}
