const { withSenderCheck, EC } = require('./helpers')

function safeError(error) {
  return error && typeof error.code === 'string' ? error.code : 'IDENTITY_OPERATION_FAILED'
}

function registerIdentityHandlers(ipcMain, deps = {}) {
  const authService = deps.authService
  ipcMain.handle('identity:get-state', withSenderCheck(async () => {
    if (!authService) return { code: 0, data: { status: 'disabled', user: null, error: null } }
    try {
      return { code: 0, data: authService.getState() }
    } catch (error) {
      return { code: EC.AUTH_ERROR, message: safeError(error) }
    }
  }))
  ipcMain.handle('identity:sign-in', withSenderCheck(async () => {
    if (!authService) return { code: EC.AUTH_ERROR, message: 'IDENTITY_NOT_CONFIGURED' }
    try {
      return { code: 0, data: await authService.signIn() }
    } catch (error) {
      return { code: EC.AUTH_ERROR, message: safeError(error) }
    }
  }))
  ipcMain.handle('identity:switch-account', withSenderCheck(async () => {
    if (!authService) return { code: EC.AUTH_ERROR, message: 'IDENTITY_NOT_CONFIGURED' }
    try {
      return { code: 0, data: await authService.switchAccount() }
    } catch (error) {
      return { code: EC.AUTH_ERROR, message: safeError(error) }
    }
  }))
  // --- B1/B2 会员侧通道（不进 PUBLIC_CHANNELS，登录态由 license-access-control 默认门禁保证） ---
  const memberApiService = authService && authService.memberApiService
  const memberApiHandler = (apiPath) => withSenderCheck(async () => {
    if (!authService || !memberApiService || typeof memberApiService.request !== 'function') {
      return { code: EC.AUTH_ERROR, message: 'IDENTITY_NOT_CONFIGURED' }
    }
    try {
      const state = typeof authService.getState === 'function' ? authService.getState() : null
      const subject = state && state.user ? state.user.sub : null
      return { code: 0, data: await memberApiService.request({ subject, path: apiPath }) }
    } catch (error) {
      return { code: EC.AUTH_ERROR, message: safeError(error) }
    }
  })
  // 通道名必须以字面量出现在 ipcMain.handle( 中：tests/ipc-contract.test.js 按字面量静态扫描 preload↔handler 合同，循环变量注册不可见。
  ipcMain.handle('identity:sessions', memberApiHandler('/api/v1/me/sessions'))
  ipcMain.handle('identity:sessions-revoke-others', memberApiHandler('/api/v1/me/sessions/revoke-others'))
  ipcMain.handle('identity:notifications', memberApiHandler('/api/v1/me/notifications'))
  ipcMain.handle('identity:notifications-mark-read', memberApiHandler('/api/v1/me/notifications/read'))

  ipcMain.handle('identity:sign-out', withSenderCheck(async () => {
    if (!authService) return { code: 0, data: { status: 'signed_out', user: null } }
    try {
      return { code: 0, data: await authService.signOut() }
    } catch (error) {
      return { code: EC.AUTH_ERROR, message: safeError(error) }
    }
  }))

  // 诊断报告：供用户在登录/连接失败时一键复制。
  // 报告在主进程组装并脱敏（auth-diagnostics.buildDiagnosticReport），
  // 渲染进程拿不到原始 error 对象，也拿不到未脱敏的 cause 链。
  ipcMain.handle('identity:diagnostic-report', withSenderCheck(async () => {
    if (!authService) return { code: 0, data: { text: '', fields: [] } }
    const { buildDiagnosticReport } = require('../services/identity/auth-diagnostics')
    const state = typeof authService.getState === 'function' ? authService.getState() : null
    // 优先用原始 error（含 cause 链，TLS 特征码只存在于链上），
    // 回落到 state.error（无原始错误时的兜底）。
    const lastError = typeof authService.getLastError === 'function' ? authService.getLastError() : null
    return {
      code: 0,
      data: buildDiagnosticReport({
        error: lastError || (state && state.error ? state.error : null),
        status: state && state.status ? state.status : '',
        env: {
          appVersion: deps.appVersion || process.env.npm_package_version || '',
          platform: process.platform,
          arch: process.arch,
          ...(deps.env || {}),
        },
      }),
    }
  }))
}

module.exports = registerIdentityHandlers
