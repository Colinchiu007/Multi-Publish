// @vitest-environment node
const {
  buildSubtitleTimeline,
  createLocalSplitResult,
  normalizeServiceSplitResult,
  splitSubtitleBlocks,
} = require('./story2video-segmentation')

describe('Story2Video 双层分句合同', () => {
  it('字幕只在单个场景内部二次切分，并保持原文顺序', () => {
    const firstScene = '俄罗斯在欧洲挡着北约东扩，我们也支持。'
    const secondScene = '可这两个兄弟偏偏都各怀鬼胎。'

    const firstBlocks = splitSubtitleBlocks(firstScene, { minChars: 8, maxChars: 15 })
    const secondBlocks = splitSubtitleBlocks(secondScene, { minChars: 8, maxChars: 15 })

    expect(firstBlocks.join('')).toBe(firstScene)
    expect(secondBlocks.join('')).toBe(secondScene)
    expect(firstBlocks).not.toContain(expect.stringContaining('各怀鬼胎'))
    expect([...firstBlocks, ...secondBlocks].every(block => block.length <= 15)).toBe(true)
    expect([...firstBlocks, ...secondBlocks].filter(block => block.length < 8)).toHaveLength(0)
  })

  it.each([
    ['短于最小值的单页', '短字幕', [3]],
    ['恰好最小值', '一二三四五六七八', [8]],
    ['恰好最大值', '一二三四五六七八九十甲乙丙丁戊', [15]],
  ])('字幕%s时不丢字', (_label, text, expectedLengths) => {
    const blocks = splitSubtitleBlocks(text, { minChars: 8, maxChars: 15 })

    expect(blocks.join('')).toBe(text)
    expect(blocks.map(block => Array.from(block).length)).toEqual(expectedLengths)
  })

  it.each([
    ['超长无标点文本', '甲'.repeat(31)],
    ['emoji 文本', '😀'.repeat(31)],
  ])('%s按 Unicode 字符分页并保持 8-15 字边界', (_label, text) => {
    const blocks = splitSubtitleBlocks(text, { minChars: 8, maxChars: 15 })
    const lengths = blocks.map(block => Array.from(block).length)

    expect(blocks.join('')).toBe(text)
    expect(lengths.every(length => length >= 8 && length <= 15)).toBe(true)
  })

  it('服务场景保持原边界，并为每个场景附加本地字幕块和来源', () => {
    const result = normalizeServiceSplitResult({
      tier_used: 'tier3_rule',
      scenes: [
        { text: '俄乌这场仗一打就是四年多，普京最近罕见发声。' },
        { text: '为啥这么说？看看战场就知道了。' },
      ],
      sentences: ['俄乌这场仗一打就是四年多，', '普京最近罕见发声。'],
    }, { subtitleMinChars: 8, subtitleMaxChars: 15 })

    expect(result).toMatchObject({
      source: 'smart-sentence-splitter',
      sceneSource: 'smart-sentence-splitter',
      subtitleSource: 'local-typescript',
      degraded: false,
      tier_used: 'tier3_rule',
    })
    expect(result.scenes.map(scene => scene.text)).toEqual([
      '俄乌这场仗一打就是四年多，普京最近罕见发声。',
      '为啥这么说？看看战场就知道了。',
    ])
    expect(result.scenes.every(scene => scene.subtitleBlocks.join('') === scene.text)).toBe(true)
  })

  it('本地降级结果明确标记来源，同时提供场景和字幕两层结果', () => {
    const result = createLocalSplitResult(
      '第一句话用于建立场景。第二句话继续补充信息。第三句话切换到新的画面。',
      { targetDuration: 6, subtitleMinChars: 8, subtitleMaxChars: 15 },
      new Error('connect ECONNREFUSED 127.0.0.1:8002'),
    )

    expect(result).toMatchObject({
      source: 'local-typescript-fallback',
      sceneSource: 'local-typescript-fallback',
      subtitleSource: 'local-typescript',
      degraded: true,
      fallbackReason: expect.stringContaining('ECONNREFUSED'),
    })
    expect(result.scenes.length).toBeGreaterThan(0)
    expect(result.scenes.every(scene => Array.isArray(scene.subtitleBlocks))).toBe(true)
    expect(result.scenes.map(scene => scene.text).join('')).toBe(
      '第一句话用于建立场景。第二句话继续补充信息。第三句话切换到新的画面。',
    )
  })
})

describe('Story2Video 字幕时间轴', () => {
  it('按可见字符权重连续分配真实音频时长，末块精确结束', () => {
    const blocks = ['俄罗斯在欧洲挡着北约东扩，', '我们也支持。']
    const timeline = buildSubtitleTimeline(blocks, 2)

    expect(timeline[0].startTime).toBe(0)
    expect(timeline[0].endTime).toBe(timeline[1].startTime)
    expect(timeline[1].endTime).toBe(2)
    expect(timeline.every(item => item.endTime > item.startTime)).toBe(true)
  })

  it('TTS 音频从 2 秒变为 4 秒时，所有字幕时间点等比例缩放', () => {
    const blocks = ['第一屏字幕内容。', '第二屏字幕内容。']
    const shortTimeline = buildSubtitleTimeline(blocks, 2)
    const slowTimeline = buildSubtitleTimeline(blocks, 4)

    expect(slowTimeline).toHaveLength(shortTimeline.length)
    slowTimeline.forEach((item, index) => {
      expect(item.startTime).toBeCloseTo(shortTimeline[index].startTime * 2, 6)
      expect(item.endTime).toBeCloseTo(shortTimeline[index].endTime * 2, 6)
    })
    expect(slowTimeline.at(-1).endTime).toBe(4)
  })
})
