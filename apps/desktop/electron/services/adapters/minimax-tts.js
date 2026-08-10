// @ts-check
/**
 * minimax-tts.js — MiniMax TTS Adapter（语音合成）
 *
 * MiniMax TTS API 关键特性：
 * - 认证头 Authorization: Bearer {key}
 * - synthesize: POST /t2a_v2，请求体 { model, text, voice_setting, audio_setting }
 * - 响应中 data.audio 为 hex 编码字符串，需转换为 Buffer
 * - 支持 speed（0.5-2，默认 1.0）和 pitch（默认 0）
 * - 支持 mp3/wav/flac 格式，采样率 32000
 *
 * 默认端点 https://api.minimaxi.com/v1，需 API Key。
 * 支持模型：speech-2.8-hd、speech-2.8-turbo、speech-2.6-hd、speech-2.6-turbo。
 *
 * 实现的方法（capabilities）：
 *   - synthesize()       POST /t2a_v2
 *   - listModels()      静态预定义列表
 *   - testConnection()  验证 apiKey 存在
 *   - validateConfig()  apiKey + baseUrl 必填
 *
 * 设计决策：
 * - 不覆盖 LLM/Image/Video 方法（BaseAdapter 默认抛 NotImplementedError）
 * - synthesize 返回 { audio: Buffer, format } 统一格式（hex → Buffer 转换）
 * - listModels 静态列表避免不必要的 HTTP 请求
 */

const { BaseAdapter } = require('./_base/base')
const { ProviderError, ERROR_CODES, fromHttpStatus } = require('./_base/provider-error')
const { MINIMAX_SYSTEM_VOICES } = require('./minimax-tts-voices')

const DEFAULT_BASE_URL = 'https://api.minimaxi.com/v1'
const DEFAULT_TIMEOUT = 60000
// 需求：MiniMax TTS 默认使用 speech-2.8-turbo（异步长文本语音合成 T2A Async 模型）
const DEFAULT_MODEL = 'speech-2.8-turbo'
const DEFAULT_VOICE = 'male-qn-qingse'
const DEFAULT_SPEED = 1.0
const DEFAULT_PITCH = 0
const DEFAULT_VOL = 10
const DEFAULT_BITRATE = 128000
const DEFAULT_CHANNEL = 2
const DEFAULT_OUTPUT_FORMAT = 'mp3'
const DEFAULT_SAMPLE_RATE = 32000
// 异步 T2A：创建任务 → 轮询查询 → 下载音频。2.8/02 系列为 T2A Async 模型
// （官方「异步语音合成」支持模型表），同步端点 /t2a_v2 对异步模型不返回
// data.audio（200 但缺音频 → “Missing audio data”）。
const DEFAULT_ASYNC_POLL_TIMEOUT_MS = 90 * 1000
const DEFAULT_ASYNC_POLL_INTERVAL_MS = 1000

// 音色复刻（克隆）使用模型（MiniMax 官方文档 speech-voice-clone）：
// 快速复刻接口示例 model=speech-2.8-hd；官方「异步语音合成」模型表中
// speech-02-hd 是唯一标注「复刻相似度」的模型——克隆音色的正式语音合成
// 必须用 speech-02-hd，不能用 speech-2.8-turbo 等（否则报 voice id wrong）。
const VOICE_CLONE_MODEL = 'speech-2.8-hd'
const CLONED_VOICE_SYNTHESIS_MODEL = 'speech-02-hd'

function isAsyncT2aModel (model) {
  return /^speech-(2\.8|02)-(turbo|hd)$/i.test(String(model || ''))
}

function isSystemVoiceId (voiceId) {
  return MINIMAX_SYSTEM_VOICES.some((item) => item.id === voiceId)
}

/**
 * 音色/参数类错误归类为 INVALID_CONFIG（非瞬时、不可重试），
 * 让流水线快速失败并透传具体原因（如「voice id wrong」），而不是反复重试后弹笼统提示。
 */
function voiceInvalidOrConfigError (message, providerId) {
  const normalized = String(message || '').trim()
  const voiceInvalid = /voice id wrong|invalid params.*voice|voice_id.*(?:invalid|wrong|not found|not exist|unsupported)|音色.*(?:无效|不存在|失效)/i.test(normalized)
  const code = voiceInvalid ? ERROR_CODES.INVALID_CONFIG : ERROR_CODES.PROVIDER_ERROR
  return new ProviderError(code, normalized || 'MiniMax 语音合成失败', { providerId })
}

// 静态预定义 MiniMax TTS 模型列表（speech-2.8-turbo 为首选默认）
const MINIMAX_TTS_MODELS = [
  { id: 'speech-2.8-turbo',  name: 'Speech 2.8 Turbo',  description: '异步长文本语音合成（T2A Async），极致生成速度' },
  { id: 'speech-2.8-hd',     name: 'Speech 2.8 HD',     description: '高质量语音合成 v2.8' },
  { id: 'speech-2.6-hd',     name: 'Speech 2.6 HD',     description: '高质量语音合成 v2.6' },
  { id: 'speech-2.6-turbo',  name: 'Speech 2.6 Turbo',  description: '快速语音合成 v2.6' },
]

/**
 * 校验 MiniMax 克隆音色自定义 voice_id 是否符合官方约束：
 * 长度 [8,256]、首字符必须为英文字母、仅允许数字/字母/-/_、末位字符不可为 -/_。
 * （官方文档：api-reference/voice-cloning-clone）
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidMiniMaxCloneVoiceId (value) {
  if (typeof value !== 'string' || value.length === 0) return false
  if (value.length < 8 || value.length > 256) return false
  if (!/^[a-zA-Z]/.test(value)) return false
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) return false
  if (/[-_]$/.test(value)) return false
  return true
}

/**
 * 生成符合官方约束的克隆音色 voice_id：
 * - 以 "MiniMax" 前缀保证首字符为英文字母
 * - 名称清洗后仅保留 [A-Za-z0-9_-]，末位非 -/_
 * - 追加短随机后缀避免与平台已有 id 重复，长度落在 [8,256]
 * @param {string} [name]
 * @returns {string}
 */
function buildMiniMaxCloneVoiceId (name) {
  let base = String(name || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/[-_]+$/g, '')
    .replace(/^[^a-zA-Z]+/, '')
  if (!base) base = 'CloneVoice'
  const suffix = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6)
  let id = 'MiniMax' + base.slice(0, 240) + '_' + suffix
  while (id.length < 8) id += '0'
  return id.slice(0, 256)
}

class MinimaxTtsAdapter extends BaseAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - MiniMax API Key（必填）
   * @param {string} [credentials.baseUrl] - 自定义端点
   * @param {object} [options]
   * @param {number} [options.timeout=60000] - 请求超时（ms）
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
   * POST /t2a_v2 — 语音合成
   *
   * @param {object} params
   * @param {string} params.text - 要合成的文本（必填）
   * @param {string} [params.model='speech-2.8-hd'] - TTS 模型 ID
   * @param {string} [params.voice] - 声音 ID（voice_id）
   * @param {number} [params.speed=1.0] - 速度（0.5-2）
   * @param {number} [params.pitch=0] - 音调
   * @param {string} [params.outputFormat='mp3'] - 输出格式（mp3/wav/flac）
   * @returns {Promise<{audio: Buffer, format: string}>}
   */
  async synthesize(params) {
    if (!params || !params.text) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.text is required')
    }

    const model = params.model || DEFAULT_MODEL
    const voice = params.voice || DEFAULT_VOICE
    const speed = params.speed !== undefined ? params.speed : DEFAULT_SPEED
    const pitch = params.pitch !== undefined ? params.pitch : DEFAULT_PITCH
    const outputFormat = params.outputFormat || DEFAULT_OUTPUT_FORMAT

    // 官方音色 vs 克隆音色使用不同模型（MiniMax 官方文档）：
    // - 官方音色 → 使用用户配置的模型（如 speech-2.8-turbo）
    // - 克隆（复刻）音色 → 必须使用 speech-02-hd（官方「异步语音合成」模型表中
    //   唯一标注「复刻相似度」的模型），否则服务商报「invalid params, voice id wrong」。
    // 系统音色列表之外的 voice_id 视为克隆音色。
    const effectiveModel = isSystemVoiceId(voice) ? model : CLONED_VOICE_SYNTHESIS_MODEL

    // 异步 T2A 模型（speech-2.8-*/speech-02-*）必须走 t2a_async_v2 创建任务 → 查询 → 下载，
    // 同步端点 /t2a_v2 对异步模型返回 200 但不含 data.audio。
    if (isAsyncT2aModel(effectiveModel)) {
      return this._synthesizeAsync({ text: params.text, model: effectiveModel, voice, speed, pitch, outputFormat })
    }

    const body = {
      model,
      text: params.text,
      voice_setting: {
        voice_id: voice,
        speed,
        pitch,
      },
      audio_setting: {
        format: outputFormat,
        sample_rate: DEFAULT_SAMPLE_RATE,
      },
    }

    const resp = await this._request('/t2a_v2', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await resp.json()

    // MiniMax 响应中 data.audio 为 hex 编码字符串
    const hexAudio = data?.data?.audio || data?.audio
    if (!hexAudio) {
      throw new ProviderError(
        ERROR_CODES.PROVIDER_ERROR,
        'Missing audio data in response',
        { providerId: this.id }
      )
    }

    // hex 字符串 → Buffer
    const audio = Buffer.from(hexAudio, 'hex')

    return {
      audio,
      format: outputFormat,
    }
  }

  /**
   * 异步 T2A 语音合成（T2A Async）：
   * 1. POST /t2a_async_v2 创建任务，返回 data.task_id
   * 2. 轮询 GET /query/t2a_async_query_v2?task_id=... 直至返回 data.file_id（或直接返回 data.audio）
   * 3. GET /files/retrieve_content?file_id=... 下载音频二进制
   * 官方文档：https://platform.minimaxi.com/docs/guides/speech-t2a-async
   */
  async _synthesizeAsync ({ text, model, voice, speed, pitch, outputFormat }) {
    const createBody = {
      model,
      text,
      language_boost: 'auto',
      voice_setting: {
        voice_id: voice,
        speed,
        vol: DEFAULT_VOL,
        pitch,
      },
      audio_setting: {
        format: outputFormat,
        audio_sample_rate: DEFAULT_SAMPLE_RATE,
        bitrate: DEFAULT_BITRATE,
        channel: DEFAULT_CHANNEL,
      },
    }
    const createResp = await this._request('/t2a_async_v2', {
      method: 'POST',
      body: JSON.stringify(createBody),
    })
    const createData = await createResp.json()
    const taskId = createData?.data?.task_id || createData?.task_id
    if (!taskId) {
      const message = createData?.base_resp?.status_msg
        || createData?.message
        || 'MiniMax 异步语音合成未返回 task_id'
      // 音色无效/参数错误属于配置问题：非瞬时、不重试，快速失败并透传具体原因
      throw voiceInvalidOrConfigError(message, this.id)
    }

    const pollTimeoutMs = Number.isFinite(Number(this.options.asyncPollTimeoutMs))
      ? Number(this.options.asyncPollTimeoutMs)
      : DEFAULT_ASYNC_POLL_TIMEOUT_MS
    const deadline = Date.now() + pollTimeoutMs
    for (;;) {
      const queryResp = await this._request('/query/t2a_async_query_v2?task_id=' + encodeURIComponent(taskId))
      const queryData = await queryResp.json()
      // 官方查询接口把 status/file_id/task_id 放在响应顶层（{ task_id, status, file_id, base_resp }），
      // 历史实现曾只读 data.*（queryData.data）导致任务永远显示 pending 直到超时。
      // 这里顶层与 data.* 双层兼容解析。
      const nested = queryData?.data && typeof queryData.data === 'object' ? queryData.data : {}
      const data = queryData && typeof queryData === 'object' ? queryData : {}
      const baseResp = data?.base_resp || nested?.base_resp || {}
      const statusCode = baseResp.status_code
      const taskStatus = String(data?.status || nested?.status || '').toLowerCase()

      // 完成：查询响应直接带音频（hex），或返回 file_id 后下载
      const inlineAudio = (typeof data.audio === 'string' && data.audio.length > 0) ? data.audio
        : ((typeof nested.audio === 'string' && nested.audio.length > 0) ? nested.audio : null)
      if (inlineAudio) {
        const audio = Buffer.from(inlineAudio, 'hex')
        if (audio.length > 0) return { audio, format: outputFormat }
      }
      const rawFileId = data?.file_id ?? nested?.file_id ?? null
      const fileId = rawFileId !== null && rawFileId !== undefined ? String(rawFileId).trim() : ''
      if (fileId && taskStatus !== 'processing') {
        const audioResp = await this._request('/files/retrieve_content?file_id=' + encodeURIComponent(fileId))
        const audioBuffer = Buffer.from(await audioResp.arrayBuffer())
        if (!audioBuffer || audioBuffer.length === 0) {
          throw new ProviderError(ERROR_CODES.PROVIDER_ERROR, 'MiniMax 异步语音合成返回空音频', { providerId: this.id })
        }
        return { audio: audioBuffer, format: outputFormat }
      }

      // 明确失败
      const errorValue = data?.error || nested?.error
      const hasError = errorValue && (typeof errorValue === 'string'
        ? String(errorValue).trim()
        : (errorValue.message || errorValue.code))
      if (hasError || taskStatus === 'failed' || taskStatus === 'expired') {
        const message = typeof errorValue === 'string'
          ? errorValue
          : (errorValue && errorValue.message) || String(data?.status || nested?.status || '') || 'MiniMax 异步语音合成失败'
        throw voiceInvalidOrConfigError(message, this.id)

      }
      if (statusCode !== undefined && Number(statusCode) !== 0) {
        throw voiceInvalidOrConfigError(
          String(baseResp.status_msg || ('MiniMax 异步语音合成失败（status_code=' + statusCode + '）')),
          this.id,
        )
      }

      if (Date.now() >= deadline) {
        throw new ProviderError(ERROR_CODES.TIMEOUT, 'MiniMax 异步语音合成查询超时', { providerId: this.id })
      }
      await new Promise((resolve) => setTimeout(resolve, DEFAULT_ASYNC_POLL_INTERVAL_MS))
    }
  }
  /** 返回静态预定义 MiniMax TTS 模型列表（副本） */
  async listModels() {
    return MINIMAX_TTS_MODELS.map(m => ({ ...m }))
  }

  /**
   * 列出可用音色（系统音色 + 用户已复刻音色）。
   * 官方文档：https://platform.minimaxi.com/docs/faq/system-voice-id.md
   * @returns {Promise<{id: string, name: string}[]>}
   */
  async listVoices() {
    return MINIMAX_SYSTEM_VOICES.map(voice => ({ id: voice.id, name: voice.name }))
  }

  /**
   * 上传复刻音频 → 创建音色复刻任务。
   * 官方文档：https://platform.minimaxi.com/docs/guides/speech-voice-clone.md
   * 上传：POST /v1/files/upload（purpose=voice_clone）→ file_id
   * 复刻：POST /v1/voice_clone（file_id + voice_id）
   * 要求：mp3/m4a/wav、时长 10s-5min、大小 ≤20MB（由 tts-voice-clone-service 前置校验）
   * 自定义 voice_id 约束（官方 API 文档）：长度 [8,256]、首字符必须为英文字母、
   * 允许数字/字母/-/_、末位字符不可为 -/_、不可与已有 id 重复。
   * @param {{name?: string, samples?: Array<{blob?: Blob, fileName?: string, contentType?: string}>}} params
   * @returns {Promise<{id: string, name: string}>}
   */
  async cloneVoice(params = {}) {
    const sample = Array.isArray(params.samples) ? params.samples[0] : null
    if (!sample || !sample.blob) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'MiniMax 音色复刻需要一个待克隆音频样本')
    }
    const form = new FormData()
    form.append('purpose', 'voice_clone')
    form.append('file', sample.blob, sample.fileName || 'clone_input.mp3')

    let uploadResp
    try {
      uploadResp = await fetch(this._url('/files/upload'), {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + this.credentials.apiKey },
        body: form,
      })
    } catch (e) {
      throw new ProviderError(ERROR_CODES.NETWORK_ERROR, '上传复刻音频失败: ' + (e.message || String(e)), { providerId: this.id })
    }
    if (!uploadResp.ok) {
      const body = await uploadResp.text().catch(() => '')
      throw fromHttpStatus(uploadResp.status, body.slice(0, 300), { providerId: this.id })
    }
    const uploadJson = await uploadResp.json()
    const fileId = uploadJson?.file?.file_id
    if (!fileId) {
      throw new ProviderError(ERROR_CODES.PROVIDER_ERROR, '上传复刻音频未返回 file_id', { providerId: this.id })
    }

    // 生成符合官方约束的克隆音色 voice_id（长度 [8,256]、首字母、仅 [A-Za-z0-9_-]、末位非 -_）
    const requestedName = String(params.name || 'clone_voice').trim()
    const voiceId = buildMiniMaxCloneVoiceId(requestedName)

    // 官方文档示例：快速复刻接口需传 model（speech-2.8-hd）
    const cloneResp = await this._request('/voice_clone', {
      method: 'POST',
      body: JSON.stringify({ file_id: fileId, voice_id: voiceId, model: VOICE_CLONE_MODEL }),
    })
    const cloneJson = await cloneResp.json()
    const finalId = cloneJson?.voice_id || cloneJson?.data?.voice_id || voiceId
    if (!finalId) {
      throw new ProviderError(ERROR_CODES.PROVIDER_ERROR, '音色复刻未返回 voice_id', { providerId: this.id })
    }
    // 平台回显的 voice_id 若不合规（旧服务端/异常），回退到本次生成的合规 id
    const validatedId = isValidMiniMaxCloneVoiceId(finalId) ? String(finalId) : voiceId
    return { id: validatedId, name: requestedName }
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

module.exports = {
  MinimaxTtsAdapter,
  MINIMAX_TTS_MODELS,
  MINIMAX_SYSTEM_VOICES,
  buildMiniMaxCloneVoiceId,
  isValidMiniMaxCloneVoiceId,
}
