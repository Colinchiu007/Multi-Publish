// @vitest-environment node
const { PipelineEngine } = require('../services/pipeline-engine')
const { StageExecutor } = require('../services/stage-executor')
const { registerStory2VideoStages } = require('../services/story2video-stages')
const {
  IMPORTED_MEDIA_DIR,
  getRunInputDir,
  importUserSelectedMedia,
} = require('../services/story2video-paths')
const fs = require('fs')
const os = require('os')
const path = require('path')

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }

function createEngine() {
  const serviceBus = {
    splitText: vi.fn(async () => ({ scenes: [{ text: '第一幕。' }, { text: '第二幕。' }] })),
    optimizePromptsBatch: vi.fn(async () => ({
      results: [{ optimized_prompt: 'prompt-1' }, { optimized_prompt: 'prompt-2' }],
    })),
    optimizePrompt: vi.fn(),
    composeVideo: vi.fn(async () => ({ code: 0, data: { videoPath: 'video.mp4' } })),
    callPythonSkill: vi.fn(),
  }
  const stageExecutor = new StageExecutor({ serviceBus, log })
  const engine = new PipelineEngine({ serviceBus, stageExecutor, log })
  return { engine, serviceBus }
}

describe('story2video 编排契约', () => {
  it('历史内容将 contentType 传入领域增强，并把富化提示词交给批量优化', async () => {
    const { engine, serviceBus } = createEngine()
    registerStory2VideoStages(engine)
    serviceBus.splitText.mockResolvedValueOnce({
      scenes: [{ text: '唐朝长安城的灯火照亮宫殿。' }],
    })
    serviceBus.optimizePromptsBatch.mockResolvedValueOnce({
      results: [{ optimized_prompt: '唐代长安城的电影感画面' }],
    })

    const started = await engine.startOrchestrated('story2video-compose', {
      text: '唐朝长安城的灯火照亮宫殿。',
      contentType: 'history',
      autoAdvance: false,
    })

    await engine.executeStage(started.runId)
    await engine.executeStage(started.runId)
    const optimized = await engine.executeStage(started.runId)

    expect(optimized.success).toBe(true)
    expect(engine.getRunContext(started.runId).domain_enrich).toMatchObject({
      domainEnriched: true,
      scenes: [expect.objectContaining({
        text: '唐朝长安城的灯火照亮宫殿。',
        imagePromptSeed: expect.stringContaining('唐代'),
      })],
    })
    expect(serviceBus.optimizePromptsBatch).toHaveBeenCalledWith(
      [expect.stringContaining('唐代')],
      expect.objectContaining({ style: 'realistic' }),
    )
  })

  it('启动时保留 initialContext，并让运行快照同时提供 context 与 status', async () => {
    const { engine } = createEngine()
    engine.registerPipeline({
      name: 'contract-context',
      description: 'contract',
      stages: ['split'],
      stageDefs: [{ name: 'split', type: 'split' }],
    })

    const started = await engine.startOrchestrated('contract-context', {
      text: '测试',
      initialContext: { seed: 'kept' },
      autoAdvance: false,
    })

    expect(started.success).toBe(true)
    const context = engine.getRunContext(started.runId)
    expect(context.seed).toBe('kept')
    expect(engine.getRunSnapshot(started.runId)).toMatchObject({
      context: { seed: 'kept' },
      status: { status: 'running' },
      currentStage: 0,
    })
  })

  it('运行参数覆盖阶段默认值，并把批量优化结果规范化为数组', async () => {
    const { engine, serviceBus } = createEngine()
    engine.registerPipeline({
      name: 'contract-options',
      description: 'contract',
      stages: ['split', 'optimize', 'review'],
      stageDefs: [
        { name: 'split', type: 'split', options: { mode: 'semantic' } },
        { name: 'optimize', type: 'optimize_batch', options: { style: 'realistic' }, inputFrom: 'split' },
        { name: 'review', type: 'manual_checkpoint' },
      ],
    })

    const started = await engine.startOrchestrated('contract-options', {
      text: '测试',
      imageStyle: 'anime',
      autoAdvance: false,
    })
    await engine.executeStage(started.runId)
    const optimized = await engine.executeStage(started.runId)

    expect(optimized.success).toBe(true)
    expect(engine.getRunContext(started.runId).optimize).toEqual([
      { optimized_prompt: 'prompt-1' },
      { optimized_prompt: 'prompt-2' },
    ])
    expect(serviceBus.optimizePromptsBatch).toHaveBeenCalledWith(
      ['第一幕。', '第二幕。'],
      expect.objectContaining({ style: 'anime' }),
    )
  })

  it('autoAdvance 在声明的检查点暂停并能继续到完成', async () => {
    const { engine } = createEngine()
    engine.registerPipeline({
      name: 'contract-checkpoint',
      description: 'contract',
      stages: ['split', 'review'],
      stageDefs: [
        { name: 'split', type: 'split', checkpointRequired: false },
        { name: 'review', type: 'manual_checkpoint', checkpointRequired: true },
      ],
    })

    const started = await engine.startOrchestrated('contract-checkpoint', {
      text: '测试',
      autoAdvance: true,
    })

    expect(started.success).toBe(true)
    expect(started.paused).toBe(true)
    expect(started.checkpoint).toMatchObject({ stageName: 'review', required: true })
    expect(engine.getRunSnapshot(started.runId)).toMatchObject({
      status: { status: 'paused' },
      checkpoint: { stageName: 'review', required: true },
    })

    const resumed = await engine.advanceToNextCheckpoint(started.runId)
    expect(resumed.success).toBe(true)
    expect(resumed.context.split).toBeDefined()
    expect(resumed.completed).toBe(true)
  })

  it('图片输入在没有文案时由 split 阶段生成场景', async () => {
    const { engine, serviceBus } = createEngine()
    engine.registerPipeline({
      name: 'contract-gallery',
      description: 'contract',
      stages: ['split'],
      stageDefs: [{ name: 'split', type: 'split' }],
    })

    const started = await engine.startOrchestrated('contract-gallery', {
      inputMode: 'images',
      images: [{ name: '封面.png', preview: 'data:image/png;base64,aW1hZ2U=' }],
      autoAdvance: false,
    })
    const split = await engine.executeStage(started.runId)

    expect(split.success).toBe(true)
    expect(split.output.scenes).toEqual([
      expect.objectContaining({ index: 0, text: '封面.png' }),
    ])
    expect(serviceBus.splitText).not.toHaveBeenCalled()
  })

  it('按 runId 执行阶段时只推进目标运行，不影响同流水线的并发运行', async () => {
    const { engine } = createEngine()
    engine.registerPipeline({
      name: 'contract-concurrent',
      description: 'contract',
      stages: ['split'],
      stageDefs: [{ name: 'split', type: 'split' }],
    })
    const first = await engine.startOrchestrated('contract-concurrent', { text: '第一条', autoAdvance: false })
    const second = await engine.startOrchestrated('contract-concurrent', { text: '第二条', autoAdvance: false })

    const executed = await engine.executeStage(first.runId)

    expect(executed.success).toBe(true)
    expect(engine.getRunSnapshot(first.runId)).toBeNull()
    expect(engine.getRunSnapshot(second.runId)).toMatchObject({
      runId: second.runId,
      status: { status: 'running', currentStage: 0 },
    })
  })

  it('非法初始上下文不会留下孤儿运行', async () => {
    const { engine } = createEngine()
    engine.registerPipeline({
      name: 'contract-invalid-context',
      description: 'contract',
      stages: ['split'],
      stageDefs: [{ name: 'split', type: 'split' }],
    })
    const circular = {}
    circular.self = circular

    const started = await engine.startOrchestrated('contract-invalid-context', {
      text: '测试',
      initialContext: circular,
      autoAdvance: false,
    })

    expect(started.success).toBe(false)
    expect(engine._runs.size).toBe(0)
  })

  it('取消 Story2Video 运行时清理 data URL 输入目录', async () => {
    const { engine } = createEngine()
    const started = await engine.startOrchestrated('story2video-compose', {
      text: '测试',
      autoAdvance: false,
    })
    const inputDir = getRunInputDir(started.runId)
    fs.mkdirSync(inputDir, { recursive: true })
    fs.writeFileSync(require('path').join(inputDir, 'image_0000.png'), 'image')

    engine.cancel()

    expect(fs.existsSync(inputDir)).toBe(false)
  })

  it('Story2Video 完成、失败或取消时清理已导入的旁白临时文件', async () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-import-source-'))
    const source = path.join(sourceRoot, 'voice.mp3')
    fs.writeFileSync(source, 'voice')
    const imported = importUserSelectedMedia(source, 'audio', {
      baseDir: path.join(IMPORTED_MEDIA_DIR, 'contract-' + Date.now()),
    })
    const { engine } = createEngine()

    try {
      const started = await engine.startOrchestrated('story2video-compose', {
        inputMode: 'audio',
        audio: [{ name: 'voice.mp3', path: imported.path }],
        autoAdvance: false,
      })
      expect(fs.existsSync(imported.path)).toBe(true)
      engine.cancel()
      expect(engine.getRunSnapshot(started.runId)).toBeNull()
      expect(fs.existsSync(imported.path)).toBe(false)
    } finally {
      fs.rmSync(sourceRoot, { recursive: true, force: true })
      fs.rmSync(imported.path, { force: true })
    }
  })
})
