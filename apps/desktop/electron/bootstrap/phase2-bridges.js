// @ts-check
/**
 * Phase 2: Python Bridges 启动与清理
 *
 * 从 bootstrap.js runWhenReady 拆出：
 * - pythonBridge.startPythonBackend()
 * - splitterBridge.start() / promptBridge.start()（Promise.allSettled 并行）
 * - 返回显式、幂等、可等待的 stop 清理函数
 *
 * 验收标准 BUGFIX-PLAN Bug-1: phase 文件 <= 80 行
 */
const log = require('../services/logger')

/**
 * @param {unknown} value
 * @returns {string}
 */
function errorMessage(value) {
  return value instanceof Error ? value.message : String(value)
}

/**
 * 启动所有 Python bridges 并注册退出清理
 * @param {object} deps
 * @param {object} deps.app - Electron app 实例
 * @param {object} deps.pythonBridge - Python 后端桥接
 * @param {object} deps.splitterBridge - 分句器桥接
 * @param {object} deps.promptBridge - 提示词引擎桥接
 * @returns {Promise<() => Promise<void>>} 幂等的异步清理函数
 */
async function startBridges({ app, pythonBridge, splitterBridge, promptBridge }) {
  // 1. Python 后端（容错：失败不阻断启动）
  try {
    await pythonBridge.startPythonBackend()
  } catch (e) {
    log.error('App', 'Failed to start Python backend: ' + errorMessage(e))
  }

  // 2. SplitterBridge / PromptBridge 并行启动（allSettled 容错）
  const results = await Promise.allSettled([
    splitterBridge.start(),
    promptBridge.start(),
  ])
  const names = ['SplitterBridge', 'PromptBridge']
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      log.warn('App', names[i] + ' failed to start: ' +
        (r.reason instanceof Error ? r.reason.message : String(r.reason)))
    } else {
      log.info('App', names[i] + ' started')
    }
  })

  // 3. 清理由 shutdown 统一等待，避免 Electron 忽略异步事件监听器返回值。
  let stopPromise = null
  function stopBridges() {
    if (stopPromise) return stopPromise
    /** @type {Array<[string, () => unknown]>} */
    const bridges = [
      ['Python backend', () => pythonBridge.stopPythonBackend()],
      ['SplitterBridge', () => splitterBridge.stop()],
      ['PromptBridge', () => promptBridge.stop()],
    ]
    stopPromise = Promise.allSettled(
      bridges.map(([, stop]) => Promise.resolve().then(() => stop())),
    )
      .then((stopResults) => {
        stopResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            const reason = result.reason instanceof Error ? result.reason.message : String(result.reason)
            log.warn('App', bridges[index][0] + ' stop failed: ' + reason)
          }
        })
      })
    return stopPromise
  }

  return stopBridges
}

module.exports = { startBridges }
