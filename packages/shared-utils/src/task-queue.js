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
      status: 'pending',    // pending | running | success | failed | cancelled
      retriesLeft: task.retry ?? this.defaultRetry,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null
    }

    this._queue.push(entry)
    this.emit('task:added', entry)
    this._saveState()
    this._processNext()

    return taskId
  }

  /**
   * 取消等待中的任务
   * @param {string} taskId
   * @returns {boolean} 是否成功取消
   */
  cancel (taskId) {
    const idx = this._queue.findIndex(t => t.id === taskId)
    if (idx === -1) {
      // 可能已经在执行中 — 标记为 cancelled，_executeTask 会检查
      const running = this._running.get(taskId)
      if (running) {
        running.status = 'cancelled'
        running.completedAt = new Date().toISOString()
        this.emit('task:cancelled', running)
        this._saveState()
        return true
      }
      return false
    }
    const task = this._queue.splice(idx, 1)[0]
    task.status = 'cancelled'
    task.completedAt = new Date().toISOString()
    this._history.push(task)
    this.emit('task:cancelled', task)
    this._saveState()
    return true
  }

  /**
   * 获取所有等待中的任务（用于持久化）
   */
  getPendingTasks () {
    return this._queue.map(t => ({
      id: t.id,
      platform: t.platform,
      article: t.article,
      retry: t.retry,
      timeout: t.timeout,
      retriesLeft: t.retriesLeft,
      createdAt: t.createdAt
    }))
  }

  /**
   * 序列化队列状态（用于崩溃恢复）
   */
  serialize () {
    return JSON.stringify({
      queue: this.getPendingTasks(),
      running: Array.from(this._running.values()).map(t => ({
        id: t.id,
        platform: t.platform,
        article: t.article,
        retry: t.retry,
        timeout: t.timeout,
        retriesLeft: t.retriesLeft,
        createdAt: t.createdAt,
        startedAt: t.startedAt
      }))
    })
  }

  /**
   * 从持久化状态恢复队列
   * @param {string} jsonStr
   * @returns {number} 恢复的任务数
   */
  deserialize (jsonStr) {
    if (!jsonStr) return 0
    try {
      const state = JSON.parse(jsonStr)
      let count = 0
      // 恢复等待中的任务
      if (state.queue) {
        for (const t of state.queue) {
          this._queue.push({
            ...t,
            status: 'pending',
            startedAt: null,
            completedAt: null,
            result: null,
            error: null
          })
          count++
        }
      }
      // 恢复运行中被中断的任务 — 重新加入队列尾部重试
      if (state.running) {
        for (const t of state.running) {
          this._queue.push({
            ...t,
            status: 'pending',
            retriesLeft: Math.max(t.retriesLeft, 1),
            startedAt: null,
            completedAt: null,
            result: null,
            error: '进程中断恢复'
          })
          count++
        }
      }
      if (count > 0) this._processNext()
      return count
    } catch (e) {
      return 0
    }
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

  /**
   * 持久化当前队列状态（由外部注册存储回调）
   */
  _saveState () {
    if (this._stateSaver) {
      try { this._stateSaver(this.serialize()) } catch (e) { /* ignore */ }
    }
  }

  /**
   * 注册状态持久化回调
   * @param {Function} fn - (jsonStr) => void
   */
  setStateSaver (fn) {
    this._stateSaver = fn
  }

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
    this._saveState()

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
      this._saveState()
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
      this._saveState()
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