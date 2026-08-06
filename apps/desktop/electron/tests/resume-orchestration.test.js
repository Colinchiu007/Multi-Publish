import { beforeEach, describe, expect, it, vi } from 'vitest'

const { PipelineEngine } = require('../services/pipeline-engine')

function makeStore() {
  return {
    saveFailed: vi.fn(() => true),
    load: vi.fn(() => null),
    remove: vi.fn(),
  }
}

function makeEngine(store, governor) {
  const engine = new PipelineEngine({
    serviceBus: {},
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    runStateStore: store,
    governor: governor || null,
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
