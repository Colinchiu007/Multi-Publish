/**
 * Backlot Replay 生产回放 preload API
 *
 * 工厂函数：createReplayApi(ipcRenderer)
 *
 * 暴露到 window.electronAPI.replay（嵌套对象）：
 *   - replay.get(projectId) → { project, events, totalDuration }
 */

/**
 * 创建 Replay API 对象
 * @param {Electron.IpcRenderer} ipcRenderer
 * @returns {{ replay: object }}
 */
function createReplayApi(ipcRenderer) {
  return {
    replay: {
      get: (projectId) => ipcRenderer.invoke('replay:get', { projectId }),
    },
  };
}

module.exports = { createReplayApi };
