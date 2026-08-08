// @vitest-environment node
const {
  TTS_SAMPLES_KEY,
  MAX_TTS_SAMPLES,
  buildTtsSample,
  collectStory2VideoTtsSamples,
  getStory2VideoTtsSamples,
} = require('./story2video-tts-samples')

function makeStore (initial) {
  const values = new Map(initial ? [[TTS_SAMPLES_KEY, initial]] : [])
  return {
    getSetting: vi.fn((key) => (values.has(key) ? values.get(key) : undefined)),
    setSetting: vi.fn((key, value) => values.set(key, value)),
    _values: values,
  }
}

const sampleSegment = { text: '长安城的灯火。', audioDuration: 4.2, duration: 6 }
const sampleConfig = {
  split: { language: 'zh', targetCharsPerScene: 27 },
  voice: { provider: 'edge-tts', model: 'zh-CN-XiaoxiaoNeural', id: 'xiao', speed: 1.2 },
}

describe('story2video-tts-samples 样本采集（Batch 5a）', () => {
  it('buildTtsSample：从片段 + 配置构建样本，chars/duration/voice/language 齐全', () => {
    const sample = buildTtsSample({ segment: sampleSegment, config: sampleConfig, now: '2026-08-08T00:00:00.000Z' })
    expect(sample).toMatchObject({
      language: 'zh',
      provider: 'edge-tts',
      model: 'zh-CN-XiaoxiaoNeural',
      voiceId: 'xiao',
      speed: 1.2,
      chars: 7,
      durationSeconds: 4.2,
      recordedAt: '2026-08-08T00:00:00.000Z',
    })
  })

  it('buildTtsSample：audioDuration 缺失/非法、文本为空 → null', () => {
    expect(buildTtsSample({ segment: { text: 'x', audioDuration: null }, config: sampleConfig })).toBeNull()
    expect(buildTtsSample({ segment: { text: 'x', audioDuration: 0 }, config: sampleConfig })).toBeNull()
    expect(buildTtsSample({ segment: { text: 'x' }, config: sampleConfig })).toBeNull()
    expect(buildTtsSample({ segment: { text: '   ', audioDuration: 3 }, config: sampleConfig })).toBeNull()
    expect(buildTtsSample({ segment: null, config: sampleConfig })).toBeNull()
  })

  it('collect：追加样本并写回 store，返回新增条数', () => {
    const store = makeStore()
    const count = collectStory2VideoTtsSamples({
      store,
      segments: [sampleSegment, { text: '第二段', audioDuration: 2.5 }, { text: '无时长', audioDuration: null }],
      config: sampleConfig,
      now: '2026-08-08T00:00:00.000Z',
    })
    expect(count).toBe(2)
    const saved = store._values.get(TTS_SAMPLES_KEY)
    expect(saved.length).toBe(2)
    expect(saved[0].chars).toBe(7)
    expect(saved[1].chars).toBe(3)
    expect(getStory2VideoTtsSamples(store).length).toBe(2)
  })

  it('collect：FIFO 上限 MAX_TTS_SAMPLES，超限只保留最新', () => {
    const existing = Array.from({ length: MAX_TTS_SAMPLES }, (_, i) => ({ chars: i, audioDuration: 1, language: 'auto' }))
    const store = makeStore(existing)
    const count = collectStory2VideoTtsSamples({ store, segments: [sampleSegment], config: sampleConfig, now: '2026-08-08T00:00:00.000Z' })
    expect(count).toBe(1)
    const saved = store._values.get(TTS_SAMPLES_KEY)
    expect(saved.length).toBe(MAX_TTS_SAMPLES)
    expect(saved.at(-1).text).toBeUndefined() // 样本不存原文
    expect(saved.at(-1).chars).toBe(7)
  })

  it('collect：store 缺失/抛出异常时 fail-open 返回 0，不影响调用方', () => {
    expect(collectStory2VideoTtsSamples({ store: null, segments: [sampleSegment], config: sampleConfig })).toBe(0)
    const badStore = { getSetting: () => { throw new Error('boom') }, setSetting: () => {} }
    expect(collectStory2VideoTtsSamples({ store: badStore, segments: [sampleSegment], config: sampleConfig })).toBe(0)
    expect(collectStory2VideoTtsSamples({ store: makeStore(), segments: [], config: sampleConfig })).toBe(0)
    expect(collectStory2VideoTtsSamples({ store: makeStore(), segments: undefined, config: sampleConfig })).toBe(0)
  })

  it('getStory2VideoTtsSamples：无数据/异常返回空数组', () => {
    expect(getStory2VideoTtsSamples(makeStore())).toEqual([])
    expect(getStory2VideoTtsSamples(null)).toEqual([])
    const badStore = { getSetting: () => { throw new Error('boom') } }
    expect(getStory2VideoTtsSamples(badStore)).toEqual([])
  })
})
