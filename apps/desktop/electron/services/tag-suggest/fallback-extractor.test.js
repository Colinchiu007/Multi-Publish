// @ts-check
/**
 * fallback-extractor — 单元测试
 */
const { extractKeywords, suggestFallback } = require('./fallback-extractor')

describe('fallback-extractor', () => {
  describe('extractKeywords', () => {
    it('extracts CJK keywords by frequency', () => {
      const kw = extractKeywords('人工智能 人工智能 深度学习 深度学习 深度学习', 5)
      expect(kw).toContain('深度学习')
      expect(kw).toContain('人工智能')
    })

    it('extracts English keywords', () => {
      const kw = extractKeywords('machine learning machine learning deep learning', 5)
      expect(kw).toContain('machine')
    })

    it('returns empty for short/empty text', () => {
      expect(extractKeywords('')).toEqual([])
      expect(extractKeywords('ab')).toEqual([])
    })

    it('removes HTML and URLs', () => {
      const kw = extractKeywords('<p>人工智能</p> https://example.com 深度学习', 5)
      expect(kw).toContain('人工智能')
      expect(kw).not.toContain('https')
    })
  })

  describe('suggestFallback', () => {
    it('returns extractor source and byPlatform structure', () => {
      const res = suggestFallback('人工智能 深度学习 大模型 技术 发展', { platforms: ['zhihu', 'weibo'] })
      expect(res.source).toBe('extractor')
      expect(res.calibrated).toBe(false)
      expect(res.byPlatform.zhihu).toBeDefined()
      expect(res.byPlatform.weibo).toBeDefined()
      expect(res.byPlatformDetail.zhihu.content.length).toBeGreaterThan(0)
      expect(res.byPlatformDetail.weibo.content.length).toBeGreaterThan(0)
    })

    it('adds hash prefix for weibo tags', () => {
      const res = suggestFallback('人工智能 深度学习', { platforms: ['weibo'] })
      res.byPlatform.weibo.forEach(t => {
        expect(t.startsWith('#')).toBe(true)
      })
    })

    it('fills traffic tags from hot topics', () => {
      const res = suggestFallback('人工智能 深度学习 大模型', { platforms: ['zhihu'] })
      expect(res.byPlatformDetail.zhihu.traffic.length).toBeGreaterThan(0)
      expect(res.matchedTopics.zhihu.length).toBeGreaterThan(0)
    })

    it('defaults platforms when not provided', () => {
      const res = suggestFallback('人工智能 深度学习')
      expect(res.byPlatform.zhihu).toBeDefined()
      expect(res.byPlatform.xiaohongshu).toBeDefined()
    })
  })
})
