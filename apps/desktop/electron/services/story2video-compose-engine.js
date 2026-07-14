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
 *   替代 ServiceBus 中的占位响应，让 story2video-compose 管线真正产出视频。
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
  // 1. 环境变量
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH
  }
  // 2. 系统 PATH
  try {
    require('child_process').execSync('ffmpeg -version', { stdio: 'ignore' })
    return 'ffmpeg'
  } catch {
    // 3. 已知 Windows 路径
    const winPath = 'D:\\Projects\\ffmpeg-7.1\\ffmpeg-n7.1-latest-win64-gpl-7.1\\bin\\ffmpeg.exe'
    if (process.platform === 'win32' && fs.existsSync(winPath)) return winPath
  }
  return null
}

const FFMPEG = findFfmpeg()

class Story2VideoComposeEngine {
  /**
   * @param {object} [opts]
   * @param {string} [opts.outputDir] - 输出目录（默认 os.tmpdir）
   * @param {object} [opts.log] - 日志模块
   */
  constructor (opts) {
    opts = opts || {}
    this.outputDir = opts.outputDir || path.join(os.tmpdir(), 'story2video')
    this.log = opts.log || require('./logger')
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
      return { code: -1, message: 'All segments failed to create' }
    }

    // 2. 拼接所有片段
    const outputPath = path.join(sessionDir, 'output.mp4')
    if (segments.length === 1) {
      fs.copyFileSync(segments[0], outputPath)
    } else {
      await this._concatSegments(segments, outputPath, sessionDir)
    }

    // 3. 验证输出
    if (!fs.existsSync(outputPath)) {
      return { code: -1, message: 'Output file not created' }
    }

    const stat = fs.statSync(outputPath)
    this.log.info('Story2VideoCompose', 'Video composed: ' + outputPath + ' (' + Math.round(stat.size / 1024) + 'KB)')

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
      const escaped = opts.subtitleText
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'")
        .replace(/,/g, '\\,')
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

module.exports = { Story2VideoComposeEngine, findFfmpeg }
