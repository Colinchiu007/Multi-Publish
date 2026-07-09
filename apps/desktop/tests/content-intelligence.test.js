/**
 * ContentIntelligence — Unit Tests
 *
 * Tests the core logic of the content-intelligence engine:
 * - Cache behavior
 * - Engagement scoring
 * - Keyword extraction
 * - All 6 v1.4.0 methods (with mocked sub-methods to avoid real API calls)
 *
 * 注意：用 __registerMock 替代 vi.mock，因为 vitest 4 下 vi.mock 的 factory
 * 对 CJS require 不生效。__registerMock 拦截 Module.prototype.require，与 CJS 完全兼容。
 */
__enableElectronMock()

__registerMock('../electron/logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

const ContentIntelligence = require('../electron/services/content-intelligence')

// ── Helpers ───────────────────────────────────────────────────────────────

function createCI () {
  const store = { _ready: true, db: { prepare: () => ({ run: vi.fn(), all: vi.fn(() => []) }) } }
  return new ContentIntelligence(store)
}

function mockSubMethods (ci) {
  ci._searchReddit = vi.fn()
  ci._searchHN = vi.fn()
  ci._searchGitHub = vi.fn()
  ci._fetchRedditTrending = vi.fn()
  ci._fetchHNTrending = vi.fn()
  ci._fetchGitHubTrending = vi.fn()
}

function makeRedditItem (overrides) {
  overrides = overrides || {}
  return {
    source: 'reddit',
    id: 'r1',
    title: 'Test Reddit Post About AI',
    url: 'https://reddit.com/r/test',
    snippet: 'This is a test post.',
    upvotes: 150,
    comments: 25,
    author: 'testuser',
    created_utc: Math.floor(Date.now() / 1000) - 3600,
    engagement: 0.95,
    thumbnail: null,
    ...overrides
  }
}

function makeHNItem (overrides) {
  overrides = overrides || {}
  return {
    source: 'hackernews',
    id: 'hn1',
    title: 'Show HN: A New AI Tool',
    url: 'https://news.ycombinator.com/item?id=12345',
    snippet: '',
    upvotes: 200,
    comments: 50,
    author: 'hnuser',
    created_utc: Math.floor(Date.now() / 1000) - 7200,
    engagement: 1.20,
    thumbnail: null,
    ...overrides
  }
}

function makeGitHubItem (overrides) {
  overrides = overrides || {}
  return {
    source: 'github',
    id: 'gh1',
    title: 'user/repo A new AI repo',
    url: 'https://github.com/user/repo',
    snippet: 'A description of the repo.',
    upvotes: 80,
    comments: 10,
    author: 'ghuser',
    created_utc: Math.floor(Date.now() / 1000) - 86400,
    engagement: 0.60,
    thumbnail: null,
    extra: { language: 'Python', topics: ['ai', 'ml'], state: 'open' },
    ...overrides
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('ContentIntelligence', () => {
  describe('cache', () => {
    it('returns null for uncached key', () => {
      const ci = createCI()
      expect(ci._getCached('nonexistent')).toBeNull()
    })

    it('returns cached data within TTL', () => {
      const ci = createCI()
      ci._setCache('key1', { data: 'test' })
      const got = ci._getCached('key1')
      expect(got).toEqual({ data: 'test' })
    })

    it('returns null after TTL expires', () => {
      const ci = createCI()
      ci._cacheTTL = -1000
      ci._setCache('key1', { data: 'test' })
      expect(ci._getCached('key1')).toBeNull()
    })

    it('evicts oldest entry when cache exceeds 50 items', () => {
      const ci = createCI()
      for (let i = 0; i < 52; i++) {
        ci._setCache('k' + i, { i: i })
      }
      expect(ci._getCached('k0')).toBeNull()
      expect(ci._getCached('k50')).toEqual({ i: 50 })
    })
  })

  describe('_engagementScore', () => {
    it('computes reddit score with log10', () => {
      const ci = createCI()
      const score = ci._engagementScore('reddit', 100, 10)
      expect(score).toBe(1.60)
    })

    it('computes hackernews score with log10', () => {
      const ci = createCI()
      const score = ci._engagementScore('hackernews', 200, 50)
      expect(score).toBeCloseTo(2.12, 1)
    })

    it('computes github score with stars extra', () => {
      const ci = createCI()
      const score = ci._engagementScore('github', 500, 20, { stars: 500 })
      expect(score).toBeCloseTo(1.74, 1)
    })

    it('handles zero values gracefully (log10(1) = 0)', () => {
      const ci = createCI()
      const score = ci._engagementScore('reddit', 0, 0)
      expect(score).toBe(0)
    })

    it('uses default formula for unknown source', () => {
      const ci = createCI()
      const score = ci._engagementScore('unknown', 100, 0)
      expect(score).toBe(2)
    })
  })

  describe('_extractKeywords', () => {
    it('extracts English keywords by frequency', () => {
      const ci = createCI()
      const text = 'AI is transforming the world of technology and AI is the future of technology'
      const kw = ci._extractKeywords(text, 5)
      expect(kw).toContain('technology')
      expect(kw).toContain('technology')
      expect(kw.length).toBeLessThanOrEqual(5)
    })

    it('extracts Chinese keywords', () => {
      const ci = createCI()
      const text = '人工智能正在改变科技行业人工智能的未来非常值得期待'
      const kw = ci._extractKeywords(text, 8)
      const hasCJK = kw.some(function(w) { return w.charCodeAt(0) >= 0x4e00 && w.charCodeAt(0) <= 0x9fff })
      expect(hasCJK).toBe(true)
    })

    it('returns empty array for short or empty text', () => {
      const ci = createCI()
      expect(ci._extractKeywords('')).toEqual([])
      expect(ci._extractKeywords('ab')).toEqual([])
    })

    it('filters out stop words', () => {
      const ci = createCI()
      const text = 'this and that about the thing for some test keyword'
      const kw = ci._extractKeywords(text, 10)
      expect(kw).not.toContain('this')
      expect(kw).not.toContain('and')
      expect(kw).toContain('keyword')
      expect(kw).toContain('test')
    })
  })

  describe('fetchTrending', () => {
    it('returns deduped sorted results from all sources', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci._fetchRedditTrending.mockResolvedValue([makeRedditItem({ title: 'Trending A' })])
      ci._fetchHNTrending.mockResolvedValue([makeHNItem({ title: 'Trending B' })])
      ci._fetchGitHubTrending.mockResolvedValue([makeGitHubItem({ title: 'Trending C' })])

      const result = await ci.fetchTrending()
      expect(result.total).toBe(3)
      expect(result.results).toHaveLength(3)
      expect(result.bySource.reddit).toHaveLength(1)
      expect(result.bySource.hackernews).toHaveLength(1)
      expect(result.bySource.github).toHaveLength(1)
      expect(result.results[0].engagement).toBeGreaterThanOrEqual(result.results[1].engagement)
    })

    it('deduplicates similar titles', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci._fetchRedditTrending.mockResolvedValue([
        makeRedditItem({ title: 'Same Title Here' }),
        makeRedditItem({ title: 'Same Title Here' })
      ])
      ci._fetchHNTrending.mockResolvedValue([])
      ci._fetchGitHubTrending.mockResolvedValue([])

      const result = await ci.fetchTrending()
      expect(result.total).toBe(1)
    })

    it('respects source filter', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci._fetchHNTrending.mockResolvedValue([makeHNItem({ title: 'Only HN' })])

      const result = await ci.fetchTrending({ sources: ['hackernews'] })
      expect(result.bySource.hackernews).toBeDefined()
      expect(result.bySource.reddit).toBeUndefined()
    })

    it('uses cache on repeated call', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci._fetchHNTrending.mockResolvedValue([makeHNItem()])

      await ci.fetchTrending({ sources: ['hackernews'] })
      await ci.fetchTrending({ sources: ['hackernews'] })

      expect(ci._fetchHNTrending).toHaveBeenCalledTimes(1)
    })
  })

  describe('suggestTags', () => {
    it('returns keywords and byPlatform mapping for content', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci.search = vi.fn().mockResolvedValue({ results: [] })

      const result = await ci.suggestTags('AI technology is great for machine learning and deep learning')
      expect(result.keywords).toBeDefined()
      expect(result.keywords.length).toBeGreaterThan(0)
      expect(result.byPlatform).toBeDefined()
      expect(result.byPlatform.zhihu).toBeDefined()
      expect(result.byPlatform.weibo).toBeDefined()
      expect(result.byPlatform.xiaohongshu).toBeDefined()
      expect(result.source).toBe('last30days')
    })

    it('adapts tag style per platform (hashtag vs topic)', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci.search = vi.fn().mockResolvedValue({ results: [] })

      const result = await ci.suggestTags('machine learning algorithms')
      result.byPlatform.weibo.forEach(function(tag) {
        expect(tag).toMatch(/^#/)
      })
      result.byPlatform.zhihu.forEach(function(tag) {
        expect(tag).not.toMatch(/^#/)
      })
    })

    it('handles empty content gracefully', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci.search = vi.fn().mockResolvedValue({ results: [] })

      const result = await ci.suggestTags('')
      expect(result.keywords).toEqual([])
    })
  })

  describe('findReferences', () => {
    it('returns filtered high-quality references', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci.search = vi.fn().mockResolvedValue({
        results: [
          makeRedditItem({ engagement: 1.5 }),
          makeHNItem({ engagement: 2.0 }),
          makeRedditItem({ title: '', engagement: 0.5 })
        ]
      })

      const result = await ci.findReferences('How to learn AI')
      expect(result.references).toHaveLength(2)
      expect(result.references[0].relevance).toBeGreaterThan(0)
      expect(result.references[0].url).toBeTruthy()
      expect(result.references[0].source).toBeTruthy()
    })

    it('returns empty for short text', async () => {
      const ci = createCI()
      const result = await ci.findReferences('ab')
      expect(result.references).toEqual([])
      expect(result.total).toBe(0)
    })

    it('filters out low-engagement items', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci.search = vi.fn().mockResolvedValue({
        results: [
          makeRedditItem({ engagement: 0.05 }),
          makeHNItem({ engagement: 0.5 })
        ]
      })

      const result = await ci.findReferences('test query', { limit: 5 })
      expect(result.references).toHaveLength(1)
    })
  })

  describe('getBenchmark', () => {
    it('returns benchmark stats when enough data available', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci.search = vi.fn().mockResolvedValue({
        results: [
          makeRedditItem({ engagement: 0.5, upvotes: 10, comments: 2 }),
          makeRedditItem({ title: 'Second item', engagement: 1.0, upvotes: 50, comments: 5 }),
          makeHNItem({ engagement: 2.0, upvotes: 100, comments: 20 }),
          makeGitHubItem({ engagement: 3.0, upvotes: 200, comments: 30 })
        ]
      })

      const result = await ci.getBenchmark('Test Article Title')
      expect(result.benchmark).toBeDefined()
      expect(result.benchmark.sampleSize).toBe(4)
      expect(result.benchmark.engagement.avg).toBeGreaterThan(0)
      expect(result.benchmark.engagement.median).toBeGreaterThan(0)
      expect(result.benchmark.topSources).toContain('reddit')
      expect(result.benchmark.generatedAt).toBeDefined()
    })

    it('returns null benchmark when too few results', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci.search = vi.fn().mockResolvedValue({
        results: [makeRedditItem({ engagement: 0.5 })]
      })

      const result = await ci.getBenchmark('Test Article')
      expect(result.benchmark).toBeNull()
      expect(result.message).toMatch(/not enough/i)
    })

    it('returns error for very short title', async () => {
      const ci = createCI()
      const result = await ci.getBenchmark('ab')
      expect(result.error).toBeDefined()
    })
  })

  describe('getOptimalTime', () => {
    it('returns time recommendation when enough data', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      var items = []
      var now = Math.floor(Date.now() / 1000)
      for (var i = 0; i < 10; i++) {
        items.push(makeRedditItem({
          title: 'Item ' + i,
          created_utc: now - i * 3600,
          engagement: 0.5 + i * 0.1
        }))
      }
      ci.search = vi.fn().mockResolvedValue({ results: items })

      const result = await ci.getOptimalTime('AI tools')
      expect(result.recommendation).toBeDefined()
      expect(result.recommendation.topHours).toHaveLength(3)
      expect(result.recommendation.bestHourUTC).toBeGreaterThanOrEqual(0)
      expect(result.recommendation.bestHourUTC).toBeLessThan(24)
      expect(result.recommendation.bestHourCN).toBeGreaterThanOrEqual(0)
      expect(result.recommendation.bestHourCN).toBeLessThan(24)
      expect(result.recommendation.dataPoints).toBe(10)
      expect(result.bySource).toBeDefined()
    })

    it('returns null recommendation for little data', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci.search = vi.fn().mockResolvedValue({ results: [makeRedditItem()] })

      const result = await ci.getOptimalTime('AI')
      expect(result.recommendation).toBeNull()
    })

    it('returns error for short keyword', async () => {
      const ci = createCI()
      const result = await ci.getOptimalTime('a')
      expect(result.error).toBeDefined()
    })
  })

  describe('search', () => {
    it('aggregates results from all sources sorted by engagement', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci._searchReddit.mockResolvedValue([makeRedditItem({ engagement: 0.5 })])
      ci._searchHN.mockResolvedValue([makeHNItem({ engagement: 2.0 })])
      ci._searchGitHub.mockResolvedValue([makeGitHubItem({ engagement: 1.0 })])

      var result = await ci.search('AI', { noCache: true })
      expect(result.results).toHaveLength(3)
      expect(result.results[0].source).toBe('hackernews')
      expect(result.results[2].source).toBe('reddit')
    })

    it('deduplicates by title prefix', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci._searchReddit.mockResolvedValue([
        makeRedditItem({ title: 'Duplicate title here' })
      ])
      ci._searchHN.mockResolvedValue([
        makeHNItem({ title: 'Duplicate title here' })
      ])
      ci._searchGitHub.mockResolvedValue([])

      var result = await ci.search('test', { noCache: true })
      expect(result.total).toBe(1)
    })
  })

  describe('searchTitles', () => {
    it('returns titleAnalysis with patterns and suggestion', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci._searchReddit.mockResolvedValue([
        makeRedditItem({ title: 'How to learn AI in 2026', engagement: 1.5 }),
        makeRedditItem({ title: 'AI learning guide for beginners', engagement: 2.0 }),
        makeHNItem({ title: 'The best way to learn AI', engagement: 2.5 })
      ])
      ci._searchHN.mockResolvedValue([])
      ci._searchGitHub.mockResolvedValue([])

      var result = await ci.searchTitles('Learning AI from scratch')
      expect(result.titleAnalysis).toBeDefined()
      expect(result.titleAnalysis.patterns).toBeDefined()
    })
  })

  describe('searchMentions', () => {
    it('returns mention analysis with top source and sentiment', async () => {
      const ci = createCI()
      mockSubMethods(ci)
      ci.search = vi.fn().mockResolvedValue({
        results: [makeRedditItem({ engagement: 1.5 }), makeHNItem({ engagement: 2.0 })],
        total: 2
      })

      var result = await ci.searchMentions('my article title')
      expect(result.analysis).toBeDefined()
      expect(result.analysis.totalMentions).toBe(2)
      expect(result.analysis.topSource).toBeDefined()
      expect(result.analysis.topEngagement).toBeGreaterThan(0)
    })
  })
})
