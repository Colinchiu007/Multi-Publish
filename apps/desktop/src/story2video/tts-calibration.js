/**
 * Story2Video 自适应校准 + 运营后台实时预估（Batch 5b）— renderer 侧纯函数模块。
 * - 数据源：5a 采集的 TTS 时长样本（story2video.ttsSamples.v1，经 storeGetSetting 读取）。
 * - 校准：按「语言 / 语言+provider / 语言+provider+voiceId」维度滚动修正有效语速；
 *   冷启动（样本不足）回退静态语言基准（voice-estimate），系数 = 1。
 * - en 单位口径（claude 5a W1）：样本按字符计，校准比 = 实际字/s ÷ 静态基准字/s，
 *   天然吸收「2.8 词/s vs 字符」错配（en 样本充足后系数 ≈ 4~5，估算自动纠偏）。
 * - 成本：默认单价常量（估算仅供参考，可后续后台化）。
 */

import {
  estimateCharsPerSecond,
  normalizeSpeechSpeed,
  MIN_TARGET_SECONDS,
  MAX_TARGET_SECONDS,
} from './voice-estimate'

export const CALIBRATION_MIN_SAMPLES = 3
export const ESTIMATE_DEVIATION_PCT = 0.15
// 默认单价（人民币，估算用；后续可后台化）
export const DEFAULT_IMAGE_UNIT_PRICE = 0.1
export const DEFAULT_TTS_PER_SECOND_PRICE = 0.05

function dimensionKey(language, provider, voiceId) {
  const parts = [String(language || 'auto').toLowerCase()]
  if (provider) parts.push(provider)
  if (voiceId) parts.push(voiceId)
  return parts.join(':')
}

/**
 * 从样本构建校准系数表：
 * { lang: factor, 'lang:provider': factor, 'lang:provider:voiceId': factor }
 * 每维度取满足阈值样本的实际字/s ÷ 静态基准字/s 的比值中位数（稳健，抗单条异常）。
 * 不设跨语言 global 桶：en（词/s 口径 ≈5×）与 zh（≈2×）混池会互相反噬（codex review W1）。
 */
export function buildCalibrationFactors(samples, now = Date.now()) {
  const buckets = new Map() // key -> number[]
  const fresh = Array.isArray(samples) ? samples : []
  const nowMs = typeof now === 'number' ? now : Date.now()
  for (const s of fresh) {
    if (!s || typeof s !== 'object') continue
    const durationSeconds = Number(s.durationSeconds)
    const chars = Number(s.chars)
    const language = String(s.language || 'auto').toLowerCase()
    const speed = normalizeSpeechSpeed(s.speed)
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(chars) || chars <= 0) continue
    // 只采 90 天内样本（排除过期与时钟回拨产生的未来样本），避免陈旧/异常数据干扰
    const recorded = typeof s.recordedAt === 'string' ? new Date(s.recordedAt).getTime() : NaN
    if (Number.isFinite(recorded) && (recorded > nowMs || nowMs - recorded > 90 * 24 * 3600 * 1000)) continue
    const expected = estimateCharsPerSecond(language, speed)
    if (expected <= 0) continue
    const ratio = (chars / durationSeconds) / expected
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 20) continue
    for (const key of [dimensionKey(language), dimensionKey(language, s.provider), dimensionKey(language, s.provider, s.voiceId)]) {
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(ratio)
    }
  }
  const median = (arr) => {
    if (arr.length === 0) return null
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }
  const factors = {}
  for (const [key, ratios] of buckets) {
    if (ratios.length >= CALIBRATION_MIN_SAMPLES) {
      factors[key] = median(ratios)
    }
  }
  return factors
}

/** 按特异性取系数：language:provider:voiceId > language:provider > language > 1（不跨语言混池）。 */
export function getCalibrationFactor(factors, { language, provider, voiceId }) {
  if (!factors || typeof factors !== 'object') return 1
  const candidates = [
    dimensionKey(language, provider, voiceId),
    dimensionKey(language, provider),
    dimensionKey(language),
  ]
  for (const key of candidates) {
    const factor = Number(factors[key])
    if (Number.isFinite(factor) && factor > 0) return factor
  }
  return 1
}

/** 校准后的有效语速（字/s）= 静态基准 × 校准系数。 */
export function getEffectiveCharsPerSecond(factors, ctx) {
  const base = estimateCharsPerSecond(ctx.language, ctx.speed)
  return base * getCalibrationFactor(factors, ctx)
}

/** 校准后的时长估算（整数秒，clamp 1..60），沿用 normalizer 口径。 */
export function estimateDurationSecondsCalibrated(chars, factors, ctx) {
  const cps = getEffectiveCharsPerSecond(factors, ctx)
  const value = Number(chars)
  if (!Number.isFinite(value) || value <= 0 || cps <= 0) return MIN_TARGET_SECONDS
  return Math.min(MAX_TARGET_SECONDS, Math.max(MIN_TARGET_SECONDS, Math.round(value / cps)))
}

/** 时长区间估算：[min, max] = 点估 ± DEVIATION_PCT（min ≥1）。 */
export function estimateDurationRange(chars, factors, ctx) {
  const point = estimateDurationSecondsCalibrated(chars, factors, ctx)
  const delta = Math.max(1, Math.round(point * ESTIMATE_DEVIATION_PCT))
  return [Math.max(MIN_TARGET_SECONDS, point - delta), Math.min(MAX_TARGET_SECONDS, point + delta)]
}

/** 预估分镜数：总字数 ÷ 每分镜目标字数，向上取整，至少 1。 */
export function estimateSceneCount(totalChars, targetCharsPerScene) {
  const chars = Number(totalChars)
  const target = Number(targetCharsPerScene)
  if (!Number.isFinite(chars) || chars <= 0) return 0
  if (!Number.isFinite(target) || target <= 0) return 1
  return Math.max(1, Math.ceil(chars / target))
}

/** 成本估算：图片 = 分镜数 × 单价；TTS = 预估总时长 × 每秒单价。 */
export function estimateCost({ sceneCount, totalDurationSeconds, imageUnitPrice = DEFAULT_IMAGE_UNIT_PRICE, ttsPerSecondPrice = DEFAULT_TTS_PER_SECOND_PRICE }) {
  const images = Number(sceneCount) || 0
  const seconds = Number(totalDurationSeconds) || 0
  const imageCost = images * (Number(imageUnitPrice) >= 0 ? Number(imageUnitPrice) : DEFAULT_IMAGE_UNIT_PRICE)
  const ttsCost = seconds * (Number(ttsPerSecondPrice) >= 0 ? Number(ttsPerSecondPrice) : DEFAULT_TTS_PER_SECOND_PRICE)
  return {
    imageCost: Math.round(imageCost * 100) / 100,
    ttsCost: Math.round(ttsCost * 100) / 100,
    totalCost: Math.round((imageCost + ttsCost) * 100) / 100,
  }
}
