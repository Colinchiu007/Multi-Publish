// @ts-check
/**
 * PromptBridge — prompt-engine Python 子进程管理
 * 端口 8013，提供提示词优化服务
 *
 * P2-6: 继承 BasePythonBridge，仅保留业务方法 optimize/optimizeBatch
 * 公共逻辑（start/stop/attach/healthCheck/watchdog/restart）由基类提供
 */
const http = require('http')
const { BasePythonBridge } = require('./base-python-bridge')
const { config } = require('../config/app-config')
const {
  normalizePromptEngineStyle,
  normalizePromptEnginePlatform,
  assertNoSensitiveContext,
} = require('./prompt-engine-contract')
const {
  buildVideoOptimizeRequest,
  buildStandaloneVideoOptimizeRequest,
  isStandaloneVideoEngineEnabled,
  getStandaloneVideoEngineTarget,
} = require('./video-prompt-engine-contract')

const PROMPT_PORT = config.promptBridge.port
const PROMPT_HOST = config.promptBridge.host
// P1-A: 移除硬编码开发者路径，必须通过环境变量配置
// PROMPT_DIR 必须指向包含 prompt_engine 包的 Python 项目根目录
const _defaultPromptDir = (() => {
  const knownPaths = [
    'D:\\Data\\projects\\prompt-engine',
    'D:\\Projects\\prompt-engine',
  ]
  const fs = require('fs')
  for (const p of knownPaths) {
    try { if (fs.existsSync(p + '/prompt_engine')) return p } catch (_) { /* ignore */ }
  }
  return process.cwd()
})()
const PROMPT_DIR = process.env.PROMPT_DIR || _defaultPromptDir

function normalizeOptimizeRequest (request) {
  const normalized = request !== null && typeof request === 'object' && !Array.isArray(request)
    ? { ...request }
    : { prompt: String(request) }

  if (normalized.max_length === null || normalized.max_length === undefined || normalized.max_length === '') {
    delete normalized.max_length
  }
  if (normalized.context === null || normalized.context === undefined || normalized.context === '') {
    delete normalized.context
  } else if (typeof normalized.context === 'string') {
    normalized.context = { synopsis: normalized.context }
  } else if (normalized.context !== null && typeof normalized.context === 'object') {
    // 纵深防御：context 会发给外部服务，敏感凭据键在此处再拦一道（契约层已拦）
    assertNoSensitiveContext(normalized.context, 'optimize.context')
  }
  // 图片提示词统一契约：发送前归一平台/风格，避免历史别名（cinematic/dall-e/stable-diffusion 等）触发 422
  if (normalized.platform !== undefined && normalized.platform !== null && normalized.platform !== '') {
    normalized.platform = normalizePromptEnginePlatform(normalized.platform)
  }
  if (normalized.style !== undefined && normalized.style !== null && normalized.style !== '') {
    normalized.style = normalizePromptEngineStyle(normalized.style)
  } else if (normalized.style === '') {
    delete normalized.style
  }
  return normalized
}

/**
 * 独立视频引擎（video_prompt_engine，8020）目标（每次调用读取环境变量，便于测试/运行期切换）。
 * @returns {{ host: string, port: number } | null}
 */
function _standaloneTarget () {
  if (!isStandaloneVideoEngineEnabled()) return null
  const { host, port } = getStandaloneVideoEngineTarget()
  const n = Number(port)
  if (!Number.isInteger(n) || n <= 0 || n > 65535) return null
  return { host, port: n }
}

class PromptBridge extends BasePythonBridge {
  /**
   * @param {{ log?: any }} opts
   */
  constructor ({ log } = {}) {
    super({
      name: 'PromptBridge',
      pythonModule: 'prompt_engine.api',
      port: PROMPT_PORT,
      host: PROMPT_HOST,
      workDir: PROMPT_DIR,
      log,
      requestTimeout: 60000,
    })
  }

  /**
   * 优化提示词 — POST /v1/optimize
   * @param {object} request - { prompt, ...options }
   * @returns {Promise<object>}
   */
  async optimize (request, traceId) {
    await this.ensureRunning()
    // async 保证同步校验异常（如敏感凭据拦截）以 rejected promise 呈现，统一走调用方错误处理
    return this._post('/v1/optimize', JSON.stringify(normalizeOptimizeRequest(request)), undefined, traceId)
  }

  /**
   * 批量优化 — POST /v1/optimize/batch
   * @param {object[]} requests - 优化请求数组
   * @returns {Promise<object>}
   */
  async optimizeBatch (requests, traceId) {
    await this.ensureRunning()
    const normalized = requests.map(normalizeOptimizeRequest)
    return this._post('/v1/optimize/batch', JSON.stringify({ requests: normalized }), undefined, traceId)
  }

  /**
   * 独立视频引擎 POST — 不启动子进程（8020 由外部/脚本单独托管），失败抛错由调用方回退。
   * @param {string} path
   * @param {string} body
   * @param {number} [timeout]
   * @returns {Promise<object>}
   * @protected
   */
  _postStandalone (path, body, timeout, traceId) {
    const target = _standaloneTarget()
    if (!target) return Promise.reject(new Error('standalone video engine not configured (VIDEO_PROMPT_PORT)'))
    const reqTimeout = timeout || this.requestTimeout
    // 仅记录 path + traceId，绝不记录 body；traceId 非 header 安全 ASCII 时跳过头发送
    const safeTraceId = typeof traceId === 'string' && /^[A-Za-z0-9._:\-_]{1,64}$/.test(traceId) ? traceId : null
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    if (safeTraceId) {
      headers['X-Request-Id'] = safeTraceId
      this.log.info(this.name, `POST ${path} traceId=${safeTraceId}`)
    } else if (traceId) {
      this.log.warn(this.name, `POST ${path} 跳过非法 traceId（非 header 安全字符）`)
    }
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: target.host,
        port: target.port,
        path,
        method: 'POST',
        headers,
        timeout: reqTimeout,
      }, (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => { try { resolve(JSON.parse(data)) } catch { reject(new Error('standalone video engine 返回非法 JSON')) } })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('standalone video engine request timeout')) })
      req.write(body)
      req.end()
    })
  }

  /**
   * 视频提示词优化 — 独立引擎（8020 /v1/video/optimize）优先，失败回退 8013 /v1/optimize（domain=video）。
   * 独立引擎与图片引擎完全分离（video_prompt_engine 包），回退仅用于兼容未托管 8020 的环境。
   * @param {string|object} promptOrRequest - 提示词或 { prompt, ...options }
   * @param {object} [options] - 视频优化选项（platform/style/creativeLevel/maxLength/negativePrompt/context/outputLanguage 等）
   * @returns {Promise<object>}
   */
  async optimizeVideo (promptOrRequest, options) {
    const isObjectReq = promptOrRequest !== null && typeof promptOrRequest === 'object' && !Array.isArray(promptOrRequest)
    const prompt = isObjectReq ? promptOrRequest.prompt : String(promptOrRequest)
    const opts = isObjectReq ? { ...promptOrRequest } : options
    // traceId 是控制字段：提取后不进业务 payload，仅用于 X-Request-Id 头
    const { traceId, ...rest } = opts || {}
    if (_standaloneTarget()) {
      try {
        const standaloneReq = buildStandaloneVideoOptimizeRequest(prompt, rest)
        return await this._postStandalone('/v1/video/optimize', JSON.stringify(standaloneReq), undefined, traceId)
      } catch (e) {
        const target = _standaloneTarget()
        this.log.warn('PromptBridge', `独立视频引擎(${target.host}:${target.port})不可用，回退 8013 domain=video：${e instanceof Error ? e.message : String(e)}`)
      }
    }
    await this.ensureRunning()
    const legacyReq = buildVideoOptimizeRequest(prompt, rest)
    return this._post('/v1/optimize', JSON.stringify(legacyReq), undefined, traceId)
  }

  /**
   * 批量视频提示词优化 — 独立引擎（8020 /v1/video/optimize/batch）优先，失败回退 8013 /v1/optimize/batch。
   * @param {string[]|object[]} prompts - 提示词数组或 { prompt, ...options } 数组
   * @param {object} [options] - 对所有纯字符串项生效的公共选项
   * @returns {Promise<object>}
   */
  async optimizeVideosBatch (prompts, options) {
    // traceId 是控制字段：从顶层 options 提取，不进业务 payload
    const { traceId, ...restOptions } = options || {}
    const build = (item) => {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        return { prompt: item.prompt, opts: { ...item } }
      }
      return { prompt: String(item), opts: restOptions }
    }
    if (_standaloneTarget()) {
      try {
        const requests = (prompts || []).map(item => {
          const { prompt, opts } = build(item)
          return buildStandaloneVideoOptimizeRequest(prompt, opts)
        })
        return await this._postStandalone('/v1/video/optimize/batch', JSON.stringify({ requests }), undefined, traceId)
      } catch (e) {
        const target = _standaloneTarget()
        this.log.warn('PromptBridge', `独立视频引擎(${target.host}:${target.port})不可用，回退 8013 domain=video 批量：${e instanceof Error ? e.message : String(e)}`)
      }
    }
    await this.ensureRunning()
    const requests = (prompts || []).map(item => {
      const { prompt, opts } = build(item)
      return buildVideoOptimizeRequest(prompt, opts)
    })
    return this._post('/v1/optimize/batch', JSON.stringify({ requests }), undefined, traceId)
  }
}

module.exports = PromptBridge
