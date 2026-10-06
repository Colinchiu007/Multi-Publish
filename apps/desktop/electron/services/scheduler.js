// @ts-check
/**
 * 桌面端 Scheduler 兼容入口。
 * 业务逻辑位于 @multi-publish/shared-utils，当前文件只注入 Electron 运行环境。
 *
 * onDispatchFailed：定时任务到点但入队失败时的通知钩子。派发失败是用户必须知情的
 * 终态——状态虽落为 failed，但旧实现既无渲染层提示也进不了发布历史，用户无从得知
 * 「排的定时任务没发出去」。这里把钩子接到主窗口，定时失败时即时弹提示。
 */
const { app } = require('electron')
const logger = require('./logger')
const { createScheduler } = require('@multi-publish/shared-utils')

function getMainWindow () {
  const { BrowserWindow } = require('electron')
  const win = BrowserWindow.getAllWindows()[0]
  return win && !win.isDestroyed() ? win : null
}

module.exports = createScheduler({
  app,
  logger,
  onDispatchFailed: (failure) => {
    logger.error('Scheduler', `Scheduled task ${failure.id} failed at ${failure.stage}: ${failure.reason}`)
    try {
      const win = getMainWindow()
      if (win) win.webContents.send('scheduler:dispatch-failed', failure)
    } catch (error) {
      // 推送失败不得影响调度器主流程；失败详情仍会落发布历史与日志
      logger.warn('Scheduler', `Failed to broadcast dispatch failure: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
})
