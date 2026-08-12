// @vitest-environment node
const { alignSubtitleBlocks, round2HalfUp, normalizeForAlign } = require('./subtitle-align-aggregator')

describe('subtitle-align-aggregator（JS 镜像）', () => {
  it('完美匹配：真实词时间', () => {
    const blocks = [
      { displayOrder: 0, text: '要知道在农耕社会' },
      { displayOrder: 1, text: '柴火、盐巴和香料' },
      { displayOrder: 2, text: '那可都是绝对的硬通货' },
    ]
    const w = [
      ['要知道', 0.0, 0.6], ['在', 0.6, 0.8], ['农耕社会', 0.8, 1.4],
      ['柴火', 1.6, 2.0], ['盐巴', 2.0, 2.4], ['和香料', 2.4, 3.1],
      ['那可', 3.2, 3.7], ['都是', 3.7, 4.1], ['绝对的', 4.1, 4.7], ['硬通货', 4.7, 5.5],
    ].map(([text, start, end]) => ({ text, start, end }))
    const r = alignSubtitleBlocks(blocks, w, 6)
    expect(r.method).toBe('asr')
    expect(r.warnings).toHaveLength(0)
    expect(r.aligned.map((b) => [b.text, b.startTime, b.endTime])).toEqual([
      ['要知道在农耕社会', 0, 1.4],
      ['柴火、盐巴和香料', 1.6, 3.1],
      ['那可都是绝对的硬通货', 3.2, 5.5],
    ])
  })

  it('部分未命中：估算 + warning，method=asr（≥1 块命中）', () => {
    const blocks = [
      { displayOrder: 0, text: '第一句话完全命中' },
      { displayOrder: 1, text: '第二句话没被识别出来' },
    ]
    const w = [['第一句', 0.0, 0.7], ['话', 0.7, 0.9], ['完全', 0.9, 1.3], ['命中', 1.3, 1.6]].map(([text, start, end]) => ({ text, start, end }))
    const r = alignSubtitleBlocks(blocks, w, 4)
    expect(r.aligned[0].source).toBe('asr')
    expect(r.aligned[1].source).toBe('estimate')
    expect(r.aligned[1].startTime).toBeGreaterThanOrEqual(r.aligned[0].endTime)
    expect(r.method).toBe('asr')
  })

  it('完全未命中：method=estimate + 区间连续', () => {
    const r = alignSubtitleBlocks([{ displayOrder: 0, text: '甲' }, { displayOrder: 1, text: '乙' }], [], 4)
    expect(r.method).toBe('estimate')
    expect(r.aligned[1].startTime).toBe(r.aligned[0].endTime)
  })

  it('round2HalfUp 与 normalizeForAlign 与 TS 一致', () => {
    expect(round2HalfUp(0.625)).toBe(0.63)
    expect(normalizeForAlign('要知道在农耕社会，柴火、盐巴和香料。')).toBe('要知道在农耕社会柴火盐巴和香料')
  })
})
