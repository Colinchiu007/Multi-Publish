// @ts-check
/**
 * Backlot Replay 生产回放 IPC handlers
 *
 * 通道：
 *   - replay:get — 获取项目的回放数据（事件列表 + 总耗时）
 */

function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR;
  const { wrapIpcHandlerRaw } = require('./helpers');
  const { executionRecorder } = deps;

  // replay:get — 获取项目回放数据
  ipcMain.handle(
    'replay:get',
    wrapIpcHandlerRaw(async (_event, args) => {
      if (!args || !args.projectId) {
        return { code: EC.VALIDATION_ERROR, message: '缺少 projectId 参数' };
      }
      if (!executionRecorder) {
        return { code: EC.REQUEST_ERROR, message: 'ExecutionRecorder 不可用' };
      }
      const replay = executionRecorder.getReplay(args.projectId);
      return { code: 0, data: replay };
    }, { label: 'replay:get' })
  );
}

module.exports = registerHandlers;
