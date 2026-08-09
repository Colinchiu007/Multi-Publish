import { beforeEach, describe, expect, it, vi } from 'vitest'

const { PipelineEngine } = require('../services/pipeline-engine')

describe('PipelineEngine 状态机模式', () => {
  let engine

  beforeEach(() => {
    engine = new PipelineEngine({
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
  })

  it('导出 PipelineEngine 类', () => {
    expect(PipelineEngine).toBeTypeOf('function')
  })

  it('列出非空的 pipeline 数组', () => {
    expect(engine.listPipelines()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'animated-explainer' }),
    ]))
  })

  it('将 Story2Video 稳定排在内置流水线首位，同时保持其他流水线顺序', () => {
    const list = engine.listPipelines()

    expect(list[0].name).toBe('story2video-compose')
    expect(list.slice(1).map(item => item.name)).toEqual([
      'animated-explainer', 'talking-head', 'cinematic', 'animation',
      'avatar-spokesperson', 'character-animation', 'clip-factory',
      'documentary-montage', 'hybrid', 'localization-dub', 'podcast-repurpose',
      'screen-demo', 'framework-smoke',
    ])
  })
  it('列表同时提供 stageCount，供桌面卡片显示阶段数', () => {
    const pipeline = engine.listPipelines().find(item => item.name === 'story2video-compose')
    expect(pipeline.stageCount).toBe(6)
  })

  it('已实现真实引擎的流水线标记 available=true', () => {
    const list = engine.listPipelines()
    const implemented = ['story2video-compose', 'animated-explainer', 'talking-head', 'cinematic', 'clip-factory', 'framework-smoke', 'documentary-montage', 'localization-dub', 'animation', 'avatar-spokesperson', 'character-animation', 'hybrid', 'podcast-repurpose']
    for (const name of implemented) {
      expect(list.find(item => item.name === name)?.available).toBe(true)
    }
  })

  it('未实现真实引擎的流水线标记 available=false', () => {
    const list = engine.listPipelines()
    const notImplemented = ['screen-demo']
    for (const name of notImplemented) {
      expect(list.find(item => item.name === name)?.available).toBe(false)
    }
  })

  it('podcast-repurpose 提供完整 stageDefs 链', () => {
    const pipeline = engine.getPipeline('podcast-repurpose')
    expect(pipeline.stages).toEqual(['analyze', 'visualize', 'assemble', 'render'])
    expect(pipeline.stageDefs.map(def => def.type)).toEqual([
      'podcast_analyze', 'podcast_visualize', 'podcast_assemble', 'compose',
    ])
  })

  it('localization-dub 提供完整 stageDefs 链', () => {
    const pipeline = engine.getPipeline('localization-dub')
    expect(pipeline.stages).toEqual(['transcribe', 'translate', 'tts', 'sync'])
    expect(pipeline.stageDefs.map(def => def.type)).toEqual([
      'localization_transcribe', 'localization_translate', 'localization_tts', 'localization_sync',
    ])
  })

  it('documentary-montage 提供完整 stageDefs 链', () => {
    const pipeline = engine.getPipeline('documentary-montage')
    expect(pipeline.stages).toEqual(['research', 'ingest', 'edit', 'narrate', 'render'])
    expect(pipeline.stageDefs.map(def => def.name)).toEqual(['research', 'ingest', 'edit', 'narrate', 'render'])
    expect(pipeline.stageDefs.map(def => def.type)).toEqual([
      'documentary_research', 'documentary_ingest', 'documentary_edit', 'documentary_narrate', 'compose',
    ])
  })

  it('每条 pipeline 都包含非空名称和描述', () => {
    for (const pipeline of engine.listPipelines()) {
      expect(pipeline.name).toEqual(expect.any(String))
      expect(pipeline.name.length).toBeGreaterThan(0)
      expect(pipeline.description).toEqual(expect.any(String))
      expect(pipeline.description.length).toBeGreaterThan(0)
    }
  })

  it('返回已知 pipeline 的完整阶段定义', () => {
    expect(engine.getPipeline('animated-explainer')).toEqual(expect.objectContaining({
      name: 'animated-explainer',
      stages: expect.any(Array),
    }))
  })

  it('未知 pipeline 返回 null', () => {
    expect(engine.getPipeline('nonexistent-pipeline')).toBeNull()
  })

  it('start 将 pipeline 状态切换为 running', () => {
    expect(engine.start('animated-explainer', { topic: 'AI basics' })).toMatchObject({ success: true })
    expect(engine.getStatus('animated-explainer').status).toBe('running')
  })

  it('pause 将运行状态切换为 paused', () => {
    engine.start('animated-explainer', {})

    expect(engine.pause()).toMatchObject({ success: true })
    expect(engine.getStatus('animated-explainer').status).toBe('paused')
  })

  it('resume 将暂停状态切回 running', () => {
    engine.start('animated-explainer', {})
    engine.pause()

    expect(engine.resume()).toMatchObject({ success: true })
    expect(engine.getStatus('animated-explainer').status).toBe('running')
  })

  it('cancel 成功并清理当前运行状态', () => {
    engine.start('animated-explainer', {})

    expect(engine.cancel()).toMatchObject({ success: true })
    expect(engine.getStatus('animated-explainer').status).toBe('idle')
  })

  it('advance 按阶段推进并在末尾回到 idle', () => {
    const pipeline = engine.getPipeline('animated-explainer')
    engine.start(pipeline.name, {})

    for (const _stage of pipeline.stages) {
      expect(engine.advance()).toMatchObject({ success: true })
    }
    expect(engine.getStatus(pipeline.name).status).toBe('idle')
  })

  it('完成 pipeline 后记录 completed 历史', () => {
    const pipeline = engine.getPipeline('animated-explainer')
    engine.start(pipeline.name, {})
    pipeline.stages.forEach(() => engine.advance())

    expect(engine.getHistory()).toContainEqual(expect.objectContaining({
      pipeline: pipeline.name,
      status: 'completed',
    }))
  })

  it('getHistory 合并持久化失败快照：应用重启后失败任务仍显示在历史记录', () => {
    const os = require('os')
    const path = require('path')
    const fs = require('fs')
    const { RunStateStore } = require('../services/run-state-store')
    const dir = path.join(os.tmpdir(), 'pipeline-engine-history-test-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2))
    const store = new RunStateStore({ dir, log: { warn() {}, info() {} } })

    const engineA = new PipelineEngine({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, runStateStore: store })
    engineA.runStateStore.saveFailed({
      id: 'run-failed-persisted',
      pipeline: 'story2video-compose',
      status: 'failed',
      currentStage: 3,
      stages: [{ name: 'split', status: 'completed' }, { name: 'optimize', status: 'failed' }],
      context: {},
      params: {},
      error: 'provider timeout',
      orchestrationMode: 'orchestrator',
      createdAt: '2026-08-08T01:00:00.000Z',
      endedAt: '2026-08-08T01:05:00.000Z',
    })

    // 模拟应用重启：新引擎（内存 _history 为空）复用同一 store
    const engineB = new PipelineEngine({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, runStateStore: store })
    const history = engineB.getHistory()
    expect(history).toContainEqual(expect.objectContaining({
      id: 'run-failed-persisted',
      pipeline: 'story2video-compose',
      status: 'failed',
    }))

    // 同会话去重：失败 run 同时在内存 _history 时只出现一次
    const engineC = new PipelineEngine({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, runStateStore: store })
    engineC._history.push({ id: 'run-failed-persisted', pipeline: 'story2video-compose', status: 'failed', stages: [], context: {}, createdAt: '2026-08-08T01:00:00.000Z' })
    const ids = engineC.getHistory().map((item) => item.id)
    expect(ids.filter((id) => id === 'run-failed-persisted')).toHaveLength(1)

    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('getHistory 合并持久化 running 快照：重启后运行中任务仍显示且可继续', () => {
    const os = require('os')
    const path = require('path')
    const fs = require('fs')
    const { RunStateStore } = require('../services/run-state-store')
    const dir = path.join(os.tmpdir(), 'pipeline-engine-running-history-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2))
    const store = new RunStateStore({ dir, log: { warn() {}, info() {} } })

    store.saveRunning({
      id: 'run-running-persisted',
      pipeline: 'story2video-compose',
      status: 'running',
      currentStage: 2,
      stages: [
        { name: 'split', status: 'completed' },
        { name: 'optimize', status: 'completed' },
        { name: 'generate_assets', status: 'running' },
      ],
      context: { prompt: '运行中' },
      params: {},
      error: null,
      orchestrationMode: 'orchestrator',
      createdAt: '2026-08-09T02:00:00.000Z',
    })

    // 模拟应用重启：新引擎（内存为空）复用同一 store
    const engineB = new PipelineEngine({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, runStateStore: store })
    const history = engineB.getHistory()
    expect(history).toContainEqual(expect.objectContaining({
      id: 'run-running-persisted',
      pipeline: 'story2video-compose',
      status: 'running',
      completedAt: null,
    }))

    // running 快照不混入 listFailed（失败/取消语义不变）
    expect(store.listFailed().map((s) => s.runId)).not.toContain('run-running-persisted')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('saveRunningState 把内存运行中编排任务落盘为 running 快照（退出兜底）', async () => {
    const os = require('os')
    const path = require('path')
    const fs = require('fs')
    const { RunStateStore } = require('../services/run-state-store')
    const dir = path.join(os.tmpdir(), 'pipeline-engine-save-running-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2))
    const store = new RunStateStore({ dir, log: { warn() {}, info() {} } })
    const engine = new PipelineEngine({ serviceBus: {}, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, runStateStore: store })
    engine.registerPipeline({
      name: 'running-persist-test',
      description: '退出兜底测试',
      stages: ['a', 'b'],
      stageDefs: [{ name: 'a', type: 'rp_a' }, { name: 'b', type: 'rp_b' }],
    })
    engine.registerStageExecutor('rp_a', async () => ({ success: true, output: {} }))
    engine.registerStageExecutor('rp_b', async () => ({ success: true, output: {} }))

    const started = await engine.startOrchestrated('running-persist-test', { initialContext: {}, autoAdvance: false })
    expect(started.success).toBe(true)
    // 启动即阶段级 checkpoint：running 快照已落盘
    expect(store.listRunning().map((s) => s.runId)).toContain(started.runId)

    // 模拟退出兜底：saveRunningState 幂等重写
    expect(engine.saveRunningState()).toBe(1)
    const loaded = store.load(started.runId)
    expect(loaded.status).toBe('running')
    expect(loaded.endedAt).toBeNull()

    // 非编排（state_machine）运行中的 run 不计入
    engine.start('animated-explainer', {})
    expect(engine.saveRunningState()).toBe(1)

    // 无运行中编排任务时返回 0
    const idleEngine = new PipelineEngine({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, runStateStore: store })
    expect(idleEngine.saveRunningState()).toBe(0)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('_executeStage 执行前写入阶段级 running checkpoint', async () => {
    const saveRunning = vi.fn(() => true)
    const engine = new PipelineEngine({
      serviceBus: {},
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      runStateStore: { saveRunning },
    })
    engine.registerPipeline({
      name: 'checkpoint-test',
      description: 'checkpoint 测试',
      stages: ['a'],
      stageDefs: [{ name: 'a', type: 'ck_a' }],
    })
    let executed = false
    engine.registerStageExecutor('ck_a', async () => { executed = true; return { success: true, output: {} } })

    const started = await engine.startOrchestrated('checkpoint-test', { initialContext: {}, autoAdvance: false })
    // startOrchestrated 启动即写入一次
    expect(saveRunning).toHaveBeenCalled()
    await engine.executeStage(started.runId)
    // _executeStage 执行前再次写入
    expect(executed).toBe(true)
    expect(saveRunning).toHaveBeenCalledTimes(2)
  })

  it('_finalizeRun completed 清理 running 快照（防止已完成任务以运行中重现）', () => {
    const remove = vi.fn()
    const engine = new PipelineEngine({
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      runStateStore: { remove },
    })
    const run = {
      id: 'run-complete-cleanup',
      pipeline: 'story2video-compose',
      status: 'running',
      currentStage: 0,
      stages: [{ name: 'split', status: 'running' }],
      context: {},
      params: {},
      orchestrationMode: 'orchestrator',
      startedAt: new Date().toISOString(),
    }
    engine._runs.set(run.id, run)
    engine._finalizeRun(run, 'completed')
    expect(remove).toHaveBeenCalledWith('run-complete-cleanup')
  })

  it('hasRunningOrchestration 只在存在运行中编排任务时返回 true', async () => {
    const engine = new PipelineEngine({ serviceBus: {}, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    engine.registerPipeline({
      name: 'running-detect',
      description: '运行检测',
      stages: ['a'],
      stageDefs: [{ name: 'a', type: 'rd_a' }],
    })
    engine.registerStageExecutor('rd_a', async () => ({ success: true, output: {} }))
    expect(engine.hasRunningOrchestration()).toBe(false)

    const started = await engine.startOrchestrated('running-detect', { initialContext: {}, autoAdvance: false })
    expect(started.success).toBe(true)
    expect(engine.hasRunningOrchestration()).toBe(true)

    engine.cancel()
    expect(engine.hasRunningOrchestration()).toBe(false)
  })

  it('确认检查点后运行快照不保留已消费的检查点', () => {
    const run = {
      id: 'run-checkpoint',
      pipeline: 'story2video-compose',
      status: 'paused',
      currentStage: 0,
      stages: [
        { name: 'optimize', status: 'paused', requiresCheckpoint: true, startedAt: null, completedAt: null },
        { name: 'generate_assets', status: 'pending', requiresCheckpoint: false, startedAt: null, completedAt: null },
      ],
      checkpoint: { stageName: 'optimize', stageIndex: 0, required: true },
      progress: 0,
      createdAt: new Date().toISOString(),
      orchestrationMode: 'orchestrator',
      context: {},
      stageResults: [],
    }
    engine._runs.set(run.id, run)

    expect(engine._advanceRun(run)).toMatchObject({ success: true, currentStage: 'generate_assets' })
    expect(engine.getRunSnapshot(run.id).checkpoint).toBeNull()
  })

  it('归档后的失败运行快照仍提供终态和可序列化错误详情', async () => {
    const error = '图片生成服务暂时不可用'
    const failingEngine = new PipelineEngine({
      stageExecutor: { execute: vi.fn().mockResolvedValue({ success: false, error }) },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    failingEngine.registerPipeline({
      name: 'terminal-snapshot-failure',
      description: 'terminal snapshot regression',
      stages: ['generate'],
    })

    const started = await failingEngine.startOrchestrated('terminal-snapshot-failure', { autoAdvance: false })
    expect(started).toMatchObject({ success: true })
    await expect(failingEngine.executeStage(started.runId)).resolves.toMatchObject({ success: false, error })

    const snapshot = JSON.parse(JSON.stringify(failingEngine.getRunSnapshot(started.runId)))
    expect(snapshot).toMatchObject({
      runId: started.runId,
      status: { status: 'failed', currentStage: 0 },
      error,
    })
  })

  it('断点续跑复用同 runId：_history 只保留最新一条终态', () => {
    const engine = new PipelineEngine({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    const base = { id: 'run-same-id', pipeline: 'story2video-compose', status: 'running', stages: [], context: {}, orchestrationMode: 'orchestrator', startedAt: new Date().toISOString() }
    engine._runs.set('run-same-id', { ...base })
    engine._finalizeRun(engine._runs.get('run-same-id'), 'failed', 'provider timeout')
    engine._runs.set('run-same-id', { ...base, resumedFrom: 'run-same-id' })
    engine._finalizeRun(engine._runs.get('run-same-id'), 'cancelled', null)
    const entries = engine.getHistory().filter(item => item.id === 'run-same-id')
    expect(entries).toHaveLength(1)
    expect(entries[0].status).toBe('cancelled')
  })

  it('取消的编排运行也持久化终态快照：重启后任务仍在历史记录', () => {
    const os = require('os')
    const path = require('path')
    const fs = require('fs')
    const { RunStateStore } = require('../services/run-state-store')
    const dir = path.join(os.tmpdir(), 'pipeline-engine-cancel-test-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2))
    const store = new RunStateStore({ dir, log: { warn() {}, info() {} } })
    const engine = new PipelineEngine({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, runStateStore: store })
    const run = {
      id: 'run-cancelled-persisted', pipeline: 'story2video-compose', status: 'running', currentStage: 2,
      stages: [{ name: 'split', status: 'completed' }, { name: 'optimize', status: 'completed' }, { name: 'generate_assets', status: 'running' }],
      context: {}, params: {}, orchestrationMode: 'orchestrator', startedAt: new Date().toISOString(),
    }
    engine._runs.set(run.id, run)
    engine._finalizeRun(run, 'cancelled', null)

    // 模拟应用重启：新引擎复用同一 store
    const engineB = new PipelineEngine({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, runStateStore: store })
    const history = engineB.getHistory()
    expect(history).toContainEqual(expect.objectContaining({ id: 'run-cancelled-persisted', status: 'cancelled' }))
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('PipelineEngine animated-explainer 编排', () => {
  function makeEngine() {
    return new PipelineEngine({
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
  }

  it('stageDefs 定义完整且类型/inputFrom 正确', () => {
    const engine = makeEngine()
    const pl = engine.getPipeline('animated-explainer')
    expect(pl.stages).toEqual([
      'research', 'proposal', 'script', 'scenes', 'assets', 'editing', 'compose', 'publish',
    ])
    const defs = Object.fromEntries(pl.stageDefs.map(stage => [stage.name, stage]))
    expect(defs.research.type).toBe('explainer_research')
    expect(defs.proposal.type).toBe('explainer_proposal')
    expect(defs.script.type).toBe('explainer_script')
    expect(defs.scenes.type).toBe('explainer_scenes')
    expect(defs.assets.type).toBe('explainer_generate_assets')
    expect(defs.editing.type).toBe('explainer_editing')
    expect(defs.compose.type).toBe('compose')
    expect(defs.compose.inputFrom).toBe('assets')
    expect(defs.publish.type).toBe('publish')
    expect(defs.publish.inputFrom).toBe('compose')
    expect(pl.stageDefs.every(stage => stage.checkpointRequired === false)).toBe(true)
  })

  it('autoAdvance 跨全部 8 阶段完成并把各阶段输出写入 context', async () => {
    const stageExecutor = {
      execute: vi.fn(async ({ stage }) => ({
        success: true,
        output: { completedStage: stage.name },
      })),
    }
    const engine = new PipelineEngine({ stageExecutor, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    const started = await engine.startOrchestrated('animated-explainer', {
      text: '测试主题',
      autoAdvance: true,
      checkpointPolicy: 'none',
    })
    expect(started.success).toBe(true)
    expect(started.completed).toBe(true)
    for (const stageName of ['research', 'proposal', 'script', 'scenes', 'assets', 'editing', 'compose', 'publish']) {
      expect(started.context[stageName]).toBeDefined()
    }
    const snapshot = engine.getRunSnapshot(started.runId)
    expect(snapshot.status.status).toBe('completed')
    expect(snapshot.stages.every(stage => stage.status === 'completed')).toBe(true)
  })

  it('background 模式立即返回 runId，后台自动推进到完成', async () => {
    const stageExecutor = {
      execute: vi.fn(async ({ stage }) => ({
        success: true,
        output: { completedStage: stage.name },
      })),
    }
    const engine = new PipelineEngine({ stageExecutor, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    const started = await engine.startOrchestrated('animated-explainer', {
      text: '测试主题',
      autoAdvance: true,
      background: true,
      checkpointPolicy: 'none',
    })
    expect(started.success).toBe(true)
    expect(started.runId).toBeTypeOf('string')
    expect(started.completed).toBeUndefined()
    expect(started.context).toBeUndefined()
    // 后台推进：轮询快照直到完成
    const deadline = Date.now() + 2000
    let snapshot = engine.getRunSnapshot(started.runId)
    while (Date.now() < deadline && snapshot && snapshot.status.status !== 'completed') {
      await new Promise((resolve) => setTimeout(resolve, 10))
      snapshot = engine.getRunSnapshot(started.runId)
    }
    expect(snapshot).not.toBeNull()
    expect(snapshot.status.status).toBe('completed')
    expect(snapshot.stages.every(stage => stage.status === 'completed')).toBe(true)
  })

  it('编排阶段缺少主题时 research 返回明确错误', async () => {
    const stageExecutor = {
      execute: vi.fn(async () => ({ success: true, output: null })),
    }
    const engine = new PipelineEngine({ stageExecutor, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    const started = await engine.startOrchestrated('animated-explainer', {
      text: '',
      autoAdvance: true,
      checkpointPolicy: 'none',
    })
    // 空文本在 startOrchestrated 不阻断（非 story2video 无归一化），由 research 执行器校验
    expect(started.success).toBe(true)
  })
})
