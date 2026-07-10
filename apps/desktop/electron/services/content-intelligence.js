// @ts-nocheck
/**
 * Content Intelligence — 跨平台内容情报引擎
 *
 * 基于 last30days 架构精简实现，提供面向发布者的社交情报功能。
 *
 * 功能：
 *   1. search(query)       — 跨平台搜索主题讨论
 *   2. searchTitles(title) — 标题优化（搜索同类标题互动数据）
 *   3. searchMentions(keywords) — 发布后提及追踪
 *
 * 数据源（免费，无需 API Key）：
 *   - Reddit: 公开 JSON API
 *   - Hacker News: Algolia API
 *   - GitHub: Issues/Releases API（60 req/h 未认证足够 MVP）
 *
 * 文件位置: apps/desktop/electron/content-intelligence.js
 */
const { ipcMain } = require('electron')
// eslint-disable-next-line no-unused-vars
const { calculateStats, deduplicateResults, calculateHourDistribution } = require('./content-intelligence-utils')
const log = require('./logger')
const EC = require('../core/error-codes').ERROR

class ContentIntelligence {
  constructor (store) {
    this._axios = null
    this._searchCache = new Map()   // cacheKey -> { results, timestamp }
    this._cacheTTL = 5 * 60 * 1000  // 5 minutes
    this._store = store             // Store instance for impact tracking persistence
  }

  _getAxios () {
    if (!this._axios) {
      this._axios = require('axios')
    }
    return this._axios
  }

  // ── Cache ───────────────────────────────────────────────────────

  _getCached (key) {
    const entry = this._searchCache.get(key)
    if (entry && Date.now() - entry.timestamp < this._cacheTTL) {
      return entry.results
    }
    return null
  }

  _setCache (key, results) {
    // Limit cache size
    if (this._searchCache.size > 50) {
      const oldest = this._searchCache.keys().next().value
      this._searchCache.delete(oldest)
    }
    this._searchCache.set(key, { results, timestamp: Date.now() })
  }

  // ── Engagement Normalization ─────────────────────────────────────
  // log10-based scoring, same philosophy as last30days
  // "real engagement, not SEO"

  _engagementScore (source, upvotes, comments, extra) {
    let score
    switch (source) {
      case 'reddit':
        score = Math.log10(Math.max(upvotes || 0, 1)) * 0.6
              + Math.log10(Math.max(comments || 0, 1)) * 0.4
        break
      case 'hackernews':
        score = Math.log10(Math.max(upvotes || 0, 1)) * 0.7
              + Math.log10(Math.max(comments || 0, 1)) * 0.3
        break
      case 'github':
        score = Math.log10(Math.max(extra?.stars || upvotes || 0, 1)) * 0.5
              + Math.log10(Math.max(comments || 0, 1)) * 0.3
              + (extra?.hasMerge ? 0.5 : 0)
        break
      default:
        score = Math.log10(Math.max(upvotes || 0, 1))
    }
    return Math.round(score * 100) / 100  // 0.00 ~ ~3.00 range
  }

  // ── Source: Reddit ───────────────────────────────────────────────

  async _searchReddit (query, limit = 10) {
    const axios = this._getAxios()
    try {
      const res = await axios.get(`https://www.reddit.com/search.json`, {
        params: { q: query, limit, sort: 'top', t: 'month' },
        timeout: 8000,
        headers: { 'User-Agent': 'Multi-Publish/1.0 (content-intelligence)' }
      })
      const children = res.data?.data?.children || []
      return children
        .filter(c => c.kind === 't3')
        .map(c => {
          const d = c.data
          return {
            source: 'reddit',
            id: d.id,
            title: d.title,
            url: `https://reddit.com${d.permalink}`,
            snippet: d.selftext?.slice(0, 200) || '',
            upvotes: d.ups,
            comments: d.num_comments,
            author: d.author,
            created_utc: d.created_utc,
            engagement: this._engagementScore('reddit', d.ups, d.num_comments),
            thumbnail: d.thumbnail && d.thumbnail.startsWith('http') ? d.thumbnail : null,
          }
        })
        .filter(r => r.title)
    } catch (e) {
      log.warn('ContentIntelligence', `Reddit search error: ${e.message}`)
      return []
    }
  }

  // ── Source: Hacker News ──────────────────────────────────────────

  async _searchHN (query, limit = 10) {
    const axios = this._getAxios()
    try {
      const res = await axios.get(`https://hn.algolia.com/api/v1/search`, {
        params: { query, hitsPerPage: limit, tags: 'story' },
        timeout: 8000,
      })
      const hits = res.data?.hits || []
      return hits.map(d => ({
        source: 'hackernews',
        id: String(d.objectID),
        title: d.title,
        url: d.url || `https://news.ycombinator.com/item?id=${d.objectID}`,
        snippet: '',
        upvotes: d.points || 0,
        comments: d.num_comments || 0,
        author: d.author,
        created_utc: d.created_at_i,
        engagement: this._engagementScore('hackernews', d.points || 0, d.num_comments || 0),
        thumbnail: null,
      }))
    } catch (e) {
      log.warn('ContentIntelligence', `HN search error: ${e.message}`)
      return []
    }
  }

  // ── Source: GitHub ───────────────────────────────────────────────

  async _searchGitHub (query, limit = 8) {
    const axios = this._getAxios()
    try {
      const res = await axios.get(`https://api.github.com/search/issues`, {
        params: { q: `${query} is:issue is:open sort:comments-desc`, per_page: limit },
        timeout: 8000,
        headers: { 'Accept': 'application/vnd.github.v3+json' },
      })
      const items = res.data?.items || []
      return items.map(d => ({
        source: 'github',
        id: String(d.id),
        title: d.title,
        url: d.html_url,
        snippet: d.body?.slice(0, 200) || '',
        upvotes: d.reactions?.['+1'] || 0,
        comments: d.comments || 0,
        author: d.user?.login || 'unknown',
        created_utc: new Date(d.created_at).getTime() / 1000,
        engagement: this._engagementScore('github', d.reactions?.['+1'] || 0, d.comments || 0, { stars: 0 }),
        thumbnail: null,
        extra: { state: d.state, labels: d.labels?.map(l => l.name) || [] },
      }))
    } catch (e) {
      log.warn('ContentIntelligence', `GitHub search error: ${e.message}`)
      return []
    }
  }

  // ── Main search ──────────────────────────────────────────────────

  /**
   * Search across all sources for a topic query.
   * @param {string} query — Search keywords
   * @param {object} [opts]
   * @param {string[]} [opts.sources] — ['reddit','hackernews','github'] or subset
   * @param {number} [opts.limit=10] — Results per source
   * @param {boolean} [opts.noCache=false] — Skip cache
   * @returns {Promise<object>} { results, sources, total }
   */
  async search (query, opts = {}) {
    const sources = opts.sources || ['reddit', 'hackernews', 'github']
    const limit = opts.limit || 10
    const cacheKey = `search:${query}:${sources.join(',')}:${limit}`

    if (!opts.noCache) {
      const cached = this._getCached(cacheKey)
      if (cached) return cached
    }

    const tasks = []
    if (sources.includes('reddit')) tasks.push(this._searchReddit(query, limit))
    if (sources.includes('hackernews')) tasks.push(this._searchHN(query, limit))
    if (sources.includes('github')) tasks.push(this._searchGitHub(query, limit))

    const results = (await Promise.allSettled(tasks))
      .flatMap(r => r.status === 'fulfilled' ? r.value : [])

    // Sort by engagement
    results.sort((a, b) => b.engagement - a.engagement)

    // Dedup by title (fuzzy same-title detection)
    const seen = new Set()
    const deduped = []
    for (const r of results) {
      const key = r.title.slice(0, 40).toLowerCase().trim()
      if (!seen.has(key)) {
        seen.add(key)
        deduped.push(r)
      }
    }

    const output = {
      query,
      sources: sources.filter(s => {
        if (s === 'reddit') return sources.includes('reddit')
        if (s === 'hackernews') return sources.includes('hackernews')
        if (s === 'github') return sources.includes('github')
        return true
      }),
      total: deduped.length,
      results: deduped.slice(0, limit * 2),
      timestamp: new Date().toISOString(),
    }

    this._setCache(cacheKey, output)
    return output
  }

  // ── Title assistant: search for similar titles ───────────────────
  //
  // Takes the draft title and searches for similar content.
  // Returns engagement data for similar titles to guide optimization.

  async searchTitles (title, opts = {}) {
    // Use the title itself as the query
    const result = await this.search(title, { ...opts, limit: 6 })

    // Extract key patterns
    const patterns = this._extractPatterns(result.results)

    return {
      ...result,
      titleAnalysis: {
        patterns,
        suggestion: this._generateTitleSuggestion(title, patterns),
      }
    }
  }

  _extractPatterns (results) {
    if (!results || results.length === 0) return null

    // Find common words in high-engagement titles
    const highEng = results.filter(r => r.engagement > 1.0)
    if (highEng.length < 2) return null

    // Simple frequency analysis
    const wordFreq = {}
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'of', 'in', 'to',
      'for', 'and', 'or', 'on', 'at', 'by', 'with', 'from', 'as', 'it', 'its',
      'that', 'this', 'these', 'those', 'be', 'been', 'being', 'have', 'has',
      'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'may', 'might',
      'shall', 'should', 'about', 'into', 'through', 'during', 'before', 'after',
      'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again',
      'further', 'then', 'once', 'here', 'there', 'all', 'each', 'every',
      'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
      'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
      // Chinese stop words
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
      '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
      '没有', '看', '好', '自己', '这', '他', '她', '它', '们',
    ])

    for (const r of highEng) {
      const words = r.title.toLowerCase().split(/[\s,.\-!?/\\()[\]{}":;]+/)
      for (const w of words) {
        if (w.length > 1 && !stopWords.has(w) && !/^\d+$/.test(w)) {
          wordFreq[w] = (wordFreq[w] || 0) + 1
        }
      }
    }

    const sorted = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    return sorted.length > 0 ? sorted : null
  }

  _generateTitleSuggestion (title, patterns) {
    if (!patterns) return null

    const topKeywords = patterns.slice(0, 3).map(([w]) => w)

    // Check if title already contains these keywords
    const missing = topKeywords.filter(kw =>
      !title.toLowerCase().includes(kw)
    )

    if (missing.length === 0) return null

    return {
      keywords: topKeywords,
      missingInTitle: missing,
      tip: `高互动标题常包含: ${topKeywords.join(', ')}。当前标题缺失: ${missing.join(', ')}，可考虑加入。`
    }
  }

  // ── Mention tracking (post-publish impact) ────────────────────────
  //
  // Search for mentions of published content across platforms.

  async searchMentions (keywords, opts = {}) {
    // keywords can be: title + brand name + author name
    const result = await this.search(keywords, { ...opts, limit: 8 })

    // After T+24h, mark vs earlier results for trend direction
    return {
      ...result,
      analysis: {
        totalMentions: result.total,
        topSource: result.results[0]?.source || null,
        topEngagement: result.results[0]?.engagement || 0,
        sentiment: 'unknown',  // would need LLM for real sentiment
      }
    }
  }

  // ── Impact tracking persistence ──────────────────────────────────

  /**
   * Save an impact snapshot for a published article.
   * Called after publish, then at T+1h / T+24h / T+72h intervals.
   */
  async saveImpactSnapshot (articleId, title, keywords, snapshot) {
    if (!this._store || !this._store._ready) return false
    try {
      this._store.db.prepare(`
        INSERT INTO impact_snapshots (article_id, title, keywords, total_mentions, top_source, top_engagement, snapshot_data, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        articleId,
        title,
        JSON.stringify(keywords),
        snapshot.total || 0,
        snapshot.results?.[0]?.source || '',
        snapshot.results?.[0]?.engagement || 0,
        JSON.stringify(snapshot)
      )
      return true
    } catch (e) {
      log.error('ContentIntelligence', `saveImpactSnapshot error: ${e.message}`)
      return false
    }
  }

  /**
   * Get impact history for a published article.
   */
  getImpactHistory (articleId) {
    if (!this._store || !this._store._ready) return []
    try {
      return this._store.db.prepare(
        'SELECT * FROM impact_snapshots WHERE article_id = ? ORDER BY checked_at ASC'
      ).all(articleId)
    } catch (e) {
      log.error('ContentIntelligence', `getImpactHistory error: ${e.message}`)
      return []
    }
  }


  // ── Trending Discovery (方案 D.1) ──────────────────────────────
  //
  // Fetch what's currently trending across sources — no keyword filter.
  // Used by the "Hot Trends" panel for content ideation.

  async _fetchRedditTrending (limit = 15) {
    const axios = this._getAxios()
    try {
      const res = await axios.get(`https://www.reddit.com/hot.json`, {
        params: { limit },
        timeout: 8000,
        headers: { 'User-Agent': 'Multi-Publish/1.0 (content-intelligence)' }
      })
      const children = res.data?.data?.children || []
      return children
        .filter(c => c.kind === 't3')
        .map(c => {
          const d = c.data
          return {
            source: 'reddit',
            id: d.id,
            title: d.title,
            url: `https://reddit.com${d.permalink}`,
            snippet: d.selftext?.slice(0, 200) || '',
            subreddit: d.subreddit,
            upvotes: d.ups,
            comments: d.num_comments,
            author: d.author,
            created_utc: d.created_utc,
            engagement: this._engagementScore('reddit', d.ups, d.num_comments),
            thumbnail: d.thumbnail && d.thumbnail.startsWith('http') ? d.thumbnail : null,
          }
        })
        .filter(r => r.title)
    } catch (e) {
      log.warn('ContentIntelligence', `Reddit trending error: ${e.message}`)
      return []
    }
  }

  async _fetchHNTrending (limit = 15) {
    const axios = this._getAxios()
    try {
      const res = await axios.get(`https://hn.algolia.com/api/v1/search`, {
        params: { hitsPerPage: limit, tags: 'front_page' },
        timeout: 8000,
      })
      const hits = res.data?.hits || []
      return hits.map(d => ({
        source: 'hackernews',
        id: String(d.objectID),
        title: d.title,
        url: d.url || `https://news.ycombinator.com/item?id=${d.objectID}`,
        snippet: '',
        upvotes: d.points || 0,
        comments: d.num_comments || 0,
        author: d.author,
        created_utc: d.created_at_i,
        engagement: this._engagementScore('hackernews', d.points || 0, d.num_comments || 0),
        thumbnail: null,
      }))
    } catch (e) {
      log.warn('ContentIntelligence', `HN trending error: ${e.message}`)
      return []
    }
  }

  async _fetchGitHubTrending (limit = 10) {
    const axios = this._getAxios()
    try {
      const res = await axios.get(`https://api.github.com/search/repositories`, {
        params: { q: 'created:>2026-04-01', sort: 'stars', order: 'desc', per_page: limit },
        timeout: 8000,
        headers: { 'Accept': 'application/vnd.github.v3+json' },
      })
      const items = res.data?.items || []
      return items.map(d => ({
        source: 'github',
        id: String(d.id),
        title: d.full_name,
        url: d.html_url,
        snippet: d.description?.slice(0, 200) || '',
        upvotes: d.stargazers_count || 0,
        comments: d.open_issues_count || 0,
        author: d.owner?.login || 'unknown',
        created_utc: new Date(d.created_at).getTime() / 1000,
        engagement: this._engagementScore('github', d.stargazers_count || 0, d.open_issues_count || 0, { stars: d.stargazers_count }),
        thumbnail: null,
        extra: { language: d.language, topics: d.topics?.slice(0, 5) || [] },
      }))
    } catch (e) {
      log.warn('ContentIntelligence', `GitHub trending error: ${e.message}`)
      return []
    }
  }

  /**
   * Fetch trending content across sources — no keyword filter.
   * @param {object} [opts]
   * @param {string[]} [opts.sources] — Default all
   * @param {number} [opts.limit=10] — Per source
   * @returns {Promise<object>} Grouped by source + merged sorted
   */
  async fetchTrending (opts = {}) {
    const sources = opts.sources || ['reddit', 'hackernews', 'github']
    const limit = opts.limit || 10
    const cacheKey = `trending:${sources.join(',')}:${limit}`

    const cached = this._getCached(cacheKey)
    if (cached) return cached

    const tasks = []
    if (sources.includes('reddit')) tasks.push(this._fetchRedditTrending(limit))
    if (sources.includes('hackernews')) tasks.push(this._fetchHNTrending(limit))
    if (sources.includes('github')) tasks.push(this._fetchGitHubTrending(limit))

    const allResults = (await Promise.allSettled(tasks))
      .flatMap(r => r.status === 'fulfilled' ? r.value : [])

    allResults.sort((a, b) => b.engagement - a.engagement)

    const seen = new Set()
    const deduped = []
    for (const r of allResults) {
      const key = r.title.slice(0, 40).toLowerCase().trim()
      if (!seen.has(key)) { seen.add(key); deduped.push(r) }
    }

    // Group by source for the frontend panel
    const bySource = {}
    for (const r of deduped) {
      if (!bySource[r.source]) bySource[r.source] = []
      bySource[r.source].push(r)
    }

    const output = {
      total: deduped.length,
      results: deduped.slice(0, limit * 3),
      bySource,
      timestamp: new Date().toISOString(),
    }

    this._setCache(cacheKey, output)
    return output
  }

  // ── Smart Tag Suggestion (方案 D.2) ─────────────────────────────
  //
  // Analyze content text, extract key topics, and map to platform tags.
  // Uses simple keyword extraction + cross-reference with search trends.

  /**
   * Extract unique Chinese + English keywords from content text.
   * @param {string} text
   * @param {number} [maxKeywords=8]
   * @returns {string[]}
   */
  _extractKeywords (text, maxKeywords = 8) {
    if (!text || text.length < 3) return []

    // Remove HTML tags, URLs, special chars
    const clean = text.replace(/<[^>]*>/g, ' ')
                      .replace(/https?:\/\/\S+/g, '')
                      .replace(/[@#]\S+/g, '')

    // Split into words: CJK characters + English words
    const cjk = clean.match(/[一-鿿㐀-䶿豈-﫿]{2,}/g) || []
    const en = clean.toLowerCase()
                   .replace(/[^a-z0-9\s-]/g, ' ')
                   .split(/[\s,-]+/)
                   .filter(w => w.length > 2 && w.length < 20)

    // Count frequency
    const freq = {}
    for (const w of [...cjk, ...en]) {
      freq[w] = (freq[w] || 0) + 1
    }

    // Filter stop words
    const stopWords = new Set(['this', 'that', 'and', 'the', 'for', 'with', 'from',
      'what', 'have', 'been', 'about', 'which', 'their', 'will', 'would', 'could',
      'should', 'more', 'some', 'than', 'also', 'very', 'just', 'like', 'make',
      'been', 'being', 'does', 'done', 'going', 'thing', 'things',
      // Chinese
      '可以', '没有', '一个', '我们', '他们', '这个', '那个', '什么', '时候',
      '因为', '所以', '但是', '如果', '虽然', '怎么', '如何', '已经', '不是',
      '就是', '可能', '需要', '不会', '非常', '还是', '只是', '自己',
    ])

    const sorted = Object.entries(freq)
      .filter(([w]) => !stopWords.has(w))
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([w]) => w)

    return sorted
  }

  /**
   * Map keywords to per-platform tag suggestions.
   * @param {string} content — Article content (title + body)
   * @param {object} [opts]
   * @param {string[]} [opts.platforms] — Platforms to suggest tags for
   * @returns {object} { keywords, byPlatform }
   */
  async suggestTags (content, opts = {}) {
    const platforms = opts.platforms || ['zhihu', 'weibo', 'xiaohongshu', 'bilibili', 'toutiao']
    const keywords = this._extractKeywords(content, 12)

    // Optionally enrich by searching trending discussions for each keyword
    // (limit to first 3 keywords to manage API usage)
    const enrichTargets = keywords.slice(0, 3)
    const enrichResults = await Promise.allSettled(
      enrichTargets.map(kw => this.search(kw, { limit: 3, sources: ['reddit', 'hackernews'] }))
    )

    // Collect related terms from search results
    const relatedTerms = new Set()
    for (const r of enrichResults) {
      if (r.status !== 'fulfilled') continue
      for (const item of r.value.results || []) {
        const words = (item.title + ' ' + (item.snippet || '')).toLowerCase()
                         .replace(/[^a-z0-9一-鿿\s-]/g, ' ')
                         .split(/[\s,-]+/)
                         .filter(w => w.length > 1)
        for (const w of words.slice(0, 5)) relatedTerms.add(w)
      }
    }

    // Build per-platform tag suggestions
    const platformTagStyle = {
      zhihu: { prefix: '', max: 5, mode: 'topic' },
      weibo: { prefix: '#', max: 4, mode: 'hashtag' },
      xiaohongshu: { prefix: '#', max: 6, mode: 'hashtag' },
      bilibili: { prefix: '', max: 5, mode: 'topic' },
      toutiao: { prefix: '', max: 5, mode: 'topic' },
      wechat_mp: { prefix: '', max: 3, mode: 'topic' },
      douyin: { prefix: '#', max: 4, mode: 'hashtag' },
    }

    const byPlatform = {}
    for (const p of platforms) {
      const style = platformTagStyle[p] || { prefix: '', max: 5, mode: 'topic' }
      const tags = keywords.slice(0, style.max + 1).map(k => style.prefix + k)
      // Add related terms if there's space
      if (tags.length < style.max) {
        for (const term of relatedTerms) {
          if (tags.length >= style.max) break
          if (!tags.includes(style.prefix + term)) {
            tags.push(style.prefix + term)
          }
        }
      }
      byPlatform[p] = tags.slice(0, style.max)
    }

    return {
      keywords,
      relatedTerms: [...relatedTerms].slice(0, 8),
      byPlatform,
      source: 'last30days',
    }
  }

  // ── External Reference Finder (方案 D.3) ────────────────────────
  //
  // Search authoritative sources for references that can be linked
  // in the article body to increase credibility.

  /**
   * Find authoritative references/sources related to the given text.
   * @param {string} text — Selected text or full article
   * @param {object} [opts]
   * @param {number} [opts.limit=5]
   * @returns {Promise<object>} { references: [{ title, url, snippet, source, relevance }] }
   */
  async findReferences (text, opts = {}) {
    const limit = opts.limit || 5
    if (!text || text.length < 5) return { references: [], total: 0 }

    // Use the text as search query
    const result = await this.search(text, { limit, sources: ['reddit', 'hackernews', 'github'] })

    // Filter for high-quality references: have URL + minimal engagement
    const refs = (result.results || [])
      .filter(r => r.url && r.engagement > 0.1 && r.title)
      .slice(0, limit)
      .map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet || null,
        source: r.source,
        engagement: r.engagement,
        relevance: Math.round(r.engagement * 20),  // 0-60 scale
      }))

    return {
      references: refs,
      total: refs.length,
      query: text.slice(0, 80),
    }
  }

  // ── Content Benchmarking (方案 D.4) ─────────────────────────────
  //
  // Compare article performance against similar content discovered
  // via search. Shows "where you stand" relative to peers.

  /**
   * Get benchmark data: compare article metrics vs. similar content.
   * @param {string} title — Article title to benchmark
   * @param {object} [opts]
   * @param {number} [opts.sampleSize=12]
   * @returns {Promise<object>} Benchmark stats
   */
  async getBenchmark (title, opts = {}) {
    const sampleSize = opts.sampleSize || 12
    if (!title || title.length < 3) {
      return { error: 'Title too short', benchmark: null }
    }

    // Search for similar content
    const searchResult = await this.search(title, { limit: sampleSize, sources: ['reddit', 'hackernews'] })
    const items = searchResult.results || []
    if (items.length < 3) {
      return { benchmark: null, message: 'Not enough similar content found for benchmarking' }
    }

    // Compute stats
    const engagements = items.map(r => r.engagement).filter(e => e > 0)
    const upvotesList = items.map(r => r.upvotes || 0)
    const commentsList = items.map(r => r.comments || 0)

    // eslint-disable-next-line no-unused-vars
    const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
    const sorted = (arr) => [...arr].sort((a, b) => a - b)
    // eslint-disable-next-line no-unused-vars
    const median = (arr) => {
      if (arr.length === 0) return 0
      const s = sorted(arr)
      return s.length % 2 === 0 ? (s[s.length/2 - 1] + s[s.length/2]) / 2 : s[Math.floor(s.length/2)]
    }
    // eslint-disable-next-line no-unused-vars
    const percentile = (arr, p) => {
      const s = sorted(arr)
      if (s.length === 0) return 0
      const idx = Math.ceil(p / 100 * s.length) - 1
      return s[Math.max(0, Math.min(idx, s.length - 1))]
    }

    const bench = {
      sampleSize: items.length,
      engagement: calculateStats(engagements),
      upvotes: calculateStats(upvotesList),
      comments: calculateStats(commentsList),
      topSources: [...new Set(items.map(r => r.source))],
      generatedAt: new Date().toISOString(),
    }

    return { benchmark: bench }
  }

  // ── Optimal Posting Time (方案 D.5) ─────────────────────────────
  //
  // Analyze search result timestamps to find peak engagement hours.

  /**
   * Analyze time distribution from search results for optimal posting time.
   * @param {string} keyword — Topic keyword
   * @returns {Promise<object>} Hourly distribution + recommendation
   */
  async getOptimalTime (keyword) {
    if (!keyword || keyword.length < 2) {
      return { error: 'Keyword too short', recommendation: null }
    }

    const result = await this.search(keyword, { limit: 20, sources: ['reddit', 'hackernews'] })
    const items = result.results || []
    if (items.length < 5) {
      return { recommendation: null, message: 'Not enough data for time analysis' }
    }

    // Compute hourly distribution from created_utc timestamps
    const hourDist = {}
    for (const r of items) {
      if (!r.created_utc) continue
      const d = new Date(r.created_utc * 1000)
      const hour = d.getUTCHours()
      hourDist[hour] = (hourDist[hour] || 0) + 1
    }

    // Find peak hours weighted by engagement
    const hourScore = {}
    for (const r of items) {
      if (!r.created_utc) continue
      const d = new Date(r.created_utc * 1000)
      const hour = d.getUTCHours()
      hourScore[hour] = (hourScore[hour] || 0) + (r.engagement || 0.1)
    }

    // Top 3 hours by engagement-weighted score
    const sorted = Object.entries(hourScore)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour, score]) => ({
        hourUTC: parseInt(hour),
        hourCN: (parseInt(hour) + 8) % 24,  // Beijing time
        score: Math.round(score * 10) / 10,
      }))

    // Count data points per source
    const bySource = {}
    for (const r of items) {
      bySource[r.source] = (bySource[r.source] || 0) + 1
    }

    return {
      recommendation: sorted.length > 0 ? {
        topHours: sorted,
        bestHourUTC: sorted[0].hourUTC,
        bestHourCN: sorted[0].hourCN,
        summary: `基于 ${items.length} 条相关内容分析，最佳发布时段 UTC ${sorted[0].hourUTC}:00（北京时间 ${sorted[0].hourCN}:00）`,
        dataPoints: items.length,
      } : null,
      bySource,
    }
  }

  // ── IPC Handlers ─────────────────────────────────────────────────

  registerIpcHandlers () {
    // R52 修复：所有 handler 统一为 { code, data, message } 格式
    // Search for topic intelligence (方案 A)
    ipcMain.handle('intelligence:search', async (event, arg) => {
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { query, opts } = arg
      try {
        return { code: 0, data: await this.search(query, opts || {}) }
      } catch (e) {
        return { code: EC.REQUEST_ERROR, message: e.message, data: { results: [], total: 0 } }
      }
    })

    // Title assistant search (方案 B)
    ipcMain.handle('intelligence:search-titles', async (event, arg) => {
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { title, opts } = arg
      try {
        return { code: 0, data: await this.searchTitles(title, opts || {}) }
      } catch (e) {
        return { code: EC.REQUEST_ERROR, message: e.message, data: { results: [], total: 0 } }
      }
    })

    // Impact tracking — save snapshot (方案 C)
    ipcMain.handle('intelligence:save-impact', async (event, arg) => {
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { articleId, title, keywords, snapshot } = arg
      try {
        const ok = await this.saveImpactSnapshot(articleId, title, keywords, snapshot)
        return { code: 0, data: ok }
      } catch (e) {
        return { code: EC.REQUEST_ERROR, message: e.message, data: false }
      }
    })

    // Impact tracking — get history (方案 C)
    ipcMain.handle('intelligence:get-impact', async (event, arg) => {
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { articleId } = arg
      try {
        return { code: 0, data: this.getImpactHistory(articleId) }
      } catch (e) {
        return { code: EC.REQUEST_ERROR, message: e.message, data: [] }
      }
    })

    // Impact tracking — search mentions (方案 C)
    ipcMain.handle('intelligence:search-mentions', async (event, arg) => {
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { keywords, opts } = arg
      try {
        return { code: 0, data: await this.searchMentions(keywords, opts || {}) }
      } catch (e) {
        return { code: EC.REQUEST_ERROR, message: e.message, data: { results: [], total: 0 } }
      }
    })
    // ── Trending Discovery ────────────────────────────────────────
    ipcMain.handle('intelligence:fetch-trending', async (event, opts) => {
      try {
        return { code: 0, data: await this.fetchTrending(opts || {}) }
      } catch (e) {
        return { code: EC.REQUEST_ERROR, message: e.message, data: { results: [], total: 0 } }
      }
    })

    // ── Smart Tag Suggestion ─────────────────────────────────────
    ipcMain.handle('intelligence:suggest-tags', async (event, arg) => {
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { content, opts } = arg
      try {
        return { code: 0, data: await this.suggestTags(content, opts || {}) }
      } catch (e) {
        return { code: EC.REQUEST_ERROR, message: e.message, data: { keywords: [], byPlatform: {} } }
      }
    })

    // ── Reference Finder ─────────────────────────────────────────
    ipcMain.handle('intelligence:find-references', async (event, arg) => {
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { text, opts } = arg
      try {
        return { code: 0, data: await this.findReferences(text, opts || {}) }
      } catch (e) {
        return { code: EC.REQUEST_ERROR, message: e.message, data: { references: [], total: 0 } }
      }
    })

    // ── Benchmark ────────────────────────────────────────────────
    ipcMain.handle('intelligence:get-benchmark', async (event, arg) => {
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { title, opts } = arg
      try {
        return { code: 0, data: await this.getBenchmark(title, opts || {}) }
      } catch (e) {
        return { code: EC.REQUEST_ERROR, message: e.message, data: null }
      }
    })

    // ── Optimal Time ─────────────────────────────────────────────
    ipcMain.handle('intelligence:get-optimal-time', async (event, arg) => {
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { keyword } = arg
      try {
        return { code: 0, data: await this.getOptimalTime(keyword) }
      } catch (e) {
        return { code: EC.REQUEST_ERROR, message: e.message, data: null }
      }
    })

  }
}

module.exports = ContentIntelligence
