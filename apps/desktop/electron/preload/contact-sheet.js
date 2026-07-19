/**
 * Backlot Contact Sheet 审批 preload API
 *
 * 工厂函数：createContactSheetApi(ipcRenderer)
 *
 * 暴露到 window.electronAPI.contactSheet（嵌套对象）：
 *   - contactSheet.list(projectId) → Scene[]
 *   - contactSheet.approve(sceneId, selectedTakeId?) → { approved, scene, allApproved }
 *   - contactSheet.reject(sceneId, feedback?) → { rejected, requeued, scene }
 *   - contactSheet.onApprovalRequest(callback) → 取消订阅函数
 */

/**
 * 创建 ContactSheet API 对象
 * @param {Electron.IpcRenderer} ipcRenderer
 * @returns {{ contactSheet: object }}
 */
function createContactSheetApi(ipcRenderer) {
  // IPC push 监听器集合（approval:request）
  const approvalListeners = new Set();

  // 监听 approval:request 推送
  ipcRenderer.on('approval:request', (_event, payload) => {
    if (payload && payload.type === 'contact_sheet') {
      for (const cb of approvalListeners) {
        try { cb(payload); } catch (_) { void _ /* 单个 listener 失败不影响其他 */ }
      }
    }
  });

  return {
    contactSheet: {
      list: (projectId) => ipcRenderer.invoke('contact-sheet:list', { projectId }),
      approve: (sceneId, selectedTakeId) =>
        ipcRenderer.invoke('contact-sheet:approve', { sceneId, selectedTakeId }),
      reject: (sceneId, feedback) =>
        ipcRenderer.invoke('contact-sheet:reject', { sceneId, feedback }),
      onApprovalRequest: (callback) => {
        approvalListeners.add(callback);
        return () => approvalListeners.delete(callback);
      },
    },
  };
}

module.exports = { createContactSheetApi };
