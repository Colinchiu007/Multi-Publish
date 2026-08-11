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
// P1-A: 移除硬编码开发者路径，必须通过环境变量配置
// SPLITTER_DIR 必须指向包含 splitter 包的 Python 项目根目录
// 优先环境变量，其次尝试已知路径，最后 process.cwd()
const _defaultSplitterDir = (() => {
  const knownPaths = [
    'D:\\Data\\projects\\smart-sentence-splitter',
    'D:\\Projects\\smart-sentence-splitter',
  ]
  const fs = require('fs')
  for (const p of knownPaths) {
    try { if (fs.existsSync(p + '/splitter')) return p } catch (_) { /* ignore */ }
  }
  return process.cwd()
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
    const body = JSON.stringify({ text, language: 'auto', mode: 'balanced', ...options })
    return this._post('/v1/split', body)
  }
}

module.exports = SplitterBridge
