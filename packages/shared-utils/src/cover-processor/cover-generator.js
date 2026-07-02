/**
 * Cover template generator
 *
 * Generates cover images from title text + platform dimensions.
 * Uses sharp for SVG overlay rendering.
 *
 * Usage:
 *   const { generateCover, COVER_TEMPLATES } = require('./cover-generator')
 *   const result = await generateCover('Article Title', 'weibo', '/output')
 *   // -> { path, width, height, format }
 */
const path = require('path')
const fs = require('fs')
const sharp = require('sharp')
const { PRESETS } = require('./presets')

/**
 * Available cover templates
 */
const COVER_TEMPLATES = {
  solid: {
    name: 'Solid color',
    backgrounds: ['#E8553A', '#2D5BE3', '#1DB954', '#FF6B35', '#6C5CE7', '#00B894', '#E17055', '#0984E3'],
  },
  gradient: {
    name: 'Gradient',
    backgrounds: [
      { start: '#E8553A', end: '#FF8A65' },
      { start: '#2D5BE3', end: '#74B9FF' },
      { start: '#6C5CE7', end: '#A29BFE' },
      { start: '#00B894', end: '#55EFC4' },
      { start: '#E17055', end: '#FAB1A0' },
      { start: '#0984E3', end: '#74B9FF' },
    ],
  },
  dark: {
    name: 'Dark with accent',
    backgrounds: ['#1A1A2E', '#16213E', '#0F3460', '#1B1B2F', '#2C3E50'],
  },
}

/**
 * Wrap text into lines that fit within maxWidth
 */
function wrapText (text, maxCharsPerLine) {
  if (!text) return ['']
  const lines = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxCharsPerLine) {
      lines.push(remaining)
      break
    }
    let breakPoint = maxCharsPerLine
    // Try to break at a space
    const lastSpace = remaining.lastIndexOf(' ', maxCharsPerLine)
    if (lastSpace > maxCharsPerLine * 0.5) {
      breakPoint = lastSpace
    }
    lines.push(remaining.slice(0, breakPoint))
    remaining = remaining.slice(breakPoint).trimStart()
  }

  return lines.slice(0, 3) // max 3 lines
}

/**
 * Build SVG overlay with title text
 */
function buildTitleSvg (title, width, height, options = {}) {
  const {
    textColor = '#FFFFFF',
    fontFamily = 'Arial, Helvetica, sans-serif',
    template = 'solid',
    bgColor = '#E8553A',
    bgColorEnd = null,
  } = options

  // Calculate font size based on width
  const maxChars = Math.floor(width / 16)
  const fontSize = width >= 1080 ? 48 : width >= 720 ? 36 : 28
  const titleLines = wrapText(title || 'Untitled', maxChars)

  // Background
  let bgSvg = ''
  if (template === 'gradient' && bgColorEnd) {
    bgSvg = `<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:${bgColor}"/><stop offset="100%" style="stop-color:${bgColorEnd}"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#bg)"/>`
  } else {
    bgSvg = `<rect width="${width}" height="${height}" fill="${bgColor}"/>`
  }

  // Title text — centered vertically
  const lineHeight = fontSize * 1.4
  const totalTextHeight = titleLines.length * lineHeight
  const startY = (height - totalTextHeight) / 2 + fontSize * 0.35

  const textElements = titleLines.map((line, i) => {
    const escapedLine = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const y = startY + i * lineHeight
    return `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="${fontFamily}" font-size="${fontSize}" font-weight="bold" fill="${textColor}">${escapedLine}</text>`
  }).join('\n    ')

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${bgSvg}
    <g>
      ${textElements}
    </g>
  </svg>`
}

/**
 * Get a random item from an array
 */
function randomItem (arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Generate a cover image from title text
 *
 * @param {string} title - Article title
 * @param {string|object} platformOrSize - Platform id or { width, height }
 * @param {string} outputDir - Output directory
 * @param {object} [options]
 * @param {string} [options.template='solid'] - Template type (solid/gradient/dark)
 * @param {string} [options.bgColor] - Override background color
 * @param {string} [options.textColor] - Override text color
 * @returns {Promise<object>} { path, width, height, format }
 */
async function generateCover (title, platformOrSize, outputDir, options = {}) {
  // Resolve dimensions
  let width, height
  if (typeof platformOrSize === 'string') {
    const preset = PRESETS[platformOrSize]
    if (!preset) throw new Error(`Unknown platform: ${platformOrSize}`)
    width = preset.width
    height = preset.height
  } else if (platformOrSize && platformOrSize.width) {
    width = platformOrSize.width
    height = platformOrSize.height
  } else {
    throw new Error('Need platform id or {width, height}')
  }

  // Resolve template
  const templateType = options.template || 'solid'
  const template = COVER_TEMPLATES[templateType]
  if (!template) throw new Error(`Unknown template: ${templateType}`)

  // Pick background color
  let bgColor, bgColorEnd = null
  if (options.bgColor) {
    bgColor = options.bgColor
  } else {
    const bg = randomItem(template.backgrounds)
    if (typeof bg === 'object') {
      bgColor = bg.start
      bgColorEnd = bg.end
    } else {
      bgColor = bg
    }
  }

  // Build SVG
  const svg = buildTitleSvg(title, width, height, {
    bgColor,
    bgColorEnd,
    template: templateType,
    textColor: options.textColor || '#FFFFFF',
  })

  // Ensure output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Generate filename
  const slug = (title || 'cover')
    .replace(/[^\w\u4e00-\u9fff]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
  const outputPath = path.join(outputDir, `cover_${slug}_${width}x${height}.png`)

  // Render SVG to PNG
  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath)

  return {
    path: outputPath,
    width,
    height,
    format: 'png',
  }
}

module.exports = { generateCover, buildTitleSvg, wrapText, COVER_TEMPLATES }
