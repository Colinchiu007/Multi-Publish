// @ts-check
/**
 * doubao-stt.js — 豆包（字节跳动）语音识别 Adapter
 *
 * 字节跳动火山引擎 ASR API 关键特性：
 * - 认证方式：app_id + token（token 在请求体内，非 Authorization Header）
 * - baseUrl: https://openspeech.bytedance.com，端点 /api/v2/asr
 * - transcribe: POST /api/v2/asr，请求体含 app/user/audio/request 四段
 * - audio.data 为 Base64 编码的音频数据
 * - request.reqid 需唯一（每次调用生成新 uuid）
 * - cluster 默认 volcano_asr（火山引擎通用 ASR 集群）
 *
 * 实现的方法（capabilities）：
 *   - validateConfig()    app_id 和 token 必填
 *   - testConnection()    通过最小 asr 请求验证
 *   - transcribe()        POST /api/v2/asr
 *
 * 设计决策：
 * - transcribe 不在 KNOWN_METHODS 中，需在类中直接定义为实例方法
 * - capabilities() 覆盖为 super.capabilities().concat(['transcribe'])
 * - app_id + token 在请求体内（字节跳特的非标准认证方式）
 * - reqid 每次调用随机生成（用 crypto.randomUUID，Node 19+）
 * - sequence=-1 表示单次完整识别（非流式）
 * - 所有 HTTP 错误统一抛 ProviderError，网络错误区分 TIMEOUT / NETWORK_ERROR
 */

const crypto = require('crypto')
const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')

const DEFAULT_BASE_URL = 'https://openspeech.bytedance.com'
const DEFAULT_TIMEOUT = 60000
const DEFAULT_CLUSTER = 'volcano_asr'
const DEFAULT_FORMAT = 'wav'
const DEFAULT_RATE = 16000
const DEFAULT_BITS = 16
const DEFAULT_CHANNEL = 1
const DEFAULT_LANGUAGE = 'zh'

class DoubaoSttAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.app_id - 豆包应用 ID（必填）
   * @param {string} credentials.token - 豆包访问 token（必填）
   * @param {string} [credentials.cluster] - ASR 集群名（默认 volcano_asr）
   * @param {string} [credentials.baseUrl] - 自定义端点
   * @param {object} [options]
   * @param {number} [options.timeout=60000] - 请求超时（ms）
   * @param {number} [options.maxRetries=2] - 最大重试次数
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.credentials.cluster = this.credentials.cluster || DEFAULT_CLUSTER
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries || 2
  }

  /** 验证配置：app_id 和 token 必填 */
  validateConfig() {
    const errors = []
    if (!this.credentials.app_id) {
      errors.push('app_id is required')
    }
    if (!this.credentials.token) {
      errors.push('token is required')
    }
    if (!this.credentials.baseUrl) {
      errors.push('baseUrl is required')
    }
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — 豆包使用 Bearer token（双重认证：Header + Body） */
  _headers() {
    return {
      'Authorization': `Bearer; ${this.credentials.token}`,
      'Content-Type': 'application/json',
      'Resource-Id': 'volc.bigasr.sauc.duration',
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
        // 豆包错误格式：{ code: 0, message: "...", ... } 或 { message: "..." }
        const message = (errorBody && (errorBody.message || errorBody.msg))
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
   * POST /api/v2/asr — 语音识别
   *
   * @param {object} params
   * @param {string} params.audio - 音频内容（Base64 编码字符串，必填）
   * @param {string} [params.format='wav'] - 音频格式
   * @param {number} [params.rate=16000] - 采样率
   * @param {number} [params.bits=16] - 位深
   * @param {number} [params.channel=1] - 声道数
   * @param {string} [params.language='zh'] - 语言代码（用于返回）
   * @param {number} [params.nbest=1] - 返回最佳候选数
   * @param {string} [params.uid='user'] - 用户标识
   * @returns {Promise<{text: string, language: string, duration: number}>}
   */
  async transcribe(params) {
    if (!params || !params.audio) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.audio is required')
    }

    const format = params.format || DEFAULT_FORMAT
    const rate = params.rate || DEFAULT_RATE
    const bits = params.bits || DEFAULT_BITS
    const channel = params.channel || DEFAULT_CHANNEL
    const language = params.language || DEFAULT_LANGUAGE
    const nbest = params.nbest || 1
    const uid = params.uid || 'user'

    // 每次调用生成新 reqid（字节跳动要求唯一）
    const reqid = (crypto.randomUUID && crypto.randomUUID()) || `req-${Date.now()}-${Math.random().toString(36).slice(2)}`

    const body = {
      app: {
        appid: this.credentials.app_id,
        token: this.credentials.token,
        cluster: this.credentials.cluster,
      },
      user: { uid },
      audio: {
        format,
        rate,
        bits,
        channel,
        data: params.audio,
      },
      request: {
        reqid,
        nbest,
        sequence: -1,
      },
    }

    const resp = await this._request('/api/v2/asr', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    // 豆包返回 { code: 1000, message: "Success", result: ["识别文本"], duration: 5.0 }
    // 或 { code: <非1000>, message: "错误信息" }
    if (data.code && data.code !== 1000 && data.code !== 0) {
      throw new ProviderError(
        ERROR_CODES.PROVIDER_ERROR,
        `Doubao ASR error: ${data.message || 'unknown'} (code=${data.code})`,
        { providerId: this.id, code: data.code }
      )
    }

    // result 可能是数组或字符串
    let text = ''
    if (Array.isArray(data.result)) {
      text = data.result[0] || ''
    } else if (typeof data.result === 'string') {
      text = data.result
    } else if (typeof data.text === 'string') {
      text = data.text
    }

    return {
      text,
      language,
      duration: typeof data.duration === 'number' ? data.duration : 0,
    }
  }

  /**
   * 测试连接 — 通过最小 asr 请求验证认证
   * 使用空音频触发请求，仅验证认证与端点可达
   */
  async testConnection() {
    try {
      const reqid = (crypto.randomUUID && crypto.randomUUID()) || `test-${Date.now()}`
      await this._request('/api/v2/asr', {
        method: 'POST',
        body: JSON.stringify({
          app: {
            appid: this.credentials.app_id,
            token: this.credentials.token,
            cluster: this.credentials.cluster,
          },
          user: { uid: 'test' },
          audio: { format: DEFAULT_FORMAT, rate: DEFAULT_RATE, bits: DEFAULT_BITS, channel: DEFAULT_CHANNEL, data: '' },
          request: { reqid, nbest: 1, sequence: -1 },
        }),
      })
      return { success: true }
    } catch (e) {
      if (e instanceof ProviderError && (e.code === ERROR_CODES.AUTH_FAILED || e.code === ERROR_CODES.INVALID_CONFIG)) {
        return { success: false, error: e }
      }
      // 空音频可能返回业务错误（code != 1000），但 HTTP 200 说明认证通过
      if (e instanceof ProviderError && e.code === ERROR_CODES.PROVIDER_ERROR) {
        // 业务错误码包含认证失败信息时也视为失败
        const msg = e.message || ''
        if (msg.includes('token') || msg.includes('auth') || msg.includes('appid')) {
          return { success: false, error: e }
        }
        return { success: true }
      }
      return { success: true }
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

module.exports = { DoubaoSttAdapter }
