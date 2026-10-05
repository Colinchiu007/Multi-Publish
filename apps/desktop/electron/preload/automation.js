// @ts-check
/**
 * Automation preload API — 自动化任务模块
 *
 * 后台语义：任务在主进程后台执行，渲染层只收通知（onAutomationNotification），
 * 不承担执行、也不弹模态框。
 */

/**
 * @param {import('electron').IpcRenderer} ipcRenderer
 */
function createAutomationApi(ipcRenderer) {
  return {
    automationList: () => ipcRenderer.invoke('automation:list'),
    automationCreate: (payload) => ipcRenderer.invoke('automation:create', payload),
    automationUpdate: (id, payload) => ipcRenderer.invoke('automation:update', id, payload),
    automationRemove: (id) => ipcRenderer.invoke('automation:remove', id),
    automationRunNow: (id) => ipcRenderer.invoke('automation:run-now', id),
    // 后台任务通知（失败 / 从失败恢复）：渲染层转 toast，不打断当前操作
    onAutomationNotification: (cb) => {
      const h = (_, payload) => cb(payload)
      ipcRenderer.on('automation:notification', h)
      return () => ipcRenderer.removeListener('automation:notification', h)
    },
  };
}

module.exports = { createAutomationApi };
