// @ts-check
/**
 * Phase 4: 事件总线接线
 *
 * 从 bootstrap.js 拆出：taskQueue 事件监听
 * - task:success → 发布成功通知 + 历史记录 + 发布监控 + 影响力追踪 + 回采登记
 * - task:failed → 发布失败通知（风控命中 → 同步登记挂起，§5 enforcement）
 * - publish:blocked → 发布间隔限制通知
 * - task:retry → 重试通知
 *
 * 验收标准 BUGFIX-PLAN Bug-1: phase 文件 ≤ 80 行
 */
const log = require('../services/logger')
const { isRiskBlocked } = require('../services/publish-risk')
const { isRiskSuspendedMessage } = require('../services/risk-suspender-store')
const { createPublishProgressEmitter } = require('../services/publish-progress-events')
const { safeHttpUrl } = require('@multi-publish/shared-utils/src/safe-http-url')

/**
 * 接线 taskQueue 事件监听
 * @param {object} deps
 * @param {object} deps.taskQueue
 * @param {object} deps.history
 * @param {object} deps.publishMonitor
 * @param {object} deps.publishImpactTracker
 * @param {object} [deps.store] - 效果闭环：tracked_content 登记（可选）
 * @param {Function} deps.getMainWin
 * @param {object} [deps.riskSuspender] - 风控挂起守卫（desktop-risk-suspender，可选）
 * @param {object} [deps.progressEmitter] - 进度事件发射器（可选，缺省自建；publish-progress-ux）
 */
function wireTaskQueueEvents({ taskQueue, history, publishMonitor, publishImpactTracker, getMainWin, store, riskSuspender, progressEmitter }) {
  // publish-progress-ux：四事件统一走富化 emitter（phase/stageKey/percent/batchId/timestamp），
  // 既有字段（platform/taskId/stage/result/error/remainingWait）原样保留，向后兼容加法。
  const emitter = progressEmitter || createPublishProgressEmitter({ getMainWin })
  taskQueue.on('task:success', (task) => {
    emitter.emit(task.id, task.platform, 'success', {
      stage: '✓ 发布成功', percent: 100, result: task.result, batchId: task.batchId || null,
    })
    const ownerSubject = task.owner_subject
    history.addRecord({
      platform: task.platform, title: task.article?.title || '', taskId: task.id,
      status: 'success', result: task.result,
      // 定时派发任务带 publishMode='scheduled'（scheduler/batch-manager 排期入队时标记），
      // 历史页「定时发布」过滤器与详情「发布模式」据此区分定时/立即发布。
      ...(task.publishMode ? { publishMode: task.publishMode } : {}),
    }, ownerSubject)
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
            }, ownerSubject)
          },
        })
      }
    } catch (e) { log.warn('PublishMonitor', 'Failed to start monitor: ' + e.message) }
    try {
      const title = task.article?.title
      const content = task.article?.content || title
      if (title && content) {
        // 2026-09-28 活体残余②修复：真实类方法是 scheduleImpactTracking
        // （publish-impact-tracker.js），旧调用 addTracking 不存在——
        // TypeError 被下方 catch 吞成 warn（产线日志「addTracking is not a function」）。
        publishImpactTracker.scheduleImpactTracking({
          articleId: task.id, title, keywords: task.article?.keywords || [title],
          platform: task.platform,
        })
        log.info('ImpactTracker', 'Started tracking "' + title + '"')
      }
    } catch (e) { log.warn('ImpactTracker', 'Failed to start impact tracking: ' + e.message) }

    // P2 效果闭环：发布成功登记 tracked_content（有 postId 或内容 URL → pending 排期回采；都没有 → untrackable 仅手动）
    try {
      if (store && typeof store.addTrackedContent === 'function') {
        const result = task.result || {}
        const postId = result.postId || result.publishId || ''
        const url = safeHttpUrl(result.url) || ''
        const hasAnchor = Boolean(postId || url)
        store.addTrackedContent({
          platform: task.platform,
          postId: String(postId || ''),
          url,
          rewriteHistoryId: task.rewriteHistoryId || task.article?.rewriteHistoryId || null,
          recrawlStatus: hasAnchor ? 'pending' : 'untrackable',
          nextRecrawlAt: hasAnchor ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null, // T+1h 首采
          ownerSubject,
        })
      }
    } catch (e) { log.warn('PerformanceLoop', 'Failed to register tracked content: ' + e.message) }
  })

  taskQueue.on('task:failed', (task) => {
    emitter.emit(task.id, task.platform, 'failed', {
      stage: '✗ 发布失败: ' + task.error, percent: 100, error: task.error, batchId: task.batchId || null,
    })
    // publish-progress-ux（G8 修复）：失败必须落发布历史——此前 task:failed 只发事件不落库，
    // 失败结果在任何页面都查不到（历史页 failed 过滤器实际只匹配监控回调写入的记录）。
    // addRecord 内建 try/catch，写入失败不阻塞发布主流程。
    history.addRecord({
      platform: task.platform, title: task.article?.title || '', taskId: task.id,
      status: 'failed', result: null, error: task.error,
      ...(task.publishMode ? { publishMode: task.publishMode } : {}),
    }, task.owner_subject)
    const win = getMainWin()
    if (win && !win.isDestroyed()) {
      if (isRiskBlocked(task.error) && !isRiskSuspendedMessage(task.error)) {
        const accountId = (task.article && task.article.accountId) || null
        // §5 enforcement：风控命中 → 平台/账号即时挂起（resume 仅显式），并广播全量挂起清单供前端刷新
        if (riskSuspender) {
          try {
            riskSuspender.suspend(task.platform, accountId, { reason: 'risk_blocked', error: task.error })
            win.webContents.send('publish:risk-suspended', { suspended: riskSuspender.listSuspended() })
          } catch (e) { log.warn('RiskSuspender', 'suspend failed: ' + e.message) }
        }
        win.webContents.send('publish:risk-hold', {
          platform: task.platform, accountId, taskId: task.id, error: task.error,
        })
      }
    }
  })

  taskQueue.on('publish:blocked', ({ task, remainingWait }) => {
    emitter.emit(task.id, task.platform, 'blocked', {
      stage: '⏳ 发布间隔限制，等待 ' + Math.ceil(remainingWait / 60000) + ' 分钟后重试',
      remainingWait, batchId: task.batchId || null,
    })
  })

  taskQueue.on('task:retry', (task) => {
    emitter.emit(task.id, task.platform, 'retry', {
      stage: '⟳ 重试中... (剩余 ' + task.retriesLeft + ' 次)',
      retriesLeft: task.retriesLeft, batchId: task.batchId || null,
    })
  })
}

module.exports = { wireTaskQueueEvents }
