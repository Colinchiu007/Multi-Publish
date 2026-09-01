// @ts-check
/**
 * trending-topics-store — 单元测试
 */
const { TrendingTopicsStore } = require('./trending-topics-store')

describe('trending-topics-store', () => {
  let store
  beforeEach(() => {
    store = new TrendingTopicsStore()
    store._data = null // 重置缓存
  })

  describe('load', () => {
    it('loads trending topics data with version', () => {
      const data = store.load()
      expect(data.version).toBe(1)
      expect(data.platforms.zhihu).toBeDefined()
      expect(Array.isArray(data.platforms.zhihu)).toBe(true)
      expect(data.platforms.zhihu.length).toBeGreaterThan(0)
    })

    it('caches data after first load', () => {
      const d1 = store.load()
      const d2 = store.load()
      expect(d1).toBe(d2)
    })
  })

  describe('getByPlatform', () => {
    it('returns topics for known platform', () => {
      const topics = store.getByPlatform('zhihu')
      expect(topics.length).toBeGreaterThan(0)
      expect(topics[0].tag).toBeDefined()
      expect(typeof topics[0].heat).toBe('number')
    })

    it('returns empty for unknown platform', () => {
      expect(store.getByPlatform('unknown')).toEqual([])
    })
  })

  describe('search', () => {
    it('finds topics by keyword', () => {
      const res = store.search('zhihu', '人工智能')
      expect(res.length).toBeGreaterThan(0)
      expect(res[0].tag).toBe('人工智能')
    })

    it('returns empty for empty keyword', () => {
      expect(store.search('zhihu', '')).toEqual([])
    })
  })

  describe('match', () => {
    it('matches exact and alias', () => {
      const res = store.match('zhihu', ['人工智能', 'AI'])
      expect(res.matched.length).toBeGreaterThan(0)
      expect(res.matched[0].matchType).toBe('exact')
    })

    it('reports unmatched tags', () => {
      const res = store.match('zhihu', ['完全不存在'])
      expect(res.unmatched).toEqual(['完全不存在'])
    })
  })

  describe('topByHeat', () => {
    it('returns top n by heat desc', () => {
      const top = store.topByHeat('zhihu', 3)
      expect(top.length).toBeLessThanOrEqual(3)
      for (let i = 1; i < top.length; i++) {
        expect(top[i - 1].heat).toBeGreaterThanOrEqual(top[i].heat)
      }
    })
  })

  describe('topByCategory', () => {
    it('filters by category sorted by heat', () => {
      const res = store.topByCategory('zhihu', '科技')
      expect(res.length).toBeGreaterThan(0)
      expect(res.every(t => t.category === '科技')).toBe(true)
    })
  })
})
