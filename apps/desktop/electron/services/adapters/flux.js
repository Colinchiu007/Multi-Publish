// @ts-check
/**
 * flux.js — P3.8 BFL FLUX Image Adapter（第一个 Image Adapter）
 *
 * 验证 IImageAdapter mixin 的扩展性 — 证明 Adapter 架构支持 Image 类别供应商。
 *
 * BFL FLUX API 关键特性：
 * - 认证头 Authorization: Bearer {key}（与 OpenAI 模式相同）
 * - generateImage: POST /v1/flux-pro-1.1 返回 { images: [{ url }], model, seed }
 * - 无 /models 端点 → listModels 返回静态预定义列表
 * - testConnection: 通过 num_images=1 的最小请求验证
 * - 支持 image_size 预设：square_hd/square/portrait_4_3/portrait_16_9/landscape_4_3/landscape_16_9
 * - 支持 safety_tolerance（0-6，0 最严格）
 * - 支持 seed（可复现）、num_images（批量）
 *
 * 实现的方法（capabilities）：
 *   - generateImage()    POST /v1/flux-pro-1.1
 *   - listModels()       静态预定义列表（无 HTTP 请求）
 *   - testConnection()   通过最小图片请求验证
 *
 * 设计决策：
 * - 不覆盖 LLM/TTS/Video 方法（BaseAdapter 默认抛 NotImplementedError）
 * - image_size 预设自动展开为 width/height（BFL API 接受数值尺寸）
 * - listModels 静态列表避免不必要的 HTTP 请求
 * - 默认 model flux-pro-1.1，可通过 params.model 覆盖为 flux-dev/flux-schnell
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_BASE_URL = 'https://api.bfl.ai'
const DEFAULT_TIMEOUT = 120000
const DEFAULT_MODEL = 'flux-pro-1.1'

// image_size 预设 → width/height 映射表
const IMAGE_SIZE_PRESETS = {
  square_hd:       { width: 768,  height: 768  },
  square:          { width: 1024, height: 1024 },
  portrait_4_3:    { width: 768,  height: 1024 },
  portrait_16_9:   { width: 768,  height: 1366 },
  landscape_4_3:   { width: 1024, height: 768  },
  landscape_16_9:  { width: 1280, height: 720  },
}

// 静态预定义 FLUX 模型列表（避免不必要的 /models HTTP 请求）
const FLUX_MODELS = [
  { id: 'flux-pro-1.1',     name: 'FLUX 1.1 Pro',       description: '最新旗舰模型，最佳质量' },
  { id: 'flux-pro',         name: 'FLUX 1 Pro',          description: '上一代专业模型' },
  { id: 'flux-dev',         name: 'FLUX Dev',            description: '开发版本，适合迭代' },
  { id: 'flux-schnell',     name: 'FLUX Schnell',        description: '快速版本，4步生成' },
  { id: 'flux-pro-1.1-ultra', name: 'FLUX 1.1 Ultra',   description: 'Ultra 高分辨率版本' },
  { id: 'flux-kontext',     name: 'FLUX Kontext',        description: '上下文感知图像编辑' },
]

class FluxAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - BFL API Key（必填）
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

  /** 验证配置：apiKey 必填 */
  validateConfig() {
    const errors = []
    if (!this.credentials.apiKey) {
      errors.push('apiKey is required')
    }
    if (!this.credentials.baseUrl) {
      errors.push('baseUrl is required')
    }
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — BFL 使用 Bearer 认证 */
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
   * POST /v1/{model} — 图像生成
   *
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @param {string} [params.model='flux-pro-1.1'] - FLUX 模型 ID
   * @param {number} [params.width] - 图片宽度（与 height 一起使用）
   * @param {number} [params.height] - 图片高度
   * @param {string} [params.image_size] - 尺寸预设（自动展开为 width/height）
   * @param {number} [params.num_images=1] - 生成数量
   * @param {number} [params.seed] - 随机种子（可复现）
   * @param {number} [params.safety_tolerance] - 安全等级（0-6，0 最严格）
   * @returns {Promise<{images: Array<{url, b64?}>, model: string, seed?: number}>}
   */
  async generateImage(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const model = params.model || DEFAULT_MODEL
    const body = {
      prompt: params.prompt,
      model,
    }

    // 尺寸处理：优先 width/height 显式值，其次 image_size 预设
    if (params.width !== undefined && params.height !== undefined) {
      body.width = params.width
      body.height = params.height
    } else if (params.image_size && IMAGE_SIZE_PRESETS[params.image_size]) {
      const preset = IMAGE_SIZE_PRESETS[params.image_size]
      body.width = preset.width
      body.height = preset.height
    }

    if (params.num_images !== undefined) body.num_images = params.num_images
    if (params.seed !== undefined) body.seed = params.seed
    if (params.safety_tolerance !== undefined) body.safety_tolerance = params.safety_tolerance

    const resp = await this._request(`/v1/${model}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    return {
      images: data.images || [],
      model: data.model || model,
      seed: data.seed,
    }
  }

  /**
   * 返回静态预定义的 FLUX 模型列表
   * BFL 无公开 /models 端点，使用静态列表避免不必要的 HTTP 请求
   *
   * P3.8 补跑修复：使用 map+展开运算符创建对象副本（非 slice 浅拷贝），
   * 防止调用方修改返回值污染内部静态列表 FLUX_MODELS。
   * @returns {Promise<Array<{id, name, description}>>}
   */
  async listModels() {
    return FLUX_MODELS.map(m => ({ ...m }))
  }

  /**
   * 测试连接 — 通过 num_images=1 的最小请求验证
   * 会实际消耗一次图片生成配额（BFL 无轻量验证端点）
   */
  async testConnection() {
    try {
      await this._request(`/v1/${DEFAULT_MODEL}`, {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'test',
          num_images: 1,
          model: DEFAULT_MODEL,
        }),
      })
      return { success: true }
    } catch (e) {
      return { success: false, error: e }
    }
  }
}

module.exports = { FluxAdapter, IMAGE_SIZE_PRESETS, FLUX_MODELS }
