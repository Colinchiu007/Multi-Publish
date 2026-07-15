// @ts-check
/**
 * openai-image.js — OpenAI DALL-E Image Adapter（图像生成与编辑）
 *
 * 继承 OpenAIAdapter，覆盖 IImageAdapter mixin：
 *   - generateImage()    POST /images/generations 返回 { images, model, created }
 *   - editImage()        POST /images/edits 返回同 generateImage
 *
 * OpenAI DALL-E API 关键特性：
 * - 认证头 Authorization: Bearer {key}（继承自 OpenAIAdapter）
 * - generateImage: POST /images/generations，请求体 JSON { model, prompt, n, size, response_format }
 * - editImage: POST /images/edits，请求体 FormData（multipart/form-data）
 * - model 默认 'dall-e-3'，size 默认 '1024x1024'
 * - 支持 response_format: url / b64_json
 * - editImage 需上传原图 image + 可选 mask
 *
 * 设计决策：
 * - 继承 OpenAIAdapter 复用 _request/_headers/_url/validateConfig/testConnection
 * - generateImage 和 editImage 在 KNOWN_METHODS 中，supports() 自动检测为 true
 * - editImage 使用 FormData，需移除默认 Content-Type
 * - 返回 { images: [{ url?, b64_json? }], model, created } 统一格式
 */

const { OpenAIAdapter } = require('./openai')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_MODEL = 'dall-e-3'
const DEFAULT_SIZE = '1024x1024'

class OpenAIImageAdapter extends OpenAIAdapter {
  /**
   * POST /images/generations — 图像生成
   *
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @param {string} [params.model='dall-e-3'] - 模型 ID（dall-e-3 / dall-e-2）
   * @param {number} [params.n=1] - 生成数量
   * @param {string} [params.size='1024x1024'] - 尺寸（1024x1024/1792x1024/1024x1792）
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
      size: params.size || DEFAULT_SIZE,
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

  /**
   * POST /images/edits — 图像编辑
   *
   * @param {object} params
   * @param {Buffer|Blob|File} params.image - 原始图片（必填）
   * @param {string} params.prompt - 编辑提示词（必填）
   * @param {Buffer|Blob|File} [params.mask] - 蒙版图片（可选）
   * @param {string} [params.model='dall-e-3'] - 模型 ID
   * @param {number} [params.n=1] - 生成数量
   * @param {string} [params.size='1024x1024'] - 尺寸
   * @returns {Promise<{images: Array<{url?: string, b64_json?: string}>, model: string, created: number}>}
   */
  async editImage(params) {
    if (!params || !params.image) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.image is required')
    }
    if (!params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const model = params.model || DEFAULT_MODEL
    const form = new FormData()
    form.append('image', params.image)
    form.append('prompt', params.prompt)
    form.append('model', model)
    form.append('n', String(params.n || 1))
    form.append('size', params.size || DEFAULT_SIZE)
    if (params.mask) {
      form.append('mask', params.mask)
    }

    const resp = await this._formRequest('/images/edits', form)
    const data = await resp.json()

    return {
      images: data.data || [],
      model: data.model || model,
      created: data.created,
    }
  }

  /**
   * FormData 请求专用 — 移除 Content-Type 让 fetch 自动设置 multipart/form-data; boundary
   * 用于文件上传类端点（/images/edits）
   */
  async _formRequest(path, formData) {
    const url = this._url(path)
    const headers = { ...this._headers() }
    delete headers['Content-Type']  // 让 fetch 自动设置 multipart boundary

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers,
      })

      if (!response.ok) {
        let errorBody
        try {
          errorBody = await response.json()
        } catch (_) {
          try { errorBody = await response.text() } catch (__) { errorBody = {} }
        }
        const message = (errorBody && errorBody.error && errorBody.error.message)
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
}

module.exports = { OpenAIImageAdapter }
