/**
 * Knowledge Base — 用户个人知识库
 *
 * 本地存储用户偏好、风格指纹、历史成功案例、反馈日志。
 * 隐私优先，所有数据存储在用户本地，不上传云端。
 *
 * 参考：Karpathy LLM Wiki 理论 + Colinchiu007/LLM-Wiki-V2
 */

const DEFAULT_KB = {
  version: 1,
  preferences: {
    industries: {},
    tones: {},
    platforms: {},
    preferredStrategies: []
  },
  styleFingerprint: {
    avgSentenceLength: 0,
    commonPhrases: [],
    openingPatterns: [],
    closingPatterns: [],
    emojiUsage: 'medium',
    punctuationStyle: 'balanced'
  },
  successfulRewrites: [],
  feedbackLog: []
}

class KnowledgeBase {
  /**
   * @param {object} options
   * @param {object} options.storage - 持久化存储接口 { get(key), set(key, value) }
   */
  constructor(options = {}) {
    this._storage = options.storage
    this._data = null
  }

  /**
   * 初始化知识库（从存储加载或创建默认）
   */
  init() {
    if (this._data) return
    const stored = this._storage ? this._storage.get('rewrite_engine_kb') : null
    if (stored) {
      try {
        this._data = JSON.parse(stored)
        this._migrate()
      } catch {
        this._data = { ...DEFAULT_KB }
      }
    } else {
      this._data = { ...DEFAULT_KB }
    }
  }

  /**
   * 获取用户偏好摘要（用于注入 Prompt 的 {knowledgeContext}）
   * @returns {string}
   */
  getContextSummary() {
    this.init()
    const p = this._data.preferences

    const parts = []

    // 行业偏好
    const topIndustries = this._topKeys(p.industries, 2)
    if (topIndustries.length > 0) {
      parts.push(`用户主要关注领域：${topIndustries.join('、')}`)
    }

    // 风格偏好
    const topTones = this._topKeys(p.tones, 2)
    if (topTones.length > 0) {
      parts.push(`偏好语言风格：${topTones.join('、')}`)
    }

    // 高频短语
    const fp = this._data.styleFingerprint
    if (fp.commonPhrases && fp.commonPhrases.length > 0) {
      parts.push(`常用表达：${fp.commonPhrases.slice(0, 5).join('、')}`)
    }

    // 开头/结尾模式
    if (fp.openingPatterns && fp.openingPatterns.length > 0) {
      parts.push(`常用开头：${fp.openingPatterns.slice(0, 3).join('、')}`)
    }

    return parts.length > 0 ? '用户偏好参考：\n' + parts.join('\n') : ''
  }

  /**
   * 记录改写结果反馈
   * @param {object} feedback
   * @param {string} feedback.action - 'adopted' | 'modified' | 'rejected'
   * @param {string} feedback.strategyId
   * @param {string} feedback.originalContent
   * @param {string} feedback.resultContent
   * @param {number} feedback.editDistance - 用户修改比例 0-1
   */
  recordFeedback(feedback) {
    this.init()
    const entry = {
      timestamp: new Date().toISOString(),
      action: feedback.action || 'unknown',
      strategyId: feedback.strategyId || '',
      editDistance: feedback.editDistance || 0,
      notes: feedback.notes || ''
    }

    this._data.feedbackLog.push(entry)

    // 限制日志长度
    if (this._data.feedbackLog.length > 500) {
      this._data.feedbackLog = this._data.feedbackLog.slice(-500)
    }

    // 更新策略偏好
    if (feedback.strategyId) {
      this._updatePreference('preferredStrategies', feedback.strategyId, feedback.action === 'adopted' ? 1 : -0.5)
    }

    // 采纳时更新风格指纹
    if (feedback.action === 'adopted' && feedback.resultContent) {
      this._updateStyleFingerprint(feedback.resultContent)
    }

    // 更新行业/风格偏好
    if (feedback.userSettings) {
      if (feedback.userSettings.industry) {
        this._incrementPreference('industries', feedback.userSettings.industry)
      }
      if (feedback.userSettings.tone) {
        this._incrementPreference('tones', feedback.userSettings.tone)
      }
      if (feedback.userSettings.platform) {
        this._incrementPreference('platforms', feedback.userSettings.platform)
      }
    }

    this._persist()
  }

  /**
   * 获取策略的历史评分
   * @param {string} strategyId
   * @returns {number|null}
   */
  getStrategyRating(strategyId) {
    this.init()
    const logs = this._data.feedbackLog.filter(l => l.strategyId === strategyId)
    if (logs.length === 0) return null

    const scoreMap = { adopted: 5, modified: 3, rejected: 1 }
    const total = logs.reduce((sum, l) => sum + (scoreMap[l.action] || 0), 0)
    return Math.round(total / logs.length)
  }

  /**
   * 获取所有策略的评分映射
   * @returns {object}
   */
  getStrategyRatings() {
    this.init()
    const ratings = {}
    const strategyIds = new Set(this._data.feedbackLog.map(l => l.strategyId))
    for (const id of strategyIds) {
      const rating = this.getStrategyRating(id)
      if (rating !== null) ratings[id] = rating
    }
    return ratings
  }

  /**
   * 获取用户偏好数据（用于策略匹配）
   * @returns {object}
   */
  getUserHistory() {
    this.init()
    return {
      preferredStrategies: this._data.preferences.preferredStrategies || [],
      strategyRatings: this.getStrategyRatings()
    }
  }

  // ===== 内部方法 =====

  _persist() {
    if (this._storage) {
      this._storage.set('rewrite_engine_kb', JSON.stringify(this._data))
    }
  }

  _migrate() {
    if (!this._data.version) {
      this._data = { ...DEFAULT_KB, ...this._data, version: 1 }
    }
  }

  _topKeys(obj, n) {
    if (!obj) return []
    return Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k]) => k)
  }

  _incrementPreference(field, key) {
    if (!this._data.preferences[field]) {
      this._data.preferences[field] = {}
    }
    const current = this._data.preferences[field][key] || 0
    this._data.preferences[field][key] = Math.min(1, current + 0.1)
  }

  _updatePreference(field, key, delta) {
    if (!this._data.preferences[field]) {
      this._data.preferences[field] = []
    }
    const list = this._data.preferences[field]
    if (delta > 0 && !list.includes(key)) {
      list.unshift(key)
      if (list.length > 10) list.length = 10
    }
  }

  _updateStyleFingerprint(content) {
    const fp = this._data.styleFingerprint
    if (!fp) return

    // 更新平均句长
    const sentences = content.split(/[。！？\.\!\?]+/).filter(Boolean)
    if (sentences.length > 0) {
      const avgLen = content.length / sentences.length
      fp.avgSentenceLength = fp.avgSentenceLength
        ? Math.round((fp.avgSentenceLength * 0.7 + avgLen * 0.3))
        : Math.round(avgLen)
    }

    // 提取开头/结尾模式（简单实现）
    if (sentences.length > 0) {
      const first = sentences[0].trim().slice(0, 20)
      if (first.length > 2 && !fp.openingPatterns.includes(first)) {
        fp.openingPatterns.unshift(first)
        if (fp.openingPatterns.length > 10) fp.openingPatterns.length = 10
      }
      const last = sentences[sentences.length - 1].trim().slice(0, 20)
      if (last.length > 2 && !fp.closingPatterns.includes(last)) {
        fp.closingPatterns.unshift(last)
        if (fp.closingPatterns.length > 10) fp.closingPatterns.length = 10
      }
    }

    // 检测 emoji 使用频率
    const emojiCount = (content.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu) || []).length
    fp.emojiUsage = emojiCount > content.length * 0.02 ? 'high' : emojiCount > 0 ? 'medium' : 'low'
  }
}

// 内存存储（开发/测试用，生产环境替换为 SQLite）
class MemoryStorage {
  constructor() {
    this._store = new Map()
  }
  get(key) {
    return this._store.get(key) || null
  }
  set(key, value) {
    this._store.set(key, value)
  }
}

module.exports = { KnowledgeBase, MemoryStorage, DEFAULT_KB }
