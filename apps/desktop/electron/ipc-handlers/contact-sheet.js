// @ts-check
/**
 * Backlot Contact Sheet 审批 IPC handlers
 *
 * 通道：
 *   - contact-sheet:list    — 获取项目的所有场景审批数据
 *   - contact-sheet:approve — 批准场景的某个 take
 *   - contact-sheet:reject  — 驳回场景并触发重新生成
 */

function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR;
  const { wrapIpcHandlerRaw, withSenderCheck } = require('./helpers');
  const { contactSheetService } = deps;

  // contact-sheet:list — 获取项目的所有场景
  ipcMain.handle(
    'contact-sheet:list',
    wrapIpcHandlerRaw(async (_event, args) => {
      if (!args || !args.projectId) {
        return { code: EC.VALIDATION_ERROR, message: '缺少 projectId 参数' };
      }
      if (!contactSheetService) {
        return { code: EC.REQUEST_ERROR, message: 'ContactSheetService 不可用' };
      }
      const scenes = contactSheetService.getContactSheet(args.projectId);
      return { code: 0, data: scenes };
    }, { label: 'contact-sheet:list' })
  );

  // contact-sheet:approve — 批准场景
  ipcMain.handle(
    'contact-sheet:approve',
    withSenderCheck(wrapIpcHandlerRaw(async (_event, args) => {
      if (!args || !args.sceneId) {
        return { code: EC.VALIDATION_ERROR, message: '缺少 sceneId 参数' };
      }
      if (!contactSheetService) {
        return { code: EC.REQUEST_ERROR, message: 'ContactSheetService 不可用' };
      }
      const result = contactSheetService.approveScene(args.sceneId, args.selectedTakeId);
      if (!result.approved) {
        return { code: EC.NOT_FOUND, message: 'Scene not found: ' + args.sceneId };
      }
      return { code: 0, data: result };
    }, { label: 'contact-sheet:approve' }))
  );

  // contact-sheet:reject — 驳回场景
  ipcMain.handle(
    'contact-sheet:reject',
    withSenderCheck(wrapIpcHandlerRaw(async (_event, args) => {
      if (!args || !args.sceneId) {
        return { code: EC.VALIDATION_ERROR, message: '缺少 sceneId 参数' };
      }
      if (!contactSheetService) {
        return { code: EC.REQUEST_ERROR, message: 'ContactSheetService 不可用' };
      }
      const result = contactSheetService.rejectScene(args.sceneId, args.feedback);
      if (!result.rejected) {
        return { code: EC.NOT_FOUND, message: 'Scene not found: ' + args.sceneId };
      }
      return { code: 0, data: result };
    }, { label: 'contact-sheet:reject' }))
  );
}

module.exports = registerHandlers;
