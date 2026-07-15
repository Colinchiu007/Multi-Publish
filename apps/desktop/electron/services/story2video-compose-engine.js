// @ts-check
/**
 * Story2VideoComposeEngine — 基于 ffmpeg 的视频合成引擎
 *
 * 职责：
 *   - 接收 assetManifest（图片 + TTS 音频 + 字幕）
 *   - 用 ffmpeg 将每张图片配对应音频合成视频片段
 *   - 拼接所有片段为最终视频
 *
 * 设计意图：
 *   替代 ServiceBus 中的占位响应，让 story2video-compose 流水线真正产出视频。
 *   不依赖 Remotion/Canvas，纯 Node.js + ffmpeg 子进程。
 */
'use strict'

const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

// 查找 ffmpeg 可执行文件
function findFfmpeg () {
  // 1. 环境变量 FFMPEG_PATH（最高优先级）
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH
  }
  // 2. 系统 PATH 查找
  try {
    require('child_process').execSync('ffmpeg -version', { stdio: 'ignore' })
    return 'ffmpeg'
  } catch {
    // 3. 常见安装位置（跨平台，非开发者路径）
    const commonPaths = process.platform === 'win32'
      ? [
          'C:\\ffmpeg\\bin\\ffmpeg.exe',
          path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'ffmpeg', 'bin', 'ffmpeg.exe'),
        ]
      : ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg']
    for (const p of commonPaths) {
      if (p && fs.existsSync(p)) return p
    }
  }
  return null
}

const FFMPEG = findFfmpeg()

/**
 * 转义 ffmpeg drawtext 滤镜中的字幕文本
 *
 * ffmpeg drawtext 的 text 参数在单引号上下文中，以下字符需转义：
 *   - \  必须最先转义（否则后续转义符 \ 会被二次转义）
 *   - :  滤镜参数分隔符
 *   - '  单引号字符串结束符
 *   - ,  滤镜链分隔符
 *   - %  避免 %{...} 函数扩展（如 %{n} 帧号）
 *   - { } 避免 ${...} 变量扩展
 *
 * @param {string} text - 原始字幕文本
 * @returns {string} 转义后的文本，可直接用于 drawtext=text='...'
 */
function escapeSubtitleText (text) {
  if (!text) return ''
  return text
    .replace(/\\/g, '\\\\')  // 1. 反斜杠最先转义（\ → \\）
    .replace(/:/g, '\\:')    // 2. 冒号
    .replace(/'/g, "\\'")    // 3. 单引号
    .replace(/,/g, '\\,')    // 4. 逗号
    .replace(/%/g, '\\%')    // 5. 百分号
    .replace(/\{/g, '\\{')   // 6. 左花括号
    .replace(/\}/g, '\\}')   // 7. 右花括号
}

class Story2VideoComposeEngine {
  /**
   * @param {object} [opts]
   * @param {string} [opts.outputDir] - 输出目录（默认 os.tmpdir）
   * @param {object} [opts.log] - 日志模块
   * @param {number} [opts.maxSessionAgeMs] - 历史 sessionDir 最大保留时间 ms（默认 24h）
   */
  constructor (opts) {
    opts = opts || {}
    this.outputDir = opts.outputDir || path.join(os.tmpdir(), 'story2video')
    this.log = opts.log || require('./logger')
    this.maxSessionAgeMs = opts.maxSessionAgeMs || 24 * 60 * 60 * 1000
    this._segmentSeq = 0
  }

  /**
   * 合成视频
   * @param {object} assetManifest - generate_assets 阶段的输出
   * @param {object} [options] - 合成选项
   * @returns {Promise<{code: number, data?: object, message?: string}>}
   */
  async compose (assetManifest, options) {
    if (!FFMPEG) {
      return { code: -1, message: 'ffmpeg not found' }
    }

    if (!assetManifest || !assetManifest.images || !assetManifest.audio) {
      return { code: -1, message: 'Invalid assetManifest: missing images or audio' }
    }

    // 确保输出目录存在
    fs.mkdirSync(this.outputDir, { recursive: true })

    // P2-7: 启动时清理历史残留 sessionDir（超过 maxSessionAgeMs）
    this._cleanupOldSessions()

    const sessionId = 's2v_' + Date.now()
    const sessionDir = path.join(this.outputDir, sessionId)
    fs.mkdirSync(sessionDir, { recursive: true })

    const transition = options?.transition || 'fade'
    const subtitleEnabled = options?.subtitleEnabled !== false

    this.log.info('Story2VideoCompose', 'Composing video: ' +
      assetManifest.images.length + ' images, ' +
      assetManifest.audio.length + ' audio clips')

    // 1. 为每个图片+音频对创建视频片段
    const segments = []
    const sentences = assetManifest.sentences || []

    for (let i = 0; i < assetManifest.images.length; i++) {
      const img = assetManifest.images[i]
      const aud = assetManifest.audio[i]
      if (!img || !img.path || !aud || !aud.path) {
        this.log.warn('Story2VideoCompose', 'Skipping segment ' + i + ': missing image or audio')
        continue
      }

      const segPath = path.join(sessionDir, 'seg_' + String(i).padStart(4, '0') + '.mp4')
      const subtitleText = sentences[i]?.text || ''

      try {
        await this._createSegment(img.path, aud.path, segPath, {
          duration: aud.duration || null,
          subtitleText: subtitleEnabled ? subtitleText : '',
          transition,
        })
        segments.push(segPath)
        this.log.info('Story2VideoCompose', 'Segment ' + i + ' created: ' + path.basename(segPath))
      } catch (e) {
        this.log.warn('Story2VideoCompose', 'Segment ' + i + ' failed: ' + e.message)
      }
    }

    if (segments.length === 0) {
      // P2-7: 失败时清理 sessionDir
      this._cleanupSession(sessionDir)
      return { code: -1, message: 'All segments failed to create' }
    }

    // 2. 拼接所有片段
    const outputPath = path.join(sessionDir, 'output.mp4')
    try {
      if (segments.length === 1) {
        fs.copyFileSync(segments[0], outputPath)
      } else {
        await this._concatSegments(segments, outputPath, sessionDir)
      }
    } catch (e) {
      // P2-7: 拼接失败时清理 sessionDir
      this._cleanupSession(sessionDir)
      throw e
    }

    // 3. 验证输出
    if (!fs.existsSync(outputPath)) {
      this._cleanupSession(sessionDir)
      return { code: -1, message: 'Output file not created' }
    }

    // P2-7: 成功后，将 output.mp4 移到 outputDir 根目录，清理 sessionDir
    const finalPath = path.join(this.outputDir, sessionId + '_output.mp4')
    try {
      fs.copyFileSync(outputPath, finalPath)
    } catch (e) {
      // 移动失败则保留原路径（output.mp4 仍在 sessionDir 内）
      this.log.warn('Story2VideoCompose', 'Failed to move output to final path, keeping in sessionDir: ' + e.message)
      const stat = fs.statSync(outputPath)
      return {
        code: 0,
        data: {
          videoPath: outputPath,
          fileSize: stat.size,
          segmentCount: segments.length,
          duration: assetManifest.audio.reduce((sum, a) => sum + (a.duration || 0), 0),
        },
      }
    }
    // 成功移到 finalPath 后清理 sessionDir
    this._cleanupSession(sessionDir)

    const stat = fs.statSync(finalPath)
    this.log.info('Story2VideoCompose', 'Video composed: ' + finalPath + ' (' + Math.round(stat.size / 1024) + 'KB)')

    return {
      code: 0,
      data: {
        videoPath: finalPath,
        fileSize: stat.size,
        segmentCount: segments.length,
        duration: assetManifest.audio.reduce((sum, a) => sum + (a.duration || 0), 0),
      },
    }
  }

  /**
   * 清理单个 sessionDir（删除目录及所有内容）
   *
   * 注意：fs.rmSync({ recursive: true }) 在部分 Windows 环境静默失败（不抛错但未删除），
   * 改用手动递归删除（unlinkSync + rmdirSync）确保跨平台可靠。
   *
   * @param {string} sessionDir - session 目录路径
   * @private
   */
  _cleanupSession (sessionDir) {
    try {
      if (!fs.existsSync(sessionDir)) return
      this._rmSyncRecursive(sessionDir)
      this.log.info('Story2VideoCompose', 'Cleaned sessionDir: ' + path.basename(sessionDir))
    } catch (e) {
      this.log.warn('Story2VideoCompose', 'Failed to cleanup sessionDir: ' + e.message)
    }
  }

  /**
   * 递归删除目录（跨平台可靠实现）
   *
   * fs.rmSync({ recursive: true, force: true }) 在部分 Windows 环境静默失败，
   * 此方法手动遍历并删除每个文件再删除目录，确保删除生效。
   *
   * @param {string} dirPath - 要删除的目录
   * @private
   */
  _rmSyncRecursive (dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        this._rmSyncRecursive(fullPath)
      } else {
        fs.unlinkSync(fullPath)
      }
    }
    fs.rmdirSync(dirPath)
  }

  /**
   * 清理历史残留的 sessionDir（超过 maxSessionAgeMs 的 s2v_* 目录）
   * @param {number} [maxAgeMs] - 最大保留时间 ms（默认使用 this.maxSessionAgeMs）
   * @returns {number} 清理的目录数
   * @private
   */
  _cleanupOldSessions (maxAgeMs) {
    const maxAge = maxAgeMs || this.maxSessionAgeMs
    const now = Date.now()
    let cleaned = 0
    try {
      const entries = fs.readdirSync(this.outputDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (!entry.name.startsWith('s2v_')) continue
        const dirPath = path.join(this.outputDir, entry.name)
        try {
          const stat = fs.statSync(dirPath)
          if (now - stat.mtimeMs > maxAge) {
            this._rmSyncRecursive(dirPath)
            cleaned++
          }
        } catch (e) {
          // 单个目录清理失败不中断其他清理
          this.log.warn('Story2VideoCompose', 'Failed to stat/cleanup old session ' + entry.name + ': ' + e.message)
        }
      }
      if (cleaned > 0) {
        this.log.info('Story2VideoCompose', 'Cleaned ' + cleaned + ' old sessionDir(s)')
      }
    } catch (e) {
      this.log.warn('Story2VideoCompose', 'Failed to scan outputDir for old sessions: ' + e.message)
    }
    return cleaned
  }

  /**
   * 创建单个视频片段（图片 + 音频 + 可选字幕）
   * @private
   */
  async _createSegment (imagePath, audioPath, outputPath, opts) {
    const args = ['-y']

    // 输入：图片（循环）+ 音频
    args.push('-loop', '1', '-i', imagePath, '-i', audioPath)

    // 字幕滤镜
    const filters = []
    if (opts.subtitleText) {
      const escaped = escapeSubtitleText(opts.subtitleText)
      const fontSize = 24
      filters.push("drawtext=text='" + escaped + "':" +
        'fontcolor=white:fontsize=' + fontSize + ':' +
        'borderw=2:bordercolor=black:' +
        'x=(w-text_w)/2:y=h-th-40')
    }

    // 转场效果（淡入）
    if (opts.transition === 'fade') {
      filters.push('fade=t=in:st=0:d=0.5')
    }

    if (filters.length > 0) {
      args.push('-vf', filters.join(','))
    }

    // 时长
    if (opts.duration) {
      args.push('-t', String(opts.duration))
    }

    // 编码
    args.push('-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p')
    args.push('-c:a', 'aac', '-b:a', '128k')
    args.push('-shortest', '-r', '30')

    // 输出
    args.push(outputPath)

    const { stderr } = await execFileAsync(FFMPEG, args, { timeout: 30000, maxBuffer: 1024 * 1024 })
    if (!fs.existsSync(outputPath)) {
      throw new Error('ffmpeg did not produce output: ' + (stderr || '').slice(-200))
    }
  }

  /**
   * 拼接视频片段
   * @private
   */
  async _concatSegments (segments, outputPath, sessionDir) {
    // 使用 concat demuxer
    const listFile = path.join(sessionDir, 'concat_list.txt')
    const listContent = segments.map(s => "file '" + s.replace(/\\/g, '/') + "'").join('\n')
    fs.writeFileSync(listFile, listContent, 'utf-8')

    const args = [
      '-y', '-f', 'concat', '-safe', '0',
      '-i', listFile,
      '-c', 'copy',
      outputPath,
    ]

    const { stderr } = await execFileAsync(FFMPEG, args, { timeout: 60000, maxBuffer: 1024 * 1024 })
    if (!fs.existsSync(outputPath)) {
      throw new Error('ffmpeg concat did not produce output: ' + (stderr || '').slice(-200))
    }
  }
}

module.exports = { Story2VideoComposeEngine, findFfmpeg, escapeSubtitleText }
