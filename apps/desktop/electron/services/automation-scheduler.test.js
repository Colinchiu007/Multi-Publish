/**
 * automation-scheduler.test.js — 自动化任务调度器
 *
 * 主线：① 后台运行不影响调用方 ② skip/abort 失败策略 ③ 同任务不并发
 *      ④ 过期不补触发 ⑤ 定时器 unref + stopAll 清干净
 */
const { AutomationScheduler } = require('./automation-scheduler')

function makeLog () {
  return { info: () => {}, warn: () => {}, error: () => {} }
}

function makeStore (initial = null) {
  const mem = { v: initial }
  return {
    mem,
    getSetting: () => mem.v,
    setSetting: (_k, v) => { mem.v = v },
  }
}

/** 可控的流水线桩：手动决定每次 startRun 的成败 */
function makePipeline () {
  const listeners = []
  return {
    calls: [],
    results: [], // 每次调用返回 'completed' | 'failed' | 'cancelled'
    startRun (config) {
      this.calls.push(config)
      const runId = 'run_' + this.calls.length
      const outcome = this.results[this.calls.length - 1] || 'completed'
      // 异步投递终态，模拟真实事件时序
      setTimeout(() => {
        for (const fn of listeners) {
          fn(outcome === 'completed'
            ? { runId, status: 'completed' }
            : outcome === 'cancelled'
              ? { runId, status: 'cancelled' }
              : { runId, status: 'failed', error: '阶段失败' })
        }
      }, 0)
      return { success: true, runId }
    },
    getRunSnapshot: () => null,
    onRunCompleted: (fn) => { listeners.push(fn) },
    offRunCompleted: (fn) => {
      const i = listeners.indexOf(fn)
      if (i >= 0) listeners.splice(i, 1)
    },
  }
}

describe('自动化调度器 · 持久化与 CRUD', () => {
  it('load 归一化并丢弃触发器全废的僵尸任务', () => {
    const store = makeStore([
      { id: 'a', name: '僵尸', triggers: [{ type: 'daily', time: '99:99' }] },
      { id: 'b', name: '正常', triggers: [{ type: 'onAppStart' }] },
    ])
    const s = new AutomationScheduler({ log: makeLog(), store })
    const r = s.load()
    expect(r.tasks).toHaveLength(1)
    expect(r.tasks[0].name).toBe('正常')
    expect(r.dropped.some((d) => d.reason === 'triggers')).toBe(true)
  })

  it('create/update/remove 即时落盘，且拒绝非法输入', () => {
    const store = makeStore(null)
    const s = new AutomationScheduler({ log: makeLog(), store })
    s.load()

    expect(s.create({ name: '', triggers: [] }).ok).toBe(false)
    const created = s.create({ name: '任务A', triggers: [{ type: 'onAppStart' }] })
    expect(created.ok).toBe(true)
    expect(store.mem.v).toBeTruthy()

    expect(s.update(created.task.id, { name: '' }).ok).toBe(false)
    expect(s.update(created.task.id, { name: '任务B' }).ok).toBe(true)
    expect(s.remove(created.task.id).ok).toBe(true)
    expect(s.remove('nope').ok).toBe(false)
  })

  it('任务数达上限 20 时拒绝新建', () => {
    const store = makeStore(null)
    const s = new AutomationScheduler({ log: makeLog(), store })
    s.load()
    for (let i = 0; i < 20; i++) {
      expect(s.create({ name: 't' + i, triggers: [{ type: 'onAppStart' }] }).ok).toBe(true)
    }
    expect(s.create({ name: '溢出', triggers: [{ type: 'onAppStart' }] }).reason).toBe('limit')
  })
})

describe('自动化调度器 · 启动触发与后台运行', () => {
  it('start 触发 onAppStart 任务（后台执行，不抛给调用方）', async () => {
    const pipeline = makePipeline()
    pipeline.results = ['completed']
    const s = new AutomationScheduler({ log: makeLog(), store: makeStore(null), pipeline })
    s.load()
    s.create({ name: '启动任务', triggers: [{ type: 'onAppStart' }] })

    expect(() => s.start()).not.toThrow()
    // 等异步执行落地
    await new Promise((r) => setTimeout(r, 20))
    expect(pipeline.calls).toHaveLength(1)
    const view = s.list()[0]
    expect(view.lastStatus).toBe('completed')
  })

  it('启动触发的任务失败不影响其他任务（Promise.allSettled 语义）', async () => {
    const pipeline = makePipeline()
    pipeline.results = ['failed', 'completed']
    const s = new AutomationScheduler({ log: makeLog(), store: makeStore(null), pipeline })
    s.load()
    s.create({ name: '会失败', triggers: [{ type: 'onAppStart' }] })
    s.create({ name: '应成功', triggers: [{ type: 'onAppStart' }] })

    s.start()
    await new Promise((r) => setTimeout(r, 40))
    expect(pipeline.calls).toHaveLength(2)
    const byName = Object.fromEntries(s.list().map((t) => [t.name, t]))
    expect(byName['会失败'].lastStatus).toBe('failed')
    expect(byName['应成功'].lastStatus).toBe('completed')
  })

  it('停用的任务不触发', async () => {
    const pipeline = makePipeline()
    const s = new AutomationScheduler({ log: makeLog(), store: makeStore(null), pipeline })
    s.load()
    s.create({ name: '停用', triggers: [{ type: 'onAppStart' }], enabled: false })
    s.start()
    await new Promise((r) => setTimeout(r, 20))
    expect(pipeline.calls).toHaveLength(0)
  })

  it('执行器未就绪 → 标记失败 + 通知，不抛异常', async () => {
    const notified = []
    const s = new AutomationScheduler({
      log: makeLog(),
      store: makeStore(null),
      pipeline: null,
      notify: (p) => notified.push(p),
    })
    s.load()
    s.create({ name: '无执行器', triggers: [{ type: 'onAppStart' }] })
    await s.runNow(s.list()[0].id)
    expect(s.list()[0].lastStatus).toBe('failed')
    expect(notified).toHaveLength(1)
    expect(notified[0].level).toBe('error')
  })
})

describe('自动化调度器 · 失败策略与重试', () => {
  it('skip 策略：重试耗尽后标记 failed（重试次数生效）', async () => {
    const pipeline = makePipeline()
    pipeline.results = ['failed', 'failed', 'failed']
    const s = new AutomationScheduler({ log: makeLog(), store: makeStore(null), pipeline })
    s.load()
    const t = s.create({ name: '重试', triggers: [{ type: 'onAppStart' }], maxRetries: 2, failurePolicy: 'skip' })
    await s.runNow(t.task.id)
    // 1 次首发 + 2 次重试
    expect(pipeline.calls).toHaveLength(3)
    expect(s.get(t.task.id).lastStatus).toBe('failed')
  })

  it('abort 策略：一次失败即中断，不重试', async () => {
    const pipeline = makePipeline()
    pipeline.results = ['failed', 'completed']
    const s = new AutomationScheduler({ log: makeLog(), store: makeStore(null), pipeline })
    s.load()
    const t = s.create({ name: '中断', triggers: [{ type: 'onAppStart' }], maxRetries: 2, failurePolicy: 'abort' })
    await s.runNow(t.task.id)
    expect(pipeline.calls).toHaveLength(1)
    expect(s.get(t.task.id).lastStatus).toBe('failed')
  })

  it('失败通知带策略说明文案', async () => {
    const notified = []
    const pipeline = makePipeline()
    pipeline.results = ['failed']
    const s = new AutomationScheduler({
      log: makeLog(), store: makeStore(null), pipeline, notify: (p) => notified.push(p),
    })
    s.load()
    const t = s.create({ name: '通知文案', triggers: [{ type: 'onAppStart' }], failurePolicy: 'abort' })
    await s.runNow(t.task.id)
    expect(notified[0].message).toContain('中断')
  })

  it('上次失败本次成功 → 发恢复通知；连续成功不发（避免噪音）', async () => {
    const notified = []
    const pipeline = makePipeline()
    pipeline.results = ['failed', 'completed', 'completed']
    const s = new AutomationScheduler({
      log: makeLog(), store: makeStore(null), pipeline, notify: (p) => notified.push(p),
    })
    s.load()
    const t = s.create({ name: '恢复', triggers: [{ type: 'onAppStart' }] })

    await s.runNow(t.task.id) // failed → 1 条 error 通知
    expect(notified).toHaveLength(1)
    await s.runNow(t.task.id) // completed（上次 failed）→ 恢复通知
    expect(notified).toHaveLength(2)
    expect(notified[1].level).toBe('success')
    await s.runNow(t.task.id) // completed（上次 completed）→ 静默
    expect(notified).toHaveLength(2)
  })
})

describe('自动化调度器 · 并发与定时器纪律', () => {
  it('同任务上一轮未结束时跳过本轮（不排队，防雪崩）', async () => {
    let release
    let onDone = null
    const gate = new Promise((r) => { release = r })
    const pipeline = {
      calls: 0,
      // 挂起直到 gate 释放，之后投递 completed 终态（真实的事件通道形态）
      startRun: async () => {
        pipeline.calls += 1
        const runId = 'r1'
        gate.then(() => { if (onDone) onDone({ runId, status: 'completed' }) })
        return { success: true, runId }
      },
      getRunSnapshot: () => ({ status: 'running' }),
      onRunCompleted: (fn) => { onDone = fn },
      offRunCompleted: () => { onDone = null },
    }
    const s = new AutomationScheduler({ log: makeLog(), store: makeStore(null), pipeline })
    s.load()
    const t = s.create({ name: '长任务', triggers: [{ type: 'onAppStart' }] })

    const first = s.runNow(t.task.id)
    await new Promise((r) => setTimeout(r, 20))
    const second = await s.runNow(t.task.id) // 上一轮还在跑
    expect(second.ok).toBe(false)
    expect(second.reason).toBe('already-running')
    expect(pipeline.calls).toBe(1) // 第二次没有真正启动流水线

    release()
    await first
    expect(s.get(t.task.id).lastStatus).toBe('completed')
  })

  it('stopAll 清空所有定时器并复位状态', () => {
    const s = new AutomationScheduler({ log: makeLog(), store: makeStore(null) })
    s.load()
    s.create({ name: '定时', triggers: [{ type: 'interval', minutes: 5 }] })
    s.start()
    expect(s._timers.size).toBeGreaterThan(0)
    s.stopAll()
    expect(s._timers.size).toBe(0)
    expect(s._started).toBe(false)
  })

  it('所有定时器都 unref（不阻止应用退出）', () => {
    const s = new AutomationScheduler({ log: makeLog(), store: makeStore(null) })
    s.load()
    s.create({ name: '定时', triggers: [{ type: 'interval', minutes: 5 }, { type: 'daily', time: '09:00' }] })
    s.start()
    for (const timer of s._timers.values()) {
      expect(typeof timer.unref).toBe('function')
    }
    s.stopAll()
  })

  it('定时任务：到期触发后重挂下一次（interval）', async () => {
    const pipeline = makePipeline()
    pipeline.results = ['completed']
    const s = new AutomationScheduler({ log: makeLog(), store: makeStore(null), pipeline })
    s.load()
    s.create({ name: '间隔', triggers: [{ type: 'interval', minutes: 5 }] })
    s.start()
    await new Promise((r) => setTimeout(r, 30))
    expect(pipeline.calls.length).toBeGreaterThanOrEqual(1)
    // 触发后定时器被重挂（不是一次性）
    expect(s._timers.size).toBeGreaterThanOrEqual(1)
    s.stopAll()
  })
})
