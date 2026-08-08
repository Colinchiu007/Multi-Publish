// @vitest-environment node
import {
  CALIBRATION_MIN_SAMPLES,
  buildCalibrationFactors,
  getCalibrationFactor,
  getEffectiveCharsPerSecond,
  estimateDurationSecondsCalibrated,
  estimateDurationRange,
  estimateSceneCount,
  estimateCost,
  DEFAULT_IMAGE_UNIT_PRICE,
  DEFAULT_TTS_PER_SECOND_PRICE,
} from './tts-calibration'
import { estimateCharsPerSecond } from './voice-estimate'

const now = Date.parse('2026-08-08T00:00:00Z')

// zh 样本：4.5 字/s 基准，实际 9 字/s → ratio 2.0
const zhSamples = Array.from({ length: 5 }, (_, i) => ({
  language: 'zh', provider: 'edge-tts', voiceId: 'v1', speed: 1,
  chars: 9, durationSeconds: 1, recordedAt: new Date(now).toISOString(),
}))
// en 样本：2.8 基准（词/s 口径按字符实现），实际 14 字/s → ratio ≈ 5.0（吸收 chars/words 错配）
const enSamples = Array.from({ length: 5 }, (_, i) => ({
  language: 'en', provider: 'edge-tts', voiceId: 'v2', speed: 1,
  chars: 14, durationSeconds: 1, recordedAt: new Date(now).toISOString(),
}))

describe('tts-calibration 自适应校准 + 实时预估（Batch 5b）', () => {
  it('buildCalibrationFactors：各维度系数 = 实际字/s ÷ 静态基准（中位数），阈值内才启用，不设跨语言 global', () => {
    const factors = buildCalibrationFactors([...zhSamples, ...enSamples], now)
    expect(factors.global).toBeUndefined() // W1：跨语言混池已移除
    expect(factors.zh).toBeCloseTo(2, 5)
    expect(factors['zh:edge-tts']).toBeCloseTo(2, 5)
    expect(factors['zh:edge-tts:v1']).toBeCloseTo(2, 5)
    expect(factors.en).toBeCloseTo(5, 5)
    expect(factors['en:edge-tts:v2']).toBeCloseTo(5, 5)
    // 样本不足 → 不产出维度
    const sparse = buildCalibrationFactors(zhSamples.slice(0, CALIBRATION_MIN_SAMPLES - 1), now)
    expect(sparse.zh).toBeUndefined()
  })

  it('buildCalibrationFactors：ratio 越界（>20/≤0）与样本过期（>90 天/未来）被过滤', () => {
    const nowMs = now
    const day = 24 * 3600 * 1000
    const bad = [
      { language: 'zh', speed: 1, chars: 100, durationSeconds: 1, recordedAt: new Date(nowMs).toISOString() }, // ratio 100/4.5≈22 >20
      { language: 'zh', speed: 1, chars: 0, durationSeconds: 1, recordedAt: new Date(nowMs).toISOString() }, // chars 0
      { language: 'zh', speed: 1, chars: 10, durationSeconds: -1, recordedAt: new Date(nowMs).toISOString() }, // duration ≤0
      { language: 'zh', speed: 1, chars: 10, durationSeconds: 1, recordedAt: new Date(nowMs - 91 * day).toISOString() }, // 过期
      { language: 'zh', speed: 1, chars: 10, durationSeconds: 1, recordedAt: new Date(nowMs + day).toISOString() }, // 未来（时钟回拨）
    ]
    const factors = buildCalibrationFactors([...zhSamples, ...bad], now)
    // 合法 zh 样本仅 5 条，全部应进入 zh 桶；5 条坏样本不影响 2.0
    expect(factors.zh).toBeCloseTo(2, 5)
    const onlyBad = buildCalibrationFactors(bad, now)
    expect(Object.keys(onlyBad)).toEqual([])
  })

  it('getCalibrationFactor：按特异性 language:provider:voiceId > language:provider > language > 1（不跨语言混池）', () => {
    const factors = buildCalibrationFactors([...zhSamples, ...enSamples], now)
    expect(getCalibrationFactor(factors, { language: 'zh', provider: 'edge-tts', voiceId: 'v1' })).toBeCloseTo(2, 5)
    expect(getCalibrationFactor(factors, { language: 'zh', provider: 'edge-tts', voiceId: 'other' })).toBeCloseTo(2, 5)
    expect(getCalibrationFactor(factors, { language: 'zh', provider: 'other', voiceId: 'x' })).toBeCloseTo(2, 5)
    // 查询语言无样本（ja/auto）→ 1（静态），绝不落入 zh/en 系数（W1 反噬防护）
    expect(getCalibrationFactor(factors, { language: 'ja', provider: 'x', voiceId: 'y' })).toBe(1)
    expect(getCalibrationFactor(factors, { language: 'auto', provider: '', voiceId: '' })).toBe(1)
    expect(getCalibrationFactor({}, { language: 'zh', provider: 'x', voiceId: 'y' })).toBe(1)
    expect(getCalibrationFactor(null, { language: 'zh' })).toBe(1)
  })

  it('getEffectiveCharsPerSecond：校准系数作用于静态基准（en 冷启动 vs 校准后）', () => {
    const factors = buildCalibrationFactors([...zhSamples, ...enSamples], now)
    // en 校准后 ≈ 2.8 × 5 = 14 字/s（吸收词/字错配，claude 5a W1）
    expect(getEffectiveCharsPerSecond(factors, { language: 'en', speed: 1, provider: 'edge-tts', voiceId: 'v2' })).toBeCloseTo(14, 5)
    // 冷启动（无样本）→ 静态基准
    expect(getEffectiveCharsPerSecond({}, { language: 'zh', speed: 1 })).toBeCloseTo(estimateCharsPerSecond('zh', 1), 5)
  })

  it('estimateDurationSecondsCalibrated / Range：校准后整数秒与精确区间，clamp 1..60', () => {
    const factors = buildCalibrationFactors([...zhSamples, ...enSamples], now)
    // 18 字 / (4.5×2.0) = 2s；delta = max(1, round(2×0.15)) = 1 → [1,3]
    expect(estimateDurationSecondsCalibrated(18, factors, { language: 'zh', speed: 1, provider: 'edge-tts', voiceId: 'v1' })).toBe(2)
    expect(estimateDurationRange(18, factors, { language: 'zh', speed: 1, provider: 'edge-tts', voiceId: 'v1' })).toEqual([1, 3])
    // clamp 上下界
    expect(estimateDurationSecondsCalibrated(100000, factors, { language: 'zh', speed: 1, provider: 'edge-tts', voiceId: 'v1' })).toBe(60)
    expect(estimateDurationSecondsCalibrated(1, factors, { language: 'zh', speed: 1, provider: 'edge-tts', voiceId: 'v1' })).toBe(1)
    // recordedAt 缺失视为新鲜样本（合理默认）——只按 ratio 过滤
    const noDate = Array.from({ length: 3 }, () => ({ language: 'zh', provider: 'p', voiceId: 'v', speed: 1, chars: 9, durationSeconds: 1 }))
    expect(buildCalibrationFactors(noDate, now).zh).toBeCloseTo(2, 5)
  })

  it('estimateSceneCount：总字数 ÷ 每分镜字数向上取整，至少 1', () => {
    expect(estimateSceneCount(0, 20)).toBe(0)
    expect(estimateSceneCount(10, 20)).toBe(1)
    expect(estimateSceneCount(20, 20)).toBe(1)
    expect(estimateSceneCount(21, 20)).toBe(2)
    expect(estimateSceneCount(100, 20)).toBe(5)
    expect(estimateSceneCount(100, 0)).toBe(1)
  })

  it('estimateCost：图片 + TTS 成本，默认单价可覆盖', () => {
    const cost = estimateCost({ sceneCount: 5, totalDurationSeconds: 30 })
    expect(cost.imageCost).toBe(5 * DEFAULT_IMAGE_UNIT_PRICE)
    expect(cost.ttsCost).toBe(30 * DEFAULT_TTS_PER_SECOND_PRICE)
    expect(cost.totalCost).toBeCloseTo(5 * DEFAULT_IMAGE_UNIT_PRICE + 30 * DEFAULT_TTS_PER_SECOND_PRICE, 2)
    const custom = estimateCost({ sceneCount: 2, totalDurationSeconds: 10, imageUnitPrice: 1, ttsPerSecondPrice: 0.2 })
    expect(custom.totalCost).toBe(4)
  })
})
