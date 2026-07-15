// @ts-check
/**
 * hunyuan.js — 腾讯混元视频 Adapter
 *
 * 腾讯混元视频 API 关键特性：
 * - 认证: SecretId + SecretKey（Tencent Cloud 签名，TC3-HMAC-SHA256）
 * - generateVideo: POST /，请求体 { Action: 'SubmitHunyuanVideoJob', Text: prompt }
 * - getVideoStatus: POST /，请求体 { Action: 'DescribeTaskStatus', JobId: id }
 * - 所有请求均通过根路径 POST，通过 Action 参数区分操作
 *
 * 实现的方法（capabilities）：
 *   - generateVideo()    提交视频生成任务
 *   - getVideoStatus()   查询任务状态
 *   - listModels()       静态预定义列表
 *   - testConnection()   通过最小请求验证
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')
const crypto = require('crypto')

const DEFAULT_BASE_URL = 'https://hunyuan.tencentcloudapi.com'
const DEFAULT_TIMEOUT = 60000

// 静态预定义模型列表（腾讯混元无公开 /models 端点）
const HUNYUAN_MODELS = [
  { id: 'hunyuan-video', name: 'Hunyuan Video', description: '腾讯混元视频生成模型' },
]

class HunyuanAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.secretId - 腾讯云 SecretId（必填）
   * @param {string} credentials.secretKey - 腾讯云 SecretKey（必填）
   * @param {string} [credentials.baseUrl] - 自定义端点
   * @param {object} [options]
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries || 2
  }

  /** 验证配置：secretId + secretKey 必填 */
  validateConfig() {
    const errors = []
    if (!this.credentials.secretId) errors.push('secretId is required')
    if (!this.credentials.secretKey) errors.push('secretKey is required')
    if (!this.credentials.baseUrl) errors.push('baseUrl is required')
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造完整 URL */
  _url(path) {
    const base = this.credentials.baseUrl.replace(/\/$/, '')
    return `${base}${path}`
  }

  /**
   * 生成腾讯云 TC3-HMAC-SHA256 签名
   * 简化版签名实现，仅用于 Hunyuan 视频接口
   */
  _sign(headers, body) {
    const service = 'hunyuan'
    const host = 'hunyuan.tencentcloudapi.com'
    const timestamp = Math.floor(Date.now() / 1000)
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

    // 1. 拼接规范请求串
    const httpRequestMethod = 'POST'
    const canonicalUri = '/'
    const canonicalQueryString = ''
    const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-tc-action:${headers['X-TC-Action']}\n`
    const signedHeaders = 'content-type;host;x-tc-action'
    const hashedRequestPayload = crypto.createHash('sha256').update(body).digest('hex')
    const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`

    // 2. 拼接签名串
    const algorithm = 'TC3-HMAC-SHA256'
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    const credentialScope = `${date}/${service}/tc3_request`
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`

    // 3. 计算签名
    const secretDate = crypto.createHmac('sha256', `TC3${this.credentials.secretKey}`).update(date).digest()
    const secretService = crypto.createHmac('sha256', secretDate).update(service).digest()
    const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest()
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

    // 4. Authorization 头
    const authorization = `${algorithm} Credential=${this.credentials.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

    return {
      'Authorization': authorization,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Action': headers['X-TC-Action'],
      'X-TC-Version': '2023-09-01',
      'Host': host,
      'Content-Type': 'application/json',
    }
  }

  /** 构造请求头 — 含腾讯云签名 */
  _headers(action, body) {
    return this._sign({ 'X-TC-Action': action }, body)
  }

  /**
   * 统一 fetch 包装 — 处理超时和错误转换
   */
  async _request(action, payload) {
    const url = this._url('/')
    const body = JSON.stringify(payload)
    const headers = this._headers(action, body)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
      })

      if (!response.ok) {
        let errorBody
        try { errorBody = await response.json() } catch (_) {
          try { errorBody = await response.text() } catch (__) { errorBody = {} }
        }
        const message = (errorBody && errorBody.Response && errorBody.Response.Error && errorBody.Response.Error.Message)
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
   * 提交视频生成任务
   * @param {object} params
   * @param {string} params.prompt - 生成提示词（必填）
   * @returns {Promise<{jobId: string, model: string}>}
   */
  async generateVideo(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const payload = {
      Action: 'SubmitHunyuanVideoJob',
      Text: params.prompt,
    }

    const resp = await this._request('SubmitHunyuanVideoJob', payload)
    const data = await resp.json()

    const jobId = data.Response && data.Response.JobId
    if (!jobId) {
      throw new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'Missing JobId in response', { providerId: this.id })
    }

    return { jobId, model: 'hunyuan-video' }
  }

  /**
   * 查询视频任务状态
   * @param {string} jobId - 任务 ID
   * @returns {Promise<{status: string, videoUrl: string, progress: number}>}
   */
  async getVideoStatus(jobId) {
    if (!jobId) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'jobId is required')
    }

    const payload = {
      Action: 'DescribeTaskStatus',
      JobId: jobId,
    }

    const resp = await this._request('DescribeTaskStatus', payload)
    const data = await resp.json()
    const task = data.Response || {}

    // 腾讯云任务状态映射
    const statusMap = {
      'RUNNING': 'processing',
      'SUCCESS': 'completed',
      'FAIL': 'failed',
    }
    const status = statusMap[task.Status] || 'processing'
    const videoUrl = task.VideoUrl || ''
    const progress = task.Progress !== undefined ? Number(task.Progress) : (status === 'completed' ? 100 : 0)

    return { status, videoUrl, progress }
  }

  /** 返回静态预定义模型列表 */
  async listModels() {
    return HUNYUAN_MODELS.map(m => ({ ...m }))
  }

  /** 测试连接 — 通过最小签名请求验证凭证 */
  async testConnection() {
    try {
      // 用 DescribeTaskStatus 配合空 JobId 验证签名是否被接受
      // 401/403 表示签名失败，参数错误（InvalidParameter）表示签名通过
      const resp = await this._request('DescribeTaskStatus', {
        Action: 'DescribeTaskStatus',
        JobId: 'connection-test',
      })
      const data = await resp.json()
      // 签名通过但参数无效，视为连接成功
      const errCode = data.Response && data.Response.Error && data.Response.Error.Code
      if (errCode === 'AuthFailure' || errCode === 'AuthFailure.SignatureFailure') {
        return { success: false, error: new ProviderError(ERROR_CODES.AUTH_FAILED, 'Signature failed') }
      }
      return { success: true }
    } catch (e) {
      if (e instanceof ProviderError && e.code === ERROR_CODES.AUTH_FAILED) {
        return { success: false, error: e }
      }
      return { success: false, error: e }
    }
  }
}

module.exports = { HunyuanAdapter, HUNYUAN_MODELS }
