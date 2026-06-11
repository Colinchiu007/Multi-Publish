/**
 * 任务队列 — 顺序执行 + 重试 + 超时
 *
 * 支持：
 * - 先进先出顺序执行
 * - 每个任务独立超时控制
 * - 失败自动重试 (可配置次数)
 * - 进度事件通知
 */
const EventEmitter = require('events')

class TaskQueue extends EventEmitter {
  constructor (options = {}) {
    super()
    this.maxConcurrent = options.maxConcurrent || 1
    this.defaultRetry = options.defaultRetry || 2
    this.defaultTimeout = options.defaultTimeout || 180000  // 3 min
    this._queue = []          // 等待队列
    this._running = new Map() // 正在执行的任务 { id -> task }
    this._history = []        // 已完成的任务历史
    this._paused = false
    this._idCounter = 0
  }

  /**
   * 添加发布任务
   * @param {object} task
   * @param {string} task.platform - 平台标识
   * @param {object} task.article - 文章数据
   * @param {number} [task.retry] - 重试次数
   * @param {number} [task.timeout] - 超时 (ms)
   * @returns {string} taskId
   */
  add (task) {
    const taskId = `task_${++this._idCounter}_${Date.now()}`
    const entry = {
      id: taskId,
      platform: task.platform,
      article: task.article,
      retry: task.retry ?? this.defaultRetry,
      timeout: task.timeout ?? this.defaultTimeout,
      status: 'pending',    // pending | running | success | failed
      retriesLeft: task.retry ?? this.defaultRetry,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null
    }

    this._queue.push(entry)
    this.emit('task:added', entry)
    this._processNext()

    return taskId
  }

  /**
   * 添加批量任务 (多平台)
   * @param {string[]} platforms
   * @param {object} article
   * @returns {string[]} taskIds
   */
  addBatch (platforms, article) {
    return platforms.map(p => this.add({ platform: p, article }))
  }

  /**
   * 获取队列状态
   */
  getStatus () {
    return {
      pending: this._queue.length,
      running: this._running.size,
      history: this._history.length,
      paused: this._paused
    }
  }

  /**
   * 获取所有历史记录
   */
  getHistory () {
    return [...this._history]
  }

  /**
   * 暂停队列
   */
  pause () {
    this._paused = true
    this.emit('queue:paused')
  }

  /**
   * 恢复队列
   */
  resume () {
    this._paused = false
    this.emit('queue:resumed')
    this._processNext()
  }

  /**
   * 清空等待队列 (不中断运行中的任务)
   */
  clearPending () {
    this._queue = []
    this.emit('queue:cleared')
  }

  // ─── 内部方法 ─────────────────────────────

  _processNext () {
    if (this._paused) return
    if (this._running.size >= this.maxConcurrent) return
    if (this._queue.length === 0) return

    const task = this._queue.shift()
    this._executeTask(task)
  }

  async _executeTask (task) {
    task.status = 'running'
    task.startedAt = new Date().toISOString()
    this._running.set(task.id, task)
    this.emit('task:start', task)

    // 创建超时 Promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Task timed out after ${task.timeout}ms`)), task.timeout)
    })

    try {
      // 执行发布 (由外部注册)
      const result = await Promise.race([
        this._runTask(task),
        timeoutPromise
      ])

      task.status = 'success'
      task.result = result
      task.completedAt = new Date().toISOString()
      this.emit('task:success', task)
    } catch (e) {
      task.error = e.message

      if (task.retriesLeft > 0) {
        task.retriesLeft--
        task.status = 'pending'
        this.emit('task:retry', task)
        // 放回队列尾部
        this._queue.push(task)
      } else {
        task.status = 'failed'
        task.completedAt = new Date().toISOString()
        this.emit('task:failed', task)
      }
    } finally {
      this._running.delete(task.id)
      // 已完成的任务移入历史
      if (task.status === 'success' || task.status === 'failed') {
        this._history.push(task)
      }
      this._processNext()
    }
  }

  /**
   * 实际执行任务的钩子 — 由外部设置
   */
  async _runTask (task) {
    if (!this._executor) {
      throw new Error('No executor registered. Use setExecutor(fn)')
    }
    const result = await this._executor(task)
    return result
  }

  /**
   * 注册执行器
   * @param {Function} fn - async (task) => result
   */
  setExecutor (fn) {
    this._executor = fn
  }
}

module.exports = TaskQueue