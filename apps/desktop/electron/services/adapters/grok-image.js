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
 * - 不发送 size 字段（Grok API 与 OpenAI DALL-E 不同，不强制要求 size）
 */

const { OpenAICompatibleAdapter } = require('./openai-compatible')
const { ProviderError, ERROR_CODES } = require('./provider-error')

const DEFAULT_BASE_URL = 'https://api.x.ai/v1'
const DEFAULT_MODEL = 'grok-image'

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
