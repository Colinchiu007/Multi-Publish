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
// BYOK：提示词引擎的 LLM 一律由调用方（桌面版「模型设置」）注入，引擎不再使用服务端 key 兜底
const CALLER_ID = 'multi-publish-desktop'
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
 * 该请求是否需要调用 LLM（与引擎端 requires_llm 语义一致：video 域或图片 creative_level>3）。
 * @param {object} request - 归一后的优化请求
 * @returns {boolean}
 */
function requiresLlm (request) {
  if (String(request.domain || '').toLowerCase() === 'video') return true
  const level = Number(request.creative_level)
  // 未显式传 creative_level 时按引擎默认值 5 处理（默认需要 LLM，fail-closed 优先）
  return Number.isFinite(level) ? level > 3 : true
}

/**
 * 桌面 provider id → 引擎 provider 注册名映射。
 * sensenova（商汤，OpenAI 兼容）与 deepseek 直接映射；其余 OpenAI 兼容供应商一律走 openai_compat。
 * @param {string} providerId
 * @returns {string}
 */
function engineProviderFor (providerId) {
  if (providerId === 'sensenova-llm') return 'sensenova'
  if (providerId === 'deepseek') return 'deepseek'
  return 'openai_compat'
}

/**
 * 取默认 LLM 的首个有效模型（models 是数组，首个非空项为当前选中模型）。
 * @param {unknown} models
 * @returns {string}
 */
function firstConfiguredModel (models) {
  if (!Array.isArray(models)) return ''
  for (const m of models) {
    if (typeof m === 'string' && m.trim()) return m.trim()
  }
  return ''
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

/**
 * 在优化结果外层附加后端来源元数据（浅拷贝，绝不改写引擎返回的原始对象/数组）。
 * 元数据仅供内部链路（story2video-stages 组装 continuity）消费，不进入发送给引擎的 payload。
 * @param {unknown} result
 * @param {{ backend: 'standalone-8020' | 'legacy-8013', fallback?: boolean }} meta
 * @returns {unknown}
 */
function tagVideoEngineResult (result, meta) {
  const tagObject = (value) => Object.assign({}, value, {
    _prompt_engine_backend: meta.backend,
    ...(meta.fallback ? { _prompt_engine_fallback: true } : {}),
  })

  const tagBatchItems = (value) => {
    if (!Array.isArray(value)) return value
    return value.map(item => (
      item !== null && typeof item === 'object' && !Array.isArray(item)
        ? tagObject(item)
        : item
    ))
  }

  if (Array.isArray(result)) return tagBatchItems(result)
  if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
    const tagged = tagObject(result)
    for (const key of ['results', 'optimized_prompts']) {
      if (Array.isArray(tagged[key])) tagged[key] = tagBatchItems(tagged[key])
    }
    if (tagged.data !== null && typeof tagged.data === 'object' && !Array.isArray(tagged.data)) {
      tagged.data = { ...tagged.data }
      for (const key of ['results', 'optimized_prompts']) {
        if (Array.isArray(tagged.data[key])) tagged.data[key] = tagBatchItems(tagged.data[key])
      }
    }
    return tagged
  }
  return result
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
   * 由桌面「模型设置」的默认 LLM 构造引擎 BYOK llm 绑定（provider/model/base_url/api_key）。
   * 无可用默认 LLM 时 fail-closed 抛错——引擎不再使用服务端 config.yaml / OpsCenter key 兜底。
   * @returns {{ provider: string, model: string, base_url?: string, api_key: string }}
   */
  resolveLlmBind () {
    const manager = this.modelProviderManager
    if (!manager || typeof manager.getDefault !== 'function' || typeof manager.getProviderWithKey !== 'function') {
      throw new Error('模型服务未就绪：无法解析默认 LLM（提示词引擎需要调用方自己的模型绑定）')
    }
    const def = manager.getDefault('llm')
    const id = def && typeof def.id === 'string' ? def.id.trim() : ''
    if (!id) {
      throw new Error('未配置默认文字推理模型：请在「模型设置」中选择并配置 LLM 后重试')
    }
    if (typeof manager.getProviderWithKey !== 'function') {
      throw new Error('模型服务未就绪：无法读取默认 LLM 的 API Key')
    }
    const withKey = manager.getProviderWithKey(id)
    if (!withKey || typeof withKey.api_key !== 'string' || !withKey.api_key.trim()) {
      throw new Error(`默认 LLM「${(def && def.name) || id}」未配置 API Key：请在「模型设置」中填写后重试`)
    }
    const model = firstConfiguredModel(withKey.models)
    if (!model) {
      throw new Error(`默认 LLM「${(def && def.name) || id}」未配置可用模型：请在「模型设置」中选择模型后重试`)
    }
    const bind = { provider: engineProviderFor(id), model, api_key: withKey.api_key }
    if (typeof withKey.base_url === 'string' && withKey.base_url.trim()) {
      bind.base_url = withKey.base_url.trim()
    }
    return bind
  }

  /**
   * 优化提示词 — POST /v1/optimize
   * @param {object} request - { prompt, ...options }
   * @returns {Promise<object>}
   */
  async optimize (request, traceId) {
    await this.ensureRunning()
    // async 保证同步校验异常（如敏感凭据拦截）以 rejected promise 呈现，统一走调用方错误处理
    const normalized = normalizeOptimizeRequest(request)
    if (requiresLlm(normalized)) {
      normalized.llm = this.resolveLlmBind()
      normalized.caller = CALLER_ID
    }
    return this._post('/v1/optimize', JSON.stringify(normalized), undefined, traceId)
  }

  /**
   * 批量优化 — POST /v1/optimize/batch
   * @param {object[]} requests - 优化请求数组
   * @returns {Promise<object>}
   */
  async optimizeBatch (requests, traceId) {
    await this.ensureRunning()
    const normalized = requests.map(normalizeOptimizeRequest)
    // 任一请求需要 LLM 即整体注入同一条默认 LLM 绑定（同一产品统一配置的模型）
    if (normalized.some(requiresLlm)) {
      const bind = this.resolveLlmBind()
      for (const n of normalized) {
        n.llm = bind
        n.caller = CALLER_ID
      }
    }
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
        const result = await this._postStandalone('/v1/video/optimize', JSON.stringify(standaloneReq), undefined, traceId)
        return tagVideoEngineResult(result, { backend: 'standalone-8020' })
      } catch (e) {
        const target = _standaloneTarget()
        this.log.warn('PromptBridge', `独立视频引擎(${target.host}:${target.port})不可用，回退 8013 domain=video：${e instanceof Error ? e.message : String(e)}`)
      }
    }
    await this.ensureRunning()
    const legacyReq = buildVideoOptimizeRequest(prompt, rest)
    // 独立视频引擎失败回退 8013：video 域必须走 BYOK llm 绑定（调用方自己的 LLM）
    legacyReq.llm = this.resolveLlmBind()
    legacyReq.caller = CALLER_ID
    const result = await this._post('/v1/optimize', JSON.stringify(legacyReq), undefined, traceId)
    return tagVideoEngineResult(result, { backend: 'legacy-8013', fallback: Boolean(_standaloneTarget()) })
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
        const result = await this._postStandalone('/v1/video/optimize/batch', JSON.stringify({ requests }), undefined, traceId)
        return tagVideoEngineResult(result, { backend: 'standalone-8020' })
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
    const bind = this.resolveLlmBind()
    for (const req of requests) {
      req.llm = bind
      req.caller = CALLER_ID
    }
    const result = await this._post('/v1/optimize/batch', JSON.stringify({ requests }), undefined, traceId)
    return tagVideoEngineResult(result, { backend: 'legacy-8013', fallback: Boolean(_standaloneTarget()) })
  }
}

module.exports = PromptBridge
