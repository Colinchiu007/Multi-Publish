// @ts-check
/**
 * minimax-multimodal.js — MiniMax 多模态 Adapter
 *
 * 多模态预设使用同一个 API Key 覆盖多个能力域。当前 MiniMax 官方开放能力
 * （https://api.minimaxi.com/v1）经本仓库既有适配器验证支持：
 *   - tts：speech-2.8-turbo（异步 T2A Async）/ speech-2.6-*（同步）
 *   - image：image-01
 *   - video：MiniMax-Hailuo-* / T2V-01 / I2V-01
 *
 * 实现策略：内部组合三个既有 MiniMax 适配器并按能力方法委托，避免复制端点/轮询逻辑。
 * 能力声明（capabilities）与能力默认模型（capability_models）由 model-provider-seeds
 * 中的预设 `minimax-multimodal` 声明，流水线通过 ModelProviderManager.getDefault 按能力路由。
 */

const { BaseAdapter } = require('./_base/base')
const { MinimaxTtsAdapter } = require('./minimax-tts')
const { MinimaxImageAdapter } = require('./minimax-image')
const { MiniMaxAdapter } = require('./minimax')

const DEFAULT_BASE_URL = 'https://api.minimaxi.com/v1'

const MULTIMODAL_MODELS = [
  { id: 'speech-2.8-turbo', name: 'Speech 2.8 Turbo', description: 'TTS：异步长文本语音合成（T2A Async）' },
  { id: 'image-01', name: 'Image 01', description: '生图' },
  { id: 'MiniMax-Hailuo-2.3', name: 'Hailuo 2.3', description: '视频生成（768P/1080P）' },
]

class MinimaxMultimodalAdapter extends BaseAdapter {
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this._tts = new MinimaxTtsAdapter(credentials, options)
    this._image = new MinimaxImageAdapter(credentials, options)
    this._video = new MiniMaxAdapter(credentials, options)
  }

  validateConfig() {
    const errors = []
    if (!this.credentials.apiKey) errors.push('apiKey is required')
    if (!this.credentials.baseUrl) errors.push('baseUrl is required')
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  async testConnection() {
    return this._tts.testConnection()
  }

  async listModels() {
    return MULTIMODAL_MODELS.map((model) => ({ ...model }))
  }

  // ─── TTS ────────────────────────────────────
  synthesize(params) {
    return this._tts.synthesize(params)
  }

  listVoices(params) {
    return this._tts.listVoices(params)
  }

  cloneVoice(params) {
    return this._tts.cloneVoice(params)
  }

  // ─── 生图 ───────────────────────────────────
  generateImage(params) {
    return this._image.generateImage(params)
  }

  // ─── 视频 ───────────────────────────────────
  generateVideo(params) {
    return this._video.generateVideo(params)
  }

  getVideoStatus(taskId) {
    return this._video.getVideoStatus(taskId)
  }
}

module.exports = { MinimaxMultimodalAdapter }
