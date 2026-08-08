/**
 * Story2Video 分镜估算（三层模型① voice-aware，Batch 5a）— renderer 侧副本。
 * 与 electron/services/story2video-voice-estimate.js 保持同一数值（合同测试锁定一致）。
 */

export const LANGUAGE_BASE_WORDS_PER_SECOND = Object.freeze({
  zh: 4.5,
  en: 2.8,
})
export const DEFAULT_BASE_WORDS_PER_SECOND = 3.3
export const MIN_CHARS_PER_SCENE = 1
export const MAX_CHARS_PER_SCENE = 200
export const MIN_TARGET_SECONDS = 1
export const MAX_TARGET_SECONDS = 60

/** 语言 → 基准语速（auto/未知回退 3.3）。 */
export function getLanguageBaseWordsPerSecond(language) {
  const key = String(language || 'auto').toLowerCase()
  return LANGUAGE_BASE_WORDS_PER_SECOND[key] || DEFAULT_BASE_WORDS_PER_SECOND
}

/** 有效语速（0.5..2，非法回退 1），与 voice.speed 校验一致。 */
export function normalizeSpeechSpeed(speed) {
  const value = Number(speed)
  return Number.isFinite(value) && value >= 0.5 && value <= 2 ? value : 1
}

/** 每分镜有效语速（字/秒）= 语言基准 × voice.speed（speechRate 单一来源）。 */
export function estimateCharsPerSecond(language, speed) {
  return getLanguageBaseWordsPerSecond(language) * normalizeSpeechSpeed(speed)
}

/** 字数 → 估算时长（整数秒），clamp 1..60，与 normalizer 幂等反推口径一致。 */
export function estimateDurationSeconds(chars, language, speed) {
  const cps = estimateCharsPerSecond(language, speed)
  const value = Number(chars)
  if (!Number.isFinite(value) || value <= 0 || cps <= 0) return 6
  return Math.min(MAX_TARGET_SECONDS, Math.max(MIN_TARGET_SECONDS, Math.round(value / cps)))
}

/** 目标时长 → 主控字数（clamp [minChars,maxChars]∩[1,200]）。 */
export function estimateCharsPerScene(targetSeconds, language, speed, minChars, maxChars) {
  const seconds = Number(targetSeconds)
  const base = getLanguageBaseWordsPerSecond(language)
  const rate = normalizeSpeechSpeed(speed)
  if (!Number.isFinite(seconds) || seconds <= 0 || base <= 0 || rate <= 0) return 20
  let min = Math.max(MIN_CHARS_PER_SCENE, Math.round(Number(minChars) || 10))
  const max = Math.min(MAX_CHARS_PER_SCENE, Math.round(Number(maxChars) || 50))
  // 防御 min>max（正常流 normalizer 已校验 minWords≤maxWords；损坏快照时兜底为 max，避免反向 clamp）
  if (min > max) min = max
  // 与 normalizer 同乘法顺序（seconds × base × rate），避免预乘 cps 的浮点精度导致 round 差 1
  return Math.min(max, Math.max(min, Math.round(seconds * base * rate)))
}

/** 场景文本字数统计：去除空白后的 Unicode 码点数（与校准样本口径一致）。 */
export function countSceneChars(text) {
  if (typeof text !== 'string') return 0
  return Array.from(text.replace(/\s+/g, '')).length
}
