// @ts-check
/**
 * Backlot Approval Gate 审批门 IPC handlers
 *
 * 通道：
 *   - approval-gate:get     — 获取项目当前待处理的审批门
 *   - approval-gate:approve — 处理审批决策（approve/modify）
 */

function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR;
  const { wrapIpcHandlerRaw, withSenderCheck } = require('./helpers');
  const { approvalGateService } = deps;

  // approval-gate:get — 获取当前审批门
  ipcMain.handle(
    'approval-gate:get',
    wrapIpcHandlerRaw(async (_event, args) => {
      if (!args || !args.projectId) {
        return { code: EC.VALIDATION_ERROR, message: '缺少 projectId 参数' };
      }
      if (!approvalGateService) {
        return { code: EC.REQUEST_ERROR, message: 'ApprovalGateService 不可用' };
      }
      const gate = approvalGateService.getCurrentGate(args.projectId);
      return { code: 0, data: gate };
    }, { label: 'approval-gate:get' })
  );

  // approval-gate:approve — 处理审批决策
  ipcMain.handle(
    'approval-gate:approve',
    withSenderCheck(wrapIpcHandlerRaw(async (_event, args) => {
      if (!args || !args.gateId) {
        return { code: EC.VALIDATION_ERROR, message: '缺少 gateId 参数' };
      }
      if (!approvalGateService) {
        return { code: EC.REQUEST_ERROR, message: 'ApprovalGateService 不可用' };
      }
      const decision = args.decision || 'approve';
      const result = approvalGateService.approveGate(args.gateId, decision, args.modification);
      if (!result.resolved) {
        return { code: EC.REQUEST_ERROR, message: 'Failed to resolve gate: ' + args.gateId };
      }
      return { code: 0, data: result };
    }, { label: 'approval-gate:approve' }))
  );
}

module.exports = registerHandlers;
