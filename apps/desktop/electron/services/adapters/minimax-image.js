// @ts-check
/**
 * minimax-image.js — MiniMax Image Adapter（图像生成）
 *
 * MiniMax Image API 关键特性：
 * - 认证头 Authorization: Bearer {key}
 * - generateImage: POST /image_generation（同步接口）
 * - 请求体 { model, prompt, aspect_ratio, response_format: 'url', n: 1 }
 * - 响应中 data.image_urls 为图片 URL 数组
 * - 支持 aspect_ratio 自动从 size 解析（如 1024x1024 → 1:1，1920x1080 → 16:9）
 *
 * 默认端点 https://api.minimaxi.com/v1，需 API Key。
 * 固定模型：image-01。
 *
 * 实现的方法（capabilities）：
 *   - generateImage()    POST /image_generation
 *   - listModels()      静态预定义列表
 *   - testConnection()  验证 apiKey 存在
 *   - validateConfig()  apiKey + baseUrl 必填
 *
 * 设计决策：
 * - 不覆盖 LLM/TTS/Video 方法（BaseAdapter 默认抛 NotImplementedError）
 * - generateImage 返回 { urls: [image_url], format: 'url' } 统一格式
 * - size 参数（如 1024x1024）自动解析为 aspect_ratio（1:1/16:9 等）
 * - listModels 静态列表避免不必要的 HTTP 请求
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus, hasStrictContentPolicySignal } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://api.minimaxi.com/v1'
const DEFAULT_TIMEOUT = 120000
const DEFAULT_MODEL = 'image-01'

// MiniMax Image 目前只支持产品配置中的固定模型，避免 UI 与调用参数漂移。
const MINIMAX_IMAGE_MODELS = [
  { id: 'image-01', name: 'Image 01', description: 'MiniMax 图像生成模型' },
]

// size → aspect_ratio 映射表
const SIZE_TO_ASPECT_RATIO = {
  '1024x1024': '1:1',
  '1280x720':  '16:9',
  '1920x1080': '16:9',
  '720x1280':  '9:16',
  '1080x1920': '9:16',
  '1024x768':  '4:3',
  '768x1024':  '3:4',
  '1280x960':  '4:3',
  '960x1280':  '3:4',
}

/**
 * 将像素尺寸解析为 aspect_ratio
 * @param {string} size - 形如 "1024x1024" 的尺寸
 * @returns {string|undefined} aspect_ratio 如 "1:1"
 */
function parseAspectRatio(size) {
  if (!size || typeof size !== 'string') return undefined
  // 先尝试精确匹配
  if (SIZE_TO_ASPECT_RATIO[size]) return SIZE_TO_ASPECT_RATIO[size]
  // 解析宽高，计算 GCD 得出最简比
  const match = size.match(/^(\d+)x(\d+)$/i)
  if (!match) return undefined
  const w = parseInt(match[1], 10)
  const h = parseInt(match[2], 10)
  if (!w || !h) return undefined
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b)
  const g = gcd(w, h)
  return `${w / g}:${h / g}`
}

class MinimaxImageAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - MiniMax API Key（必填）
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

  /** 构造请求头 — MiniMax 使用 Bearer 认证 */
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

    // 有界超时（2026-08-11 E2E 复盘）：DEFAULT_TIMEOUT 之前从未接入 fetch，
    // 网络/上游卡住时请求永久挂起（explainer/documentary assets 阶段偶发卡死根因之一）。
    const controller = new AbortController()
    const timeoutMs = Number.isFinite(Number(this.options.timeout)) && Number(this.options.timeout) > 0
      ? Number(this.options.timeout)
      : DEFAULT_TIMEOUT
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response
    try {
      try {
        response = await fetch(url, { ...opts, headers, signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }

      if (!response.ok) {
        let errorBody
        try { errorBody = await response.json() } catch (_) {
          try { errorBody = await response.text() } catch (__) { errorBody = {} }
        }
        const message = (errorBody && errorBody.base_resp && errorBody.base_resp.status_msg)
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
   * POST /image_generation — 图像生成（同步接口）
   *
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @param {string} [params.model] - 忽略；MiniMax Image 固定使用 image-01
   * @param {string} [params.size] - 尺寸（如 1024x1024），自动解析为 aspect_ratio
   * @param {string} [params.aspect_ratio] - 宽高比（如 1:1/16:9），优先于 size
   * @param {number} [params.n=1] - 生成数量
   * @returns {Promise<{urls: string[], format: string}>}
   */
  async generateImage(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const model = DEFAULT_MODEL
    const aspect_ratio = params.aspect_ratio || parseAspectRatio(params.size)

    const body = {
      model,
      prompt: params.prompt,
      response_format: 'url',
      n: params.n || 1,
    }
    if (aspect_ratio) body.aspect_ratio = aspect_ratio

    const resp = await this._request('/image_generation', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    // MiniMax 响应中 data.image_urls 为 URL 数组
    const imageUrls = data?.data?.image_urls || data?.image_urls || []

    // 静默空结果：HTTP 200 但无图片 URL（常见于内容安全策略拒绝或瞬时故障），
    // 必须显式抛错，禁止返回空数组让上层误判为「已生成」。
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      const statusMsg = data?.base_resp?.status_msg
        || data?.base_resp?.status_message
        || data?.message
        || ''
      const isContentPolicy = Boolean(statusMsg) && hasStrictContentPolicySignal(statusMsg)
      const code = isContentPolicy
        ? ERROR_CODES.CONTENT_POLICY
        : ERROR_CODES.PROVIDER_ERROR
      const error = new ProviderError(
        code,
        statusMsg
          ? 'image_generation returned no image: ' + statusMsg
          : 'image_generation returned no image (empty image_urls)',
        { providerId: this.id },
      )
      // 2026-08-09 Bug 反哺：无明确内容政策信号的空图（如 status_msg="success" 但无图）
      // 必须标记 emptyResult=true，让上层 runContentPolicyImageRetry 走「同提示词重试 →
      // 第 3 次起内容安全改写 → 5 次后 needs_user_input(empty_result)」合同路径；
      // 未标记时会被误判为普通 PROVIDER_ERROR 立即失败（26/27 场景整线失败的真实根因）。
      if (!isContentPolicy) error.emptyResult = true
      throw error
    }

    return {
      urls: imageUrls,
      format: 'url',
    }
  }

  /** 返回静态预定义 MiniMax Image 模型列表（副本） */
  async listModels() {
    return MINIMAX_IMAGE_MODELS.map(m => ({ ...m }))
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

module.exports = { MinimaxImageAdapter, MINIMAX_IMAGE_MODELS, parseAspectRatio }
