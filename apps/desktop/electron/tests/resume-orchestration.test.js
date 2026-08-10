import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'

const { PipelineEngine, computeDefaultMaxConcurrentRuns } = require('../services/pipeline-engine')

function makeStore() {
  return {
    saveFailed: vi.fn(() => true),
    load: vi.fn(() => null),
    remove: vi.fn(),
  }
}

function makeEngine(store, governor, maxConcurrentRuns, maxHistoryEntries) {
  const engine = new PipelineEngine({
    serviceBus: {},
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    runStateStore: store,
    governor: governor || null,
    maxConcurrentRuns,
    maxHistoryEntries,
  })
  engine.registerPipeline({
    name: 'resume-test',
    description: '断点恢复测试',
    stages: ['a', 'b', 'c'],
    stageDefs: [
      { name: 'a', type: 't_a' },
      { name: 'b', type: 't_b' },
      { name: 'c', type: 't_c' },
    ],
  })
  return engine
}

describe('编排流水线断点恢复', () => {
  let store
  let engine

  beforeEach(() => {
    store = makeStore()
    engine = makeEngine(store)
  })

  it('失败后保存快照，resumeOrchestration 从失败阶段重建并保留前序 context', async () => {
    engine.registerStageExecutor('t_a', async () => ({ success: true, output: { ok: 'a' } }))
    engine.registerStageExecutor('t_b', async () => ({ success: false, error: 'boom: rate limit' }))
    engine.registerStageExecutor('t_c', async () => ({ success: true, output: { ok: 'c' } }))

    const started = await engine.startOrchestrated('resume-test', { initialContext: { x: 1 }, autoAdvance: false })
    expect(started.success).toBe(true)
    const runId = started.runId

    const first = await engine.executeStage(runId)
    expect(first.success).toBe(true)
    // a 完成，推进到 b；b 失败 → 运行失败并落快照
    const failed = await engine.executeStage(runId)
    expect(failed.success).toBe(false)
    expect(store.saveFailed).toHaveBeenCalledWith(expect.objectContaining({ id: runId, status: 'failed' }))

    const resume = await engine.resumeOrchestration(runId)
    expect(resume.success).toBe(true)
    expect(resume.runId).toBe(runId)

    const snap = engine.getRunSnapshot(runId)
    expect(snap.status.status).toBe('running')
    expect(snap.currentStage).toBe(1) // 失败阶段 b
    expect(snap.stages.map((s) => [s.name, s.status])).toEqual([
      ['a', 'completed'],
      ['b', 'running'],
      ['c', 'pending'],
    ])
    expect(snap.context).toEqual(expect.objectContaining({ x: 1, a: { ok: 'a' } }))
    expect(store.remove).toHaveBeenCalledWith(runId)
  })

  it('内容政策失败不允许恢复，返回明确错误码', async () => {
    engine.registerStageExecutor('t_a', async () => ({ success: true, output: { ok: 'a' } }))
    engine.registerStageExecutor('t_b', async () => ({ success: false, error: 'content policy rejected' }))
    engine.registerStageExecutor('t_c', async () => ({ success: true, output: { ok: 'c' } }))

    const started = await engine.startOrchestrated('resume-test', { initialContext: {}, autoAdvance: false })
    const runId = started.runId
    await engine.executeStage(runId)
    await engine.executeStage(runId)

    const resume = await engine.resumeOrchestration(runId)
    expect(resume.success).toBe(false)
    expect(resume.errorCode).toBe('PIPELINE_USER_INPUT_REQUIRED')
  })

  it('内存无该 run 时从 RunStateStore 持久化快照恢复（跨重启）', async () => {
    engine.registerStageExecutor('t_a', async () => ({ success: true, output: { ok: 'a' } }))
    engine.registerStageExecutor('t_b', async () => ({ success: false, error: 'network timeout' }))
    engine.registerStageExecutor('t_c', async () => ({ success: true, output: { ok: 'c' } }))

    // 直接模拟持久化快照（无内存 history）
    store.load.mockReturnValue({
      kind: 'orchestration-run-state',
      version: 1,
      runId: 'run_persisted_1',
      pipeline: 'resume-test',
      status: 'failed',
      currentStage: 1,
      stages: [{ name: 'a', status: 'completed' }, { name: 'b', status: 'failed' }, { name: 'c', status: 'pending' }],
      context: { x: 2, a: { ok: 'a' } },
      params: { initialContext: { x: 2 } },
      error: 'network timeout',
      orchestrationMode: 'orchestrator',
      endedAt: new Date().toISOString(),
    })

    const resume = await engine.resumeOrchestration('run_persisted_1')
    expect(resume.success).toBe(true)
    const snap = engine.getRunSnapshot('run_persisted_1')
    expect(snap.status.status).toBe('running')
    expect(snap.currentStage).toBe(1)
    expect(snap.context).toEqual(expect.objectContaining({ x: 2, a: { ok: 'a' } }))
  })

  it('非失败/非编排运行拒绝恢复', async () => {
    const resume = await engine.resumeOrchestration('missing-run')
    expect(resume.success).toBe(false)
    expect(resume.errorCode).toBe('RUN_SNAPSHOT_NOT_FOUND')
  })

  it('从持久化 running 快照恢复：从中断阶段重建并继续执行（跨重启断点续跑）', async () => {
    let releaseB
    const gate = new Promise((resolve) => { releaseB = resolve })
    engine.registerStageExecutor('t_a', async () => ({ success: true, output: { ok: 'a' } }))
    engine.registerStageExecutor('t_b', async () => { await gate; return { success: true, output: { ok: 'b' } } })
    engine.registerStageExecutor('t_c', async () => ({ success: true, output: { ok: 'c' } }))
    store.load.mockReturnValue({
      kind: 'orchestration-run-state',
      version: 1,
      runId: 'run_interrupted_1',
      pipeline: 'resume-test',
      status: 'running',
      error: null,
      currentStage: 1,
      stages: [
        { name: 'a', status: 'completed' },
        { name: 'b', status: 'running' },
        { name: 'c', status: 'pending' },
      ],
      context: { x: 2, a: { ok: 'a' } },
      params: {},
      orchestrationMode: 'orchestrator',
      createdAt: new Date().toISOString(),
      endedAt: null,
    })

    const resume = await engine.resumeOrchestration('run_interrupted_1')
    expect(resume.success).toBe(true)
    const snap = engine.getRunSnapshot('run_interrupted_1')
    expect(snap.status.status).toBe('running')
    expect(snap.currentStage).toBe(1)
    expect(snap.stages.map((s) => [s.name, s.status])).toEqual([
      ['a', 'completed'],
      ['b', 'running'],
      ['c', 'pending'],
    ])
    expect(snap.context).toEqual(expect.objectContaining({ x: 2, a: { ok: 'a' } }))
    expect(store.remove).toHaveBeenCalledWith('run_interrupted_1')
    releaseB()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('内存中已是 running 的编排 run：resumeOrchestration 幂等返回，不重复创建运行', async () => {
    engine.registerStageExecutor('t_a', async () => ({ success: true, output: { ok: 'a' } }))
    const started = await engine.startOrchestrated('resume-test', { initialContext: {}, autoAdvance: false })
    expect(started.success).toBe(true)
    const runId = started.runId

    store.load.mockClear()
    store.remove.mockClear()
    const resume = await engine.resumeOrchestration(runId)
    expect(resume).toMatchObject({ success: true, runId, alreadyRunning: true })
    expect(store.load).not.toHaveBeenCalled()
    expect(store.remove).not.toHaveBeenCalled()
  })

  it('failed 快照缺少 error 时拒绝恢复（异常数据防御）', async () => {
    store.load.mockReturnValue({
      runId: 'run-no-error',
      pipeline: 'resume-test',
      status: 'failed',
      error: null,
      currentStage: 0,
      stages: [{ name: 'a', status: 'failed' }],
      context: {},
      params: {},
      orchestrationMode: 'orchestrator',
    })
    const resume = await engine.resumeOrchestration('run-no-error')
    expect(resume.success).toBe(false)
    expect(resume.errorCode).toBe('RUN_NOT_FAILED')
  })

  it('getRunSnapshot 为已完成运行附带成片文件大小（完成汇总）', async () => {
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-run-size-'))
    const videoPath = path.join(tempDir, 'out.mp4')
    fs.writeFileSync(videoPath, Buffer.alloc(2048))
    try {
      const sizeEngine = new PipelineEngine({
        serviceBus: {},
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      })
      sizeEngine.registerPipeline({
        name: 'size-test',
        description: '大小测试',
        stages: ['compose'],
        stageDefs: [{ name: 'compose', type: 't_compose' }],
      })
      sizeEngine.registerStageExecutor('t_compose', async () => ({ success: true, output: { videoPath, path: videoPath } }))
      const started = await sizeEngine.startOrchestrated('size-test', { initialContext: {}, autoAdvance: true })
      expect(started.success).toBe(true)
      // 条件等待完成
      let snapshot = null
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        snapshot = sizeEngine.getRunSnapshot(started.runId)
        if (snapshot && snapshot.status?.status === 'completed') break
        await new Promise((r) => setTimeout(r, 20))
      }
      expect(snapshot?.status?.status).toBe('completed')
      expect(snapshot?.outputSizeBytes).toBe(2048)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})


describe('W2：run 结束统一回收 governor 过期 waiter', () => {
  let store
  let governor

  beforeEach(() => {
    store = makeStore()
    governor = { sweepAll: vi.fn() }
  })

  it('失败落快照时调用 governor.sweepAll', async () => {
    const engine = makeEngine(store, governor)
    engine.registerPipeline({
      name: 'sweep-test',
      description: '回收测试',
      stages: ['a', 'b'],
      stageDefs: [
        { name: 'a', type: 's_a' },
        { name: 'b', type: 's_b' },
      ],
    })
    engine.registerStageExecutor('s_a', async () => ({ success: true, output: {} }))
    engine.registerStageExecutor('s_b', async () => ({ success: false, error: 'rate limited' }))

    const started = await engine.startOrchestrated('sweep-test', { initialContext: {}, autoAdvance: false })
    const runId = started.runId
    await engine.executeStage(runId)
    await engine.executeStage(runId)
    expect(governor.sweepAll).toHaveBeenCalled()
  })

  it('取消时也调用 governor.sweepAll', async () => {
    const engine = makeEngine(store, governor)
    engine.registerPipeline({
      name: 'sweep-cancel',
      description: '回收测试-取消',
      stages: ['a'],
      stageDefs: [{ name: 'a', type: 'sc_a' }],
    })
    engine.registerStageExecutor('sc_a', async () => ({ success: false, error: 'need user input' }))

    const started = await engine.startOrchestrated('sweep-cancel', { initialContext: {}, autoAdvance: false })
    engine.cancel()
    expect(governor.sweepAll).toHaveBeenCalled()
  })
})


describe('后台运行：历史含运行中 + 并发上限', () => {
  function registerConc(engine) {
    engine.registerPipeline({
      name: 'conc-test',
      description: '并发测试',
      stages: ['a', 'b'],
      stageDefs: [
        { name: 'a', type: 'conc_a' },
        { name: 'b', type: 'conc_b' },
      ],
    })
    engine.registerStageExecutor('conc_a', async () => ({ success: true, output: {} }))
  }

  it('getHistory 包含运行中的编排 run，且无 _name 索引重复', async () => {
    const engine = makeEngine(makeStore())
    registerConc(engine)
    const started = await engine.startOrchestrated('conc-test', { initialContext: {}, autoAdvance: false })
    expect(started.success).toBe(true)

    const history = engine.getHistory()
    const matching = history.filter((h) => h.id === started.runId)
    expect(matching.length).toBe(1)
    expect(matching[0].status).toBe('running')
    expect(matching[0].orchestrationMode).toBe('orchestrator')
  })

  it('超过并发上限（注入 2）时拒绝第 3 条并返回 PIPELINE_CONCURRENCY_LIMIT', async () => {
    const engine = makeEngine(makeStore(), undefined, 2)
    registerConc(engine)
    const r1 = await engine.startOrchestrated('conc-test', { initialContext: {}, autoAdvance: false })
    const r2 = await engine.startOrchestrated('conc-test', { initialContext: {}, autoAdvance: false })
    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)

    const r3 = await engine.startOrchestrated('conc-test', { initialContext: {}, autoAdvance: false })
    expect(r3.success).toBe(false)
    expect(r3.errorCode).toBe('PIPELINE_CONCURRENCY_LIMIT')
    expect(r3.error).toContain('最多同时运行 2 条')
    expect(r3.errorParams).toEqual({ count: 2, max: 2 })
  })

  it('注入 maxConcurrentRuns=1 时第 2 条即被拒绝，取消后释放槽位可再次启动', async () => {
    const engine = makeEngine(makeStore(), null, 1)
    registerConc(engine)
    const r1 = await engine.startOrchestrated('conc-test', { initialContext: {}, autoAdvance: false })
    expect(r1.success).toBe(true)

    const r2 = await engine.startOrchestrated('conc-test', { initialContext: {}, autoAdvance: false })
    expect(r2.success).toBe(false)
    expect(r2.errorCode).toBe('PIPELINE_CONCURRENCY_LIMIT')

    engine.cancel()
    const r3 = await engine.startOrchestrated('conc-test', { initialContext: {}, autoAdvance: false })
    expect(r3.success).toBe(true)
  })

  it('resumeOrchestration 也占用并发槽位，超限时拒绝恢复', async () => {
    const store = makeStore()
    store.load = vi.fn(() => ({
      id: 'failed-run-1',
      runId: 'failed-run-1',
      pipeline: 'conc-test',
      status: 'failed',
      error: 'boom: network timeout',
      currentStage: 0,
      stages: [
        { name: 'a', status: 'failed' },
        { name: 'b', status: 'pending' },
      ],
      context: {},
      params: {},
      orchestrationMode: 'orchestrator',
    }))
    const engine = makeEngine(store, null, 1)
    registerConc(engine)
    const r1 = await engine.startOrchestrated('conc-test', { initialContext: {}, autoAdvance: false })
    expect(r1.success).toBe(true)

    const resume = await engine.resumeOrchestration('failed-run-1')
    expect(resume.success).toBe(false)
    expect(resume.errorCode).toBe('PIPELINE_CONCURRENCY_LIMIT')
  })
})


describe('MAJOR-1：_history 内存历史上限', () => {
  it('超过 maxHistoryEntries 时裁剪最旧快照，运行中 run 不受影响', async () => {
    const engine = makeEngine(makeStore(), null, undefined, 3) // maxHistoryEntries=3
    engine.registerPipeline({
      name: 'conc-test',
      description: '并发测试',
      stages: ['a', 'b'],
      stageDefs: [
        { name: 'a', type: 'conc_a' },
        { name: 'b', type: 'conc_b' },
      ],
    })
    engine.registerStageExecutor('conc_a', async () => ({ success: true, output: {} }))
    for (let i = 0; i < 6; i += 1) {
      const started = await engine.startOrchestrated('conc-test', { initialContext: {}, autoAdvance: false })
      expect(started.success).toBe(true)
      engine.cancel()
    }
    const history = engine.getHistory()
    expect(history.length).toBe(3)
  })
})

describe('MINOR-6：computeDefaultMaxConcurrentRuns 机器资源自适应', () => {
  it('低配（1 核或可用内存 <2GB）→ 1', () => {
    expect(computeDefaultMaxConcurrentRuns({ cpus: 1, freeMemGB: 8 })).toBe(1)
    expect(computeDefaultMaxConcurrentRuns({ cpus: 4, freeMemGB: 1.5 })).toBe(1)
  })

  it('常规（2 核且内存充足）→ 2', () => {
    expect(computeDefaultMaxConcurrentRuns({ cpus: 2, freeMemGB: 4 })).toBe(2)
    expect(computeDefaultMaxConcurrentRuns({ cpus: 4, freeMemGB: 3 })).toBe(2)
  })

  it('中高配（≥4 核且 ≥4GB）→ 3；高配（≥8 核且 ≥8GB）→ 4，且封顶 4', () => {
    expect(computeDefaultMaxConcurrentRuns({ cpus: 4, freeMemGB: 4 })).toBe(3)
    expect(computeDefaultMaxConcurrentRuns({ cpus: 8, freeMemGB: 8 })).toBe(4)
    expect(computeDefaultMaxConcurrentRuns({ cpus: 32, freeMemGB: 64 })).toBe(4)
  })

  it('注入 maxConcurrentRuns 仍覆盖自适应默认值', async () => {
    const engine = makeEngine(makeStore(), undefined, 1)
    expect(engine.maxConcurrentRuns).toBe(1)
  })
})

describe('并发上限环境变量开关（STORY2VIDEO_MAX_CONCURRENT_RUNS）', () => {
  const KEY = 'STORY2VIDEO_MAX_CONCURRENT_RUNS'
  const original = process.env[KEY]

  afterEach(() => {
    if (original === undefined) delete process.env[KEY]
    else process.env[KEY] = original
  })

  it('设 2 → 无 deps 注入时固定为 2（固定并发上限开关）', () => {
    process.env[KEY] = '2'
    const engine = makeEngine(makeStore())
    expect(engine.maxConcurrentRuns).toBe(2)
  })

  it('非法/非正数回退机器资源自适应', () => {
    process.env[KEY] = 'abc'
    const engine = makeEngine(makeStore())
    expect(engine.maxConcurrentRuns).toBe(computeDefaultMaxConcurrentRuns())
  })

  it('deps.maxConcurrentRuns 注入优先于环境变量', () => {
    process.env[KEY] = '2'
    const engine = makeEngine(makeStore(), undefined, 1)
    expect(engine.maxConcurrentRuns).toBe(1)
  })

  it('环境变量封顶 8，防止误配拉爆资源', () => {
    process.env[KEY] = '99'
    const engine = makeEngine(makeStore())
    expect(engine.maxConcurrentRuns).toBe(8)
  })
})

describe('已用时跨断点恢复累计（activeMs）', () => {
  let store
  let engine

  beforeEach(() => {
    store = makeStore()
    engine = makeEngine(store)
  })

  it('失败段耗时累计进快照，恢复后继承并继续累计（不丢段、不双计）', async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    engine.registerStageExecutor('t_a', async () => { await sleep(30); return { success: true, output: { ok: 'a' } } })
    engine.registerStageExecutor('t_b', async () => { await sleep(30); return { success: false, error: 'boom: retry me' } })
    engine.registerStageExecutor('t_c', async () => { await sleep(30); return { success: true, output: { ok: 'c' } } })

    const started = await engine.startOrchestrated('resume-test', { initialContext: {}, autoAdvance: false })
    const runId = started.runId
    await engine.executeStage(runId) // a 完成（~30ms）
    await engine.executeStage(runId) // b 失败（~30ms）→ saveFailed
    const failedSnapshot = engine.getRunSnapshot(runId)
    expect(failedSnapshot.status.status).toBe('failed')
    expect(failedSnapshot.activeMs).toBeGreaterThan(0)

    // 模拟应用重启：store.load 返回的持久化快照携带 activeMs（saveFailed 已写入）
    const persisted = store.saveFailed.mock.calls[0][0]
    expect(persisted.activeMs).toBeGreaterThan(0)

    // 新引擎从持久化快照恢复（跨重启语义）
    const storeB = makeStore()
    storeB.load.mockReturnValue({
      kind: 'orchestration-run-state',
      version: 1,
      runId,
      pipeline: 'resume-test',
      status: 'failed',
      currentStage: 1,
      stages: [
        { name: 'a', status: 'completed', startedAt: '2026-08-10T00:00:00.000Z', completedAt: '2026-08-10T00:00:01.000Z' },
        { name: 'b', status: 'failed', startedAt: '2026-08-10T00:00:02.000Z' },
        { name: 'c', status: 'pending' },
      ],
      context: { a: { ok: 'a' } },
      params: {},
      error: 'boom: retry me',
      orchestrationMode: 'orchestrator',
      activeMs: persisted.activeMs,
      endedAt: new Date().toISOString(),
    })
    const engineB = makeEngine(storeB)
    engineB.registerStageExecutor('t_a', async () => ({ success: true, output: { ok: 'a' } }))
    engineB.registerStageExecutor('t_b', async () => { await sleep(30); return { success: true, output: { ok: 'b' } } })
    engineB.registerStageExecutor('t_c', async () => ({ success: true, output: { ok: 'c' } }))

    const resume = await engineB.resumeOrchestration(runId)
    expect(resume.success).toBe(true)
    // 恢复瞬间即继承历史累计
    const resumedRun = engineB._runs.get(runId)
    expect(resumedRun.activeMs).toBe(persisted.activeMs)
    // 重试 b + c 完成后累计 = 历史累计 + 新执行段
    await engineB.executeStage(runId) // b 重试成功（~30ms）
    await engineB.executeStage(runId) // c 完成
    const finalSnapshot = engineB.getRunSnapshot(runId)
    expect(finalSnapshot.status.status).toBe('completed')
    expect(finalSnapshot.activeMs).toBeGreaterThanOrEqual(persisted.activeMs + 30)
  })
})
