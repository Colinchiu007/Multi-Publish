// @ts-check
/**
 * Aggregation preload API — 热文采集模块
 *
 * 暴露给渲染进程的 aggregation 相关 IPC 调用。
 */

/**
 * @param {import('electron').IpcRenderer} ipcRenderer
 */
function createAggregationApi(ipcRenderer) {
  return {
    aggregationCollect: (payload) => ipcRenderer.invoke('aggregation:collect', payload),
    aggregationCollectBatch: (payload) => ipcRenderer.invoke('aggregation:collect-batch', payload),
    aggregationRewrite: (payload) => ipcRenderer.invoke('aggregation:rewrite', payload),
    aggregationSources: () => ipcRenderer.invoke('aggregation:sources'),
    aggregationTaskStatus: (taskId) => ipcRenderer.invoke('aggregation:task-status', taskId),
  }
}

module.exports = { createAggregationApi }
