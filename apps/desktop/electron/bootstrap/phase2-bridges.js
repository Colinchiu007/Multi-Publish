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
 * SplitterBridge 启动失败的用户可见提示（2026-09-12 bug 反思 P1 打包契约）。
 * 背景：splitter 依赖用户机器 pip 安装 smart-sentence-splitter；缺失时此前仅写日志，
 * 用户无感知地使用降级分句。此通知让「语义分句引擎不可用」显性化（不阻断启动）。
 * 仅打包形态提示（开发环境降级属已知调试状态，避免噪音）。
 */
function notifySplitterUnavailable(reason) {
  try {
    const { app, Notification, isPackaged } = require('electron')
    if (!isPackaged()) return
    if (typeof Notification !== 'function' || !Notification.isSupported()) return
    const notification = new Notification({
      title: '语义分句引擎不可用',
      body: '视频字幕将使用本地基础分句（质量可能下降）。请安装 Python 及 smart-sentence-splitter 包后重启应用。诊断: ' + String(reason || '').slice(0, 180),
    })
    notification.show()
  } catch (_) { /* 通知失败不影响启动 */ }
}

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
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
      log.warn('App', names[i] + ' failed to start: ' + reason)
      if (names[i] === 'SplitterBridge') notifySplitterUnavailable(reason)
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
