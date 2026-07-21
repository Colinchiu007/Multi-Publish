'use strict'

const { ERROR } = require('../core/error-codes')
const { isTrustedSender } = require('../core/ipc-security')

const PUBLIC_CHANNELS = new Set([
  'app:get-version', 'app:get-platform',
  'update:check', 'update:download', 'update:install',
  'first-run:check', 'show-notification',
  'onboarding:complete', 'onboarding:get-steps', 'onboarding:status',
  'license:info', 'license:activate', 'license:deactivate',
  'license:activate-trial', 'license:has-feature', 'license:features',
  'payment:create-order', 'payment:list-orders', 'payment:get-order', 'payment:cancel',
  'auth:open-login', 'auth:close', 'auth:login-silent',
  'auth:open-qrcode-login', 'auth:qrcode-close',
  'oauth:start', 'oauth:close', 'oauth:get-configs',
  'platform:list', 'platform:get', 'platform:definitions',
  'offline:status', 'offline:is-offline', 'offline:cached-tasks',
  'offline:add-to-cache', 'offline:clear-cache',
  'hotkeys:list',
  'sensitive:check', 'sensitive:replace',
  'sync:all', 'sync:platform', 'sync:cached',
  'webview:set-layout', 'webview:open-tab', 'webview:close-tab',
  'webview:close-all', 'webview:list-tabs',
  'model-provider:list', 'model-provider:get', 'model-provider:create',
  'model-provider:update', 'model-provider:delete', 'model-provider:set-default',
  'model-provider:get-default', 'model-provider:test', 'model-provider:presets',
  'model-provider:is-configured', 'model-provider:logs', 'model-provider:clean-logs',
  'render:status', 'render:install-deps',
  'pipeline:list', 'pipeline:get',
  'usage:stats', 'usage:daily', 'usage:track',
  'identity:get-state', 'identity:sign-in', 'identity:switch-account', 'identity:sign-out',
])

const ADMIN_ONLY_CHANNELS = new Set([
  'payment:complete', 'payment:simulate',
  'proxy:test', 'proxy:test-all', 'proxy:reset',
])

// 业务权益是服务端权威；本地 license 只在身份服务未启用的兼容模式生效。
// 本地 RPA 发布沿用现有 cloud_publish 产品权益名，避免客户端自行发明一套套餐。
const CHANNEL_FEATURE_MAP = Object.freeze({
  'publish:wechat': 'cloud_publish',
  'publish:batch': 'cloud_publish',
  'cloud-publisher:submit': 'cloud_publish',
  'cloud-publisher:list-tasks': 'cloud_publish',
  'cloud-publisher:get-task': 'cloud_publish',
})

const ONLINE_ONLY_FEATURE_CHANNELS = new Set([
  'cloud-publisher:submit',
  'cloud-publisher:list-tasks',
  'cloud-publisher:get-task',
])

function getAccessLevel(licenseManager, env = process.env, app, identityService) {
  if (identityService) {
    try {
      const status = identityService.getState().status
      return status === 'authenticated' || status === 'offline_authenticated'
        ? 'authenticated'
        : 'public'
    } catch (_) {
      return 'public'
    }
  }
  const isDevMode = env.NODE_ENV === 'development' || env.ELECTRON_IS_DEV === '1'
  if (isDevMode && app && app.isPackaged === false) return 'admin'
  try {
    if (licenseManager && typeof licenseManager.isPro === 'function' && licenseManager.isPro()) {
      return 'authenticated'
    }
  } catch (_) {
    // 许可证状态不可读时按最低权限处理。
  }
  return 'public'
}

function requiredLevelForChannel(channel) {
  if (ADMIN_ONLY_CHANNELS.has(channel)) return 'admin'
  if (PUBLIC_CHANNELS.has(channel)) return 'public'
  return 'authenticated'
}

function requiredFeatureForChannel(channel) {
  return CHANNEL_FEATURE_MAP[channel] || null
}

function hasAccess(currentLevel, requiredLevel) {
  if (requiredLevel === 'public') return true
  if (requiredLevel === 'authenticated') {
    return currentLevel === 'authenticated' || currentLevel === 'admin'
  }
  return currentLevel === 'admin'
}

function denied(channel) {
  return {
    code: ERROR.AUTH_ERROR,
    message: `当前许可证无权访问 ${channel}`,
  }
}

function entitlementDenied(channel) {
  return {
    code: ERROR.AUTH_ERROR,
    message: `当前账号没有所需权益，无法访问 ${channel}`,
  }
}

function untrustedSender() {
  return {
    code: ERROR.AUTH_ERROR,
    message: '未授权的调用来源',
  }
}

/**
 * 包装 ipcMain.handle。权限在 handler 执行时读取，而不是注册时缓存。
 */
function createAccessControlledIpcMain(ipcMain, licenseManager, env = process.env, app, identityService) {
  return new Proxy(ipcMain, {
    get(target, property, receiver) {
      if (property !== 'handle') {
        const value = Reflect.get(target, property, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      }

      const registerHandle = target.handle.bind(target)
      return function registerProtectedHandler(channel, handler) {
        const requiredLevel = requiredLevelForChannel(channel)
        return registerHandle(channel, async function dynamicallyAuthorizedHandler(...args) {
          const event = args[0]
          if (!isTrustedSender(event, app)) return untrustedSender()
          if (requiredLevel !== 'public') {
            const currentLevel = getAccessLevel(licenseManager, env, app, identityService)
            if (!hasAccess(currentLevel, requiredLevel)) return denied(channel)
          }
          const feature = requiredFeatureForChannel(channel)
          if (feature && identityService) {
            if (typeof identityService.requireEntitlement !== 'function') return entitlementDenied(channel)
            try {
              await identityService.requireEntitlement(feature, {
                onlineOnly: ONLINE_ONLY_FEATURE_CHANNELS.has(channel),
              })
            } catch (_) {
              return entitlementDenied(channel)
            }
          }
          return handler.apply(this, args)
        })
      }
    },
  })
}

module.exports = {
  ADMIN_ONLY_CHANNELS,
  PUBLIC_CHANNELS,
  CHANNEL_FEATURE_MAP,
  createAccessControlledIpcMain,
  getAccessLevel,
  hasAccess,
  requiredLevelForChannel,
  requiredFeatureForChannel,
}
