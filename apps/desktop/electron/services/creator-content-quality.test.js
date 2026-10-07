/**
 * creator-content-quality.test.js — 正文质量分级
 *
 * 分级决定 UI 徽章与「是否推荐送入 AI 写作」。判错的后果是双向的：
 * 把 `stub` 当成 `full`，用户会拿到一段只有标题的文字却以为有完整正文。
 */

const {
  classifyContentQuality,
  QUALITY,
  MIN_FULL_CHARS,
  MIN_PARTIAL_CHARS,
  DEFAULT_COLLECT_PAGE_SIZE,
} = require('./creator-content-quality')

describe('creator-content-quality · 分级判据', () => {
  it('字幕来源且正文足够长 → full', () => {
    expect(classifyContentQuality('subtitle', 'x'.repeat(600))).toBe(QUALITY.FULL)
  })

  it('字幕来源但正文极短 → 不给 full（可能只抓到一句）', () => {
    expect(classifyContentQuality('subtitle', '短')).not.toBe(QUALITY.FULL)
  })

  it('描述来源但长度达标 → partial', () => {
    expect(classifyContentQuality('description', 'x'.repeat(MIN_PARTIAL_CHARS))).toBe(QUALITY.PARTIAL)
  })

  it('描述来源且很短 → stub', () => {
    expect(classifyContentQuality('description', '就一句话')).toBe(QUALITY.STUB)
  })

  it('无来源无内容 → stub（MUST NOT 误判为可用正文）', () => {
    expect(classifyContentQuality(null, '')).toBe(QUALITY.STUB)
    expect(classifyContentQuality(undefined, undefined)).toBe(QUALITY.STUB)
  })
})

describe('creator-content-quality · 边界与健壮', () => {
  it('长度判据用去空白后的字符数（纯空白不算正文）', () => {
    expect(classifyContentQuality('subtitle', '   \n\t  ' + '字'.repeat(MIN_FULL_CHARS))).toBe(QUALITY.FULL)
  })

  it('恰好达 partial 阈值即 partial（边界含端点）', () => {
    const body = '字'.repeat(MIN_PARTIAL_CHARS)
    expect(classifyContentQuality('description', body)).toBe(QUALITY.PARTIAL)
  })

  it('阈值常量自洽：full 阈值不低于 partial 阈值', () => {
    expect(MIN_FULL_CHARS).toBeGreaterThanOrEqual(MIN_PARTIAL_CHARS)
  })

  it('非字符串输入不抛错，一律降级 stub', () => {
    for (const bad of [123, {}, [], true]) {
      expect(() => classifyContentQuality('subtitle', bad)).not.toThrow()
    }
    expect(classifyContentQuality('subtitle', 123)).toBe(QUALITY.STUB)
  })

  it('未知 transcriptSource 不当成字幕', () => {
    expect(classifyContentQuality('someNewSource', 'x'.repeat(MIN_FULL_CHARS))).toBe(QUALITY.PARTIAL)
  })
})

describe('creator-content-quality · 采集页大小', () => {
  it('页大小取 YouTube playlistItems 单页上限', () => {
    expect(DEFAULT_COLLECT_PAGE_SIZE).toBe(50)
  })
})