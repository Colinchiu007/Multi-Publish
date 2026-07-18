/**
 * preload 聚合入口（Phase 3.3 + Bug-2 三级分离）
 *
 * 从 electron 拿到 ipcRenderer，分别构造三个子模块的 API，
 * 根据访问级别（public/authenticated/admin）动态鉴权后，
 * 通过 contextBridge.exposeInMainWorld 暴露给渲染进程。
 *
 * 三级分离设计：
 *   - public: 未登录可用（系统信息/登录入口/许可证激活/通知/onboarding）
 *   - authenticated: 登录后可用（业务 API：发布/流水线/账号/渲染等）
 *   - admin: 仅开发模式（敏感操作：paymentComplete/proxyTest 等）
 *
 * 访问级别在每次受限 API 调用时通过同步 IPC auth:get-access-level 获取，
 * fallback 到环境变量判断（development → admin，其他 → public）。
 */
const { contextBridge, ipcRenderer } = require('electron')
const { createPublishApi } = require('./publish')
const { createAccountApi } = require('./account')
const { createSystemApi } = require('./system')
const { createProjectApi } = require('./project')
const { createBoardApi } = require('./board')
const { createContactSheetApi } = require('./contact-sheet')
const { createApprovalGateApi } = require('./approval-gate')
const { createReplayApi } = require('./replay')
const {
  ADMIN_ONLY_METHODS,
  PUBLIC_METHODS,
  createDynamicAccessApi,
  filterApiByAccessLevel,
} = require('./access-control')

/**
 * 同步读取主进程的当前访问级别。该函数刻意不缓存：许可证可在窗口运行期间
 * 激活或注销，受限 API 必须立即使用最新状态。
 */
function getAccessLevel() {
  try {
    if (typeof ipcRenderer.sendSync === 'function') {
      const level = ipcRenderer.sendSync('auth:get-access-level')
      if (level === 'admin' || level === 'authenticated' || level === 'public') {
        return level
      }
    }
  } catch (_) { /* IPC 未注册时 fallback */ }
  const isDevMode = process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1'
  return isDevMode ? 'admin' : 'public'
}

const fullApi = {
  ...createPublishApi(ipcRenderer),
  ...createAccountApi(ipcRenderer),
  ...createSystemApi(ipcRenderer),
  ...createProjectApi(ipcRenderer),
  ...createBoardApi(ipcRenderer),
  ...createContactSheetApi(ipcRenderer),
  ...createApprovalGateApi(ipcRenderer),
  ...createReplayApi(ipcRenderer),
}

const exposedApi = createDynamicAccessApi(fullApi, getAccessLevel)

exposedApi.getAccessLevel = getAccessLevel

contextBridge.exposeInMainWorld('electronAPI', exposedApi)

module.exports = {
  getAccessLevel,
  filterApiByAccessLevel,
  createDynamicAccessApi,
  ADMIN_ONLY_METHODS,
  PUBLIC_METHODS,
}
