/**
 * Markdown -> HTML converter
 */
const { marked } = require('marked')

marked.setOptions({ gfm: true, breaks: true, smartLists: true })

/**
 * Detect if text is Markdown (not HTML)
 */
function detectMarkdown (text) {
  if (!text || typeof text !== 'string') return false
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return false

  const mdPatterns = [
    /^#{1,6}\s/m,
    /^\s*[-*+]\s/m,
    /^\s*\d+\.\s/m,
    /```[\s\S]*?```/,
    /`[^`]+`/,
    /\*\*[^*]+\*\*/,
    /__[^_]+__/,
    /\[([^\]]+)\]\([^)]+\)/,
    /!\[([^\]]*)\]\([^)]+\)/,
    /^>\s/m,
    /^---+$/m,
    /^\|[\s\S]+\|$/m,
  ]

  for (const p of mdPatterns) {
    if (p.test(trimmed)) return true
  }
  return false
}

/**
 * Markdown -> HTML
 */
function markdownToHtml (md, options) {
  options = options || {}
  if (!md || typeof md !== 'string') return ''
  var doSanitize = options.sanitize !== false
  var html = marked.parse(md)
  if (doSanitize) {
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
    html = html.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    html = html.replace(/<object[\s\S]*?<\/object>/gi, '')
    html = html.replace(/<embed[^>]*>/gi, '')
    html = html.replace(/<link[^>]*>/gi, '')
  }
  return html
}

/**
 * HTML -> Markdown
 */
function htmlToMarkdown (html) {
  if (!html || typeof html !== 'string') return ''
  return html
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<img[^>]*?src=["']([^"']+)["'][^>]*?alt=["']([^"']*)["'][^>]*>/gi, '![$2]($1)')
    .replace(/<img[^>]*?alt=["']([^"']*)["'][^>]*?src=["']([^"']+)["'][^>]*>/gi, '![$1]($2)')
    .replace(/<img[^>]*?src=["']([^"']+)["'][^>]*>/gi, '![]($1)')
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '> $1\n')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
    .replace(/<hr\s*\/?>/gi, '---\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

module.exports = { markdownToHtml, detectMarkdown, htmlToMarkdown }
