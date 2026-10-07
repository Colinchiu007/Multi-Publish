// @ts-check
/**
 * automation-scheduler.js — 自动化任务调度器（主进程，后台运行）
 *
 * 设计要点（对应 PRD §六，三条是被用户明确追问后定的）：
 *
 * ① **后台运行，不打扰当前操作**
 *    任务在主进程跑，不占用渲染进程、不弹模态框、不阻塞任何页面。
 *    界面只通过 `automation:notification` 事件（渲染层转成 toast/通知）+ 任务列表
 *    状态字段反映进度。用户此刻在发布页手动操作不受影响。
 *    ⚠️ 但不假装无代价：任务会占用模型额度与浏览器资源，可能与手动操作竞争
 *    平台限流 —— 这一条在界面上明示，不藏起来。
 *
 * ② **失败策略 skip / abort，重试先于策略**
 *    单步失败 → 先按 maxRetries 重试（默认 0）；重试耗尽后：
 *      - skip（默认）：记录失败步，继续下一步，终态 completed_with_errors
 *      - abort：立即停止，终态 failed
 *    为什么默认 skip：自动化任务是批量采集发布，个别源挂掉不该让整批白跑。
 *
 * ③ **不做过期补触发**
 *    应用没开时的到期时间不补偿。理由：任务是「采集→改写→发布」这类有外部
 *    副作用的动作，开机补跑 N 条过期任务会把平台限流打满且用户不知情。
 *    「应用启动触发」是**显式的一种触发器**（type='onAppStart'），与补跑不同。
 *
 * 定时器纪律：所有 timer 一律 `.unref()`，不让调度器阻止应用退出；
 * `stopAll()` 清空全部定时器并置空，供 shutdown 调用。
 */

const {
  normalizeAutomationTasks,
  validateAutomationTask,
  nextTriggerAt,
  describeTrigger,
  MAX_TASKS,
} = require('./automation-task')

/** 单任务硬超时：防一个卡死的 run 永久占着执行位 */
const DEFAULT_RUN_TIMEOUT_MS = 30 * 60 * 1000
/** setTimeout 单次上限（≈24.8 天），超过需分段重挂 */
const MAX_TIMER_DELAY = 2147483647

class AutomationScheduler {
  /**
   * @param {{
   *   log?: { info: Function, warn: Function, error: Function },
   *   store?: { getSetting: Function, setSetting: Function },
   *   pipeline?: { startRun: Function, getRunSnapshot: Function },
   *   notify?: (payload: object) => void,
   * }} deps
   */
  constructor (deps = {}) {
    this._log = deps.log || { info: () => {}, warn: () => {}, error: () => {}, notify: () => {} }
    this._store = deps.store || null
    this._pipeline = deps.pipeline || null
    this._notify = typeof deps.notify === 'function' ? deps.notify : () => {}
    this._settingsKey = deps.settingsKey || 'automation_tasks'

    this._tasks = []
    /** @type {Map<string, NodeJS.Timeout>} taskId+triggerIndex → timer */
    this._timers = new Map()
    /** @type {Map<string, boolean>} 正在跑的任务 id（同任务不并发） */
    this._running = new Map()
    this._started = false
    this._runTimeoutMs = DEFAULT_RUN_TIMEOUT_MS
  }

  // ─── 持久化 ────────────────────────────────────────────────

  _loadRaw () {
    if (!this._store || typeof this._store.getSetting !== 'function') return null
    try {
      const raw = this._store.getSetting(this._settingsKey)
      if (raw == null) return null
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) {
      this._log.warn('AutomationScheduler', '读取任务失败: ' + (e && e.message ? e.message : String(e)))
      return null
    }
  }

  _persist () {
    if (!this._store || typeof this._store.setSetting !== 'function') return false
    try {
      // 脱壳：settings 走 IPC 结构化克隆，不接受带 getter 的对象
      const plain = JSON.parse(JSON.stringify(this._tasks))
      this._store.setSetting(this._settingsKey, plain)
      return true
    } catch (e) {
      this._log.warn('AutomationScheduler', '保存任务失败: ' + (e && e.message ? e.message : String(e)))
      return false
    }
  }

  /** 读取并归一化任务（丢弃项逐条出声） */
  load () {
    const raw = this._loadRaw()
    const r = normalizeAutomationTasks(raw)
    this._tasks = r.tasks
    if (r.invalidShape) this._log.warn('AutomationScheduler', '任务数据结构非法，按空列表处理')
    for (const d of r.dropped) {
      this._log.warn('AutomationScheduler', '丢弃任务 ' + (d.id || '<no-id>') + '：' + d.reason)
    }
    return r
  }

  list () {
    return this._tasks.map((t) => this._toView(t))
  }

  /** 界面视图：补上触发摘要与运行中标记 */
  _toView (task) {
    return {
      ...task,
      triggerLabels: (task.triggers || []).map(describeTrigger),
      running: this._running.get(task.id) === true,
    }
  }

  create (body) {
    const r = validateAutomationTask(body, { existing: this._tasks })
    if (!r.ok) return { ok: false, reason: r.reason, task: null }
    if (this._tasks.length >= MAX_TASKS) return { ok: false, reason: 'limit', task: null }
    this._tasks.push(r.task)
    this._persist()
    if (this._started) this._armTask(r.task)
    return { ok: true, task: this._toView(r.task) }
  }

  update (id, body) {
    const idx = this._tasks.findIndex((t) => t.id === id)
    if (idx < 0) return { ok: false, reason: 'not-found', task: null }
    const r = validateAutomationTask({ ...this._tasks[idx], ...body, id }, { existing: this._tasks })
    if (!r.ok) return { ok: false, reason: r.reason, task: null }
    this._tasks[idx] = r.task
    this._persist()
    if (this._started) { this._disarmTask(id); this._armTask(r.task) }
    return { ok: true, task: this._toView(r.task) }
  }

  remove (id) {
    const idx = this._tasks.findIndex((t) => t.id === id)
    if (idx < 0) return { ok: false, reason: 'not-found' }
    this._tasks.splice(idx, 1)
    this._persist()
    if (this._started) this._disarmTask(id)
    return { ok: true }
  }

  get (id) {
    const t = this._tasks.find((x) => x.id === id)
    return t ? this._toView(t) : null
  }

  // ─── 调度 ──────────────────────────────────────────────────

  /**
   * 启动调度器（应用启动调用）。
   * 顺序：先跑 onAppStart 任务（旁路，失败不影响后续），再挂定时任务。
   */
  start () {
    if (this._started) return
    this._started = true
    this.load()
    // 启动触发：fire-and-forget，单任务失败不阻断其他任务（Promise.allSettled 语义）
    for (const task of this._tasks) {
      if (!task.enabled) continue
      if ((task.triggers || []).some((t) => t.type === 'onAppStart')) {
        this._runTask(task.id, { reason: 'onAppStart' }).catch(() => {})
      }
    }
    for (const task of this._tasks) this._armTask(task)
  }

  stopAll () {
    for (const timer of this._timers.values()) clearTimeout(timer)
    this._timers.clear()
    this._started = false
  }

  _disarmTask (taskId) {
    for (const [key, timer] of [...this._timers.entries()]) {
      if (key.startsWith(taskId + '#')) { clearTimeout(timer); this._timers.delete(key) }
    }
  }

  _armTask (task) {
    this._disarmTask(task.id)
    if (!task.enabled) return
    const triggers = Array.isArray(task.triggers) ? task.triggers : []
    triggers.forEach((trigger, index) => {
      if (trigger.type === 'onAppStart') return // 只在启动时触发
      this._armTrigger(task, trigger, index)
    })
  }

  _armTrigger (task, trigger, index) {
    const key = task.id + '#' + index
    const arm = () => {
      const at = nextTriggerAt(trigger, new Date())
      if (at == null) return
      const delay = Math.max(0, Math.min(at - Date.now(), MAX_TIMER_DELAY))
      const timer = setTimeout(() => {
        this._timers.delete(key)
        // 到期时重新读一次任务：可能被停用/删除/改了配置
        const current = this._tasks.find((t) => t.id === task.id)
        if (!current || !current.enabled) return
        trigger._lastFiredAt = Date.now()
        this._runTask(task.id, { reason: trigger.type }).catch(() => {})
        // 重挂下一次
        this._armTrigger(current, (current.triggers || [])[index] || trigger, index)
      }, delay)
      if (typeof timer.unref === 'function') timer.unref() // 不阻止应用退出
      this._timers.set(key, timer)
    }
    arm()
  }

  // ─── 执行（后台） ──────────────────────────────────────────

  /**
   * 执行一个任务。后台运行：不抛给调用方界面错误，异常一律转通知 + 状态。
   * @param {string} taskId
   * @param {{ reason?: string }} [opts]
   */
  async _runTask (taskId, opts = {}) {
    const task = this._tasks.find((t) => t.id === taskId)
    if (!task) return { ok: false, reason: 'not-found' }
    // 同任务不并发：上一次还没跑完就直接跳过本轮（不是排队，避免雪崩）
    if (this._running.get(taskId)) {
      this._log.warn('AutomationScheduler', '任务 ' + task.name + ' 上一轮仍在运行，跳过本轮触发')
      return { ok: false, reason: 'already-running' }
    }
    if (!task.enabled) return { ok: false, reason: 'disabled' }
    if (!this._pipeline || typeof this._pipeline.startRun !== 'function') {
      this._markResult(task, 'failed', '自动化执行器未就绪')
      this._notify({
        level: 'error',
        title: '自动化任务失败：' + task.name,
        message: '自动化执行器未就绪，任务未执行。',
        taskId: task.id,
      })
      return { ok: false, reason: 'no-pipeline' }
    }

    this._running.set(taskId, true)
    const startedAt = new Date().toISOString()
    // 上一次的状态必须在 _markResult 之前取：markResult 会覆盖 lastStatus，
    // 而「是否从失败恢复」正是拿上一次状态判的（顺序错了恢复通知永远发不出来）
    const previousStatus = String(task.lastStatus || '')
    try {
      const result = await this._executeWithPolicy(task)
      this._markResult(task, result.status, result.error || '', startedAt)
      this._emitNotification(task, result, previousStatus)
      return { ok: result.status !== 'failed', status: result.status }
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      this._markResult(task, 'failed', msg, startedAt)
      this._notify({
        level: 'error',
        title: '自动化任务失败：' + task.name,
        message: msg,
        taskId: task.id,
      })
      return { ok: false, reason: msg }
    } finally {
      this._running.delete(taskId)
    }
  }

  /**
   * 按失败策略执行一次。
   * 一期动作类型是 fullAutoPipeline：整条流水线作为**一个执行单元**，
   * 重试=重跑整条；流水线内部阶段失败由 failurePolicy 决定终态语义。
   * @param {object} task
   * @returns {Promise<{status: string, error?: string, failedSteps?: string[]}>}
   */
  async _executeWithPolicy (task) {
    // 新增任务类型 MUST 在此显式分发。未知类型走 _quarantineUnknownType，
    // 既不 fallback 到 pipeline（会静默跑错链路），也不 throw
    // （throw 发生在调度循环里，一条脏任务就会让其余任务全部不再触发）。
    const type = task.action && task.action.type
    if (type && type !== 'fullAutoPipeline') {
      if (type === 'creatorMonitor') return this._executeCreatorMonitor(task)
      return this._quarantineUnknownType(task)
    }

    const attempts = (task.maxRetries || 0) + 1
    let lastError = ''
    for (let i = 0; i < attempts; i++) {
      const started = await this._pipeline.startRun(task.action && task.action.config ? task.action.config : {})
      if (!started || started.success === false) {
        lastError = (started && started.error) || '流水线启动失败'
        continue
      }
      const outcome = await this._awaitRun(started.runId)
      if (outcome.status === 'completed') return { status: 'completed' }
      if (outcome.status === 'cancelled') return { status: 'cancelled' }
      lastError = outcome.error || '运行失败'
      // abort 策略：一次失败即中断，不重试
      if (task.failurePolicy === 'abort') {
        return { status: 'failed', error: lastError }
      }
    }
    // skip 策略：重试耗尽仍失败
    return { status: 'failed', error: lastError }
  }

  /**
   * 博主监控巡检：逐个探测到期博主。
   * 单个博主探测失败 MUST NOT 中断整轮 —— runtime.probeCreator 本身已不抛异常，
   * 这里再兜一层，保证「一个坏博主不会拖垮当轮其余博主」。
   */
  async _executeCreatorMonitor (task) {
    const rt = this._creatorRuntime
    if (!rt || typeof rt.probeCreator !== 'function') {
      return { status: 'failed', error: '博主监控运行时未装配' }
    }
    const ids = (task.action && task.action.config && task.action.config.followIds) || []
    let ok = 0
    let skipped = 0
    for (const followId of ids) {
      try {
        const r = await rt.probeCreator(followId)
        if (r && r.ok) ok += 1
        else skipped += 1
      } catch (e) {
        skipped += 1
      }
    }
    if (this._log && this._log.warn && skipped > 0) {
      this._log.warn('[automation] 博主巡检', `${skipped}/${ids.length} 个未成功探测`)
    }
    return { status: ok > 0 || ids.length === 0 ? 'completed' : 'failed', skipped }
  }

  /** 未知任务类型：挂起并保留原始载荷，绝不执行任何链路 */
  async _quarantineUnknownType (task) {
    const type = task.action && task.action.type
    if (this._log && this._log.warn) {
      this._log.warn('[automation] 未知任务类型已隔离', `task=${task.id} type=${type}`)
    }
    if (typeof this._quarantine === 'function') {
      try { await this._quarantine(task) } catch (_) { /* 隔离失败不得影响调度 */ }
    }
    if (typeof this._markTaskPaused === 'function') {
      try { await this._markTaskPaused(task.id, 'unknown_type', `未知自动化任务类型: ${type}`) } catch (_) { /* 同上 */ }
    }
    return { status: 'failed', error: `未知自动化任务类型: ${type}` }
  }

  /**
   * 等待一个 run 到终态。硬超时兜底，超时按失败处理且**不取消底层 run**
   * （底层 run 是 main-process 资源，交由 pipeline 自己的清理逻辑处理）。
   */
  _awaitRun (runId) {
    return new Promise((resolve) => {
      let settled = false
      const finish = (outcome) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this._pipeline.offRunCompleted && this._pipeline.offRunCompleted(onDone)
        resolve(outcome)
      }
      const timer = setTimeout(() => {
        finish({ status: 'failed', error: '任务执行超时（' + Math.round(this._runTimeoutMs / 60000) + ' 分钟）' })
      }, this._runTimeoutMs)
      if (typeof timer.unref === 'function') timer.unref()

      const onDone = (payload) => {
        if (!payload || payload.runId !== runId) return
        if (payload.status === 'completed') finish({ status: 'completed' })
        else if (payload.status === 'cancelled') finish({ status: 'cancelled' })
        else finish({ status: 'failed', error: (payload.error || '运行未成功完成') })
      }
      if (this._pipeline.onRunCompleted && typeof this._pipeline.onRunCompleted === 'function') {
        this._pipeline.onRunCompleted(onDone)
      } else {
        // 无事件通道时退化为轮询快照
        this._pollRun(runId, finish)
      }
    })
  }

  _pollRun (runId, finish) {
    const started = Date.now()
    const tick = () => {
      const snap = this._pipeline.getRunSnapshot ? this._pipeline.getRunSnapshot(runId) : null
      const status = snap && snap.status
      if (status === 'completed') return finish({ status: 'completed' })
      if (status === 'cancelled') return finish({ status: 'cancelled' })
      if (status === 'failed') return finish({ status: 'failed', error: (snap && snap.error) || '运行失败' })
      if (Date.now() - started > this._runTimeoutMs) {
        return finish({ status: 'failed', error: '任务执行超时' })
      }
      const t = setTimeout(tick, 3000)
      if (typeof t.unref === 'function') t.unref()
    }
    const t = setTimeout(tick, 1000)
    if (typeof t.unref === 'function') t.unref()
  }

  _markResult (task, status, error = '', startedAt = '') {
    const t = this._tasks.find((x) => x.id === task.id)
    if (!t) return
    t.lastRunAt = startedAt || new Date().toISOString()
    t.lastStatus = status
    t.lastError = String(error || '').slice(0, 500)
    this._persist()
  }

  /**
   * 终态通知：成功只在「上次失败本次成功」时通知，避免噪音。
   * @param {object} task
   * @param {{status: string, error?: string}} result
   * @param {string} previousStatus 本轮之前的 lastStatus（由调用方在写盘前取好）
   */
  _emitNotification (task, result, previousStatus = '') {
    if (result.status === 'completed') {
      if (previousStatus === 'failed') {
        this._notify({
          level: 'success',
          title: '自动化任务已恢复：' + task.name,
          message: '任务「' + task.name + '」已恢复正常。',
          taskId: task.id,
        })
      }
      return
    }
    if (result.status === 'cancelled') return
    const suffix = task.failurePolicy === 'abort'
      ? '策略为「中断」，失败后已停止后续步骤。'
      : '策略为「跳过继续」，已重试 ' + (task.maxRetries || 0) + ' 次后放弃。'
    this._notify({
      level: 'error',
      title: '自动化任务失败：' + task.name,
      message: result.error + '。' + suffix,
      taskId: task.id,
    })
  }

  /** 手动立即运行（界面「立即运行」按钮） */
  runNow (taskId) {
    return this._runTask(taskId, { reason: 'manual' })
  }

  /**
   * 注入通知出口（bootstrap 接线：窗口就绪后才有 webContents 可发）。
   * 容器装配期拿不到主窗口，若在构造时硬取会让通知永久静默 —— 故延迟注入。
   * @param {(payload: object) => void} fn
   */
  setNotify (fn) {
    this._notify = typeof fn === 'function' ? fn : () => {}
  }
}

module.exports = { AutomationScheduler, DEFAULT_RUN_TIMEOUT_MS, MAX_TIMER_DELAY }
