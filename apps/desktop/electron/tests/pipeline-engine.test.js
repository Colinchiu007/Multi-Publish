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
})
