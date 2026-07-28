// @ts-check
'use strict'

const DEFAULT_OPTIONS = Object.freeze({
  maxSentenceLength: 200,
  targetDuration: 6,
  baseWordsPerSecond: 3.3,
  speechRate: 1,
  minWords: 10,
  maxWords: 50,
  subtitleMinChars: 8,
  subtitleMaxChars: 15,
})

const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
])
const STRONG_SUBTITLE_BREAKS = new Set(Array.from('。！？!?；;'))
const WEAK_SUBTITLE_BREAKS = new Set(Array.from('，,、：: '))
const SENTENCE_ENDINGS = new Set(Array.from('。！？!?；;'))

function firstDefined (...values) {
  return values.find(value => value !== undefined && value !== null)
}

function finiteNumber (value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function integerInRange (value, min, max, fallback) {
  const number = Math.floor(finiteNumber(value, fallback))
  return Math.min(max, Math.max(min, number))
}

function normalizeText (value) {
  return String(value || '').replace(/\s+/gu, ' ').trim()
}

function textLength (value) {
  return Array.from(String(value || '')).length
}

function normalizeOptions (options = {}) {
  const minChars = integerInRange(
    firstDefined(options.minChars, options.subtitleMinChars, options.subtitle_min_chars),
    1,
    80,
    DEFAULT_OPTIONS.subtitleMinChars,
  )
  const maxChars = integerInRange(
    firstDefined(options.maxChars, options.subtitleMaxChars, options.subtitle_max_chars),
    minChars,
    120,
    DEFAULT_OPTIONS.subtitleMaxChars,
  )
  return {
    maxSentenceLength: integerInRange(
      firstDefined(options.maxSentenceLength, options.max_sentence_length),
      20,
      1000,
      DEFAULT_OPTIONS.maxSentenceLength,
    ),
    targetDuration: finiteNumber(
      firstDefined(options.targetDuration, options.target_duration),
      DEFAULT_OPTIONS.targetDuration,
    ),
    baseWordsPerSecond: finiteNumber(
      firstDefined(options.baseWordsPerSecond, options.base_words_per_second),
      DEFAULT_OPTIONS.baseWordsPerSecond,
    ),
    speechRate: finiteNumber(
      firstDefined(options.speechRate, options.speech_rate),
      DEFAULT_OPTIONS.speechRate,
    ),
    minWords: integerInRange(
      firstDefined(options.minWords, options.min_words),
      1,
      500,
      DEFAULT_OPTIONS.minWords,
    ),
    maxWords: integerInRange(
      firstDefined(options.maxWords, options.max_words),
      1,
      1000,
      DEFAULT_OPTIONS.maxWords,
    ),
    subtitleMinChars: minChars,
    subtitleMaxChars: maxChars,
  }
}

function findBreakPosition (chars, minPosition, maxPosition) {
  const lower = Math.max(1, minPosition)
  const upper = Math.min(chars.length, maxPosition)
  for (const breakSet of [STRONG_SUBTITLE_BREAKS, WEAK_SUBTITLE_BREAKS]) {
    for (let index = upper - 1; index >= lower - 1; index--) {
      if (breakSet.has(chars[index])) return index + 1
    }
  }
  return upper
}

function rebalanceSubtitleTail (blocks, minChars, maxChars) {
  if (blocks.length < 2 || textLength(blocks.at(-1)) >= minChars) return blocks
  const tail = blocks.pop()
  const previous = blocks.pop()
  const combined = Array.from(previous + tail)
  if (combined.length <= maxChars) {
    blocks.push(combined.join(''))
    return blocks
  }

  const lower = Math.max(minChars, combined.length - maxChars)
  const upper = Math.min(maxChars, combined.length - minChars)
  const ideal = Math.min(upper, Math.max(lower, Math.ceil(combined.length / 2)))
  let splitPosition = ideal
  for (let distance = 0; distance <= upper - lower; distance++) {
    const candidates = [ideal + distance, ideal - distance]
    const matched = candidates.find(position => (
      position >= lower && position <= upper &&
      (STRONG_SUBTITLE_BREAKS.has(combined[position - 1]) ||
       WEAK_SUBTITLE_BREAKS.has(combined[position - 1]))
    ))
    if (matched !== undefined) {
      splitPosition = matched
      break
    }
  }
  blocks.push(combined.slice(0, splitPosition).join(''))
  blocks.push(combined.slice(splitPosition).join(''))
  return blocks
}

/**
 * 在单个场景内部生成字幕页。返回值拼接后始终等于规范化后的场景原文。
 */
function splitSubtitleBlocks (text, options = {}) {
  const normalized = normalizeText(text)
  if (!normalized) return []
  const config = normalizeOptions(options)
  const remaining = Array.from(normalized)
  const blocks = []

  while (remaining.length > config.subtitleMaxChars) {
    const splitPosition = findBreakPosition(
      remaining,
      config.subtitleMinChars,
      config.subtitleMaxChars,
    )
    blocks.push(remaining.splice(0, splitPosition).join(''))
  }
  if (remaining.length > 0) blocks.push(remaining.join(''))
  return rebalanceSubtitleTail(
    blocks,
    config.subtitleMinChars,
    config.subtitleMaxChars,
  )
}

function splitLongSentence (sentence, maxLength) {
  const chars = Array.from(sentence)
  if (chars.length <= maxLength) return [sentence]
  const chunks = []
  while (chars.length > maxLength) {
    const splitPosition = findBreakPosition(chars, Math.floor(maxLength * 0.55), maxLength)
    chunks.push(chars.splice(0, splitPosition).join(''))
  }
  if (chars.length > 0) chunks.push(chars.join(''))
  return chunks
}

function splitIntoSentences (text, maxSentenceLength) {
  const normalized = normalizeText(text)
  if (!normalized) return []
  const chars = Array.from(normalized)
  const sentences = []
  let current = ''

  for (let index = 0; index < chars.length; index++) {
    const char = chars[index]
    current += char
    const next = chars[index + 1]
    const decimalPoint = char === '.' && /\d/u.test(chars[index - 1] || '') && /\d/u.test(next || '')
    const englishPeriod = char === '.' && !decimalPoint && (!next || /\s/u.test(next))
    if (SENTENCE_ENDINGS.has(char) || englishPeriod) {
      if (current.trim()) sentences.push(current.trim())
      current = ''
    }
  }
  if (current.trim()) sentences.push(current.trim())
  return sentences.flatMap(sentence => splitLongSentence(sentence, maxSentenceLength))
}

function needsSpaceBetween (left, right) {
  return /[a-z0-9]$/iu.test(left) && /^[a-z0-9]/iu.test(right)
}

function joinTextParts (parts) {
  return parts.reduce((joined, part) => {
    if (!joined) return part
    return joined + (needsSpaceBetween(joined, part) ? ' ' : '') + part
  }, '')
}

function splitScenesLocally (text, options = {}) {
  const config = normalizeOptions(options)
  const sentences = splitIntoSentences(text, config.maxSentenceLength)
  if (sentences.length === 0) return { scenes: [], sentences: [] }

  const calculatedTarget = Math.round(
    Math.max(0.1, config.targetDuration) *
    Math.max(0.1, config.baseWordsPerSecond) *
    Math.max(0.1, config.speechRate),
  )
  const upper = Math.max(config.minWords, config.maxWords)
  const targetChars = Math.min(upper, Math.max(config.minWords, calculatedTarget))
  const sceneTexts = []
  let currentParts = []
  let currentLength = 0

  for (const sentence of sentences) {
    const sentenceLength = textLength(sentence)
    if (currentParts.length > 0 && currentLength + sentenceLength > targetChars) {
      sceneTexts.push(joinTextParts(currentParts))
      currentParts = []
      currentLength = 0
    }
    currentParts.push(sentence)
    currentLength += sentenceLength
  }
  if (currentParts.length > 0) sceneTexts.push(joinTextParts(currentParts))
  return { scenes: sceneTexts, sentences }
}

function fallbackReason (error) {
  const code = error && typeof error.code === 'string' ? error.code : ''
  const message = error && error.message ? String(error.message) : String(error || '服务不可用')
  const combined = code && !message.includes(code) ? code + ': ' + message : message
  return combined.slice(0, 300)
}

function isSplitterUnavailableError (error) {
  let current = error
  for (let depth = 0; current && depth < 4; depth++) {
    if (UNAVAILABLE_CODES.has(String(current.code || '').toUpperCase())) return true
    const message = String(current.message || current)
    if (/splitterbridge is not running/i.test(message) ||
        /splitterbridge request timeout/i.test(message) ||
        /\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EPIPE)\b/i.test(message) ||
        /socket hang up/i.test(message)) {
      return true
    }
    current = current.cause
  }
  return false
}

function sceneTextOf (scene) {
  if (typeof scene === 'string') return normalizeText(scene)
  if (!scene || typeof scene !== 'object') return ''
  return normalizeText(scene.text || scene.content || scene.sentence)
}

function withSubtitleBlocks (scene, index, source, degraded, reason, options) {
  const text = sceneTextOf(scene)
  if (!text) throw new Error('分句结果包含空场景文本，无法生成字幕')
  return {
    ...(scene && typeof scene === 'object' ? scene : {}),
    index,
    text,
    subtitleBlocks: splitSubtitleBlocks(text, options),
    sceneSource: source,
    subtitleSource: 'local-typescript',
    degraded,
    ...(reason ? { fallbackReason: reason } : {}),
  }
}

function normalizeServiceSplitResult (output, options = {}) {
  if (!output || typeof output !== 'object' || !Array.isArray(output.scenes) || output.scenes.length === 0) {
    throw new Error('smart-sentence-splitter 响应缺少有效 scenes 场景数组')
  }
  const scenes = output.scenes.map((scene, index) => (
    withSubtitleBlocks(scene, index, 'smart-sentence-splitter', false, '', options)
  ))
  return {
    ...output,
    source: 'smart-sentence-splitter',
    sceneSource: 'smart-sentence-splitter',
    subtitleSource: 'local-typescript',
    degraded: false,
    scenes,
    sentences: Array.isArray(output.sentences) ? output.sentences : scenes.map(scene => scene.text),
  }
}

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

module.exports = {
  buildSubtitleTimeline,
  createLocalSplitResult,
  isSplitterUnavailableError,
  normalizeServiceSplitResult,
  splitScenesLocally,
  splitSubtitleBlocks,
}
