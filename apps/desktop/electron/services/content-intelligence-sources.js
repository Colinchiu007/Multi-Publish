// @ts-check
/**
 * content-intelligence-sources — 数据源 fetch 逻辑 mixin
 *
 * 拆分自 content-intelligence.js (2026-07-16 架构重构)
 * 通过 Object.assign 注入 ContentIntelligence.prototype，方法内通过 this._getAxios() /
 * this._engagementScore() / this._getCached() 等访问主类与 mixin 提供的共享状态。
 *
 * 依赖：log（模块级 require）
 *      this._getAxios()        — 主类提供的 axios 懒加载
 *      this._engagementScore() — 本 mixin 内部方法
 */
const log = require('./logger')

const sourcesMixin = {
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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
}

module.exports = sourcesMixin
