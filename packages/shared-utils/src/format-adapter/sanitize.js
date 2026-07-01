/**
 * HTML 清理 / 标签白名单
 */

// 各平台允许的 HTML 标签白名单
const ALLOWED_TAGS = {
  wechat_mp: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a', 'img', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'span', 'div', 'section'],
  zhihu: ['p', 'br', 'b', 'strong', 'i', 'em', 'a', 'img', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'hr'],
  weibo: [], // 纯文本
  douyin: [],
  xiaohongshu: [],
  tencent_video: [],
  kuaishou: [],
  toutiao: ['p', 'br', 'b', 'strong', 'i', 'a', 'img', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li'],
  youtube: [],
  tiktok: [],
  bilibili: ['p', 'br', 'b', 'strong', 'i', 'a', 'img', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'pre', 'code'],
}

/**
 * 移除 HTML 标签，返回纯文本
 */
function stripHtml (html) {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 按平台白名单过滤 HTML
 * @param {string} html
 * @param {string} platform
 * @returns {string}
 */
function sanitize (html, platform) {
  if (!html) return ''
  const allowed = ALLOWED_TAGS[platform]
  if (!allowed || allowed.length === 0) {
    return stripHtml(html)
  }
  // 简单白名单过滤：只保留允许的标签
  const allowedSet = new Set(allowed)
  return html.replace(/<\/?([a-zA-Z0-9]+)[^>]*>/g, (match, tag) => {
    const tagName = tag.toLowerCase()
    if (allowedSet.has(tagName)) return match
    // 替换为空格
    return ' '
  }).replace(/\s+/g, ' ').trim()
}

module.exports = { sanitize, stripHtml, ALLOWED_TAGS }
