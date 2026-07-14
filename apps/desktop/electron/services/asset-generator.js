// @ts-check
/**
 * AssetGenerator - 资源生成服务
 *
 * 职责：
 *   - generateImage: 用 ffmpeg 生成带文字的占位图片（无需外部 API）
 *   - generateTTS: 用 edge-tts 生成语音（免费，无需 API key），fallback 到静音音频
 *
 * 设计意图：
 *   替代 serviceBus.callPythonSkill('generate_image'/'generate_tts')，
 *   让 generate_assets 阶段无需依赖 Python 后端即可产出资源。
 */
'use strict'

const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { promisify } = require('util')
const { spawn } = require('child_process')

const execFileAsync = promisify(execFile)

function findFfmpeg () {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH
  try {
    require('child_process').execSync('ffmpeg -version', { stdio: 'ignore' })
    return 'ffmpeg'
  } catch {
    const winPath = 'D:\\Projects\\ffmpeg-7.1\\ffmpeg-n7.1-latest-win64-gpl-7.1\\bin\\ffmpeg.exe'
    if (process.platform === 'win32' && fs.existsSync(winPath)) return winPath
  }
  return null
}

const FFMPEG = findFfmpeg()

class AssetGenerator {
  /**
   * @param {object} [opts]
   * @param {string} [opts.outputDir] - 输出目录
   * @param {object} [opts.log] - 日志模块
   */
  constructor (opts) {
    opts = opts || {}
    this.outputDir = opts.outputDir || path.join(os.tmpdir(), 'story2video', 'assets')
    this.log = opts.log || require('./logger')
  }

  /**
   * 生成占位图片（纯色背景 + 文字）
   * @param {string} prompt - 提示词（用于绘制文字）
   * @param {object} [opts] - { style, index, aspect_ratio }
   * @returns {Promise<{code: number, data?: object, message?: string}>}
   */
  async generateImage (prompt, opts) {
    if (!FFMPEG) return { code: -1, message: 'ffmpeg not found' }

    fs.mkdirSync(this.outputDir, { recursive: true })
    const idx = opts?.index ?? 0
    const imgPath = path.join(this.outputDir, 'img_' + String(idx).padStart(4, '0') + '.png')

    // 根据 aspect_ratio 设置尺寸
    const ratio = opts?.aspect_ratio || '16:9'
    let width = 1280
    let height = 720
    if (ratio === '9:16') { width = 720; height = 1280 }
    else if (ratio === '1:1') { width = 1024; height = 1024 }
    else if (ratio === '4:3') { width = 1024; height = 768 }

    // 根据 style 选择背景色
    const styleColors = {
      cinematic: '0x1a1a2e',
      realistic: '0x2d4a2d',
      cartoon: '0x4a90d9',
      anime: '0xe91e63',
      cyberpunk: '0x6a1b9a',
    }
    const bgColor = styleColors[opts?.style] || '0x1a1a2e'

    // 截取前 30 个字符作为图片文字
    const displayText = (prompt || '').slice(0, 30).replace(/[':\\]/g, ' ')

    const args = [
      '-y',
      '-f', 'lavfi', '-i', 'color=c=' + bgColor + ':s=' + width + 'x' + height + ':d=1',
      '-vf', "drawtext=text='" + displayText + "':fontcolor=white:fontsize=36:" +
        'x=(w-text_w)/2:y=(h-text_h)/2:borderw=2:bordercolor=black',
      '-frames:v', '1',
      imgPath,
    ]

    try {
      await execFileAsync(FFMPEG, args, { timeout: 15000, maxBuffer: 512 * 1024 })
      if (!fs.existsSync(imgPath)) {
        return { code: -1, message: 'ffmpeg did not produce image' }
      }
      const stat = fs.statSync(imgPath)
      this.log.info('AssetGenerator', 'Image ' + idx + ' generated: ' + path.basename(imgPath) + ' (' + stat.size + 'B)')
      return {
        code: 0,
        data: { path: imgPath, url: imgPath, image_path: imgPath, size: stat.size },
      }
    } catch (e) {
      this.log.warn('AssetGenerator', 'Image ' + idx + ' failed: ' + e.message)
      return { code: -1, message: e.message }
    }
  }

  /**
   * 生成 TTS 音频（优先 edge-tts，fallback 静音音频）
   * @param {string} text - 待合成文本
   * @param {object} [opts] - { voice_id, index }
   * @returns {Promise<{code: number, data?: object, message?: string}>}
   */
  async generateTTS (text, opts) {
    fs.mkdirSync(this.outputDir, { recursive: true })
    const idx = opts?.index ?? 0
    const audioPath = path.join(this.outputDir, 'tts_' + String(idx).padStart(4, '0') + '.mp3')

    // 尝试 edge-tts（通过 Python edge-tts 包，如果可用）
    const ttsResult = await this._tryEdgeTTS(text, audioPath, opts)
    if (ttsResult) return ttsResult

    // Fallback: 用 ffmpeg 生成静音音频（3秒）
    return this._generateSilence(audioPath, idx, 3.0)
  }

  /**
   * 尝试用 edge-tts 生成语音
   * @private
   */
  async _tryEdgeTTS (text, audioPath, opts) {
    const voice = opts?.voice_id || 'zh-CN-XiaoxiaoNeural'
    // 截取前 200 个字符
    const cleanText = (text || '').slice(0, 200)
    if (!cleanText) return null

    return new Promise((resolve) => {
      // 尝试调用 Python edge-tts
      // 安全修复 (P0-1): 移除 shell: true，避免命令注入风险
      // 参数通过数组传递，由 spawn 直接转给 Python 解释器，shell 元字符不被解释
      const proc = spawn('python', ['-c',
        'import sys; import edge_tts; import asyncio; ' +
        'async def main(): ' +
        '  c = edge_tts.Communicate(sys.argv[1], sys.argv[2]); ' +
        '  await c.save(sys.argv[3]); ' +
        'asyncio.run(main())',
        cleanText, voice, audioPath,
      ], { stdio: 'ignore', shell: false, timeout: 15000 })

      proc.on('error', () => resolve(null))
      proc.on('exit', (code) => {
        if (code === 0 && fs.existsSync(audioPath)) {
          const stat = fs.statSync(audioPath)
          // 估算时长（mp3 ~128kbps，字节/125 = 秒）
          const duration = Math.max(1.0, stat.size / 16000)
          this.log.info('AssetGenerator', 'TTS ' + opts?.index + ' via edge-tts: ' + Math.round(duration * 10) / 10 + 's')
          resolve({
            code: 0,
            data: { path: audioPath, audio_path: audioPath, duration },
          })
        } else {
          resolve(null)
        }
      })
    })
  }

  /**
   * 生成静音音频（fallback）
   * @private
   */
  async _generateSilence (audioPath, idx, duration) {
    if (!FFMPEG) return { code: -1, message: 'ffmpeg not found' }

    const args = [
      '-y',
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t', String(duration),
      '-c:a', 'libmp3lame', '-b:a', '128k',
      audioPath,
    ]

    try {
      await execFileAsync(FFMPEG, args, { timeout: 10000, maxBuffer: 256 * 1024 })
      if (!fs.existsSync(audioPath)) {
        return { code: -1, message: 'ffmpeg did not produce audio' }
      }
      const stat = fs.statSync(audioPath)
      this.log.info('AssetGenerator', 'TTS ' + idx + ' fallback silence: ' + duration + 's')
      return {
        code: 0,
        data: { path: audioPath, audio_path: audioPath, duration },
      }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  }
}

module.exports = { AssetGenerator, findFfmpeg }
