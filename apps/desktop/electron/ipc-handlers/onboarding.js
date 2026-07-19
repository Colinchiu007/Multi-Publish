// @ts-check
/**
 * Onboarding IPC handlers
 * 对接 preload 暴露的 onboarding:complete / onboarding:get-steps / onboarding:status 通道
 */
// eslint-disable-next-line no-unused-vars
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const onboarding = require('../services/onboarding')
  const { withSenderCheck } = require('./helpers')

  ipcMain.handle('onboarding:complete', withSenderCheck(async function () {
    try {
      const ok = onboarding.completeOnboarding()
      return { code: 0, data: { completed: ok } }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('onboarding:get-steps', async function () {
    try {
      return { code: 0, data: onboarding.getSteps() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('onboarding:status', async function () {
    try {
      return { code: 0, data: { done: onboarding.isOnboardingDone() } }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
}

module.exports = registerHandlers
