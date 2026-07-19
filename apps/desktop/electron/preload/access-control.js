'use strict'

const AUTH_ERROR = -3

// 仅开发模式允许暴露的敏感方法。
const ADMIN_ONLY_METHODS = [
  'paymentComplete', 'paymentSimulate',
  'proxyTest', 'proxyTestAll', 'proxyReset',
]

// 未激活专业许可证时仍可使用的方法。
const PUBLIC_METHODS = [
  'getVersion', 'getPlatform',
  'updateCheck', 'updateDownload', 'updateInstall', 'onUpdateStatus',
  'firstRunCheck', 'onFirstRunStatus',
  'showNotification', 'onNotification',
  'onNavigate',
  'onboardingComplete', 'onboardingGetSteps', 'onboardingStatus',
  'licenseInfo', 'licenseActivate', 'licenseDeactivate', 'licenseActivateTrial',
  'licenseHasFeature', 'licenseFeatures',
  'paymentCreateOrder', 'paymentListOrders', 'paymentGetOrder', 'paymentCancel',
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
  'modelProviderList', 'modelProviderGet', 'modelProviderCreate', 'modelProviderUpdate',
  'modelProviderDelete', 'modelProviderSetDefault', 'modelProviderGetDefault',
  'modelProviderTest', 'modelProviderPresets', 'modelProviderIsConfigured',
  'modelProviderLogs', 'modelProviderCleanLogs',
  'renderGetStatus', 'renderInstallDeps', 'onRenderInstallProgress',
  'pipelineList', 'pipelineGet',
]

function hasAccess(currentLevel, requiredLevel) {
  if (requiredLevel === 'public') return true
  if (requiredLevel === 'authenticated') {
    return currentLevel === 'authenticated' || currentLevel === 'admin'
  }
  return currentLevel === 'admin'
}

function requiredLevelForMethod(methodName, inheritedLevel = 'public') {
  if (inheritedLevel !== 'public') return inheritedLevel
  if (ADMIN_ONLY_METHODS.includes(methodName)) return 'admin'
  if (PUBLIC_METHODS.includes(methodName)) return 'public'
  return 'authenticated'
}

function createPermissionError(methodName) {
  const error = new Error(`许可证权限不足，无法调用 ${methodName}`)
  error.name = 'LicensePermissionError'
  error.code = AUTH_ERROR
  return error
}

function readAccessLevel(getCurrentAccessLevel) {
  try {
    const level = getCurrentAccessLevel()
    if (level === 'public' || level === 'authenticated' || level === 'admin') return level
  } catch (_) {
    // 同步权限 IPC 不可用时按最低权限处理。
  }
  return 'public'
}

/**
 * 创建稳定的 renderer API 表面。受限函数每次调用时重新读取主进程权限，
 * 因此许可证升级或降级都不需要重载窗口。
 */
function createDynamicAccessApi(api, getCurrentAccessLevel, inheritedLevel = 'public') {
  const exposed = {}
  const initialLevel = readAccessLevel(getCurrentAccessLevel)

  for (const key of Object.keys(api)) {
    const value = api[key]
    const requiredLevel = requiredLevelForMethod(key, inheritedLevel)

    // admin 能力不会在生产 renderer 中出现，避免扩大敏感 API 暴露面。
    if (requiredLevel === 'admin' && initialLevel !== 'admin') continue

    if (typeof value === 'function') {
      if (requiredLevel === 'public') {
        exposed[key] = value
        continue
      }
      exposed[key] = function (...args) {
        if (!hasAccess(readAccessLevel(getCurrentAccessLevel), requiredLevel)) {
          throw createPermissionError(key)
        }
        return value.apply(this, args)
      }
    } else if (value && typeof value === 'object') {
      exposed[key] = createDynamicAccessApi(value, getCurrentAccessLevel, requiredLevel)
    }
  }

  return exposed
}

function filterApiByAccessLevel(api, level) {
  const filtered = {}
  for (const key of Object.keys(api)) {
    const value = api[key]
    const requiredLevel = requiredLevelForMethod(key)
    if (!hasAccess(level, requiredLevel)) continue
    if (typeof value === 'function') filtered[key] = value
    else if (value && typeof value === 'object') filtered[key] = value
  }
  return filtered
}

module.exports = {
  ADMIN_ONLY_METHODS,
  PUBLIC_METHODS,
  createDynamicAccessApi,
  filterApiByAccessLevel,
  hasAccess,
}
