// @ts-check
/**
 * IPC handlers 注册中心
 * 将所有 ipcMain.handle 调用从 main.js 拆分到独立模块
 */
function registerAllHandlers(ipcMain, deps) {
  require('./identity')(ipcMain, { authService: deps.identityService })
  require('./store')(ipcMain, deps)
  require('./proxy')(ipcMain, deps)
  require('./account')(ipcMain, deps)
  require('./keyword')(ipcMain, deps)
  require('./publish')(ipcMain, deps)
  require('./analytics')(ipcMain, deps)
  require('./sync')(ipcMain, deps)
  require('./update')(ipcMain, deps)
  require('./upload')(ipcMain, deps)
  require('./scheduler')(ipcMain, deps)
  require('./sensitive')(ipcMain, deps)
  require('./render')(ipcMain, deps)
  require('./platform')(ipcMain, deps)
  require('./templates')(ipcMain, deps)
  require('./license')(ipcMain, deps)
  require('./ai')(ipcMain, deps)
  require('./offline')(ipcMain, deps)
  require('./payment')(ipcMain, deps)
  require('./pipeline')(ipcMain, deps)
  require('./video')(ipcMain, deps)
  require('./misc')(ipcMain, deps)
  require('./onboarding')(ipcMain, deps)
  require('./model-provider')(ipcMain, deps)
  // Backlot 项目库
  require('./project')(ipcMain, deps)
  // Backlot 实时看板
  require('./board')(ipcMain, deps)
  // Backlot Contact Sheet 审批
  require('./contact-sheet')(ipcMain, deps)
  // Backlot Approval Gate 审批门
  require('./approval-gate')(ipcMain, deps)
  // Backlot Replay 生产回放
  require('./replay')(ipcMain, deps)
}

module.exports = registerAllHandlers
