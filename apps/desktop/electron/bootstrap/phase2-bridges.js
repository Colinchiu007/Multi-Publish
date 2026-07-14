// @ts-check
/**
 * Phase 2: Python Bridges 启动与清理
 *
 * 从 bootstrap.js runWhenReady 拆出：
 * - pythonBridge.startPythonBackend()
 * - splitterBridge.start() / promptBridge.start()（Promise.allSettled 并行）
 * - before-quit 事件注册（stop 清理）
 *
 * 验收标准 BUGFIX-PLAN Bug-1: phase 文件 <= 80 行
 */
const log = require('../services/logger')

/**
 * 启动所有 Python bridges 并注册退出清理
 * @param {object} deps
 * @param {object} deps.app - Electron app 实例
 * @param {object} deps.pythonBridge - Python 后端桥接
 * @param {object} deps.splitterBridge - 分句器桥接
 * @param {object} deps.promptBridge - 提示词引擎桥接
 * @returns {Promise<void>}
 */
async function startBridges({ app, pythonBridge, splitterBridge, promptBridge }) {
  // 1. Python 后端（容错：失败不阻断启动）
  try {
    await pythonBridge.startPythonBackend()
  } catch (e) {
    log.error('App', 'Failed to start Python backend:', e.message)
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

  // 3. 退出清理：停止所有 bridges（容错：单个失败不影响其他）
  app.on('before-quit', async () => {
    try { await splitterBridge.stop() }
    catch (e) { log.warn('App', 'SplitterBridge stop failed: ' + e.message) }
    try { await promptBridge.stop() }
    catch (e) { log.warn('App', 'PromptBridge stop failed: ' + e.message) }
  })
}

module.exports = { startBridges }
