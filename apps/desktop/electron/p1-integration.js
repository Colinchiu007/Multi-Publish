// Onboarding and Publish Alert integration
const onboarding = require('./onboarding')

// ─── Onboarding IPC Handlers ─────────────
ipcMain.handle('onboarding:get-steps', () => {
  return onboarding.getSteps()
})

ipcMain.handle('onboarding:complete', () => {
  return onboarding.completeOnboarding()
})

ipcMain.handle('onboarding:status', () => {
  return { isDone: onboarding.isOnboardingDone() }
})

// ─── Publish Alert Integration ─────────────
taskQueue.on('task:success', (task) => {
  PublishAlert.triggerAlert('success', {
    platform: task.platform,
    message: `已成功发布到 ${task.platform}`,
    success: true,
  })
})

taskQueue.on('task:failed', (task) => {
  PublishAlert.triggerAlert('error', {
    platform: task.platform,
    message: `${task.platform} 发布失败`,
    success: false,
  })
})