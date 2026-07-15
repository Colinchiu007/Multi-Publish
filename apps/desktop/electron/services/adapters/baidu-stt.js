// @ts-check
/**
 * baidu-stt.js — 百度语音识别 Adapter
 *
 * 百度智能云语音识别 API 关键特性：
 * - 认证方式：API Key + Secret Key → 换取 access_token（OAuth 2.0 client_credentials）
 * - token 换取端点：https://aip.baidubce.com/oauth/2.0/token
 * - ASR 端点：POST https://vop.baidu.com/server_api
 * - 请求体内含 token 字段（非 Authorization Header）
 * - audio.data 为 Base64 编码的音频数据，len 为原始字节数
 * - 返回 { err_no: 0, err_msg: "success.", result: ["识别文本"] }
 *
 * 实现的方法（capabilities）：
 *   - validateConfig()    apiKey + apiSecret 必填
 *   - testConnection()    通过 token 换取验证
 *   - transcribe()        POST /server_api（自动获取/复用 access_token）
 *
 * 设计决策：
 * - transcribe 不在 KNOWN_METHODS 中，需在类中直接定义为实例方法
 * - capabilities() 覆盖为 super.capabilities().concat(['transcribe'])
 * - access_token 缓存到实例（_tokenCache），过期前 60s 提前刷新
 * - cuid 固定为 'multi-publish'（百度要求唯一设备标识，用产品名即可）
 * - 错误码 err_no != 0 时抛 ProviderError(PROVIDER_ERROR)
 * - 所有 HTTP 错误统一抛 ProviderError，网络错误区分 TIMEOUT / NETWORK_ERROR
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://vop.baidu.com'
const DEFAULT_OAUTH_URL = 'https://aip.baidubce.com/oauth/2.0/token'
const DEFAULT_TIMEOUT = 60000
const DEFAULT_FORMAT = 'wav'
const DEFAULT_RATE = 16000
const DEFAULT_CHANNEL = 1
const DEFAULT_CUID = 'multi-publish'
const DEFAULT_LANGUAGE = 'zh'
// 提前 60 秒刷新 token，避免边界过期
const TOKEN_REFRESH_MARGIN = 60

class BaiduSttAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - 百度 API Key（必填）
   * @param {string} credentials.apiSecret - 百度 Secret Key（必填）
   * @param {string} [credentials.baseUrl] - ASR 自定义端点
   * @param {string} [credentials.oauthUrl] - OAuth 自定义端点
   * @param {object} [options]
   * @param {number} [options.timeout=60000] - 请求超时（ms）
   * @param {number} [options.maxRetries=2] - 最大重试次数
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.credentials.oauthUrl = this.credentials.oauthUrl || DEFAULT_OAUTH_URL
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries || 2
    // token 缓存：{ token, expiresAt }
    this._tokenCache = null
  }

  /** 验证配置：apiKey + apiSecret 必填 */
  validateConfig() {
    const errors = []
    if (!this.credentials.apiKey) {
      errors.push('apiKey is required')
    }
    if (!this.credentials.apiSecret) {
      errors.push('apiSecret is required')
    }
    if (!this.credentials.baseUrl) {
      errors.push('baseUrl is required')
    }
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — 百度 ASR 端点 token 在 Body，Header 仅 Content-Type */
  _headers() {
    return {
      'Content-Type': 'application/json',
    }
  }

  /** 构造 ASR 完整 URL */
  _url(path) {
    const base = this.credentials.baseUrl.replace(/\/$/, '')
    return `${base}${path}`
  }

  /**
   * 统一 fetch 包装 — 处理超时和错误转换
   */
  async _fetch(url, opts = {}) {
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
        // 百度错误格式：{ error: "...", error_description: "..." }（OAuth）
        // 或 { err_no: 3300, err_msg: "..." }（ASR）
        const message = (errorBody && (errorBody.error_description || errorBody.error || errorBody.err_msg))
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
   * 获取 access_token — 自动缓存，过期前 60s 提前刷新
   * OAuth 2.0 client_credentials 模式
   * @returns {Promise<string>} access_token
   */
  async _getAccessToken() {
    // 命中缓存（且未接近过期）
    if (this._tokenCache && this._tokenCache.expiresAt - TOKEN_REFRESH_MARGIN > Date.now() / 1000) {
      return this._tokenCache.token
    }

    const url = `${this.credentials.oauthUrl}?grant_type=client_credentials&client_id=${encodeURIComponent(this.credentials.apiKey)}&client_secret=${encodeURIComponent(this.credentials.apiSecret)}`
    const resp = await this._fetch(url, { method: 'POST' })
    const data = await resp.json()

    if (!data.access_token) {
      throw new ProviderError(
        ERROR_CODES.AUTH_FAILED,
        `Failed to obtain access_token: ${data.error_description || data.error || 'unknown'}`,
        { providerId: this.id }
      )
    }

    const expiresIn = data.expires_in || 2592000 // 默认 30 天
    this._tokenCache = {
      token: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    }

    return data.access_token
  }

  /**
   * POST /server_api — 语音识别
   *
   * @param {object} params
   * @param {string} params.audio - 音频内容（Base64 编码字符串，必填）
   * @param {number} params.len - 原始音频字节数（必填，百度要求）
   * @param {string} [params.format='wav'] - 音频格式
   * @param {number} [params.rate=16000] - 采样率
   * @param {number} [params.channel=1] - 声道数
   * @param {string} [params.language='zh'] - 语言代码（用于返回）
   * @param {string} [params.cuid='multi-publish'] - 设备唯一标识
   * @returns {Promise<{text: string, language: string, err_no: number}>}
   */
  async transcribe(params) {
    if (!params || !params.audio) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.audio is required')
    }
    if (typeof params.len !== 'number') {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.len is required (original audio byte length)')
    }

    const format = params.format || DEFAULT_FORMAT
    const rate = params.rate || DEFAULT_RATE
    const channel = params.channel || DEFAULT_CHANNEL
    const language = params.language || DEFAULT_LANGUAGE
    const cuid = params.cuid || DEFAULT_CUID

    // 获取 access_token（带缓存）
    const token = await this._getAccessToken()

    const body = {
      format,
      rate,
      channel,
      token,
      cuid,
      speech: params.audio,
      len: params.len,
    }

    const resp = await this._fetch(this._url('/server_api'), {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    // 百度返回 { err_no: 0, err_msg: "success.", result: ["识别文本"] }
    if (data.err_no && data.err_no !== 0) {
      // 111/110: token 无效 → AUTH_FAILED
      if (data.err_no === 111 || data.err_no === 110) {
        // 清空 token 缓存，下次重新获取
        this._tokenCache = null
        throw new ProviderError(
          ERROR_CODES.AUTH_FAILED,
          `Baidu ASR auth error: ${data.err_msg} (err_no=${data.err_no})`,
          { providerId: this.id, err_no: data.err_no }
        )
      }
      throw new ProviderError(
        ERROR_CODES.PROVIDER_ERROR,
        `Baidu ASR error: ${data.err_msg} (err_no=${data.err_no})`,
        { providerId: this.id, err_no: data.err_no }
      )
    }

    // result 是字符串数组，取第一个
    const text = Array.isArray(data.result) ? (data.result[0] || '') : (data.result || '')

    return {
      text,
      language,
      err_no: data.err_no || 0,
    }
  }

  /**
   * 测试连接 — 通过 token 换取验证 apiKey/apiSecret 有效性
   * 不实际调用 ASR 端点，仅验证 OAuth 流程
   */
  async testConnection() {
    try {
      await this._getAccessToken()
      return { success: true }
    } catch (e) {
      return { success: false, error: e }
    }
  }

  /**
   * capabilities() — 覆盖以手动添加 'transcribe'
   * transcribe 不在 BaseAdapter 的 KNOWN_METHODS 中，supports() 默认返回 false
   */
  capabilities() {
    return super.capabilities().concat(['transcribe'])
  }
}

module.exports = { BaiduSttAdapter }
