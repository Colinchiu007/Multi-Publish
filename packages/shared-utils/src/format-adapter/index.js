/**
 * 格式适配器 — 入口
 *
 * formatForPlatform(html, platform, options)
 *   → { title, content, tags, images, coverSize }
 *
 * 用法:
 *   const { formatForPlatform } = require('./format-adapter')
 *   const result = formatForPlatform('<h1>标题</h1><p>正文</p>', 'weibo')
 */
const { sanitize, stripHtml } = require('./sanitize')
const { markdownToHtml, detectMarkdown } = require('../md-converter')
const FORMATTERS = require('./formatters')
const { LIMITS } = require('./rules')

/**
 * 解析 HTML 为统一内部结构
 */
function normalize (html) {
  if (!html) {
    return { title: '', content: '', images: [], tags: [], originalHtml: '' }
  }

  // Auto-detect Markdown input and convert to HTML
  if (detectMarkdown(html)) {
    html = markdownToHtml(html, { sanitize: false })
  }

  const originalHtml = html

  // 提取标题：<h1> 或 <h2> 或第一段
  let title = ''
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
  if (h1Match) {
    title = stripHtml(h1Match[1])
  } else if (h2Match) {
    title = stripHtml(h2Match[1])
  } else {
    // 取第一个非空段落的前 64 字
    const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    if (pMatch) {
      title = stripHtml(pMatch[1]).slice(0, 64)
    }
  }

  // 提取图片 URL
  const images = []
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  let imgMatch
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    images.push(imgMatch[1])
  }

  // 提取标签 #xxx
  const tags = []
  const textContent = stripHtml(html)
  const tagRegex = /#([\u4e00-\u9fff\w-]+)/g
  let tagMatch
  while ((tagMatch = tagRegex.exec(textContent)) !== null) {
    const tag = tagMatch[1].trim()
    if (tag && !tags.includes(tag)) {
      tags.push(tag)
    }
  }

  return { title, content: html, images, tags, originalHtml }
}

/**
 * 格式化内容到指定平台
 * @param {string} html - 输入 HTML
 * @param {string} platform - 平台标识
 * @param {object} [options] - 可选参数
 * @returns {object} { title, content, tags, images, coverSize }
 */
function formatForPlatform (html, platform, options = {}) {
  // 校验平台
  if (!FORMATTERS[platform]) {
    const supported = Object.keys(FORMATTERS)
    throw new Error(`不支持的平台: ${platform}。支持的平台: ${supported.join(', ')}`)
  }

  // 1. 解析为统一结构
  const struct = normalize(html)

  // 2. 按平台白名单清理 HTML
  struct.content = sanitize(struct.content, platform)

  // 3. 获取平台限制
  const limit = LIMITS[platform]

  // 4. 调用平台格式化函数
  const formatted = FORMATTERS[platform](struct)

  // 5. 确保覆盖 limit
  if (!formatted.coverSize) {
    formatted.coverSize = limit ? limit.coverSize : null
  }

  return {
    title: formatted.title || '',
    content: formatted.content || '',
    tags: formatted.tags || [],
    images: struct.images || [],
    coverSize: formatted.coverSize,
  }
}

/**
 * 获取所有支持的平台列表
 */
function listPlatforms () {
  return Object.keys(FORMATTERS)
}

/**
 * 获取平台限制信息
 */
function getPlatformLimit (platform) {
  return LIMITS[platform] || null
}

module.exports = {
  formatForPlatform,
  listPlatforms,
  getPlatformLimit,
  normalize,
}
