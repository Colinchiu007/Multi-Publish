// @vitest-environment node
import { describe, expect, it } from 'vitest'
const { PRESET_PROVIDERS, PRESET_RATE_LIMITS } = require('./model-provider-seeds')
const { PROVIDER_LIMITS } = require('./governor-provider-limits')

// 模型预算类类别（媒体素材库 pixabay/pexels/freesound 等不在此列）
const API_CATEGORIES = new Set(['llm', 'tts', 'speech_recognition', 'image', 'video', 'audio', 'multimodal'])
// 素材库 provider：走内容库 HTTP 取素材，不经模型预算调度（无需 rpm）
const MEDIA_LIBRARY_IDS = new Set(['pixabay', 'pexels', 'pixabay-music', 'freesound', 'music-library'])

describe('model-provider-seeds rpm 默认值契约（2026-08-13）', () => {
  it('每个模型预算类预设都有 rate_per_minute 默认初始值', () => {
    const missing = PRESET_PROVIDERS
      .filter(p => API_CATEGORIES.has(p.category) && !MEDIA_LIBRARY_IDS.has(p.id) && !PRESET_RATE_LIMITS[p.id])
      .map(p => `${p.id}(${p.category})`)
    expect(missing).toEqual([])
  })

  it('视频预设 rpm 与 governor 静态表一致（异步任务制低并发）', () => {
    for (const p of PRESET_PROVIDERS.filter(p => p.category === 'video')) {
      expect(PRESET_RATE_LIMITS[p.id]).toBeDefined()
      const staticRpm = PROVIDER_LIMITS[p.id] && PROVIDER_LIMITS[p.id].rpm
      if (staticRpm != null) {
        expect(PRESET_RATE_LIMITS[p.id].rate_per_minute).toBe(staticRpm)
      }
    }
  })

  it('视频预设全部声明 rate_per_minute ≥ 1', () => {
    for (const p of PRESET_PROVIDERS.filter(p => p.category === 'video')) {
      expect(PRESET_RATE_LIMITS[p.id].rate_per_minute).toBeGreaterThanOrEqual(1)
    }
  })
})
