// @ts-check
/**
 * SplitterBridge — smart-sentence-splitter Python 子进程管理
 * 端口 8002，提供文本分句服务
 *
 * P2-6: 继承 BasePythonBridge，仅保留业务方法 split()
 * 公共逻辑（start/stop/attach/healthCheck/watchdog/restart）由基类提供
 */
const { BasePythonBridge } = require('./base-python-bridge')
const { config } = require('../config/app-config')

const SPLITTER_PORT = config.splitterBridge.port
const SPLITTER_HOST = config.splitterBridge.host
// Stage -1 附项：移除硬编码开发机绝对路径，仅保留环境变量 + 打包相对路径
const SPLITTER_DIR = process.env.SPLITTER_DIR || (() => {
  const path = require('path')
  return path.join(__dirname, '..', '..', '..', 'packages', 'smart-sentence-splitter')
})()
const SPLITTER_DIR = process.env.SPLITTER_DIR || _defaultSplitterDir

class SplitterBridge extends BasePythonBridge {
  /**
   * @param {{ log?: any }} opts
   */
  constructor ({ log } = {}) {
    super({
      name: 'SplitterBridge',
      pythonModule: 'splitter.api.rest_api',
      port: SPLITTER_PORT,
      host: SPLITTER_HOST,
      workDir: SPLITTER_DIR,
      log,
      requestTimeout: 30000,
    })
  }

  /**
   * 分句 — POST /v1/split
   * @param {string} text - 待分句文本
   * @param {object} [options] - 额外选项（language, mode 等）
   * @returns {Promise<object>} 分句结果
   */
  async split (text, options = {}) {
    await this.ensureRunning()
    // traceId 是控制字段：提取后不进业务 payload，仅用于 X-Request-Id 头
    const { traceId, ...rest } = options || {}
    const body = JSON.stringify({ text, language: 'auto', mode: 'balanced', ...rest })
    return this._post('/v1/split', body, undefined, traceId)
  }
}

module.exports = SplitterBridge
