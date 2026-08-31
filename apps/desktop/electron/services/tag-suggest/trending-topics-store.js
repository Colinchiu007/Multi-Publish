// @ts-check
/**
 * trending-topics-store — 热门话题库
 *
 * 同步加载 trending-topics-zh.json，提供按平台查询/搜索/匹配/按类目取热门。
 * 数据为静态快照，v2 预留动态刷新接口。
 */
const path = require('path')

class TrendingTopicsStore {
  /**
   * @param {string} [dataDir] — 指向 tag-suggest-data/ 目录
   */
  constructor (dataDir) {
    this._dataDir = dataDir || path.join(__dirname, '..', 'tag-suggest-data')
    this._data = null
  }

  /**
   * 同步加载热门话题库（带缓存），校验 version 兼容。
   * @returns {{version:number, updatedAt:string, platforms:Record<string,Array>}}
   */
  load () {
    if (this._data) return this._data
    const file = path.join(this._dataDir, 'trending-topics-zh.json')
    let raw
    try {
      raw = require(file)
    } catch (e) {
      raw = { version: 1, updatedAt: '', platforms: {} }
    }
    this._data = {
      version: Number(raw.version) || 1,
      updatedAt: raw.updatedAt || '',
      platforms: raw.platforms && typeof raw.platforms === 'object' ? raw.platforms : {},
    }
    return this._data
  }

  /**
   * 取某平台话题列表。
   * @param {string} platform
   * @returns {Array<{tag:string, category:string, heat:number, trend:string, aliases:string[], subTopics:string[]}>}
   */
  getByPlatform (platform) {
    const data = this.load()
    return Array.isArray(data.platforms[platform]) ? data.platforms[platform] : []
  }

  /**
   * 模糊匹配 tag/aliases/subTopics。
   * @param {string} platform
   * @param {string} keyword
   * @returns {Array}
   */
  search (platform, keyword) {
    const kw = String(keyword || '').trim().toLowerCase()
    if (!kw) return []
    return this.getByPlatform(platform).filter(topic => {
      const tag = String(topic.tag || '').toLowerCase()
      const aliases = (topic.aliases || []).map(a => String(a).toLowerCase())
      const subs = (topic.subTopics || []).map(s => String(s).toLowerCase())
      return tag.includes(kw) || aliases.some(a => a.includes(kw)) || subs.some(s => s.includes(kw))
    })
  }

  /**
   * 输入标签数组，返回匹配结果。
   * @param {string} platform
   * @param {string[]} tags
   * @returns {{matched:Array<{tag:string, heat:number, matchType:string}>, unmatched:string[]}}
   */
  match (platform, tags) {
    const topics = this.getByPlatform(platform)
    const matched = []
    const unmatched = []
    for (const t of tags) {
      const key = String(t || '').replace(/^#+|#+$/g, '').trim().toLowerCase()
      if (!key) { unmatched.push(t); continue }
      let found = null
      for (const topic of topics) {
        const canonical = String(topic.tag || '').replace(/^#+|#+$/g, '').trim().toLowerCase()
        if (canonical === key) { found = { topic, matchType: 'exact' }; break }
        if ((topic.aliases || []).some(a => String(a).replace(/^#+|#+$/g, '').trim().toLowerCase() === key)) {
          found = { topic, matchType: 'alias' }; break
        }
        if ((topic.subTopics || []).some(s => String(s).replace(/^#+|#+$/g, '').trim().toLowerCase() === key)) {
          found = { topic, matchType: 'subtopic' }; break
        }
      }
      if (found) {
        matched.push({ tag: found.topic.tag, heat: found.topic.heat, matchType: found.matchType })
      } else {
        unmatched.push(t)
      }
    }
    return { matched, unmatched }
  }

  /**
   * 按类目取热门话题（heat 降序）。
   * @param {string} platform
   * @param {string} category
   * @returns {Array}
   */
  topByCategory (platform, category) {
    return this.getByPlatform(platform)
      .filter(topic => topic.category === category)
      .sort((a, b) => (b.heat || 0) - (a.heat || 0))
  }

  /**
   * 按热度取前 n 个话题。
   * @param {string} platform
   * @param {number} n
   * @returns {Array}
   */
  topByHeat (platform, n) {
    return this.getByPlatform(platform)
      .slice()
      .sort((a, b) => (b.heat || 0) - (a.heat || 0))
      .slice(0, n)
  }
}

module.exports = { TrendingTopicsStore }

