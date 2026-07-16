/**
 * Backlot Approval Gate 审批门 preload API
 *
 * 工厂函数：createApprovalGateApi(ipcRenderer)
 *
 * 暴露到 window.electronAPI.approvalGate（嵌套对象）：
 *   - approvalGate.get(projectId) → ApprovalGate | null
 *   - approvalGate.approve(gateId, decision, modification?) → { resolved, gate }
 *   - approvalGate.onApprovalRequest(callback) → 取消订阅函数
 *     （监听 type='approval_gate' 的 approval:request 推送）
 */

/**
 * 创建 ApprovalGate API 对象
 * @param {Electron.IpcRenderer} ipcRenderer
 * @returns {{ approvalGate: object }}
 */
function createApprovalGateApi(ipcRenderer) {
  // IPC push 监听器集合（approval:request 中 type='approval_gate'）
  const gateListeners = new Set();

  // 监听 approval:request 推送，过滤 type='approval_gate'
  ipcRenderer.on('approval:request', (_event, payload) => {
    if (payload && payload.type === 'approval_gate') {
      for (const cb of gateListeners) {
        try { cb(payload); } catch (_) { /* 单个 listener 失败不影响其他 */ }
      }
    }
  });

  return {
    approvalGate: {
      get: (projectId) => ipcRenderer.invoke('approval-gate:get', { projectId }),
      approve: (gateId, decision, modification) =>
        ipcRenderer.invoke('approval-gate:approve', { gateId, decision, modification }),
      onApprovalRequest: (callback) => {
        gateListeners.add(callback);
        return () => gateListeners.delete(callback);
      },
    },
  };
}

module.exports = { createApprovalGateApi };
