// @ts-check
/**
 * calibrator — 校准重排算法
 *
 * 对 LLM 生成的「流量标签」与热门话题库匹配验证：
 * 精确/别名/子话题/模糊匹配分别加分，未匹配的降权或替换为热门库相关话题。
 * 内容标签直通（信任 LLM 的内容理解）。
 */
const { stripHash } = require('./platform-rules')

// 匹配类型 → heat bonus
const BONUS = {
  exact: 20,
  alias: 15,
  subtopic: 10,
  fuzzy: 5,
}

// 未验证但有 reasoning 的固定 heat
const UNVERIFIED_WITH_REASONING_HEAT = 30

/**
 * 简单 Levenshtein 编辑距离。
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein (a, b) {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = new Array(m + 1)
  for (let i = 0; i <= m; i++) dp[i] = new Array(n + 1)
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }
  return dp[m][n]
}

/**
 * 在热门话题中做模糊匹配（编辑距离 ≤2）。
 * @param {string} key
 * @param {Array} topics
 * @returns {object|null}
 */
function fuzzyMatch (key, topics) {
  for (const topic of topics) {
    const canonical = stripHash(topic.tag).toLowerCase()
    if (!canonical) continue
    if (levenshtein(key, canonical) <= 2) return topic
  }
  return null
}

/**
 * 校准单个平台的流量标签。
 * @param {object} opts
 * @param {string[]} opts.content — LLM 内容标签（直通）
 * @param {string[]} opts.traffic — LLM 流量标签（需校准）
 * @param {Array} opts.hotTopics — 热门话题列表
 * @param {boolean} [opts.hasReasoning] — LLM 是否给出具体关联理由
 * @returns {{content:string[], traffic:Array<{tag:string, heat:number, matched:boolean, matchType:string}>, matchedTopics:Array<{tag:string, heat:number}>}}
 */
function calibrate ({ content, traffic, hotTopics, hasReasoning }) {
  const topics = Array.isArray(hotTopics) ? hotTopics : []
  const contentTags = Array.isArray(content) ? content.slice() : []
  const trafficTags = Array.isArray(traffic) ? traffic.slice() : []

  const contentKeys = new Set(contentTags.map(t => stripHash(t).toLowerCase()).filter(Boolean))
  const calibratedTraffic = []
  const matchedTopics = []
  const usedCanonical = new Set()

  for (const raw of trafficTags) {
    const key = stripHash(raw).toLowerCase()
    if (!key) continue
    // 与内容标签重复则跳过（避免流量标签与内容标签重复）
    if (contentKeys.has(key)) continue

    let match = null
    // 1. 精确匹配
    for (const topic of topics) {
      if (stripHash(topic.tag).toLowerCase() === key) { match = { topic, matchType: 'exact' }; break }
    }
    // 2. 别名匹配
    if (!match) {
      for (const topic of topics) {
        if ((topic.aliases || []).some(a => stripHash(a).toLowerCase() === key)) { match = { topic, matchType: 'alias' }; break }
      }
    }
    // 3. 子话题匹配
    if (!match) {
      for (const topic of topics) {
        if ((topic.subTopics || []).some(s => stripHash(s).toLowerCase() === key)) { match = { topic, matchType: 'subtopic' }; break }
      }
    }
    // 4. 模糊匹配
    if (!match) {
      const fz = fuzzyMatch(key, topics)
      if (fz) match = { topic: fz, matchType: 'fuzzy' }
    }

    if (match) {
      const canonical = stripHash(match.topic.tag)
      const canonicalKey = canonical.toLowerCase()
      if (usedCanonical.has(canonicalKey)) continue
      usedCanonical.add(canonicalKey)
      const heat = (match.topic.heat || 0) + BONUS[match.matchType]
      calibratedTraffic.push({ tag: match.topic.tag, heat, matched: true, matchType: match.matchType })
      matchedTopics.push({ tag: match.topic.tag, heat: match.topic.heat || 0 })
    } else if (hasReasoning) {
      // 未验证但有 reasoning → 保留降权
      calibratedTraffic.push({ tag: raw, heat: UNVERIFIED_WITH_REASONING_HEAT, matched: false, matchType: 'unverified' })
    }
    // 未验证且无 reasoning → 不保留（由调用方从热门库替换）
  }

  // 排序：matched 优先，再按 heat 降序
  calibratedTraffic.sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1
    return b.heat - a.heat
  })

  return { content: contentTags, traffic: calibratedTraffic, matchedTopics }
}

/**
 * 从热门库按 heat 降序补充流量标签（用于未验证标签替换）。
 * @param {Array} hotTopics
 * @param {number} count
 * @param {Array} excludeTags — 排除已用标签
 * @returns {Array<{tag:string, heat:number}>}
 */
function fillFromHotTopics (hotTopics, count, excludeTags) {
  const exclude = new Set((excludeTags || []).map(t => stripHash(t).toLowerCase()).filter(Boolean))
  const out = []
  const sorted = (hotTopics || []).slice().sort((a, b) => (b.heat || 0) - (a.heat || 0))
  for (const topic of sorted) {
    if (out.length >= count) break
    const key = stripHash(topic.tag).toLowerCase()
    if (exclude.has(key)) continue
    out.push({ tag: topic.tag, heat: topic.heat || 0 })
  }
  return out
}

module.exports = {
  BONUS,
  UNVERIFIED_WITH_REASONING_HEAT,
  levenshtein,
  fuzzyMatch,
  calibrate,
  fillFromHotTopics,
}

