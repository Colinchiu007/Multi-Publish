// @ts-check
/**
 * agnes-image.js — Agnes Image Adapter（图像生成）
 *
 * Agnes Image API 关键特性：
 * - 认证头 Authorization: Bearer {key}
 * - generateImage: POST /images/generations（OpenAI 兼容）
 * - 请求体 { model: 'agnes-image-2.1-flash', prompt, size: '2K', ratio: '16:9', response_format: 'url' }
 * - 响应中 data[0].url 为图片 URL
 * - 支持 size 参数映射：像素尺寸 → 档位（如 2048x2048 → 2K）
 *
 * 默认端点 https://apihub.agnes-ai.com/v1，需 API Key。
 * 单模型：agnes-image-2.1-flash。
 *
 * 实现的方法（capabilities）：
 *   - generateImage()    POST /images/generations
 *   - listModels()      静态预定义列表
 *   - testConnection()  验证 apiKey 存在
 *   - validateConfig()  apiKey + baseUrl 必填
 *
 * 设计决策：
 * - 不覆盖 LLM/TTS/Video 方法（BaseAdapter 默认抛 NotImplementedError）
 * - generateImage 返回 { urls: [url], format: 'url' } 统一格式
 * - size 参数（如 2048x2048）自动映射到档位（2K/4K/1K）
 * - listModels 静态列表避免不必要的 HTTP 请求
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://apihub.agnes-ai.com/v1'
const DEFAULT_TIMEOUT = 120000
const DEFAULT_MODEL = 'agnes-image-2.1-flash'
const DEFAULT_RATIO = '16:9'

// 静态预定义 Agnes Image 模型列表
const AGNES_IMAGE_MODELS = [
  { id: 'agnes-image-2.1-flash', name: 'Agnes Image 2.1 Flash', description: 'Agnes 快速图像生成' },
]

// size 像素尺寸 → 档位映射表
const SIZE_TO_TIER = {
  '1024x1024': '1K',
  '2048x2048': '2K',
  '4096x4096': '4K',
  '1920x1080': '2K',
  '1280x720':  '1K',
}

/**
 * 将像素尺寸解析为档位（1K/2K/4K）
 * 规则：取 max(width, height)，按阈值映射档位
 * @param {string} size - 形如 "2048x2048" 的尺寸
 * @returns {string|undefined} 档位如 "2K"
 */
function parseSizeTier(size) {
  if (!size || typeof size !== 'string') return undefined
  // 先尝试精确匹配
  if (SIZE_TO_TIER[size]) return SIZE_TO_TIER[size]
  const match = size.match(/^(\d+)x(\d+)$/i)
  if (!match) return undefined
  const w = parseInt(match[1], 10)
  const h = parseInt(match[2], 10)
  if (!w || !h) return undefined
  const maxDim = Math.max(w, h)
  if (maxDim >= 3840) return '4K'
  if (maxDim >= 1920) return '2K'
  if (maxDim >= 1024) return '1K'
  return '1K'
}

class AgnesImageAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - Agnes API Key（必填）
   * @param {string} [credentials.baseUrl] - 自定义端点
   * @param {object} [options]
   * @param {number} [options.timeout=120000] - 请求超时（ms），图片生成较慢
   * @param {number} [options.maxRetries=2] - 最大重试次数
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries || 2
  }

  /** 验证配置：apiKey + baseUrl 必填 */
  validateConfig() {
    const errors = []
    if (!this.credentials.apiKey) errors.push('apiKey is required')
    if (!this.credentials.baseUrl) errors.push('baseUrl is required')
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — Agnes 使用 Bearer 认证 */
  _headers() {
    return {
      'Authorization': `Bearer ${this.credentials.apiKey}`,
      'Content-Type': 'application/json',
    }
  }

  /** 构造完整 URL */
  _url(path) {
    const base = this.credentials.baseUrl.replace(/\/$/, '')
    return `${base}${path}`
  }

  /**
   * 统一 fetch 包装 — 处理超时和错误转换
   */
  async _request(path, opts = {}) {
    const url = this._url(path)
    const headers = { ...this._headers(), ...(opts.headers || {}) }

    try {
      const response = await fetch(url, { ...opts, headers })

      if (!response.ok) {
        let errorBody
        try { errorBody = await response.json() } catch (_) {
          try { errorBody = await response.text() } catch (__) { errorBody = {} }
        }
        const message = (errorBody && errorBody.error && (errorBody.error.message || errorBody.error))
          || (errorBody && errorBody.message)
          || (typeof errorBody === 'string' ? errorBody : `HTTP ${response.status}`)
        throw fromHttpStatus(response.status, message, { providerId: this.id, url })
      }

      return response
    } catch (e) {
      if (e instanceof ProviderError) throw e
      const msg = e.message || String(e)
      if (msg.includes('ETIMEDOUT') || msg.includes('timeout') || msg.includes('aborted')) {
        throw new ProviderError(ERROR_CODES.TIMEOUT, msg, { providerId: this.id })
      }
      if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('network')) {
        throw new ProviderError(ERROR_CODES.NETWORK_ERROR, msg, { providerId: this.id })
      }
      throw new ProviderError(ERROR_CODES.NETWORK_ERROR, msg, { providerId: this.id })
    }
  }

  /**
   * POST /images/generations — 图像生成（OpenAI 兼容）
   *
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @param {string} [params.model='agnes-image-2.1-flash'] - 模型 ID
   * @param {string} [params.size] - 像素尺寸（如 2048x2048），自动映射到档位
   * @param {string} [params.sizeTier] - 档位（1K/2K/4K），优先于 size
   * @param {string} [params.ratio='16:9'] - 宽高比
   * @returns {Promise<{urls: string[], format: string}>}
   */
  async generateImage(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const model = params.model || DEFAULT_MODEL
    const ratio = params.ratio || DEFAULT_RATIO
    const sizeTier = params.sizeTier || parseSizeTier(params.size) || '2K'

    const body = {
      model,
      prompt: params.prompt,
      size: sizeTier,
      ratio,
      response_format: 'url',
    }

    const resp = await this._request('/images/generations', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    // OpenAI 兼容响应：data[0].url
    const url = data?.data?.[0]?.url
    if (!url) {
      throw new ProviderError(
        ERROR_CODES.PROVIDER_ERROR,
        'Missing image url in response',
        { providerId: this.id }
      )
    }

    return {
      urls: [url],
      format: 'url',
    }
  }

  /** 返回静态预定义 Agnes Image 模型列表（副本） */
  async listModels() {
    return AGNES_IMAGE_MODELS.map(m => ({ ...m }))
  }

  /** 测试连接 — 验证 apiKey 存在 */
  async testConnection() {
    const validation = this.validateConfig()
    if (!validation.valid) {
      return {
        success: false,
        error: new ProviderError(ERROR_CODES.INVALID_CONFIG, validation.errors.join(', ')),
      }
    }
    return { success: true }
  }
}

module.exports = { AgnesImageAdapter, AGNES_IMAGE_MODELS, parseSizeTier }
