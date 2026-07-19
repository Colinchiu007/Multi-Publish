// @ts-check
/**
 * BatchManager — 批量发布管理器
 *
 * 增强批量发布能力：
 *   - 批量编辑：一次创建多篇文章，每篇独立平台选择
 *   - 批量排期：每篇文章/平台可设不同发布时间
 *   - 批量复制：复制已有文章作为模板
 *
 * 数据存储在 Store.batch_jobs 表
 */
const { ipcMain } = require('electron')
const log = require('./logger')
const EC = require('../core/error-codes').ERROR
const { withSenderCheck } = require('../ipc-handlers/helpers')

let _taskQueue = null

/**
 * @typedef {object} PlannedBatchTask
 * @property {{title: string, content: string, author?: string, cover_url?: string, video_path?: string}} article
 * @property {string} platform
 * @property {string | null} accountId
 * @property {string} submissionTaskId
 * @property {string} [taskId]
 * @property {boolean} [settled]
 */

class BatchManager {
  constructor (store) {
    this.store = store
    this._timers = new Set()   // 跟踪 scheduleBatch 创建的所有 setTimeout 句柄
  }

  static setTaskQueue (taskQueue) {
    _taskQueue = taskQueue
  }

  /**
   * R40 边界归一化：platform 可能是字符串或 {platform, accountId} 对象
   * 在入口统一解析为规范形态，后续代码只消费规范形态（禁止在每个使用点重复 typeof 判断）
   */
  static resolvePlatform (p) {
    return typeof p === 'object' && p
      ? { platform: p.platform, accountId: p.accountId || null }
      : { platform: p, accountId: null }
  }

  /**
   * 清理所有排期中的定时器（应用退出时调用）
   */
  stopAll () {
    const count = this._timers.size
    for (const timer of this._timers) {
      clearTimeout(timer)
    }
    this._timers.clear()
    log.info('BatchManager', `Cleared ${count} pending batch timers`)
  }

  /**
   * 创建批量发布任务
   * @param {object} batch - { articles: Array<{title, content, platforms, publishTime?}>, name? }
   * @returns {string} batchId
   */
  createBatch (batch) {
    const id = `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const record = {
      id,
      name: batch.name || `批量发布 ${new Date().toLocaleDateString('zh-CN')}`,
      articles: batch.articles || [],
      total: (batch.articles || []).length,
      completed: 0,
      failed: 0,
      status: 'pending',     // pending / running / done / cancelled
      createdAt: Date.now(),
    }

    this.store.addBatchJob(record)
    log.info('BatchManager', `Created batch ${id}: ${record.total} articles`)
    return id
  }

  /**
   * 执行批量发布
   * 每篇文章提交到任务队列
   */
  async executeBatch (batchId) {
    const batch = this.store.getBatchJob(batchId)
    if (!batch) {
      log.warn('BatchManager', `Batch ${batchId} not found`)
      return null
    }

    /** @type {PlannedBatchTask[]} */
    const plannedTasks = []
    for (const article of batch.articles) {
      if (!article.platforms || article.platforms.length === 0) continue
      for (const platform of article.platforms) {
        const resolved = BatchManager.resolvePlatform(platform)
        plannedTasks.push({
          article,
          platform: typeof resolved.platform === 'string' ? resolved.platform.trim() : '',
          accountId: resolved.accountId,
          submissionTaskId: `${batchId}:enqueue:${plannedTasks.length + 1}:${Date.now()}`,
        })
      }
    }

    const taskQueue = _taskQueue
    const total = plannedTasks.length
    const acceptedTasks = new Map()
    const earlyResults = new Map()
    let accepted = 0
    let enqueueFailed = 0
    let completed = 0
    let failed = 0
    let batchCompleteEmitted = false
    let acceptingTasks = true

    const queueCanTrackResults = Boolean(
      taskQueue &&
      typeof taskQueue.add === 'function' &&
      typeof taskQueue.on === 'function' &&
      typeof taskQueue.off === 'function'
    )

    const removeQueueListeners = () => {
      if (!queueCanTrackResults) return
      taskQueue.off('task:success', onResult)
      taskQueue.off('task:failed', onResult)
    }

    const updateBatchState = () => {
      this.store.updateBatchJob(batchId, {
        total,
        completed,
        failed,
        status: completed >= total ? 'done' : 'running',
      })
    }

    const emitBatchCompleteIfReady = () => {
      if (batchCompleteEmitted || completed < total) return
      batchCompleteEmitted = true
      removeQueueListeners()
      updateBatchState()
      this._emitBatchComplete(batchId, {
        total,
        accepted,
        completed,
        succeeded: completed - failed,
        failed,
      })
    }

    const settleAcceptedTask = (metadata, task) => {
      if (metadata.settled) return
      metadata.settled = true
      const result = task.status === 'failed'
        ? { error: task.error || '发布失败' }
        : (task.result || {})
      completed += 1
      if (result.error) failed += 1
      updateBatchState()
      this._emitProgress(batchId, task.id || metadata.taskId, metadata.platform, metadata.article.title, result)
      emitBatchCompleteIfReady()
    }

    function onResult (task) {
      if (!task || !task.id) return
      const metadata = acceptedTasks.get(task.id)
      if (!metadata) {
        if (acceptingTasks) earlyResults.set(task.id, task)
        return
      }
      settleAcceptedTask(metadata, task)
    }

    const failToEnqueue = (metadata, message) => {
      enqueueFailed += 1
      completed += 1
      failed += 1
      updateBatchState()
      this._emitProgress(
        batchId,
        metadata.submissionTaskId,
        metadata.platform || '未知平台',
        metadata.article.title,
        { error: message }
      )
      emitBatchCompleteIfReady()
    }

    this.store.updateBatchJob(batchId, {
      total,
      completed: 0,
      failed: 0,
      status: total === 0 ? 'done' : 'running',
    })

    if (queueCanTrackResults) {
      taskQueue.on('task:success', onResult)
      taskQueue.on('task:failed', onResult)
    }

    for (const metadata of plannedTasks) {
      if (!metadata.platform) {
        failToEnqueue(metadata, '无效发布平台')
        continue
      }
      if (!queueCanTrackResults) {
        failToEnqueue(metadata, '任务队列未初始化')
        continue
      }

      try {
        const taskId = await taskQueue.add({
          platform: metadata.platform,
          article: {
            title: metadata.article.title,
            content: metadata.article.content,
            author: metadata.article.author || '',
            cover_url: metadata.article.cover_url || '',
            video_path: metadata.article.video_path || '',
            accountId: metadata.accountId,
          },
          batchId,
          retry: 2,
        })
        if (typeof taskId !== 'string' || !taskId) {
          throw new Error('任务队列未返回有效任务 ID')
        }

        metadata.taskId = taskId
        metadata.settled = false
        accepted += 1
        acceptedTasks.set(taskId, metadata)

        const earlyResult = earlyResults.get(taskId)
        if (earlyResult) {
          earlyResults.delete(taskId)
          settleAcceptedTask(metadata, earlyResult)
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        log.error('BatchManager', `Failed to submit ${metadata.platform}: ${message}`)
        failToEnqueue(metadata, message || '任务入队失败')
      }
    }

    acceptingTasks = false
    earlyResults.clear()
    emitBatchCompleteIfReady()

    return { batchId, total, accepted, failed: enqueueFailed }
  }

  /**
   * 复制已有文章
   */
  duplicateArticle (article) {
    return {
      ...article,
      title: `${article.title} (复制)`,
      id: undefined,
    }
  }

  /**
   * 批量排期
   * 为每篇文章设置发布时间，到点自动提交
   */
  scheduleBatch (batchId) {
    const batch = this.store.getBatchJob(batchId)
    if (!batch) return false

    // R40：复用类静态方法归一化（禁止本地副本，避免与 executeBatch 解析逻辑漂移）
    for (const article of batch.articles) {
      if (!article.publishTime || !article.platforms) continue

      const delay = new Date(article.publishTime).getTime() - Date.now()
      // 安全修复：Invalid Date 导致 NaN，setTimeout(fn, NaN) 会立即执行（原仅检查 <=0，NaN<=0 为 false 漏过）
      if (!Number.isFinite(delay)) {
        log.warn('BatchManager', 'Invalid publishTime in batch ' + batchId + ': ' + article.publishTime)
        continue
      }
      if (delay <= 0) {
        // 已过期，立即发布
        // 边界修复：_taskQueue 可能为 null（与下方 setTimeout 路径的 try/catch 对齐）
        if (!_taskQueue) {
          log.warn('BatchManager', 'Task queue not ready, skipping immediate publish for batch ' + batchId)
          continue
        }
        for (const platform of article.platforms) {
          const r = BatchManager.resolvePlatform(platform)
          _taskQueue.add({ platform: r.platform, article, batchId, accountId: r.accountId })
        }
        continue
      }

      const timer = setTimeout(() => {
        this._timers.delete(timer)
        try {
          // 边界修复：_taskQueue 可能为 null（与立即发布路径对齐）
          if (!_taskQueue) {
            log.warn('BatchManager', 'Task queue not ready, skipping batch task for batch ' + batchId)
            return
          }
          for (const platform of article.platforms) {
            const r = BatchManager.resolvePlatform(platform)
            _taskQueue.add({ platform: r.platform, article, batchId, accountId: r.accountId })
          }
        } catch (e) {
          log.error('BatchManager', 'Failed to schedule batch task for batch ' + batchId + ': ' + e.message)
        }
      }, delay)
      // R28 修复：unref 让定时器不阻止进程退出
      if (timer && timer.unref) timer.unref()
      this._timers.add(timer)
    }

    this.store.updateBatchJob(batchId, { status: 'scheduled' })
    log.info('BatchManager', `Batch ${batchId} scheduled (${batch.articles.length} articles)`)
    return true
  }

  _emitProgress (batchId, taskId, platform, title, result) {
    const wins = require('electron').BrowserWindow.getAllWindows()
    const win = wins[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('batch:progress', {
        kind: 'task-complete',
        batchId, taskId, platform, title,
        ok: !result?.error,
        message: result?.error || '发布成功',
        timestamp: Date.now(),
      })
    }
  }

  _emitBatchComplete (batchId, counts) {
    const wins = require('electron').BrowserWindow.getAllWindows()
    const win = wins[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('batch:progress', {
        kind: 'batch-complete',
        batchId,
        ...counts,
        timestamp: Date.now(),
      })
    }
  }

  /**
   * 注册 IPC handlers
   */
  registerIpcHandlers () {
    ipcMain.handle('batch:create', withSenderCheck((_, batch) => {
      try {
        const id = this.createBatch(batch)
        return { code: 0, data: { id } }
      } catch (e) {
        return { code: EC.REQUEST_ERROR, message: e.message }
      }
    }))

    ipcMain.handle('batch:execute', withSenderCheck(async (_, batchId) => {
      try {
        const result = await this.executeBatch(batchId)
        return result
          ? { code: 0, data: result }
          : { code: EC.REQUEST_ERROR, message: '批量任务不存在' }
      } catch (e) {
        return { code: EC.REQUEST_ERROR, message: e.message }
      }
    }))

    ipcMain.handle('batch:schedule', withSenderCheck((_, batchId) => {
      try {
        const ok = this.scheduleBatch(batchId)
        return ok ? { code: 0 } : { code: EC.REQUEST_ERROR, message: '批量任务不存在' }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('batch:list', () => {
      try { return { code: 0, data: this.store.listBatchJobs() } }
      catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
    })

    ipcMain.handle('batch:get', (_, id) => {
      try {
        const batch = this.store.getBatchJob(id)
        return batch ? { code: 0, data: batch } : { code: EC.REQUEST_ERROR, message: '未找到' }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    })

    ipcMain.handle('batch:delete', withSenderCheck((_, id) => {
      try { this.store.deleteBatchJob(id); return { code: 0 } }
      catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('batch:duplicate-article', withSenderCheck((_, article) => {
      try { return { code: 0, data: this.duplicateArticle(article) } }
      catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))
  }
}

module.exports = BatchManager
