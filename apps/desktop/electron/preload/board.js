/**
 * Backlot 实时看板 preload API
 *
 * 工厂函数：createBoardApi(ipcRenderer)
 *
 * 暴露到 window.electronAPI.board（嵌套对象）：
 *   - board.subscribe(projectId) → { subscribed, initial }
 *   - board.unsubscribe() → { unsubscribed }
 *   - board.get(projectId) → BoardState
 *   - board.onUpdate(callback) → 取消订阅函数
 */

/**
 * 创建看板 API 对象
 * @param {Electron.IpcRenderer} ipcRenderer
 * @returns {{ board: object }}
 */
function createBoardApi(ipcRenderer) {
  // IPC push 监听器集合
  const updateListeners = new Set();

  // 监听 board:update 推送
  ipcRenderer.on('board:update', (_event, payload) => {
    const board = payload && payload.board;
    if (board) {
      for (const cb of updateListeners) {
        try { cb(board); } catch (_) { /* 单个 listener 失败不影响其他 */ }
      }
    }
  });

  return {
    board: {
      subscribe: (projectId) => ipcRenderer.invoke('board:subscribe', { projectId }),
      unsubscribe: () => ipcRenderer.invoke('board:unsubscribe'),
      get: (projectId) => ipcRenderer.invoke('board:get', { projectId }),
      onUpdate: (callback) => {
        updateListeners.add(callback);
        return () => updateListeners.delete(callback);
      },
    },
  };
}

module.exports = { createBoardApi };
