/**
 * Strategy Matcher — 策略自动匹配算法
 *
 * 根据用户设置（行业、目的、平台、风格）和历史评分，
 * 为所有启用的策略打分，返回 Top N 推荐。
 */

class StrategyMatcher {
  /**
   * @param {object} options
   * @param {object} options.userSettings - { industry, purpose, platform, tone }
   * @param {object} options.userHistory - { preferredStrategies, strategyRatings }
   * @param {number} options.topN - 返回 Top N 推荐，默认 3
   */
  constructor(options = {}) {
    this._userSettings = options.userSettings || {}
    this._userHistory = options.userHistory || {}
    this._topN = options.topN || 3
  }

  /**
   * 计算所有策略的匹配分数并排序
   * @param {Array} strategies
   * @returns {Array} 排序后的策略数组，每项附加 score 字段
   */
  rank(strategies) {
    if (!Array.isArray(strategies) || strategies.length === 0) return []

    const scored = strategies.map(s => ({
      ...s,
      score: this._score(s)
    }))

    scored.sort((a, b) => b.score - a.score)
    return scored
  }

  /**
   * 返回 Top N 推荐策略
   * @param {Array} strategies
   * @returns {Array}
   */
  recommend(strategies) {
    return this.rank(strategies).slice(0, this._topN)
  }

  /**
   * 计算单个策略的匹配分数
   * @param {object} strategy
   * @returns {number} 0-100
   */
  _score(strategy) {
    const weights = {
      industry: 30,
      purpose: 25,
      platform: 20,
      tone: 15,
      history: 10
    }

    let score = 0

    // 行业匹配 (30%)
    score += this._matchDimension(
      this._userSettings.industry,
      strategy.industry || [],
      weights.industry
    )

    // 目的匹配 (25%)
    score += this._matchDimension(
      this._userSettings.purpose,
      strategy.purpose || [],
      weights.purpose
    )

    // 平台匹配 (20%)
    score += this._matchDimension(
      this._userSettings.platform,
      strategy.platforms || [],
      weights.platform
    )

    // 风格匹配 (15%)
    score += this._matchDimension(
      this._userSettings.tone,
      strategy.tone || [],
      weights.tone
    )

    // 历史评分 (10%)
    score += this._historyScore(strategy.id, weights.history)

    return Math.round(score * 100) / 100
  }

  /**
   * 计算单个维度匹配度
   * @param {string} userValue
   * @param {Array} strategyValues
   * @param {number} weight
   * @returns {number}
   */
  _matchDimension(userValue, strategyValues, weight) {
    if (!userValue || !strategyValues || strategyValues.length === 0) {
      return weight * 0.3 // 无法匹配时给 30% 基础分
    }
    const normalizedUser = userValue.toLowerCase().trim()
    const match = strategyValues.some(v => {
      const nv = String(v).toLowerCase().trim()
      return nv === normalizedUser || nv.includes(normalizedUser) || normalizedUser.includes(nv)
    })
    return match ? weight : 0
  }

  /**
   * 历史评分贡献
   * @param {string} strategyId
   * @param {number} weight
   * @returns {number}
   */
  _historyScore(strategyId, weight) {
    const ratings = this._userHistory.strategyRatings || {}
    const rating = ratings[strategyId]
    if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
      return (rating / 5) * weight
    }
    // 偏好策略给 60% 基础分
    const preferred = this._userHistory.preferredStrategies || []
    if (preferred.includes(strategyId)) {
      return weight * 0.6
    }
    return weight * 0.3 // 无历史数据给 30% 基础分
  }
}

module.exports = { StrategyMatcher }
