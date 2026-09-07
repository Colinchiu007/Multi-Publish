// @ts-check
/**
 * Auto-Pipeline preload API — 全自动管道
 */

/**
 * @param {import('electron').IpcRenderer} ipcRenderer
 */
function createAutoPipelineApi(ipcRenderer) {
  return {
    autoPipelineStart: (config) => ipcRenderer.invoke('auto-pipeline:start', config),
    autoPipelineGetRun: (runId) => ipcRenderer.invoke('auto-pipeline:get-run', runId),
    autoPipelineCancel: (runId) => ipcRenderer.invoke('auto-pipeline:cancel', runId),
    autoPipelineListRuns: () => ipcRenderer.invoke('auto-pipeline:list-runs'),
  };
}

module.exports = { createAutoPipelineApi };
