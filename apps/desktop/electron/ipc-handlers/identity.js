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
  ipcMain.handle('identity:sign-out', withSenderCheck(async () => {
    if (!authService) return { code: 0, data: { status: 'signed_out', user: null } }
    try {
      return { code: 0, data: await authService.signOut() }
    } catch (error) {
      return { code: EC.AUTH_ERROR, message: safeError(error) }
    }
  }))
}

module.exports = registerIdentityHandlers
