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

const PROMPT_PORT = config.promptBridge.port
const PROMPT_HOST = config.promptBridge.host
// P1-A: 移除硬编码开发者路径，必须通过环境变量配置
const PROMPT_DIR = process.env.PROMPT_DIR || process.cwd()

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
  optimize (request) {
    return this._post('/v1/optimize', JSON.stringify(normalizeOptimizeRequest(request)))
  }

  /**
   * 批量优化 — POST /v1/optimize/batch
   * @param {object[]} requests - 优化请求数组
   * @returns {Promise<object>}
   */
  optimizeBatch (requests) {
    const normalized = requests.map(normalizeOptimizeRequest)
    return this._post('/v1/optimize/batch', JSON.stringify({ requests: normalized }))
  }
}

module.exports = PromptBridge
