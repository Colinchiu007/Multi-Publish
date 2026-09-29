// @ts-check
/**
 * local-cover-generator.js — 本地封面生成器（零生图模型、零新增依赖）
 *
 * 用途：图文发布（小红书/快手/抖音图文）要求至少 1 张图片；无 AI 生图 provider 配置时，
 * 用「SVG（标题文字 + 渐变背景）→ sharp → PNG」产出标题卡封面，保证一键发布图文链路可用。
 *
 * 设计约束：
 * - sharp 已在 packages/shared-utils 依赖（hoisted node_modules），主进程可直接 require
 * - 标题折行：每行 ≤12 字（CJK 宽度近似），最多 5 行；超 60 字截断加省略号
 * - 比例：3:4（1080x1440，小红书/快手图文推荐竖版）/ 16:9（1920x1080）/ 1:1（1080x1080）
 * - 输出：os.tmpdir()/multi-publish-cover-local/<时间戳>-<随机>.png（与 AI 封面目录区分）
 */
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const RATIOS = Object.freeze({
  '3:4': { width: 1080, height: 1440 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
})

const MAX_TITLE_CHARS = 60
const CHARS_PER_LINE = 12
const MAX_LINES = 5

/** 标题折行：每行 ≤12 字，最多 5 行，超 60 字截断加省略号 */
function wrapTitle (rawTitle) {
  const title = String(rawTitle || '').trim()
  if (!title) return ['图文作品']
  const truncated = title.length > MAX_TITLE_CHARS
    ? title.slice(0, MAX_TITLE_CHARS - 1) + '…'
    : title
  const lines = []
  for (let i = 0; i < truncated.length && lines.length < MAX_LINES; i += CHARS_PER_LINE) {
    lines.push(truncated.slice(i, i + CHARS_PER_LINE))
  }
  return lines.length > 0 ? lines : ['图文作品']
}

/** 转义 SVG 文本特殊字符（标题是用户内容，防注入 SVG 标记） */
function escapeXml (text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 构造标题卡 SVG（渐变背景 + 居中标题 + 底部品牌条） */
function buildCoverSvg (title, { width, height }) {
  const lines = wrapTitle(title)
  const fontSize = Math.round(width / 1080 * 72)
  const lineHeight = Math.round(fontSize * 1.5)
  const totalTextHeight = lineHeight * lines.length
  const startY = Math.round((height - totalTextHeight) / 2 + fontSize * 0.8)
  const tspans = lines.map((line, i) =>
    `<tspan x="${width / 2}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `<stop offset="0%" stop-color="#1a2a6c"/><stop offset="50%" stop-color="#b21f1f"/><stop offset="100%" stop-color="#fdbb2d"/>`,
    `</linearGradient></defs>`,
    `<rect width="${width}" height="${height}" fill="url(#bg)"/>`,
    `<rect x="0" y="${height - Math.round(height * 0.06)}" width="${width}" height="${Math.round(height * 0.06)}" fill="rgba(0,0,0,0.35)"/>`,
    `<text x="${width / 2}" y="${startY}" text-anchor="middle" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff" fill-opacity="0.95">${tspans}</text>`,
    `</svg>`,
  ].join('')
}

/**
 * 生成本地标题卡封面
 * @param {string} title - 文章标题（折行/截断由内部处理）
 * @param {object} [options]
 * @param {string} [options.outputDir] - 输出目录（默认 os.tmpdir()/multi-publish-cover-local）
 * @param {string} [options.ratio] - 宽高比（默认 3:4 竖版）
 * @returns {Promise<{code:number,data:{path:string}|null,message?:string}>}
 */
async function generateLocalCover (title, options = {}) {
  try {
    const ratioKey = RATIOS[options.ratio] ? options.ratio : '3:4'
    const { width, height } = RATIOS[ratioKey]
    const outputDir = options.outputDir || path.join(os.tmpdir(), 'multi-publish-cover-local')
    fs.mkdirSync(outputDir, { recursive: true })
    const fileName = `cover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
    const outputPath = path.join(outputDir, fileName)

    const svg = buildCoverSvg(title, { width, height })
    const sharp = require('sharp')
    await sharp(Buffer.from(svg)).png().toFile(outputPath)

    if (!fs.existsSync(outputPath)) {
      return { code: -1, data: null, message: '本地封面写入失败' }
    }
    return { code: 0, data: { path: outputPath } }
  } catch (e) {
    return { code: -1, data: null, message: '本地封面生成失败：' + (e && e.message) }
  }
}

module.exports = { generateLocalCover, wrapTitle, buildCoverSvg, RATIOS }
