'use strict'

/**
 * Story2Video TTS 时长样本采集（Batch 5a，为 5b 自适应校准铺路）。
 * - 样本来源：compose 结果每场景的真实 TTS 音频时长（audioDuration，探测失败为 null 时跳过）。
 * - 存储：settings store key `story2video.ttsSamples.v1`，FIFO 上限 MAX_TTS_SAMPLES。
 * - 语义：best-effort——采集失败绝不抛错（不影响流水线）。
 */
const { countSceneChars, normalizeSpeechSpeed } = require('./story2video-voice-estimate')

const TTS_SAMPLES_KEY = 'story2video.ttsSamples.v1'
const MAX_TTS_SAMPLES = 500

/** 从 compose 片段 + 运行配置构建一条样本；缺失关键字段返回 null。 */
function buildTtsSample ({ segment, config, now }) {
  if (!segment || typeof segment !== 'object' || Array.isArray(segment)) return null
  const durationSeconds = Number(segment.audioDuration)
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null
  const chars = countSceneChars(segment.text)
  if (chars <= 0) return null

  const voice = (config && typeof config === 'object' && !Array.isArray(config) && config.voice) || {}
  const split = (config && typeof config === 'object' && !Array.isArray(config) && config.split) || {}
  return {
    // 语言小写归一（normalizer 已保证 auto/zh/en，这里防御大小写输入）
    language: typeof split.language === 'string' ? split.language.toLowerCase() : 'auto',
    provider: typeof voice.provider === 'string' ? voice.provider : '',
    model: typeof voice.model === 'string' ? voice.model : '',
    voiceId: typeof voice.id === 'string' ? voice.id : '',
    // 语速归一化复用 voice-estimate（单一来源，codex review I1）
    speed: normalizeSpeechSpeed(voice.speed),
    chars,
    durationSeconds: Math.round(durationSeconds * 100) / 100,
    recordedAt: (now ? new Date(now) : new Date()).toISOString(),
  }
}

/** 追加样本（FIFO 上限），返回本次新增条数；store 缺失/读写出错时返回 0。 */
function collectStory2VideoTtsSamples ({ store, segments, config, now = new Date() }) {
  if (!store || typeof store.getSetting !== 'function' || typeof store.setSetting !== 'function') return 0
  if (!Array.isArray(segments) || segments.length === 0) return 0
  try {
    const existingRaw = store.getSetting(TTS_SAMPLES_KEY)
    const existing = Array.isArray(existingRaw) ? existingRaw : []
    const added = []
    for (const segment of segments) {
      const sample = buildTtsSample({ segment, config, now })
      if (sample) added.push(sample)
    }
    if (added.length === 0) return 0
    const merged = [...existing, ...added]
    store.setSetting(TTS_SAMPLES_KEY, merged.slice(-MAX_TTS_SAMPLES))
    return added.length
  } catch (_) {
    return 0
  }
}

/** 读取样本（不存在返回空数组）。 */
function getStory2VideoTtsSamples (store) {
  if (!store || typeof store.getSetting !== 'function') return []
  try {
    const raw = store.getSetting(TTS_SAMPLES_KEY)
    return Array.isArray(raw) ? raw : []
  } catch (_) {
    return []
  }
}

module.exports = {
  TTS_SAMPLES_KEY,
  MAX_TTS_SAMPLES,
  buildTtsSample,
  collectStory2VideoTtsSamples,
  getStory2VideoTtsSamples,
}
