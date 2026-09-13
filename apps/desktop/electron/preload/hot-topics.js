// @ts-check
/**
 * Hot Topics preload API — 热门选题模块
 */

/**
 * @param {import('electron').IpcRenderer} ipcRenderer
 */
function createHotTopicsApi(ipcRenderer) {
  return {
    hotTopicsFetch: (payload) => ipcRenderer.invoke('hot-topics:fetch', payload),
    hotTopicsGetCache: () => ipcRenderer.invoke('hot-topics:get-cache'),
    // 收藏
    hotTopicsFavoriteAdd: (topic) => ipcRenderer.invoke('hot-topics:favorite-add', { topic }),
    hotTopicsFavoriteRemove: (topicId) => ipcRenderer.invoke('hot-topics:favorite-remove', { topicId }),
    hotTopicsFavoriteList: () => ipcRenderer.invoke('hot-topics:favorite-list'),
  }
}

module.exports = { createHotTopicsApi }
