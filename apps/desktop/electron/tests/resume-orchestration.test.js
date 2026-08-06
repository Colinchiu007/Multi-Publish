import { beforeEach, describe, expect, it, vi } from 'vitest'

const { PipelineEngine } = require('../services/pipeline-engine')

function makeStore() {
  return {
    saveFailed: vi.fn(() => true),
    load: vi.fn(() => null),
    remove: vi.fn(),
  }
}

function makeEngine(store) {
  const engine = new PipelineEngine({
    serviceBus: {},
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    runStateStore: store,
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
})
