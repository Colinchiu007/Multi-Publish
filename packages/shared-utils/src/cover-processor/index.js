/**
 * 封面图自动处理器
 *
 * 输入图片路径 → 按平台预设裁剪/压缩/格式转换 → 输出处理后的图片
 *
 * 用法:
 *   const { processCover, getPreset, parseCoverSize } = require('./cover-processor')
 *   const result = await processCover('/path/to/image.jpg', 'weibo', '/output/dir')
 *   // → { path, width, height, size, format }
 */
const path = require('path')
const fs = require('fs')
const sharp = require('sharp')
const { PRESETS } = require('./presets')

/**
 * 获取平台封面预设
 * @param {string} platform
 * @returns {object|null} { width, height, format, maxSize, quality }
 */
function getPreset (platform) {
  return PRESETS[platform] || null
}

/**
 * 解析 coverSize 字符串 "宽x高"
 * @param {string} str - 如 "900x500"
 * @returns {object|null} { width, height }
 */
function parseCoverSize (str) {
  if (!str || typeof str !== 'string') return null
  const parts = str.split('x').map(Number)
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null
  return { width: parts[0], height: parts[1] }
}

/**
 * 处理封面图
 *
 * @param {string} inputPath - 输入图片路径
 * @param {string|object} platformOrPreset - 平台标识 或 { width, height, format, maxSize }
 * @param {string} outputDir - 输出目录
 * @param {object} [options]
 * @param {boolean} [options.keepOriginal=false] - 保留原始文件
 * @returns {Promise<object>} { path, width, height, size, format }
 */
async function processCover (inputPath, platformOrPreset, outputDir, options = {}) {
  if (!inputPath) throw new Error('输入路径不能为空')
  if (!fs.existsSync(inputPath)) throw new Error(`文件不存在: ${inputPath}`)

  // 解析预设
  let preset
  if (typeof platformOrPreset === 'string') {
    preset = getPreset(platformOrPreset)
    if (!preset) throw new Error(`不支持的平台: ${platformOrPreset}`)
  } else if (platformOrPreset && platformOrPreset.width) {
    preset = platformOrPreset
  } else {
    throw new Error('需要 platform 标识或 {width, height} 预设')
  }

  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // 读取原图
  const metadata = await sharp(inputPath).metadata()

  // 计算中心裁剪
  const targetRatio = preset.width / preset.height
  const sourceRatio = metadata.width / metadata.height

  let resizeWidth, resizeHeight, cropLeft, cropTop, cropWidth, cropHeight

  if (sourceRatio > targetRatio) {
    // 原图更宽 → 裁剪宽度
    cropHeight = metadata.height
    cropWidth = Math.round(metadata.height * targetRatio)
    cropLeft = Math.round((metadata.width - cropWidth) / 2)
    cropTop = 0
  } else {
    // 原图更高 → 裁剪高度
    cropWidth = metadata.width
    cropHeight = Math.round(metadata.width / targetRatio)
    cropTop = Math.round((metadata.height - cropHeight) / 2)
    cropLeft = 0
  }

  // 生成输出文件名
  const ext = preset.format === 'jpeg' ? '.jpg' : `.${preset.format}`
  const basename = path.basename(inputPath, path.extname(inputPath))
  const outputPath = path.join(outputDir, `${basename}_${preset.width}x${preset.height}${ext}`)

  // 裁剪 + 缩放 + 格式转换
  let pipeline = sharp(inputPath)
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .resize(preset.width, preset.height)

  // 格式转换 + 质量
  if (preset.format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: preset.quality, mozjpeg: true })
  } else if (preset.format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 9 })
  } else if (preset.format === 'webp') {
    pipeline = pipeline.webp({ quality: preset.quality })
  }

  await pipeline.toFile(outputPath)

  // 检查输出文件大小，如果超限，降低质量重试
  const stat = fs.statSync(outputPath)
  let finalQuality = preset.quality

  if (stat.size > preset.maxSize && preset.format === 'jpeg' && finalQuality > 30) {
    // 二分法降低质量
    let low = 30
    let high = finalQuality
    let bestPath = outputPath

    for (let i = 0; i < 5; i++) {
      const mid = Math.round((low + high) / 2)
      const trialPath = outputPath.replace('.jpg', `_q${mid}.jpg`)

      await sharp(inputPath)
        .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
        .resize(preset.width, preset.height)
        .jpeg({ quality: mid, mozjpeg: true })
        .toFile(trialPath)

      const trialStat = fs.statSync(trialPath)
      if (trialStat.size <= preset.maxSize) {
        // 可以接受，尝试更高质量
        low = mid + 1
        bestPath = trialPath
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
        fs.renameSync(trialPath, outputPath)
        break
      } else {
        high = mid - 1
        fs.unlinkSync(trialPath)
      }
    }

    finalQuality = low
  }

  const finalStat = fs.statSync(outputPath)

  return {
    path: outputPath,
    width: preset.width,
    height: preset.height,
    size: finalStat.size,
    format: preset.format,
    quality: finalQuality,
  }
}

/**
 * 获取所有平台预设列表
 */
function listPresets () {
  return Object.entries(PRESETS).map(([platform, preset]) => ({
    platform,
    ...preset,
  }))
}

module.exports = {
  processCover,
  getPreset,
  parseCoverSize,
  listPresets,
  PRESETS,
}
