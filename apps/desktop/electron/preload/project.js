/**
 * Backlot 项目库 preload API（OpenMontage 集成）
 *
 * 工厂函数：createProjectApi(ipcRenderer)
 *   - ipcRenderer 由调用方（preload/index.js）注入，便于测试 mock
 *
 * 暴露到 window.electronAPI.project（嵌套对象）：
 *   - project.list() → Project[]
 *   - project.get(id) → Project
 *   - project.del(id) → { deleted: boolean }
 */

/**
 * 创建项目库 API 对象（嵌套到 electronAPI.project）
 * @param {Electron.IpcRenderer} ipcRenderer - 由 index.js 注入
 * @returns {{ project: object }}
 */
function createProjectApi(ipcRenderer) {
  return {
    project: {
      list: () => ipcRenderer.invoke('project:list'),
      get: (projectId) => ipcRenderer.invoke('project:get', { projectId }),
      del: (projectId) => ipcRenderer.invoke('project:delete', { projectId }),
    },
  };
}

module.exports = { createProjectApi };
