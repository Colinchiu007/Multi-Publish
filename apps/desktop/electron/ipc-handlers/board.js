// @ts-check
/**
 * Backlot 实时看板 IPC handlers
 *
 * 通道：
 *   - board:subscribe   — 订阅项目看板更新
 *   - board:unsubscribe — 取消订阅
 *   - board:get         — 获取当前看板状态快照
 */

function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR;
  const { wrapIpcHandlerRaw } = require('./helpers');
  const { boardService, log } = deps;

  // board:subscribe — 订阅项目看板更新
  ipcMain.handle(
    'board:subscribe',
    wrapIpcHandlerRaw(async (event, args) => {
      if (!args || !args.projectId) {
        return { code: EC.VALIDATION_ERROR, message: '缺少 projectId 参数' };
      }
      if (!boardService) {
        return { code: EC.REQUEST_ERROR, message: 'BoardService 不可用' };
      }
      const result = boardService.subscribe(event.sender, args.projectId);
      return { code: 0, data: result };
    }, { label: 'board:subscribe' })
  );

  // board:unsubscribe — 取消订阅
  ipcMain.handle(
    'board:unsubscribe',
    wrapIpcHandlerRaw(async (event) => {
      if (!boardService) {
        return { code: 0, data: { unsubscribed: true } };
      }
      const result = boardService.unsubscribe(event.sender);
      return { code: 0, data: result };
    }, { label: 'board:unsubscribe' })
  );

  // board:get — 获取当前看板状态
  ipcMain.handle(
    'board:get',
    wrapIpcHandlerRaw(async (_event, args) => {
      if (!args || !args.projectId) {
        return { code: EC.VALIDATION_ERROR, message: '缺少 projectId 参数' };
      }
      if (!boardService) {
        return { code: EC.REQUEST_ERROR, message: 'BoardService 不可用' };
      }
      const board = boardService.buildBoardState(args.projectId);
      if (!board) {
        return { code: EC.NOT_FOUND, message: 'Project not found: ' + args.projectId };
      }
      return { code: 0, data: board };
    }, { label: 'board:get' })
  );
}

module.exports = registerHandlers;
