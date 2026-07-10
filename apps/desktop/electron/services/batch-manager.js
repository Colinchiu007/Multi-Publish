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

let _taskQueue = null

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
      return false
    }

    this.store.updateBatchJob(batchId, { status: 'running' })

    for (const article of batch.articles) {
      if (!article.platforms || article.platforms.length === 0) continue

      for (const platform of article.platforms) {
        try {
          // R40：入口归一化为规范形态，后续只消费 r.platform / r.accountId
          const r = BatchManager.resolvePlatform(platform)

          const taskId = _taskQueue.add({
            platform: r.platform,
            article: {
              title: article.title,
              content: article.content,
              author: article.author || '',
              cover_url: article.cover_url || '',
              video_path: article.video_path || '',
              accountId: r.accountId,
            },
            batchId,
            retry: 2,
          })

          // 监听完成（修复：TaskQueue 实际 emit task:success / task:failed，原 task:${id}:done 从不触发）
          const onResult = (task) => {
            if (!task || task.id !== taskId) return  // 忽略其他 task 的事件
            // 手动清理两个监听器（不再是 once，需显式 off）
            _taskQueue.off('task:success', onResult)
            _taskQueue.off('task:failed', onResult)
            // 归一化 result：failed 时携带 error，success 时透传 task.result
            const result = task.status === 'failed'
              ? { error: task.error || '发布失败' }
              : (task.result || {})
            const current = this.store.getBatchJob(batchId)
            if (!current) return
            const updates = {
              completed: (current.completed || 0) + 1,
            }
            if (result && result.error) {
              updates.failed = (current.failed || 0) + 1
            }
            updates.status = updates.completed >= current.total ? 'done' : 'running'
            this.store.updateBatchJob(batchId, updates)

            // 通知渲染进程
            this._emitProgress(batchId, platform, article.title, result)
          }
          _taskQueue.on('task:success', onResult)
          _taskQueue.on('task:failed', onResult)
        } catch (e) {
          log.error('BatchManager', `Failed to submit ${platform}: ${e.message}`)
          const current = this.store.getBatchJob(batchId)
          if (current) {
            this.store.updateBatchJob(batchId, {
              failed: (current.failed || 0) + 1,
              completed: (current.completed || 0) + 1,
            })
          }
        }
      }
    }

    return true
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

  _emitProgress (batchId, platform, title, result) {
    const wins = require('electron').BrowserWindow.getAllWindows()
    const win = wins[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('batch:progress', {
        batchId, platform, title,
        ok: !result?.error,
        message: result?.error || '发布成功',
        timestamp: Date.now(),
      })
    }
  }

  /**
   * 注册 IPC handlers
   */
  registerIpcHandlers () {
    ipcMain.handle('batch:create', (_, batch) => {
      try {
        const id = this.createBatch(batch)
        return { code: 0, data: { id } }
      } catch (e) {
        return { code: -1, message: e.message }
      }
    })

    ipcMain.handle('batch:execute', async (_, batchId) => {
      try {
        await this.executeBatch(batchId)
        return { code: 0 }
      } catch (e) {
        return { code: -1, message: e.message }
      }
    })

    ipcMain.handle('batch:schedule', (_, batchId) => {
      try {
        const ok = this.scheduleBatch(batchId)
        return ok ? { code: 0 } : { code: -1, message: '批量任务不存在' }
      } catch (e) { return { code: -1, message: e.message } }
    })

    ipcMain.handle('batch:list', () => {
      try { return { code: 0, data: this.store.listBatchJobs() } }
      catch (e) { return { code: -1, message: e.message, data: [] } }
    })

    ipcMain.handle('batch:get', (_, id) => {
      try {
        const batch = this.store.getBatchJob(id)
        return batch ? { code: 0, data: batch } : { code: -1, message: '未找到' }
      } catch (e) { return { code: -1, message: e.message } }
    })

    ipcMain.handle('batch:delete', (_, id) => {
      try { this.store.deleteBatchJob(id); return { code: 0 } }
      catch (e) { return { code: -1, message: e.message } }
    })

    ipcMain.handle('batch:duplicate-article', (_, article) => {
      try { return { code: 0, data: this.duplicateArticle(article) } }
      catch (e) { return { code: -1, message: e.message } }
    })
  }
}

module.exports = BatchManager
