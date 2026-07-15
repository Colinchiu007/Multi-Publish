// @ts-check
/**
 * local-diffusion.js — 本地 Stable Diffusion Adapter
 *
 * Stable Diffusion WebUI API 关键特性：
 * - 无需认证（本地服务）
 * - baseUrl: http://localhost:7860（默认，可配置）
 * - generateImage: POST /sdapi/v1/txt2img
 *   请求体 { prompt, negative_prompt, steps: 20, width: 512, height: 512, sampler_name: 'Euler a' }
 *   原始返回 { images: [base64str], parameters: {... }, info: '...' }
 *   转换为统一格式 { images: [{ b64_json }], model: 'sd', parameters }
 * - editImage: POST /sdapi/v1/img2img
 *   请求体 { init_images: [base64], prompt, denoising_strength: 0.75 }
 * - testConnection: GET /sdapi/v1/options 检查在线
 *
 * 实现的方法（capabilities）：
 *   - generateImage()    POST /sdapi/v1/txt2img
 *   - editImage()        POST /sdapi/v1/img2img
 *   - listModels()       GET /sdapi/v1/sd-models（动态拉取）
 *   - testConnection()   GET /sdapi/v1/options 检查在线
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_BASE_URL = 'http://localhost:7860'
const DEFAULT_TIMEOUT = 300000
const DEFAULT_STEPS = 20
const DEFAULT_WIDTH = 512
const DEFAULT_HEIGHT = 512
const DEFAULT_SAMPLER = 'Euler a'
const DEFAULT_DENOISING = 0.75

class LocalDiffusionAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} [credentials.baseUrl] - 本地 SD WebUI 端点（必填，默认 localhost:7860）
   * @param {object} [options]
   * @param {number} [options.timeout=300000] - 请求超时（ms），本地 SD 较慢
   * @param {number} [options.maxRetries=0] - 最大重试次数（本地无重试）
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries !== undefined ? this.options.maxRetries : 0
  }

  /** 验证配置：baseUrl 必填 */
  validateConfig() {
    const errors = []
    if (!this.credentials.baseUrl) {
      errors.push('baseUrl is required')
    }
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — 本地 SD 无需认证 */
  _headers() {
    return {
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
      const response = await fetch(url, {
        ...opts,
        headers,
      })

      if (!response.ok) {
        let errorBody
        try {
          errorBody = await response.json()
        } catch (_) {
          try { errorBody = await response.text() } catch (__) { errorBody = {} }
        }
        const message = (errorBody && errorBody.error && (errorBody.error.message || errorBody.error))
          || (errorBody && errorBody.detail)
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
   * POST /sdapi/v1/txt2img — 图像生成（文本到图像）
   *
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @param {string} [params.negative_prompt] - 反向提示词
   * @param {number} [params.steps=20] - 采样步数
   * @param {number} [params.width=512] - 图片宽度
   * @param {number} [params.height=512] - 图片高度
   * @param {string} [params.sampler_name='Euler a'] - 采样器
   * @param {number} [params.seed] - 随机种子
   * @param {number} [params.batch_size] - 批量大小
   * @returns {Promise<{images: Array<{b64_json}>, model: string, parameters: object}>}
   */
  async generateImage(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const body = {
      prompt: params.prompt,
      steps: params.steps || DEFAULT_STEPS,
      width: params.width || DEFAULT_WIDTH,
      height: params.height || DEFAULT_HEIGHT,
      sampler_name: params.sampler_name || DEFAULT_SAMPLER,
    }

    if (params.negative_prompt !== undefined) body.negative_prompt = params.negative_prompt
    if (params.seed !== undefined) body.seed = params.seed
    if (params.batch_size !== undefined) body.batch_size = params.batch_size

    const resp = await this._request('/sdapi/v1/txt2img', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    // SD WebUI 返回 images: [base64str]（数组，每个元素是 base64 字符串）
    // 转换为统一格式 images: [{ b64_json }]
    const rawImages = data.images || []
    const images = rawImages.map(b64 => ({ b64_json: b64 }))

    return {
      images,
      model: 'sd',
      parameters: data.parameters || {},
    }
  }

  /**
   * POST /sdapi/v1/img2img — 图像编辑（图像到图像）
   *
   * @param {object} params
   * @param {string} params.image - 初始图像 base64（必填，无 data: 前缀）
   * @param {string} params.prompt - 编辑提示词（必填）
   * @param {number} [params.denoising_strength=0.75] - 去噪强度（0-1）
   * @param {string} [params.negative_prompt] - 反向提示词
   * @param {number} [params.steps=20] - 采样步数
   * @returns {Promise<{images: Array<{b64_json}>, model: string, parameters: object}>}
   */
  async editImage(params) {
    if (!params || !params.image) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.image is required')
    }
    if (!params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const body = {
      init_images: [params.image],
      prompt: params.prompt,
      denoising_strength: params.denoising_strength !== undefined ? params.denoising_strength : DEFAULT_DENOISING,
      steps: params.steps || DEFAULT_STEPS,
    }

    if (params.negative_prompt !== undefined) body.negative_prompt = params.negative_prompt

    const resp = await this._request('/sdapi/v1/img2img', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    const rawImages = data.images || []
    const images = rawImages.map(b64 => ({ b64_json: b64 }))

    return {
      images,
      model: 'sd',
      parameters: data.parameters || {},
    }
  }

  /**
   * 列出可用模型 — GET /sdapi/v1/sd-models
   * @returns {Promise<Array<{id, name, description}>>}
   */
  async listModels() {
    const resp = await this._request('/sdapi/v1/sd-models', { method: 'GET' })
    const data = await resp.json()
    const models = Array.isArray(data) ? data : []
    return models.map(m => ({
      id: m.model_name || m.title,
      name: m.title || m.model_name,
      description: m.sha256 || '',
    }))
  }

  /**
   * 测试连接 — GET /sdapi/v1/options 检查在线
   */
  async testConnection() {
    try {
      await this._request('/sdapi/v1/options', { method: 'GET' })
      return { success: true }
    } catch (e) {
      return { success: false, error: e }
    }
  }
}

module.exports = { LocalDiffusionAdapter }
