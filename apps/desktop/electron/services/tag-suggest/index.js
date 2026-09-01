// @ts-check
/**
 * tag-suggest/index — 智能标签建议编排入口
 *
 * 流程：LLM 生成（内容+流量标签）→ 热门话题库校准 → 合规过滤 → 平台裁剪。
 * LLM 不可用/失败/输出非法时回退到本地摘词（fallback-extractor）。
 *
 * 依赖注入：aiGenerator 由调用方传入（避免与 ContentIntelligence 循环依赖）。
 */
const { buildMessages, parseAndValidate } = require('./llm-tag-generator')
const { TrendingTopicsStore } = require('./trending-topics-store')
const { calibrate, fillFromHotTopics } = require('./calibrator')
const { filterTags } = require('./compliance-filter')
const { getTagStyle, applyPrefix } = require('./platform-rules')
const { suggestFallback } = require('./fallback-extractor')
const log = require('../logger')

/**
 * 判断 aiGenerator 是否可用于 LLM 标签生成。
 * @param {object} aiGenerator
 * @returns {boolean}
 */
function isLlmAvailable (aiGenerator) {
  return !!(aiGenerator && typeof aiGenerator.generateWithDefault === 'function')
}

/**
 * 从热门话题库按平台取 top-n 高热度话题（用于 prompt 注入与回退填充）。
 * @param {TrendingTopicsStore} store
 * @param {string[]} platforms
 * @returns {Record<string, Array>}
 */
function collectHotTopics (store, platforms) {
  const out = {}
  for (const p of platforms) {
    out[p] = store.topByHeat(p, 5)
  }
  return out
}

/**
 * 编排 LLM 标签生成 → 校准 → 合规 → 平台裁剪。
 * @param {object} opts
 * @param {string} opts.content — 标题+正文
 * @param {string[]} opts.platforms — 目标平台
 * @param {object} opts.aiGenerator — 注入的 AIGenerator
 * @returns {Promise<object>} SuggestTagsResult
 */
async function suggestTagsWithLLM ({ content, platforms, aiGenerator }) {
  const store = new TrendingTopicsStore()
  const hotTopicsByPlatform = collectHotTopics(store, platforms)

  // 空内容直接回退摘词（返回空结果）
  if (!content || String(content).trim().length < 3) {
    return suggestFallback(String(content || ''), { platforms })
  }

  let llmResult
  try {
    const { messages, temperature, max_tokens } = buildMessages({
      content,
      platforms,
      hotTopicsByPlatform,
    })
    const result = await aiGenerator.generateWithDefault('llm', {
      temperature,
      max_tokens,
      messages,
    })
    const raw = result && typeof result.content === 'string' ? result.content : ''
    llmResult = parseAndValidate(raw)
  } catch (e) {
    // LLM 调用失败或输出非法 → 回退摘词（标记 fallback，供前端提示降级）
    log.warn('TagSuggest', 'LLM 标签生成失败，回退本地摘词: ' + (e && e.message ? e.message : String(e)))
    return suggestFallback(content, { platforms, fallback: true })
  }

  const byPlatform = {}
  const byPlatformDetail = {}
  const matchedTopics = {}
  const trafficTags = new Set()
  let calibrated = false

  for (const p of platforms) {
    const style = getTagStyle(p)
    const llmBlock = llmResult.platforms[p]
    const hotTopics = store.getByPlatform(p)

    // 1. 校准
    const cal = calibrate({
      content: llmBlock ? llmBlock.content : [],
      traffic: llmBlock ? llmBlock.traffic : [],
      hotTopics,
      hasReasoning: !!llmResult.reasoning,
    })

    // 2. 若流量标签为空（全部未验证且无 reasoning），从热门库按 heat 补充
    let traffic = cal.traffic
    if (traffic.length === 0 && hotTopics.length > 0) {
      const filled = fillFromHotTopics(hotTopics, 2, cal.content)
      traffic = filled.map(t => ({ tag: t.tag, heat: t.heat, matched: true, matchType: 'hotfill' }))
    }
    // 只要流量标签命中热门库即视为已校准
    if (traffic.some(t => t.matched)) calibrated = true

    // 3. 合规过滤 + 平台前缀
    // 内容标签保留 max-2 个流量位（设计契约），流量标签最多 2 个
    const contentTags = filterTags(cal.content.map(t => applyPrefix(t, p)), p).slice(0, Math.max(0, style.max - 2))
    const trafficTagsRaw = traffic.map(t => applyPrefix(t.tag, p))
    const trafficFiltered = filterTags(trafficTagsRaw, p).slice(0, 2)

    // 4. 合并输出（content + traffic，按平台上限裁剪）
    const merged = [...contentTags, ...trafficFiltered].slice(0, style.max)

    byPlatformDetail[p] = { content: contentTags, traffic: trafficFiltered }
    byPlatform[p] = merged
    // matchedTopics 使用渲染形态（applyPrefix 规范化后），与前端 hotHeat 精确匹配一致
    matchedTopics[p] = traffic
      .filter(t => t.matched)
      .map(t => ({ tag: applyPrefix(t.tag, p), heat: t.heat }))
    for (const t of trafficFiltered) trafficTags.add(t)
  }

  return {
    keywords: byPlatformDetail[platforms[0]] ? byPlatformDetail[platforms[0]].content.slice() : [],
    trafficTags: [...trafficTags],
    relatedTerms: [],
    byPlatform,
    byPlatformDetail,
    source: 'llm',
    calibrated,
    matchedTopics,
    fallback: false,
  }
}

module.exports = {
  isLlmAvailable,
  collectHotTopics,
  suggestTagsWithLLM,
}
