// @ts-check
/**
 * 服务状态 IPC — 聚合本地常驻/按需服务的运行状态
 *
 * 返回结构（每项）：
 *   { key, name, status: 'running'|'stopped'|'standby', port }
 *
 * - mainBackend / callbackServer / mediaServer：同步状态读取（isRunning / server.listening / origin）
 * - splitterEngine / promptEngine：主动健康检查（GET /health，2s 超时）
 * - alignerEngine：按需懒启动，未激活时返回 standby（不算故障）
 */
const { withSenderCheck, EC } = require('./helpers')

function bridgeStatus (bridge, fallbackPort) {
  if (!bridge) return { status: 'standby', port: fallbackPort }
  return { status: bridge.isRunning ? 'running' : 'stopped', port: bridge.port || fallbackPort }
}

function registerServicesHandlers (ipcMain, deps = {}) {
  ipcMain.handle('services:get-status', withSenderCheck(async () => {
    try {
      const { config } = require('../config/app-config')

      const splitterHealthy = deps.splitterBridge
        ? await Promise.resolve(deps.splitterBridge.healthCheck()).catch(() => false)
        : false
      const promptHealthy = deps.promptBridge
        ? await Promise.resolve(deps.promptBridge.healthCheck()).catch(() => false)
        : false

      const services = [
        {
          key: 'mainBackend',
          name: '主服务',
          status: deps.pythonBridge && typeof deps.pythonBridge.isRunning === 'function' && deps.pythonBridge.isRunning() ? 'running' : 'stopped',
          port: deps.pythonBridge && typeof deps.pythonBridge.currentPort === 'function' ? deps.pythonBridge.currentPort() : config.pythonBridge.port,
        },
        {
          key: 'splitterEngine',
          name: '分句引擎',
          status: splitterHealthy ? 'running' : 'stopped',
          port: config.splitterBridge.port,
        },
        {
          key: 'promptEngine',
          name: '提示词优化引擎',
          status: promptHealthy ? 'running' : 'stopped',
          port: config.promptBridge.port,
        },
        {
          key: 'callbackServer',
          name: '回调服务',
          status: deps.callbackServer && deps.callbackServer.server && deps.callbackServer.server.listening ? 'running' : 'stopped',
          port: config.callbackServer.port,
        },
        {
          key: 'mediaServer',
          name: '媒体服务',
          status: deps.story2videoMediaServer && deps.story2videoMediaServer.origin ? 'running' : 'stopped',
          port: deps.story2videoMediaServer && deps.story2videoMediaServer.origin
            ? Number(deps.story2videoMediaServer.origin.split(':').pop()) || 0
            : 0,
        },
        { key: 'alignerEngine', name: '对齐引擎', ...bridgeStatus(null, config.alignerBridge.port) },
      ]

      return { code: 0, data: { services, timestamp: Date.now() } }
    } catch (_error) {
      return { code: EC.UNKNOWN_ERROR, message: 'SERVICES_STATUS_UNAVAILABLE' }
    }
  }))
}

module.exports = registerServicesHandlers
