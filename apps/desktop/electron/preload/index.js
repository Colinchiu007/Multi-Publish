/**
 * preload 聚合入口（Phase 3.3 + Bug-2 三级分离）
 *
 * 从 electron 拿到 ipcRenderer，分别构造三个子模块的 API，
 * 根据访问级别（public/authenticated/admin）过滤后，
 * 通过 contextBridge.exposeInMainWorld 暴露给渲染进程。
 *
 * 三级分离设计：
 *   - public: 未登录可用（系统信息/登录入口/许可证激活/通知/onboarding）
 *   - authenticated: 登录后可用（业务 API：发布/流水线/账号/渲染等）
 *   - admin: 仅开发模式（敏感操作：paymentComplete/proxyTest 等）
 *
 * 访问级别通过同步 IPC auth:get-access-level 从主进程获取，
 * fallback 到环境变量判断（development → admin，其他 → public）。
 */
const { contextBridge, ipcRenderer } = require('electron')
const { createPublishApi } = require('./publish')
const { createAccountApi } = require('./account')
const { createSystemApi } = require('./system')

// ─── admin-only 方法清单（仅开发模式可用） ───
const ADMIN_ONLY_METHODS = [
  'paymentComplete', 'paymentSimulate', 'paymentCancel',
  'proxyTest', 'proxyTestAll', 'proxyReset',
]

// ─── public 方法清单（未登录也可用） ───
const PUBLIC_METHODS = [
  'getVersion', 'getPlatform',
  'updateCheck', 'updateDownload', 'updateInstall', 'onUpdateStatus',
  'firstRunCheck', 'onFirstRunStatus',
  'showNotification', 'onNotification',
  'onNavigate',
  'onboardingComplete', 'onboardingGetSteps', 'onboardingStatus',
  'licenseInfo', 'licenseActivate', 'licenseDeactivate', 'licenseActivateTrial',
  'licenseHasFeature', 'licenseFeatures',
  'authOpenLogin', 'authClose', 'onAuthViewOpened', 'onAuthCompleted', 'onAuthViewClosed',
  'authLoginSilent',
  'authOpenQrCodeLogin', 'authQrCodeClose',
  'onQrCodeOpened', 'onQrCodeDetected', 'onQrCodeCompleted', 'onQrCodeClosed',
  'oauthStart', 'oauthClose', 'oauthGetConfigs',
  'onOAuthOpened', 'onOAuthCompleted', 'onOAuthFailed', 'onOAuthClosed',
  'platformList', 'platformGet', 'getPlatformDefinitions',
  'offlineStatus', 'offlineIsOffline', 'offlineCachedTasks', 'offlineAddToCache',
  'offlineClearCache', 'onOfflineRestored',
  'onCallbackReceived',
  'hotkeysList',
  'sensitiveCheck', 'sensitiveReplace',
  'syncAll', 'syncPlatform', 'syncCached',
  'webviewSetLayout', 'webviewOpenTab', 'webviewCloseTab', 'webviewCloseAll', 'webviewListTabs',
  'onWebviewLayoutChanged', 'onWebviewTabOpened', 'onWebviewTabClosed', 'onWebviewNav', 'onWebviewAllClosed',
  // 模型服务商管理（应用级配置，与登录状态无关，需在设置中随时配置）
  'modelProviderList', 'modelProviderGet', 'modelProviderCreate', 'modelProviderUpdate',
  'modelProviderDelete', 'modelProviderSetDefault', 'modelProviderGetDefault',
  'modelProviderTest', 'modelProviderPresets', 'modelProviderIsConfigured',
  'modelProviderLogs', 'modelProviderCleanLogs',
  // 渲染引擎诊断（只读状态查询 + 依赖安装，未登录也应可用，便于诊断 remotion 状态）
  // 注意：renderStart/renderCancel/renderListCompositions 仍保持 authenticated（需登录后才能发起渲染）
  'renderGetStatus', 'renderInstallDeps', 'onRenderInstallProgress',
  // 流水线查询（只读，未登录也应能浏览流水线列表）
  'pipelineList', 'pipelineGet',
]

/**
 * 获取当前访问级别
 * @returns {'public'|'authenticated'|'admin'}
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

/**
 * 根据访问级别过滤 API
 * @param {object} api - 完整 API 对象
 * @param {'public'|'authenticated'|'admin'} level - 访问级别
 * @returns {object} 过滤后的 API
 */
function filterApiByAccessLevel(api, level) {
  const filtered = {}
  for (const key of Object.keys(api)) {
    const value = api[key]
    if (typeof value === 'function') {
      if (level === 'admin') {
        filtered[key] = value
      } else if (level === 'authenticated') {
        if (!ADMIN_ONLY_METHODS.includes(key)) {
          filtered[key] = value
        }
      } else {
        if (PUBLIC_METHODS.includes(key)) {
          filtered[key] = value
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      if (level === 'admin' || level === 'authenticated') {
        filtered[key] = value
      }
    }
  }
  return filtered
}

const fullApi = {
  ...createPublishApi(ipcRenderer),
  ...createAccountApi(ipcRenderer),
  ...createSystemApi(ipcRenderer),
}

const accessLevel = getAccessLevel()
const exposedApi = filterApiByAccessLevel(fullApi, accessLevel)

exposedApi.getAccessLevel = () => accessLevel

contextBridge.exposeInMainWorld('electronAPI', exposedApi)

module.exports = { getAccessLevel, filterApiByAccessLevel, ADMIN_ONLY_METHODS, PUBLIC_METHODS }