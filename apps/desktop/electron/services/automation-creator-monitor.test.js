/**
 * automation-creator-monitor.test.js — 调度器的博主监控分发与未知类型隔离
 *
 * 这组用例锁的是 2026-10-07 引入的两条分支，其价值在于「它们替代了什么」：
 *
 *  · 未知 action.type 既 **不能 fallback 到 pipeline**（会静默跑错链路，
 *    用户以为在跑博主巡检、实际跑的是采集改写发布），也**不能 throw**
 *    ——throw 发生在调度循环里，一条脏任务就会让其余任务全部不再触发。
 *  · 博主巡检中单个博主失败 MUST NOT 中断当轮其余博主。
 */
const { AutomationScheduler } = require('./automation-scheduler')

function makeTask (over = {}) {
  return {
    id: 't1', name: 't', enabled: true, triggers: [],
    maxRetries: 0, failurePolicy: 'skip',
    action: { type: 'creatorMonitor', config: { followIds: ['f1', 'f2', 'f3'] } },
    ...over,
  }
}

function makeScheduler (rt, extra = {}) {
  const pipelineCalls = []
  const quarantined = []
  const paused = []
  const s = new AutomationScheduler({
    log: { info: () => {}, warn: () => {}, error: () => {} },
    store: { getSetting: () => undefined, setSetting: () => {} },
    pipeline: {
      startRun: async (cfg) => { pipelineCalls.push(cfg); return { success: true, runId: 'r1' } },
    },
    ...extra,
  })
  s._creatorRuntime = rt
  s._quarantine = async (t) => { quarantined.push(t.id) }
  s._markTaskPaused = async (id, reason) => { paused.push([id, reason]) }
  return { s, pipelineCalls, quarantined, paused }
}

describe('automation-scheduler · 博主监控分发', () => {
  it('creatorMonitor 类型走巡检分支，绝不进入 pipeline', async () => {
    const probed = []
    const { s, pipelineCalls } = makeScheduler({
      probeCreator: async (id) => { probed.push(id); return { ok: true } },
    })
    const r = await s._executeWithPolicy(makeTask())
    expect(r.status).toBe('completed')
    expect(probed).toEqual(['f1', 'f2', 'f3'])
    expect(pipelineCalls).toHaveLength(0)   // ← 关键：没有误跑流水线
  })

  it('单个博主失败不中断当轮其余博主', async () => {
    const probed = []
    const { s } = makeScheduler({
      probeCreator: async (id) => {
        probed.push(id)
        if (id === 'f2') return { ok: false, tier: 'throttled' }
        return { ok: true }
      },
    })
    const r = await s._executeWithPolicy(makeTask())
    expect(probed).toEqual(['f1', 'f2', 'f3'])   // f2 之后仍继续
    expect(r.skipped).toBe(1)
    expect(r.status).toBe('completed')
  })

  it('探测抛异常也不中断当轮', async () => {
    const probed = []
    const { s } = makeScheduler({
      probeCreator: async (id) => {
        probed.push(id)
        if (id === 'f1') throw new Error('boom')
        return { ok: true }
      },
    })
    const r = await s._executeWithPolicy(makeTask())
    expect(probed).toEqual(['f1', 'f2', 'f3'])
    expect(r.skipped).toBe(1)
  })

  it('全部失败时任务判失败（而不是假装成功）', async () => {
    const { s } = makeScheduler({ probeCreator: async () => ({ ok: false }) })
    const r = await s._executeWithPolicy(makeTask())
    expect(r.status).toBe('failed')
    expect(r.skipped).toBe(3)
  })

  it('运行时未装配时明确失败，不静默跳过', async () => {
    const { s } = makeScheduler(null)
    const r = await s._executeWithPolicy(makeTask())
    expect(r.status).toBe('failed')
    expect(r.error).toMatch(/未装配/)
  })

  it('fullAutoPipeline 仍走原路径（既有行为不回归）', async () => {
    const { s, pipelineCalls } = makeScheduler({ probeCreator: async () => ({ ok: true }) })
    const task = makeTask({ action: { type: 'fullAutoPipeline', config: { a: 1 } } })
    // 不 await 整个执行：pipeline 替身不会发 run 完成事件，
    // _awaitRun 会一直等到硬超时。这里要验的只是「有没有进 pipeline」。
    s._executeWithPolicy(task).catch(() => {})
    await new Promise((r) => setTimeout(r, 0))
    expect(pipelineCalls).toHaveLength(1)
    expect(pipelineCalls[0]).toEqual({ a: 1 })
  })
})

describe('automation-scheduler · 未知类型隔离', () => {
  it('未知类型挂起并隔离原始载荷', async () => {
    const { s, quarantined, paused, pipelineCalls } = makeScheduler({ probeCreator: async () => ({ ok: true }) })
    const r = await s._executeWithPolicy(makeTask({ action: { type: 'someLegacyType' } }))
    expect(r.status).toBe('failed')
    expect(quarantined).toEqual(['t1'])
    expect(paused[0][1]).toBe('unknown_type')
  })

  it('未知类型绝不 fallback 到 pipeline（那会静默跑错链路）', async () => {
    const { s, pipelineCalls } = makeScheduler({ probeCreator: async () => ({ ok: true }) })
    await s._executeWithPolicy(makeTask({ action: { type: 'someLegacyType' } }))
    expect(pipelineCalls).toHaveLength(0)
  })

  it('未知类型绝不 throw（throw 会中断调度循环）', async () => {
    const { s } = makeScheduler({ probeCreator: async () => ({ ok: true }) })
    await expect(s._executeWithPolicy(makeTask({ action: { type: 'someLegacyType' } }))).resolves.toBeTruthy()
  })

  it('隔离/挂起自身抛错也不影响调度返回', async () => {
    const { s } = makeScheduler({ probeCreator: async () => ({ ok: true }) })
    s._quarantine = async () => { throw new Error('quarantine boom') }
    s._markTaskPaused = async () => { throw new Error('pause boom') }
    await expect(s._executeWithPolicy(makeTask({ action: { type: 'weird' } }))).resolves.toBeTruthy()
  })
})