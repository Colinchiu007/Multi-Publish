/**
 * CoverProcessor — 封面图自动处理
 *
 * 功能：下载 URL → 自动裁剪/缩放 → 压缩 → 保存到缓存
 *
 * 各平台封面图规格：
 *   wechat_mp: 900x500  JPEG < 5MB
 *   zhihu:      720x480  JPEG < 2MB
 *   weibo:      980x任意 PNG < 20MB
 *   douyin:     1080x1920 JPEG < 5MB
 *   xiaohongshu: 任意比例 JPEG/PNG < 10MB
 *   youtube:    1280x720  JPEG < 2MB
 */
const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const crypto = require('crypto')

const COVER_DIR = 'cover-cache'
const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024  // 50MB max download

const PLATFORM_SPECS = {
  wechat_mp:     { width: 900,  height: 500,  format: 'jpeg', maxSize: 5 * 1024 * 1024 },
  zhihu:         { width: 720,  height: 480,  format: 'jpeg', maxSize: 2 * 1024 * 1024 },
  weibo:         { width: 980,  height: null, format: 'jpeg', maxSize: 20 * 1024 * 1024 },
  douyin:        { width: 1080, height: 1920, format: 'jpeg', maxSize: 5 * 1024 * 1024 },
  xiaohongshu:   { width: null, height: null, format: 'jpeg', maxSize: 10 * 1024 * 1024 },
  tencent_video: { width: null, height: null, format: 'jpeg', maxSize: 5 * 1024 * 1024 },
  kuaishou:      { width: null, height: null, format: 'jpeg', maxSize: 5 * 1024 * 1024 },
  toutiao:       { width: 720,  height: 400,  format: 'jpeg', maxSize: 5 * 1024 * 1024 },
  youtube:       { width: 1280, height: 720,  format: 'jpeg', maxSize: 2 * 1024 * 1024 },
  tiktok:        { width: 1080, height: 1920, format: 'jpeg', maxSize: 5 * 1024 * 1024 },
}

class CoverProcessor {
  /**
   * 获取封面缓存目录
   */
  static getCoverDir (userDataDir) {
    return path.join(userDataDir || process.cwd(), COVER_DIR)
  }

  /**
   * 处理封面图：下载 → 校验 → 裁剪
   * @param {string} imageUrl - 图片 URL
   * @param {string} platform - 平台标识
   * @param {object} [options]
   * @param {string} [options.userDataDir] - Electron userData 目录
   * @returns {Promise<{path: string, width: number, height: number, size: number}>}
   */
  static async process (imageUrl, platform, options = {}) {
    if (!imageUrl) throw new Error('封面图 URL 不能为空')

    const spec = PLATFORM_SPECS[platform]
    if (!spec) {
      // 未知平台，直接下载不做处理
      return this._downloadOnly(imageUrl, options.userDataDir)
    }

    const coverDir = this.getCoverDir(options.userDataDir)
    fs.mkdirSync(coverDir, { recursive: true })

    // 下载
    const localPath = await this._download(imageUrl, coverDir)
    const stats = fs.statSync(localPath)
    let finalPath = localPath

    // 检查尺寸
    const dimensions = await this._getDimensions(localPath)

    // 如果超出目标尺寸，尝试裁剪
    if (spec.width && dimensions.width > spec.width) {
      finalPath = await this._resize(localPath, spec.width, spec.height, coverDir)
    }

    // 检查大小，如果超出限制尝试压缩
    let finalStats = fs.statSync(finalPath)
    if (spec.maxSize && finalStats.size > spec.maxSize) {
      finalPath = await this._compress(finalPath, spec.maxSize, coverDir)
      finalStats = fs.statSync(finalPath)
    }

    const finalDims = await this._getDimensions(finalPath)

    return {
      path: finalPath,
      width: finalDims.width,
      height: finalDims.height,
      size: finalStats.size,
      originalUrl: imageUrl,
      platform,
    }
  }

  /**
   * 下载图片到本地缓存
   */
  static _download (url, destDir) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5').update(url).digest('hex')
      const ext = path.extname(new URL(url).pathname) || '.jpg'
      const localPath = path.join(destDir, hash + ext)

      if (fs.existsSync(localPath)) {
        resolve(localPath)
        return
      }

      const transport = url.startsWith('https') ? https : http
      transport.get(url, { timeout: 30000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // 重定向
          return this._download(res.headers.location, destDir).then(resolve, reject)
        }
        if (res.statusCode !== 200) {
          reject(new Error(`下载失败: HTTP ${res.statusCode}`))
          return
        }

        const chunks = []
        let totalSize = 0
        res.on('data', (chunk) => {
          totalSize += chunk.length
          if (totalSize > MAX_DOWNLOAD_SIZE) {
            res.destroy()
            reject(new Error('图片超过 50MB 限制'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          const buffer = Buffer.concat(chunks)
          fs.writeFileSync(localPath, buffer)
          resolve(localPath)
        })
      })
      .on('error', reject)
      .on('timeout', function () { this.destroy(); reject(new Error('下载超时')) })
    })
  }

  /**
   * 仅下载不做处理
   */
  static async _downloadOnly (url, userDataDir) {
    const coverDir = this.getCoverDir(userDataDir)
    fs.mkdirSync(coverDir, { recursive: true })
    const localPath = await this._download(url, coverDir)
    return { path: localPath, originalUrl: url, platform: 'unknown' }
  }

  /**
   * 获取图片尺寸（通过读取文件头）
   */
  static _getDimensions (filePath) {
    return new Promise((resolve) => {
      try {
        const fd = fs.openSync(filePath, 'r')
        const buf = Buffer.alloc(24)
        fs.readSync(fd, buf, 0, 24, 0)
        fs.closeSync(fd)

        let width = 0
        let height = 0

        // JPEG
        if (buf[0] === 0xFF && buf[1] === 0xD8) {
          let offset = 2
          while (offset < buf.length) {
            if (buf[offset] === 0xFF && buf[offset + 1] === 0xC0) {
              height = buf.readUInt16BE(offset + 5)
              width = buf.readUInt16BE(offset + 7)
              break
            }
            offset++
          }
        }
        // PNG
        else if (buf[0] === 0x89 && buf[1] === 0x50) {
          width = buf.readUInt32BE(16)
          height = buf.readUInt32BE(20)
        }
        // GIF
        else if (buf[0] === 0x47 && buf[1] === 0x49) {
          width = buf.readUInt16LE(6)
          height = buf.readUInt16LE(8)
        }

        resolve({ width, height })
      } catch (e) {
        resolve({ width: 0, height: 0 })
      }
    })
  }

  /**
   * 缩放图片（需要 sharp 库，回退到复制）
   */
  static async _resize (filePath, maxWidth, maxHeight, destDir) {
    // 优先使用 sharp
    try {
      const sharp = require('sharp')
      const ext = path.extname(filePath)
      const outputPath = path.join(destDir, path.basename(filePath, ext) + '_resized' + ext)
      await sharp(filePath)
        .resize(maxWidth, maxHeight || undefined, { fit: 'inside', withoutEnlargement: true })
        .toFile(outputPath)
      return outputPath
    } catch (e) {
      // sharp not available — 返回原文件
      const outPath = path.join(destDir, path.basename(filePath) + '.resized' + path.extname(filePath))
      fs.copyFileSync(filePath, outPath)
      return outPath
    }
  }

  /**
   * 压缩图片（需要 sharp，回退到返回原文件）
   */
  static async _compress (filePath, maxSize, destDir) {
    try {
      const sharp = require('sharp')
      let quality = 85
      const ext = path.extname(filePath)
      let outputPath = path.join(destDir, path.basename(filePath, ext) + '_compressed' + ext)

      // 迭代降低质量
      while (quality > 20) {
        await sharp(filePath)
          .jpeg({ quality })
          .toFile(outputPath)
        const outSize = fs.statSync(outputPath).size
        if (outSize <= maxSize) return outputPath
        quality -= 15
      }
      return outputPath
    } catch (e) {
      return filePath
    }
  }
}

module.exports = CoverProcessor