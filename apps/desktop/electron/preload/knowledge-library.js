// @ts-check
/**
 * Knowledge Library preload API
 *
 * 暴露给渲染进程的知识库相关 IPC 调用（扁平方法名，兼容 electron-bridge invokeWithFallback）。
 */

/**
 * @param {import('electron').IpcRenderer} ipcRenderer
 */
function createKnowledgeLibraryApi(ipcRenderer) {
  return {
    // 爆款库
    addViralToLibrary: (item) => ipcRenderer.invoke('knowledge-library:add-viral', item),
    addViralBatchToLibrary: (items) => ipcRenderer.invoke('knowledge-library:add-viral-batch', items),
    listViralItems: (params) => ipcRenderer.invoke('knowledge-library:list-viral', params),
    getViralItem: (id) => ipcRenderer.invoke('knowledge-library:get-viral', id),
    updateViralItem: (id, updates) => ipcRenderer.invoke('knowledge-library:update-viral', id, updates),
    deleteViralItem: (id) => ipcRenderer.invoke('knowledge-library:delete-viral', id),
    searchViralItems: (query, limit) => ipcRenderer.invoke('knowledge-library:search-viral', query, limit),
    // 个人知识库
    addPersonalToLibrary: (item) => ipcRenderer.invoke('knowledge-library:add-personal', item),
    addPersonalBatchToLibrary: (items) => ipcRenderer.invoke('knowledge-library:add-personal-batch', items),
    listPersonalItems: (params) => ipcRenderer.invoke('knowledge-library:list-personal', params),
    getPersonalItem: (id) => ipcRenderer.invoke('knowledge-library:get-personal', id),
    updatePersonalItem: (id, updates) => ipcRenderer.invoke('knowledge-library:update-personal', id, updates),
    deletePersonalItem: (id) => ipcRenderer.invoke('knowledge-library:delete-personal', id),
    searchPersonalItems: (query, limit) => ipcRenderer.invoke('knowledge-library:search-personal', query, limit),
  }
}

module.exports = { createKnowledgeLibraryApi }

