/**
 * Title Optimizer — AI-style title suggestion engine
 *
 * Generates multiple title variants based on:
 * - Input title + keywords
 * - High-engagement title patterns
 * - Platform-specific character limits
 * - Chinese/English title templates
 *
 * Usage:
 *   const { optimizeTitle, TITLE_TEMPLATES } = require('./title-optimizer')
 *   const result = optimizeTitle('Python 教程', ['python', '教程', '入门'], { platform: 'zhihu' })
 *   // -> { original, variants: [{ text, score, style }], keywords }
 */

// ── Title Templates ──────────────────────────────────────────────

const TITLE_TEMPLATES = {
  // Number/list style
  number: [
    '{num}个{topic}技巧',
    '{num}个你不知道的{topic}',
    '{num}个{topic}方法，第{last}个最实用',
    '{num}个{topic}常见错误',
    '{num}种{topic}方案对比',
    'Top {num}: {topic}',
    '{num} ways to {topic_en}',
  ],
  // Question style
  question: [
    '为什么{topic}这么{adj}？',
    '{topic}到底该怎么学？',
    '如何用{topic}提升{benefit}？',
    '{topic}真的有用吗？',
    '怎样才能学好{topic}？',
    'What makes {topic} so {adj_en}?',
    'How to master {topic_en}?',
  ],
  // How-to style
  howto: [
    '{topic}从入门到精通',
    '手把手教你{topic}',
    '{topic}完全指南',
    '{topic}实战教程',
    '一文搞懂{topic}',
    '{topic}保姆级教程',
    'The ultimate guide to {topic_en}',
  ],
  // Comparison/debate style
  compare: [
    '{topic} vs {topic2}：该选哪个？',
    '{topic}：优点和缺点全分析',
    '为什么{topic}比你想象的更好',
    '{topic}深度评测',
    '{topic}：你真的了解吗？',
  ],
  // Story/emotional style
  story: [
    '我花了{time}学习{topic}，这是经验总结',
    '{topic}踩坑记录，希望你别走弯路',
    '从零开始学{topic}，我的{time}心得',
    '分享一个{topic}的实用技巧',
    '{topic}：一个被低估的{tool}',
  ],
  // Trending/urgency style
  trend: [
    '2026年{topic}趋势分析',
    '{topic}最新变化，你必须知道',
    '{topic}新玩法：{technique}',
    '别再用老方法了！{topic}这样更高效',
  ],
}

// ── Scoring Heuristics ───────────────────────────────────────────

/**
 * Score a title based on engagement heuristics
 */
function scoreTitle (title, keywords, platform) {
  let score = 50  // base score

  // Length bonus (optimal range varies by platform)
  const optimalRange = getOptimalRange(platform)
  if (title.length >= optimalRange.min && title.length <= optimalRange.max) {
    score += 15
  } else if (title.length > optimalRange.max) {
    score -= 20
  }

  // Keyword presence
  const lower = title.toLowerCase()
  let kwCount = 0
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) kwCount++
  }
  score += Math.min(kwCount * 8, 24)

  // Style bonuses
  if (/\d+/.test(title)) score += 8       // numbers
  if (/[？?!]/.test(title)) score += 5    // question marks
  if (/[：:]/.test(title)) score += 3     // colons (structure)
  if (title.includes('最') || title.includes('必') || title.includes('全')) score += 5  // power words

  // Penalty for being too short
  if (title.length < 8) score -= 15

  return Math.min(Math.max(score, 0), 100)
}

function getOptimalRange (platform) {
  const ranges = {
    weibo: { min: 15, max: 100 },
    zhihu: { min: 10, max: 50 },
    wechat_mp: { min: 8, max: 64 },
    douyin: { min: 10, max: 30 },
    xiaohongshu: { min: 10, max: 20 },
    bilibili: { min: 10, max: 80 },
    toutiao: { min: 10, max: 30 },
    youtube: { min: 20, max: 60 },
    tiktok: { min: 10, max: 30 },
    tencent_video: { min: 10, max: 30 },
    kuaishou: { min: 10, max: 30 },
  }
  return ranges[platform] || { min: 10, max: 60 }
}

// ── Main Optimizer ───────────────────────────────────────────────

/**
 * Generate optimized title variants
 *
 * @param {string} title - Original title
 * @param {string[]} keywords - Extracted keywords
 * @param {object} [options]
 * @param {string} [options.platform] - Target platform
 * @param {number} [options.maxVariants=6] - Max variants to return
 * @param {string[]} [options.styles] - Preferred template styles
 * @returns {object} { original, variants: [{ text, score, style }], keywords, suggestions }
 */
function optimizeTitle (title, keywords, options = {}) {
  if (!title || typeof title !== 'string') {
    return { original: '', variants: [], keywords: keywords || [], suggestions: [] }
  }

  const {
    platform = null,
    maxVariants = 6,
    styles = null,
  } = options

  const kw = keywords || []
  const variants = []

  // Pick templates to use
  const templateStyles = styles || Object.keys(TITLE_TEMPLATES)

  // Extract topic from title (remove common prefixes)
  const topic = title
    .replace(/^(关于|谈谈|说说|聊聊|浅谈|浅析|深入|详解|一文|手把手|保姆级)\s*/g, '')
    .slice(0, 20)

  const topicEn = topic.replace(/[\u4e00-\u9fff]+/g, '').trim() || 'this topic'

  // Fill templates
  for (const style of templateStyles) {
    const templates = TITLE_TEMPLATES[style]
    if (!templates) continue

    for (const tmpl of templates) {
      let text = tmpl
        .replace(/{topic}/g, topic)
        .replace(/{topic_en}/g, topicEn)
        .replace(/{topic2}/g, kw[1] || 'alternatives')
        .replace(/{num}/g, String(Math.floor(Math.random() * 8) + 3))
        .replace(/{last}/g, String(Math.floor(Math.random() * 5) + 1))
        .replace(/{adj}/g, getAdj(kw))
        .replace(/{adj_en}/g, 'awesome')
        .replace(/{benefit}/g, kw[0] || '效率')
        .replace(/{time}/g, getTimeWord())
        .replace(/{tool}/g, '工具')
        .replace(/{technique}/g, kw[0] || '技巧')

      // Trim to platform limit
      if (platform) {
        const range = getOptimalRange(platform)
        if (text.length > range.max) {
          text = text.slice(0, range.max - 1) + '...'
        }
      }

      const score = scoreTitle(text, kw, platform)

      variants.push({ text, score, style })
    }
  }

  // Sort by score, take top N
  variants.sort((a, b) => b.score - a.score)
  const topVariants = variants.slice(0, maxVariants)

  // Generate suggestions
  const suggestions = []
  if (title.length > 60) suggestions.push('标题过长，建议控制在 30 字以内')
  if (title.length < 8) suggestions.push('标题过短，建议补充关键词')
  if (kw.length > 0 && !title.toLowerCase().includes(kw[0].toLowerCase())) {
    suggestions.push(`建议在标题中加入关键词「${kw[0]}」`)
  }
  if (!/[？?!]/.test(title) && !/\d+/.test(title)) {
    suggestions.push('添加数字或问号可以提升点击率')
  }

  return {
    original: title,
    variants: topVariants,
    keywords: kw,
    suggestions,
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function getAdj (keywords) {
  const adjs = ['实用', '重要', '有趣', '高效', '简单', '强大']
  return adjs[Math.floor(Math.random() * adjs.length)]
}

function getTimeWord () {
  const words = ['半年', '一年', '三个月', '两年', '数年']
  return words[Math.floor(Math.random() * words.length)]
}

module.exports = { optimizeTitle, scoreTitle, TITLE_TEMPLATES, getOptimalRange }
