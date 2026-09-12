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
const path = require('path')
const fs = require('fs')

const SPLITTER_PORT = config.splitterBridge.port
const SPLITTER_HOST = config.splitterBridge.host
// Stage -1 附项：移除硬编码开发机绝对路径；2026-09-12 bug 反思修复——
// 旧实现 path.join(__dirname,'..','..','..') 只回退到 apps/，拼出 apps/packages/...（不存在），
// Windows 上 spawn 的 cwd 不存在 → ENOENT（伪装成 python 缺失）→ 语义分句引擎静默降级。
// 修复：候选目录依次探测（显式环境变量 → 仓库源码 → 打包 extraResources → 应用根 → cwd），
// splitter 模块本身经 pip 安装（全局 site-packages），workDir 只需是一个真实存在的目录即可。
function resolveSplitterDir () {
  const candidates = [
    process.env.SPLITTER_DIR,
    // 开发形态：仓库根 packages/smart-sentence-splitter（源码安装场景）
    path.join(__dirname, '..', '..', '..', 'packages', 'smart-sentence-splitter'),
    // 开发形态回退：仓库根（pip 安装场景——模块在 site-packages，任意存在目录即可）
    path.join(__dirname, '..', '..', '..'),
    // 打包形态：extraResources packages/smart-sentence-splitter
    path.join(process.resourcesPath || '', 'packages', 'smart-sentence-splitter'),
    // 打包形态回退：resources 根
    process.resourcesPath,
    // 最终兜底：进程 cwd（保证 spawn cwd 永远有效，ENOENT 只会在 python 真缺失时出现）
    process.cwd(),
  ].filter(Boolean)
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir)) {
        if (dir !== process.env.SPLITTER_DIR) {
          // 诊断日志：区分「cwd 不存在」与「python 缺失」两类 ENOENT（bug 反思 P1）
          // eslint-disable-next-line no-console
          console.info('[SplitterBridge] workDir resolved:', dir)
        }
        return dir
      }
    } catch (_) { /* existsSync 失败继续下一候选 */ }
  }
  return process.cwd()
}
const SPLITTER_DIR = process.env.SPLITTER_DIR || (() => {
  return resolveSplitterDir()
})()

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
module.exports.resolveSplitterDir = resolveSplitterDir
module.exports.SPLITTER_DIR = SPLITTER_DIR
