// @ts-check
/**
 * platform-rules — 单元测试
 */
const {
  DEFAULT_PLATFORMS,
  PLATFORM_KEYS,
  HASH_PLATFORMS,
  PLATFORM_STYLES,
  getTagStyle,
  stripHash,
  normalizeTag,
  applyPrefix,
} = require('./platform-rules')

describe('platform-rules', () => {
  describe('getTagStyle', () => {
    it('returns correct style for known platforms', () => {
      expect(getTagStyle('weibo')).toEqual({ prefix: '#', max: 10, mode: 'hash' })
      expect(getTagStyle('zhihu')).toEqual({ prefix: '', max: 10, mode: 'plain' })
      expect(getTagStyle('xiaohongshu').prefix).toBe('#')
      expect(getTagStyle('douyin').prefix).toBe('#')
    })

    it('falls back to default for unknown platform', () => {
      expect(getTagStyle('unknown')).toEqual({ prefix: '', max: 5, mode: 'plain' })
    })
  })

  describe('stripHash', () => {
    it('strips leading and trailing hash', () => {
      expect(stripHash('#人工智能#')).toBe('人工智能')
      expect(stripHash('#AI')).toBe('AI')
      expect(stripHash('AI#')).toBe('AI')
    })

   it('handles empty and whitespace', () => {
     expect(stripHash('')).toBe('')
      expect(stripHash('  #  #  ')).toBe('#  #')
   })
  })

  describe('normalizeTag', () => {
    it('adds hash prefix for hash platforms', () => {
      expect(normalizeTag('人工智能', 'weibo')).toBe('#人工智能')
      expect(normalizeTag('人工智能', 'xiaohongshu')).toBe('#人工智能')
    })

    it('removes hash for plain platforms', () => {
      expect(normalizeTag('#人工智能', 'zhihu')).toBe('人工智能')
      expect(normalizeTag('#人工智能#', 'bilibili')).toBe('人工智能')
    })

    it('returns empty for empty input', () => {
      expect(normalizeTag('', 'weibo')).toBe('')
      expect(normalizeTag('###', 'weibo')).toBe('')
    })
  })

  describe('applyPrefix', () => {
    it('applies platform prefix', () => {
      expect(applyPrefix('人工智能', 'weibo')).toBe('#人工智能')
      expect(applyPrefix('#AI#', 'weibo')).toBe('#AI')
      expect(applyPrefix('#AI#', 'zhihu')).toBe('AI')
    })

    it('returns empty for empty tag', () => {
      expect(applyPrefix('', 'weibo')).toBe('')
    })
  })

  describe('constants', () => {
    it('exposes default platforms and hash set', () => {
      expect(DEFAULT_PLATFORMS).toContain('zhihu')
      expect(HASH_PLATFORMS.has('weibo')).toBe(true)
      expect(HASH_PLATFORMS.has('zhihu')).toBe(false)
      expect(PLATFORM_KEYS.length).toBeGreaterThan(5)
    })
  })
})
