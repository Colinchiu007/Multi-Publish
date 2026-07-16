// @ts-check
/**
 * content-intelligence-analysis — 分析逻辑 mixin
 *
 * 拆分自 content-intelligence.js (2026-07-16 架构重构)
 * 通过 Object.assign 注入 ContentIntelligence.prototype，方法内通过 this.search() /
 * this._extractKeywords() 等访问主类与 mixin 提供的方法。
 *
 * 依赖：calculateStats（content-intelligence-utils，getBenchmark 使用）
 *      this.search()           — 主类提供的跨平台搜索入口
 *      this._extractKeywords() — 本 mixin 内部方法
 */
const { calculateStats } = require('./content-intelligence-utils')

const analysisMixin = {
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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
}

module.exports = analysisMixin
