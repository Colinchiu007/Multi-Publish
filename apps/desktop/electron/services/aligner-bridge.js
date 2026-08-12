// @ts-check
/**
 * AlignerBridge — audio-aligner Python 子进程管理（ASR 词级时间，端口 8004）
 *
 * 对齐层编排：/align 取词级时间 → story2video-engine subtitle-aligner 聚合到分句块。
 * 继承 BasePythonBridge：start/stop/attach/healthCheck/watchdog/restart 由基类提供。
 */
const { BasePythonBridge } = require('./base-python-bridge')
const { config } = require('../config/app-config')

const ALIGNER_PORT = config.alignerBridge.port
const ALIGNER_HOST = config.alignerBridge.host
// ALIGNER_DIR 必须指向包含 audio_aligner 包的 Python 项目根目录（packages/audio-aligner）
const _defaultAlignerDir = (() => {
  const knownPaths = [
    'D:\\Data\\projects\\Multi-Publish\\packages\\audio-aligner',
    'D:\\Projects\\Multi-Publish\\packages\\audio-aligner',
  ]
  const fs = require('fs')
  for (const p of knownPaths) {
    try { if (fs.existsSync(p + '/aligner')) return p } catch (_) { /* ignore */ }
  }
  return process.cwd()
})()
const ALIGNER_DIR = process.env.ALIGNER_DIR || _defaultAlignerDir

class AlignerBridge extends BasePythonBridge {
  /**
   * @param {{ log?: any }} opts
   */
  constructor ({ log } = {}) {
    super({
      name: 'AlignerBridge',
      pythonModule: 'aligner',
      port: ALIGNER_PORT,
      host: ALIGNER_HOST,
      workDir: ALIGNER_DIR,
      log,
      requestTimeout: 300000, // ASR base 模型 CPU 单场景 <30s，留 5min 余量
    })
  }

  /**
   * 音频 → ASR 词级时间
   * @param {string} audioPath - 音频绝对路径
   * @param {object} [options] - { model, language, beamSize, vadFilter, initialPrompt }
   * @returns {Promise<object>} { words, segments, language, duration, elapsedMs, model }
   */
  async transcribeAudio (audioPath, options = {}) {
    await this.ensureRunning()
    const body = JSON.stringify({
      audio_path: audioPath,
      options: {
        model: options.model || 'base',
        language: options.language || undefined,
        beam_size: options.beamSize ?? 5,
        vad_filter: options.vadFilter ?? true,
        initial_prompt: options.initialPrompt || undefined,
      },
    })
    return this._post('/align', body)
  }
}

module.exports = AlignerBridge
