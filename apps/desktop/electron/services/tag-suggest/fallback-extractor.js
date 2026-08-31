// @ts-check
/**
 * fallback-extractor — 摘词回退
 *
 * 当 LLM 不可用/未配置/输出非法时，回退到本地关键词抽取。
 * 复用原 content-intelligence-analysis.js 的 _extractKeywords 逻辑。
 */
const { DEFAULT_PLATFORMS, getTagStyle, applyPrefix } = require('./platform-rules')
const { TrendingTopicsStore } = require('./trending-topics-store')

const STOP_WORDS = new Set([
  'this', 'that', 'and', 'the', 'for', 'with', 'from', 'what', 'have', 'been',
  'about', 'which', 'their', 'will', 'would', 'could', 'should', 'more', 'some',
  'than', 'also', 'very', 'just', 'like', 'make', 'been', 'being', 'does', 'done',
  'going', 'thing', 'things',
  '可以', '没有', '一个', '我们', '他们', '这个', '那个', '什么', '时候',
  '因为', '所以', '但是', '如果', '虽然', '怎么', '如何', '已经', '不是',
  '就是', '可能', '需要', '不会', '非常', '还是', '只是', '自己',
])

/**
 * 从文本抽取关键词（CJK 2+ 字 + 英文 3-20 字符，词频排序，停用词过滤）。
 * @param {string} text
 * @param {number} [maxKeywords=12]
 * @returns {string[]}
 */
function extractKeywords (text, maxKeywords = 12) {
  if (!text || text.length < 3) return []
  const clean = String(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[@#]\S+/g, '')

  const cjk = clean.match(/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]{2,}/g) || []
  const en = clean.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s,-]+/)
    .filter(w => w.length > 2 && w.length < 20)

  const freq = {}
  for (const w of [...cjk, ...en]) {
    freq[w] = (freq[w] || 0) + 1
  }

  return Object.entries(freq)
    .filter(([w]) => !STOP_WORDS.has(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([w]) => w)
}

/**
 * 摘词回退建议。
 * @param {string} content
 * @param {object} [opts]
 * @param {string[]} [opts.platforms]
 * @param {boolean} [opts.fallback] — 是否因 LLM 失败而降级（供前端提示）
 * @returns {object} SuggestTagsResult（source:'extractor'）
 */
function suggestFallback (content, opts = {}) {
  const platforms = Array.isArray(opts.platforms) && opts.platforms.length > 0
    ? opts.platforms.filter(p => DEFAULT_PLATFORMS.includes(p))
    : DEFAULT_PLATFORMS.slice()
  const keywords = extractKeywords(content, 12)

  // 空内容直接返回空结果（无关键词也无流量标签）
  if (keywords.length === 0) {
    const emptyByPlatform = {}
    const emptyDetail = {}
    const emptyMatched = {}
    for (const p of platforms) {
      emptyByPlatform[p] = []
      emptyDetail[p] = { content: [], traffic: [] }
      emptyMatched[p] = []
    }
    return {
      keywords: [],
      trafficTags: [],
      relatedTerms: [],
      byPlatform: emptyByPlatform,
      byPlatformDetail: emptyDetail,
      source: 'extractor',
      calibrated: false,
      matchedTopics: emptyMatched,
      fallback: !!opts.fallback,
    }
  }

  const byPlatform = {}
  const byPlatformDetail = {}
  const matchedTopics = {}

  const store = new TrendingTopicsStore()

  for (const p of platforms) {
    const style = getTagStyle(p)
    const contentTags = keywords.slice(0, style.max).map(k => applyPrefix(k, p))
    // 回退模式从热门库按 heat 补 top-2 作为流量标签
    const hot = store.topByHeat(p, 2)
    const hotTags = hot.map(t => applyPrefix(t.tag, p))
    const traffic = hotTags.slice(0, 2)
    const merged = [...contentTags, ...traffic].slice(0, style.max)

    byPlatformDetail[p] = { content: contentTags, traffic }
    byPlatform[p] = merged
    // matchedTopics 使用渲染形态（applyPrefix 规范化后），与前端 hotHeat 精确匹配一致
    matchedTopics[p] = hot.map(t => ({ tag: applyPrefix(t.tag, p), heat: t.heat }))
  }

  return {
    keywords,
    trafficTags: [],
    relatedTerms: [],
    byPlatform,
    byPlatformDetail,
    source: 'extractor',
    calibrated: false,
    matchedTopics,
    fallback: !!opts.fallback,
  }
}

module.exports = {
  extractKeywords,
  suggestFallback,
}
