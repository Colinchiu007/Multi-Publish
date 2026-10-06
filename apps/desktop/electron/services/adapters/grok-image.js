// @ts-check
/**
 * grok-image.js — xAI Grok Image Adapter（图像生成）
 *
 * 继承 OpenAICompatibleAdapter，覆盖 IImageAdapter mixin：
 *   - generateImage()    POST /images/generations 返回 { images, model, created }
 *
 * xAI Grok Image API 关键特性：
 * - 认证头 Authorization: Bearer {key}（继承自 OpenAIAdapter）
 * - generateImage: POST /images/generations，请求体 JSON { model, prompt, n, response_format? }
 * - model 默认 'grok-image'
 * - baseUrl 默认 'https://api.x.ai/v1'
 *
 * 设计决策：
 * - 继承 OpenAICompatibleAdapter 复用 _request/_headers/_url/validateConfig/testConnection
 * - 覆盖构造函数，设置供应商特定默认 baseUrl
 * - generateImage 在 KNOWN_METHODS 中，supports() 自动检测为 true
 * - 返回 { images: [{ url?, b64_json? }], model, created } 统一格式
 * - 画幅走 xAI 原生 aspect_ratio 枚举（不臆造 size 字段），见下方 SUPPORTED_ASPECT_RATIOS
 */

const { OpenAICompatibleAdapter } = require('./_base/openai-compatible')
const { ProviderError, ERROR_CODES } = require('./_base/provider-error')
const { readAspectRatio, pickClosestAspectRatio } = require('./_base/aspect-ratio')

const DEFAULT_BASE_URL = 'https://api.x.ai/v1'
const DEFAULT_MODEL = 'grok-image'

/**
 * xAI 图像生成 aspect_ratio 支持的枚举（2026-10-06 核对官方文档）。
 * 传枚举外的值会被拒，故必须先归一到最接近的一档。
 * 'auto' 不参与相似度匹配（语义是「由模型自选」，不是画幅值），仅作最后兜底。
 */
const SUPPORTED_ASPECT_RATIOS = Object.freeze([
  '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '19.5:9', '20:9', 'auto',
])

class GrokImageAdapter extends OpenAICompatibleAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - xAI API Key（必填，用于 Bearer 认证）
   * @param {string} [credentials.baseUrl] - 自定义端点（默认 https://api.x.ai/v1）
   * @param {object} [options]
   */
  constructor(credentials, options = {}) {
    const merged = { ...(credentials || {}) }
    if (!merged.baseUrl) {
      merged.baseUrl = DEFAULT_BASE_URL
    }
    super(merged, options)
  }

  /**
   * POST /images/generations — 图像生成
   *
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @param {string} [params.model='grok-image'] - 模型 ID
   * @param {number} [params.n=1] - 生成数量
   * @param {string} [params.aspect_ratio] - 画幅（流水线统一契约键，如 '9:16'）；缺省时不下发该字段，由模型自选
   * @param {string} [params.response_format] - 响应格式（url / b64_json）
   * @returns {Promise<{images: Array<{url?: string, b64_json?: string}>, model: string, created: number}>}
   */
  async generateImage(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const model = params.model || DEFAULT_MODEL
    const body = {
      model,
      prompt: params.prompt,
      n: params.n || 1,
    }
    // 画幅（2026-10-06 fix-s2v-image-aspect-adapters）：历史实现完全不下发画幅，
    // Story2Video 竖屏（9:16）请求因此被模型按提示词自选成横图，合成到 720x1280
    // 竖屏成片时两侧留黑。归一到官方枚举后才下发，避免传枚举外值被拒。
    const aspectRatio = pickClosestAspectRatio(SUPPORTED_ASPECT_RATIOS, readAspectRatio(params))
    if (aspectRatio && aspectRatio !== 'auto') {
      body.aspect_ratio = aspectRatio
    }
    if (params.response_format) {
      body.response_format = params.response_format
    }

    const resp = await this._request('/images/generations', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    return {
      images: data.data || [],
      model: data.model || model,
      created: data.created,
    }
  }
}

module.exports = { GrokImageAdapter }
