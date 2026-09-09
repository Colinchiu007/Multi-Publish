// @ts-check
/**
 * FileParser — 本地文件内容解析（知识库导入用）
 *
 * 支持 .txt / .md / .docx。同步解析，文件大小限制（5MB）由上层校验。
 * - .txt: UTF-8 优先，检测到乱码回退 GBK（iconv-lite），编码不确定时用 jschardet 辅助
 * - .md: 剥离 YAML frontmatter，取首个 # 标题
 * - .docx: 使用 mammoth 提取纯文本
 */

const fs = require('fs')
const path = require('path')
const iconv = require('iconv-lite')

const MAX_CONTENT_LENGTH = 50000
const MAX_TITLE_LENGTH = 100

/**
 * 解析纯文本文件（UTF-8 优先，乱码时回退 GBK）
 * @param {string} filePath
 * @returns {{ title: string, content: string }}
 */
function parseTxt (filePath) {
  const buf = fs.readFileSync(filePath)
  let text = buf.toString('utf8')
  if (text.includes('\ufffd')) {
    try {
      text = iconv.decode(buf, 'gbk')
    } catch (_) { void _ }
  }
  const lines = text.split(/\r?\n/).filter(Boolean)
  const title = (lines[0] || '').slice(0, MAX_TITLE_LENGTH).trim()
  const content = text.slice(0, MAX_CONTENT_LENGTH)
  return { title, content }
}

/**
 * 解析 Markdown 文件（剥离 frontmatter，取首个 # 标题）
 * @param {string} filePath
 * @returns {{ title: string, content: string }}
 */
function parseMd (filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const cleaned = text.replace(/^---[\s\S]*?---\s*/m, '')
  const titleMatch = cleaned.match(/^#\s+(.+)/m)
  const title = titleMatch ? titleMatch[1].slice(0, MAX_TITLE_LENGTH).trim() : ''
  const content = cleaned.slice(0, MAX_CONTENT_LENGTH)
  return { title, content }
}

/**
 * 解析 Word 文档（mammoth 提取纯文本）
 * @param {string} filePath
 * @returns {Promise<{ title: string, content: string }>}
 */
async function parseDocx (filePath) {
  const mammoth = require('mammoth')
  const result = await mammoth.extractRawText({ path: filePath })
  const text = (result && result.value) || ''
  const lines = text.split(/\r?\n/).filter(Boolean)
  const title = (lines[0] || '').slice(0, MAX_TITLE_LENGTH).trim()
  const content = text.slice(0, MAX_CONTENT_LENGTH)
  return { title, content }
}

/**
 * 解析文件（按扩展名分发）
 * @param {string} filePath
 * @returns {Promise<{ title: string, content: string }>}
 */
async function parseFile (filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.txt') return parseTxt(filePath)
  if (ext === '.md') return parseMd(filePath)
  if (ext === '.docx' || ext === '.doc') return parseDocx(filePath)
  throw new Error('Unsupported file format: ' + ext)
}

/**
 * 是否支持该文件格式
 * @param {string} filePath
 * @returns {boolean}
 */
function isSupportedFile (filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return ['.txt', '.md', '.doc', '.docx'].includes(ext)
}

module.exports = { parseFile, isSupportedFile, parseTxt, parseMd, parseDocx }
