// @ts-check
/**
 * comfyui.js — ComfyUI Adapter
 *
 * ComfyUI API 关键特性：
 * - 无需认证（本地服务）
 * - baseUrl: http://localhost:8188（默认，可配置）
 * - generateImage: POST /prompt
 *   请求体 { prompt: workflow_json, client_id: 'multi-publish' }
 *   原始返回 { prompt_id, number, node_errors }
 *   注：ComfyUI 是异步的，generateImage 直接返回 prompt_id 和 message "queued"
 *   需调用方轮询 getJobStatus(prompt_id) 获取结果
 * - getVideoStatus 复用为 getJobStatus: GET /history/{id} 检查任务状态
 * - testConnection: GET /system_stats 检查在线
 *
 * 实现的方法（capabilities）：
 *   - generateImage()    POST /prompt（提交工作流）
 *   - getVideoStatus()   GET /history/{id}（复用为 getJobStatus）
 *   - listModels()       GET /object_info（动态拉取节点信息）
 *   - testConnection()   GET /system_stats 检查在线
 */

const { BaseAdapter } = require('./base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./provider-error')

const DEFAULT_BASE_URL = 'http://localhost:8188'
const DEFAULT_TIMEOUT = 60000
const DEFAULT_CLIENT_ID = 'multi-publish'

class ComfyUiAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} [credentials.baseUrl] - 本地 ComfyUI 端点（必填，默认 localhost:8188）
   * @param {object} [options]
   * @param {number} [options.timeout=60000] - 请求超时（ms）
   * @param {number} [options.maxRetries=0] - 最大重试次数
   * @param {string} [options.clientId] - ComfyUI client_id 标识
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
    this.credentials.baseUrl = this.credentials.baseUrl || DEFAULT_BASE_URL
    this.options.timeout = this.options.timeout || DEFAULT_TIMEOUT
    this.options.maxRetries = this.options.maxRetries !== undefined ? this.options.maxRetries : 0
    this.options.clientId = this.options.clientId || DEFAULT_CLIENT_ID
  }

  /** 验证配置：baseUrl 必填 */
  validateConfig() {
    const errors = []
    if (!this.credentials.baseUrl) {
      errors.push('baseUrl is required')
    }
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }

  /** 构造请求头 — ComfyUI 无需认证 */
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
   * POST /prompt — 提交工作流（异步）
   *
   * ComfyUI 是异步的，generateImage 仅提交任务并返回 prompt_id。
   * 调用方需轮询 getJobStatus(prompt_id) 获取最终结果。
   *
   * @param {object} params
   * @param {object} params.prompt - ComfyUI 工作流 JSON（必填，节点 ID → 节点配置）
   * @param {string} [params.client_id] - 客户端 ID 标识
   * @returns {Promise<{prompt_id: string, message: string, model: string}>}
   */
  async generateImage(params) {
    if (!params || !params.prompt) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.prompt is required')
    }

    const body = {
      prompt: params.prompt,
      client_id: params.client_id || this.options.clientId,
    }

    const resp = await this._request('/prompt', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    return {
      prompt_id: data.prompt_id,
      message: 'queued',
      model: 'comfyui',
    }
  }

  /**
   * GET /history/{id} — 查询任务状态
   * 复用 IVideoAdapter.getVideoStatus 作为 getJobStatus
   *
   * @param {string} promptId - ComfyUI prompt_id
   * @returns {Promise<{status: string, outputs?: object, prompt_id: string}>}
   */
  async getVideoStatus(promptId) {
    if (!promptId) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'promptId is required')
    }

    const resp = await this._request(`/history/${encodeURIComponent(promptId)}`, {
      method: 'GET',
    })
    const data = await resp.json()

    // ComfyUI /history/{id} 返回 { [prompt_id]: { outputs, status, ... } }
    // 任务不存在时返回 {}
    const entry = data[promptId]
    if (!entry) {
      return {
        status: 'pending',
        prompt_id: promptId,
      }
    }

    // status 字段格式：{ status_str: 'success'/'error', completed: true/false, messages: [...] }
    const statusStr = entry.status && entry.status.status_str
    const isCompleted = entry.status && entry.status.completed

    return {
      status: statusStr || (isCompleted ? 'success' : 'pending'),
      completed: !!isCompleted,
      outputs: entry.outputs,
      prompt_id: promptId,
    }
  }

  /**
   * 列出可用模型 — GET /object_info
   * 返回 ComfyUI 节点信息（含可用 checkpoint 模型列表）
   * @returns {Promise<Array<{id, name, description}>>}
   */
  async listModels() {
    const resp = await this._request('/object_info', { method: 'GET' })
    const data = await resp.json()

    // 从 CheckpointLoaderSimple 节点提取可用模型
    const checkpointInfo = data.CheckpointLoaderSimple
    const modelNames = (checkpointInfo && checkpointInfo.input && checkpointInfo.input.required
      && checkpointInfo.input.required.ckpt_name && checkpointInfo.input.required.ckpt_name[0]) || []

    return modelNames.map(name => ({
      id: name,
      name,
      description: 'ComfyUI checkpoint',
    }))
  }

  /**
   * 测试连接 — GET /system_stats 检查在线
   */
  async testConnection() {
    try {
      await this._request('/system_stats', { method: 'GET' })
      return { success: true }
    } catch (e) {
      return { success: false, error: e }
    }
  }
}

module.exports = { ComfyUiAdapter }
