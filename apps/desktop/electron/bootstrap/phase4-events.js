// @ts-check
/**
 * Phase 4: 事件总线接线
 *
 * 从 bootstrap.js 拆出：taskQueue 事件监听
 * - task:success → 发布成功通知 + 历史记录 + 发布监控 + 影响力追踪
 * - task:failed → 发布失败通知
 * - publish:blocked → 发布间隔限制通知
 * - task:retry → 重试通知
 *
 * 验收标准 BUGFIX-PLAN Bug-1: phase 文件 ≤ 80 行
 */
const log = require('../services/logger')

/**
 * 接线 taskQueue 事件监听
 * @param {object} deps
 * @param {object} deps.taskQueue
 * @param {object} deps.history
 * @param {object} deps.publishMonitor
 * @param {object} deps.publishImpactTracker
 * @param {Function} deps.getMainWin
 */
function wireTaskQueueEvents({ taskQueue, history, publishMonitor, publishImpactTracker, getMainWin }) {
  taskQueue.on('task:success', (task) => {
    const win = getMainWin()
    if (win && !win.isDestroyed()) {
      win.webContents.send('publish:progress', {
        platform: task.platform, stage: '✓ 发布成功', taskId: task.id, result: task.result,
      })
    }
    history.addRecord({
      platform: task.platform, title: task.article?.title || '', taskId: task.id,
      status: 'success', result: task.result,
    })
    try {
      const postId = task.result?.postId || task.result?.id
      if (postId) {
        publishMonitor.createMonitorTask({
          postId, platform: task.platform, cookies: task.article?.cookies || '',
          callback: (monitorResult) => {
            log.info('PublishMonitor', 'Monitor result for ' + task.platform + ':' + postId + ': ' + monitorResult.status)
            history.addRecord({
              platform: task.platform, title: task.article?.title || '',
              taskId: task.id, status: monitorResult.status, result: monitorResult,
            })
          },
        })
      }
    } catch (e) { log.warn('PublishMonitor', 'Failed to start monitor: ' + e.message) }
    try {
      const title = task.article?.title
      const content = task.article?.content || title
      if (title && content) {
        publishImpactTracker.addTracking({
          articleId: task.id, title, keywords: task.article?.keywords || [title],
        })
        log.info('ImpactTracker', 'Started tracking "' + title + '"')
      }
    } catch (e) { log.warn('ImpactTracker', 'Failed to start impact tracking: ' + e.message) }
  })

  taskQueue.on('task:failed', (task) => {
    const win = getMainWin()
    if (win && !win.isDestroyed()) {
      win.webContents.send('publish:progress', {
        platform: task.platform, stage: '✗ 发布失败: ' + task.error, taskId: task.id, error: task.error,
      })
    }
  })

  taskQueue.on('publish:blocked', ({ task, remainingWait }) => {
    const win = getMainWin()
    if (win && !win.isDestroyed()) {
      const minutes = Math.ceil(remainingWait / 60000)
      win.webContents.send('publish:progress', {
        platform: task.platform, stage: '⏳ 发布间隔限制，等待 ' + minutes + ' 分钟后重试',
        taskId: task.id, remainingWait,
      })
    }
  })

  taskQueue.on('task:retry', (task) => {
    const win = getMainWin()
    if (win && !win.isDestroyed()) {
      win.webContents.send('publish:progress', {
        platform: task.platform, stage: '⟳ 重试中... (剩余 ' + task.retriesLeft + ' 次)', taskId: task.id,
      })
    }
  })
}

module.exports = { wireTaskQueueEvents }
