// @ts-check
/**
 * PromptBridge — prompt-engine Python 子进程管理
 * 端口 8013，提供提示词优化服务
 *
 * P2-6: 继承 BasePythonBridge，仅保留业务方法 optimize/optimizeBatch
 * 公共逻辑（start/stop/attach/healthCheck/watchdog/restart）由基类提供
 */
const { BasePythonBridge } = require('./base-python-bridge')
const { config } = require('../config/app-config')
const {
  normalizePromptEngineStyle,
  normalizePromptEnginePlatform,
  assertNoSensitiveContext,
} = require('./prompt-engine-contract')
const { buildVideoOptimizeRequest } = require('./video-prompt-engine-contract')

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
  async optimize (request) {
    await this.ensureRunning()
    // async 保证同步校验异常（如敏感凭据拦截）以 rejected promise 呈现，统一走调用方错误处理
    return this._post('/v1/optimize', JSON.stringify(normalizeOptimizeRequest(request)))
  }

  /**
   * 批量优化 — POST /v1/optimize/batch
   * @param {object[]} requests - 优化请求数组
   * @returns {Promise<object>}
   */
  async optimizeBatch (requests) {
    await this.ensureRunning()
    const normalized = requests.map(normalizeOptimizeRequest)
    return this._post('/v1/optimize/batch', JSON.stringify({ requests: normalized }))
  }

  /**
   * 视频提示词优化 — POST /v1/optimize（domain=video）
   * 与图片 optimize 同端点、同 Bridge，但走视频契约（video-prompt-engine-contract.js）。
   * @param {string|object} promptOrRequest - 提示词或 { prompt, ...options }
   * @param {object} [options] - 视频优化选项（platform/style/creativeLevel/maxLength/negativePrompt/context 等）
   * @returns {Promise<object>}
   */
  async optimizeVideo (promptOrRequest, options) {
    await this.ensureRunning()
    const request = (promptOrRequest !== null && typeof promptOrRequest === 'object' && !Array.isArray(promptOrRequest))
      ? buildVideoOptimizeRequest(promptOrRequest.prompt, { ...promptOrRequest })
      : buildVideoOptimizeRequest(String(promptOrRequest), options)
    return this._post('/v1/optimize', JSON.stringify(request))
  }

  /**
   * 批量视频提示词优化 — POST /v1/optimize/batch（domain=video）
   * @param {string[]|object[]} prompts - 提示词数组或 { prompt, ...options } 数组
   * @param {object} [options] - 对所有纯字符串项生效的公共选项
   * @returns {Promise<object>}
   */
  async optimizeVideosBatch (prompts, options) {
    await this.ensureRunning()
    const requests = (prompts || []).map(item => {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        return buildVideoOptimizeRequest(item.prompt, { ...item })
      }
      return buildVideoOptimizeRequest(String(item), options)
    })
    return this._post('/v1/optimize/batch', JSON.stringify({ requests }))
  }
}

module.exports = PromptBridge
