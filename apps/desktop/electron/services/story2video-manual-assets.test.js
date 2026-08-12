// @vitest-environment node
/**
 * story2video-manual-assets.test.js — 分镜素材自选（creation.mode='manual'）专项测试
 * 覆盖：normalizer creation 契约、generate_assets 候选生成（2 图 / 2图+1视频 / 跳过 TTS / checkpoint）、
 * finalize_assets 选择校验与最终清单、pipeline-engine 动态阶段插入与 confirmSceneAssets 校验、paused 恢复。
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
// vitest globals（describe/it/expect/vi）由测试环境注入
const { registerStory2VideoStages, STORY2VIDEO_STAGE_TYPES } = require('./story2video-stages')
const { normalizeStory2VideoTextParams, DEFAULT_STORY2VIDEO_TEXT_CONFIG } = require('./story2video-text-config')
const { PipelineEngine } = require('./pipeline-engine')
const { RunStateStore } = require('./run-state-store')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-manual-'))
afterEach(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true }) } catch { /* ignore */ }
})

function makeStageExecutor() {
  const executors = new Map()
  return { executors, register(type, fn) { executors.set(type, fn) } }
}

function makePipeline(assetGenerator, aiGenerator) {
  const stageExecutor = makeStageExecutor()
  const pipeline = {
    stageExecutor,
    _assetGenerator: assetGenerator,
    aiGenerator,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerStageExecutor(type, fn) { stageExecutor.register(type, fn); return { success: true } },
  }
  registerStory2VideoStages(pipeline)
  return {
    pipeline,
    executors: stageExecutor.executors,
    generateAssets: stageExecutor.executors.get(STORY2VIDEO_STAGE_TYPES.GENERATE_ASSETS),
    finalizeAssets: stageExecutor.executors.get(STORY2VIDEO_STAGE_TYPES.FINALIZE_ASSETS),
  }
}

/** 生成真实临时文件作为「已生成素材」，返回 { code: 0, data: { path } }。 */
function mockImageResult(index, seq) {
  const dir = path.join(TMP, 'assets', 'run_' + index)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'img_' + String(index).padStart(4, '0') + '_' + seq + '.png')
  fs.writeFileSync(file, Buffer.from('fake-png-' + index + '-' + seq))
  return { code: 0, data: { path: file, url: file, image_path: file, size: 12 } }
}

function makeImageGenerator() {
  return {
    generateImage: vi.fn(async (prompt, opts) => mockImageResult(opts?.index ?? 0, opts?.seq ?? 0)),
    generateTTS: vi.fn(async (text, opts) => {
      const dir = path.join(TMP, 'assets', 'tts')
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, 'tts_' + String(opts?.index ?? 0).padStart(4, '0') + '.mp3')
      fs.writeFileSync(file, Buffer.from('fake-mp3'))
      return { code: 0, data: { path: file, audio_path: file } }
    }),
  }
}

const BASE_CONTEXT = {
  split: [{ text: '场景A' }, { text: '场景B' }],
  optimize: [{ optimized_prompt: 'prompt-A' }, { optimized_prompt: 'prompt-B' }],
  prompt_translations: {
    uiLocale: 'zh',
    items: [{ index: 0, prompt: 'prompt-A', translation: '翻译A' }, { index: 1, prompt: 'prompt-B', translation: '翻译B' }],
  },
}

const BASE_STAGE = { options: { concurrency: 2, imageStyle: 'cinematic', aspectRatio: '9:16', voiceId: 'default', contentType: 'general', creationMode: 'manual', manualMaterialMode: 'all-images' } }

describe('normalizer creation 契约', () => {
  it('默认 auto + all-images，缺失段按默认处理', () => {
    const r = normalizeStory2VideoTextParams({ text: '你好', story2videoTextConfig: {} })
    expect(r.story2videoTextConfig.creation).toEqual({ mode: 'auto', materialMode: 'all-images' })
    expect(r.stageOptions.generate_assets.creationMode).toBe('auto')
    expect(r.stageOptions.generate_assets.manualMaterialMode).toBe('all-images')
    expect(r.stageOptions.finalize_assets).toEqual({ creationMode: 'auto' })
  })

  it('合法 manual + video-image 通过并进入 stageOptions', () => {
    const r = normalizeStory2VideoTextParams({
      text: '你好',
      story2videoTextConfig: { creation: { mode: 'manual', materialMode: 'video-image' } },
    })
    expect(r.story2videoTextConfig.creation).toEqual({ mode: 'manual', materialMode: 'video-image' })
    expect(r.stageOptions.generate_assets.creationMode).toBe('manual')
    expect(r.stageOptions.generate_assets.manualMaterialMode).toBe('video-image')
  })

  it('非法枚举拒绝', () => {
    expect(() => normalizeStory2VideoTextParams({ text: '你好', story2videoTextConfig: { creation: { mode: 'unknown' } } })).toThrow(/creation\.mode/)
    expect(() => normalizeStory2VideoTextParams({ text: '你好', story2videoTextConfig: { creation: { mode: 'manual', materialMode: 'foo' } } })).toThrow(/creation\.materialMode/)
  })

  it('uiLocale 缺失默认 en（不触发翻译），提交时透传', () => {
    const r = normalizeStory2VideoTextParams({ text: '你好' })
    expect(r.uiLocale).toBe('en')
    const r2 = normalizeStory2VideoTextParams({ text: '你好', uiLocale: 'zh' })
    expect(r2.uiLocale).toBe('zh')
  })
})

describe('generate_assets manual 候选生成', () => {
  it('all-images：每场景 2 图、跳过 TTS、返回 scene_asset_selection 检查点', async () => {
    const generator = makeImageGenerator()
    const { generateAssets } = makePipeline(generator, null)
    const context = JSON.parse(JSON.stringify(BASE_CONTEXT))
    const result = await generateAssets({
      stage: BASE_STAGE,
      params: { creationMode: 'manual', manualMaterialMode: 'all-images', runId: 'run-x' },
      context,
      serviceBus: {},
    })
    expect(result.success).toBe(true)
    expect(result.checkpoint).toBe('scene_asset_selection')
    expect(result.checkpointMeta.type).toBe('scene_asset_selection')
    expect(generator.generateImage).toHaveBeenCalledTimes(4) // 2 scenes × 2 images
    expect(generator.generateTTS).not.toHaveBeenCalled()
    expect(result.output.materialMode).toBe('all-images')
    expect(result.output.candidates).toHaveLength(2)
    for (const scene of result.output.candidates) {
      expect(scene.candidates).toHaveLength(2)
      expect(scene.candidates.every(c => c.kind === 'image' && c.id && c.path && fs.existsSync(c.path))).toBe(true)
      expect(scene.candidates.map(c => c.id).sort()).toEqual(['image-0', 'image-1'])
      expect(scene.promptTranslation).toBeTruthy()
    }
    expect(context.assets_progress.imagesTotal).toBe(4)
  })

  it('video-image：AI 视频场景 2 图 + 1 视频（同一提示词），其余 2 图', async () => {
    const generator = makeImageGenerator()
    const { generateAssets } = makePipeline(generator, null)
    const context = {
      ...JSON.parse(JSON.stringify(BASE_CONTEXT)),
      video_plan: { mode: 'ai-judged', scenes: [{ index: 0, useVideo: true, seconds: 6 }], provider: 'mock', model: 'v1' },
    }
    // 本地 HTTP 服务器提供可下载的视频文件（与既有 blend 测试同模式；无 ffmpeg/ffprobe 时跳过）
    fs.mkdirSync(TMP, { recursive: true })
    const { findFfmpeg, findFfprobe } = require('./media-tool-paths')
    const ffmpeg = findFfmpeg()
    const ffprobe = findFfprobe()
    const tiny = path.join(TMP, 'tiny.mp4')
    try {
      if (!ffmpeg || !ffprobe) return
      const { execFileSync } = require('child_process')
      execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=0.3', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', tiny], { timeout: 30000, stdio: 'pipe' })
    } catch (_) {
      return // 无媒体工具跳过
    }
    let server
    let baseUrl = ''
    try {
      const http = require('http')
      server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'video/mp4' })
        fs.createReadStream(tiny).pipe(res)
      })
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
      baseUrl = 'http://127.0.0.1:' + server.address().port + '/video.mp4'
    } catch (_) {
      if (server) server.close()
      return // 环境不可用跳过
    }
    try {
      const adapter = {
        generateVideo: vi.fn(async () => ({ code: 0, data: { taskId: 't1' } })),
        getVideoStatus: vi.fn(async () => ({ code: 0, videoUrl: baseUrl })),
      }
      const manager = { callAdapter: vi.fn(async (provider, method, args) => adapter[method](args)), getDefault: vi.fn(), getProvider: vi.fn() }
      const pipeline = makePipeline(generator, null)
      pipeline.pipeline._modelProviderManager = manager
      pipeline.pipeline.container = { get: vi.fn(() => manager) }
      pipeline.pipeline.governor = { run: vi.fn(async (key, fn) => fn()) }
      const serviceBus = {
        optimizeVideoPrompt: vi.fn(async (prompt) => ({ optimized_prompt: '[video-opt] ' + prompt })),
      }

      const result = await pipeline.generateAssets({
        stage: { ...BASE_STAGE, options: { ...BASE_STAGE.options, manualMaterialMode: 'video-image' } },
        params: { creationMode: 'manual', manualMaterialMode: 'video-image', runId: 'run-x', videoMode: 'ai-judged', videoConfig: { pollIntervalMs: 5 } },
        context,
        serviceBus,
      })
      expect(result.success).toBe(true)
      expect(result.checkpoint).toBe('scene_asset_selection')
      const scene0 = result.output.candidates[0]
      const scene1 = result.output.candidates[1]
      expect(scene0.candidates.map(c => c.kind).sort()).toEqual(['image', 'image', 'video'])
      expect(scene1.candidates.map(c => c.kind)).toEqual(['image', 'image'])
      expect(scene0.candidates.find(c => c.kind === 'video').id).toBe('video-2')
      expect(adapter.generateVideo).toHaveBeenCalledTimes(1)
      expect(generator.generateImage).toHaveBeenCalledTimes(4)
    } finally {
      if (server) server.close()
    }
  })

  it('任一场景 0 候选 → fail closed', async () => {
    const generator = {
      generateImage: vi.fn(async () => ({ code: -1, message: 'all failed' })),
    }
    const { generateAssets } = makePipeline(generator, null)
    const context = JSON.parse(JSON.stringify(BASE_CONTEXT))
    const result = await generateAssets({
      stage: BASE_STAGE,
      params: { creationMode: 'manual', manualMaterialMode: 'all-images', runId: 'run-x' },
      context,
      serviceBus: {},
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/未生成任何候选素材/)
    expect(result.checkpoint).toBeUndefined()
  })

  it('内容政策 needs_user_input 整体失败（与全自动一致）', async () => {
    let call = 0
    const generator = {
      generateImage: vi.fn(async () => {
        call += 1
        if (call === 1) return { code: -1, message: 'Image generation requires user input after content-policy review', needsUserInput: true, checkpoint: { reason: 'content_policy', type: 'needs_user_input' } }
        return mockImageResult(0, 1)
      }),
    }
    const { generateAssets } = makePipeline(generator, null)
    const context = JSON.parse(JSON.stringify(BASE_CONTEXT))
    const result = await generateAssets({
      stage: BASE_STAGE,
      params: { creationMode: 'manual', manualMaterialMode: 'all-images', runId: 'run-x' },
      context,
      serviceBus: {},
    })
    expect(result.success).toBe(false)
    expect(result.needsUserInput).toBe(true)
  })
})

describe('finalize_assets', () => {
  function makeSelectionContext() {
    const generator = makeImageGenerator()
    const { generateAssets, finalizeAssets } = makePipeline(generator, null)
    return { generator, finalizeAssets, generateAssets }
  }

  async function produceCandidates() {
    const ctx = makeSelectionContext()
    const context = JSON.parse(JSON.stringify(BASE_CONTEXT))
    const genResult = await ctx.generateAssets({
      stage: BASE_STAGE,
      params: { creationMode: 'manual', manualMaterialMode: 'all-images', runId: 'run-x' },
      context,
      serviceBus: {},
    })
    expect(genResult.success).toBe(true)
    const candidates = genResult.output.candidates
    const selections = candidates.map(scene => ({
      index: scene.index,
      candidateId: scene.candidates[0].id,
    }))
    context.scene_asset_selection = { selections, confirmedAt: new Date().toISOString() }
    return { ...ctx, context, candidates, selections }
  }

  it('缺少选择 → fail closed', async () => {
    const { finalizeAssets } = makeSelectionContext()
    const result = await finalizeAssets({
      stage: { options: { creationMode: 'manual' } },
      params: { creationMode: 'manual' },
      context: { generate_assets: { candidates: [{ index: 0, candidates: [] }] } },
      serviceBus: {},
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/需要先确认分镜素材选择/)
  })

  it('非法 candidateId → fail closed', async () => {
    const { finalizeAssets, context } = await produceCandidates()
    context.scene_asset_selection = { selections: [{ index: 0, candidateId: 'nope' }, { index: 1, candidateId: 'image-0' }] }
    const result = await finalizeAssets({
      stage: { options: { creationMode: 'manual' } },
      params: { creationMode: 'manual' },
      context,
      serviceBus: {},
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/无效素材/)
  })

  it('合法选择 → 生成 TTS 并组装最终清单（含 promptTranslation）', async () => {
    const { finalizeAssets, context, generator } = await produceCandidates()
    const result = await finalizeAssets({
      stage: { options: { creationMode: 'manual', concurrency: 2 } },
      params: { creationMode: 'manual', runId: 'run-x' },
      context,
      serviceBus: {},
    })
    expect(result.success).toBe(true)
    expect(generator.generateTTS).toHaveBeenCalledTimes(2)
    expect(result.output.scenes).toHaveLength(2)
    expect(result.output.scenes[0].promptTranslation).toBe('翻译A')
    expect(result.output.scenes[0].audioPath).toBeTruthy()
    expect(fs.existsSync(result.output.scenes[0].audioPath)).toBe(true)
    expect(result.output.stats.successScenes).toBe(2)
    // context 已写入最终清单，compose 可读
    expect(context.generate_assets.scenes).toHaveLength(2)
  })

  it('finalize 走 serviceBus._assetGenerator 路径（未挂 pipeline._assetGenerator，防 C1 回归）', async () => {
    // 与生产一致：pipelineEngine._assetGenerator 为空，资源生成器挂在 serviceBus 上
    const pipeline = makePipeline(null, null)
    pipeline.pipeline._assetGenerator = null
    const busGenerator = makeImageGenerator()
    const serviceBus = { _assetGenerator: busGenerator }
    const context = JSON.parse(JSON.stringify(BASE_CONTEXT))
    const genResult = await pipeline.generateAssets({
      stage: { ...BASE_STAGE, options: { ...BASE_STAGE.options, creationMode: 'manual' } },
      params: { creationMode: 'manual', manualMaterialMode: 'all-images', runId: 'run-x' },
      context,
      serviceBus,
    })
    expect(genResult.success).toBe(true)
    const candidates = genResult.output.candidates
    context.scene_asset_selection = {
      selections: candidates.map(scene => ({ index: scene.index, candidateId: scene.candidates[0].id })),
      confirmedAt: new Date().toISOString(),
    }
    const result = await pipeline.finalizeAssets({
      stage: { options: { creationMode: 'manual', concurrency: 2 } },
      params: { creationMode: 'manual' },
      context,
      serviceBus,
    })
    expect(result.success).toBe(true)
    expect(busGenerator.generateTTS).toHaveBeenCalledTimes(2)
    expect(result.output.scenes).toHaveLength(2)
  })

  it('auto 模式防御快速通过', async () => {
    const { finalizeAssets } = makeSelectionContext()
    const result = await finalizeAssets({
      stage: { options: { creationMode: 'auto' } },
      params: { creationMode: 'auto' },
      context: { generate_assets: { scenes: [{ index: 0 }] } },
      serviceBus: {},
    })
    expect(result.success).toBe(true)
  })
})

function makeConfiguredEngine() {
  const engine = new PipelineEngine()
  const stageExecutor = makeStageExecutor()
  engine.stageExecutor = stageExecutor
  engine.registerStageExecutor = (type, fn) => { stageExecutor.register(type, fn); return { success: true } }
  registerStory2VideoStages(engine)
  return engine
}

describe('pipeline-engine manual 集成', () => {
  it('manual 模式在 compose 前插入 finalize_assets 阶段；auto 不插入', async () => {
    const engine = makeConfiguredEngine()
    const manual = await engine.startOrchestrated('story2video-compose', {
      text: '你好世界，这是一段测试文案，需要拆分成多个场景来验证。',
      autoAdvance: false,
      checkpointPolicy: 'none',
      story2videoTextConfig: { creation: { mode: 'manual', materialMode: 'all-images' } },
    })
    expect(manual.success).toBe(true)
    const manualRun = engine.getRunSnapshot(manual.runId)
    const names = manualRun.stages.map(s => s.name)
    expect(names).toContain('finalize_assets')
    expect(names.indexOf('finalize_assets')).toBe(names.indexOf('compose') - 1)

    const auto = await engine.startOrchestrated('story2video-compose', {
      text: '你好世界，这是一段测试文案，需要拆分成多个场景来验证。',
      autoAdvance: false,
      checkpointPolicy: 'none',
      story2videoTextConfig: {},
    })
    expect(auto.success).toBe(true)
    const autoRun = engine.getRunSnapshot(auto.runId)
    expect(autoRun.stages.some(s => s.name === 'finalize_assets')).toBe(false)
  })

  it('confirmSceneAssets 校验：非法/未覆盖/错误状态拒绝，合法推进', async () => {
    const engine = makeConfiguredEngine()
    const start = await engine.startOrchestrated('story2video-compose', {
      text: '你好世界，这是一段测试文案，需要拆分成多个场景来验证。',
      autoAdvance: false,
      checkpointPolicy: 'none',
      story2videoTextConfig: { creation: { mode: 'manual', materialMode: 'all-images' } },
    })
    const runId = start.runId
    const run = engine._runs.get(runId)
    // 模拟 generate_assets 候选与暂停检查点
    run.status = 'paused'
    run.checkpoint = { type: 'scene_asset_selection', stageName: 'generate_assets' }
    run.context.generate_assets = {
      candidates: [
        { index: 0, candidates: [{ id: 'image-0', kind: 'image', path: 'C:/tmp/x.png' }] },
        { index: 1, candidates: [{ id: 'image-0', kind: 'image', path: 'C:/tmp/y.png' }] },
      ],
    }
    const bad = await engine.confirmSceneAssets(runId, [{ index: 0, candidateId: 'nope' }])
    expect(bad.success).toBe(false)
    expect(bad.errorCode).toBe('INVALID_SCENE_ASSET_SELECTION')
    const partial = await engine.confirmSceneAssets(runId, [{ index: 0, candidateId: 'image-0' }])
    expect(partial.success).toBe(false)
    expect(partial.error).toMatch(/未覆盖全部场景/)
    const wrongState = await engine.confirmSceneAssets('run_missing', [{ index: 0, candidateId: 'image-0' }])
    expect(wrongState.success).toBe(false)

    run.status = 'paused'
    run.checkpoint = { type: 'scene_asset_selection', stageName: 'generate_assets' }
    run.context.scene_asset_selection = undefined
    // 推进由 advanceToNextCheckpoint 承担；此处 stub 只验证「选择写入 + 发起推进」
    const advanceSpy = vi.fn(async () => ({ success: true, runId, paused: false }))
    engine.advanceToNextCheckpoint = advanceSpy
    const ok = await engine.confirmSceneAssets(runId, [
      { index: 0, candidateId: 'image-0' },
      { index: 1, candidateId: 'image-0' },
    ])
    expect(ok.success).toBe(true)
    expect(run.context.scene_asset_selection.selections).toHaveLength(2)
    expect(advanceSpy).toHaveBeenCalledWith(runId)
  })

  it('resumeOrchestration 恢复 paused + scene_asset_selection 快照为 paused（不重跑）', async () => {
    const engine = makeConfiguredEngine()
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-runstate-'))
    try {
      const store = new RunStateStore({ dir, log: { warn() {}, info() {} } })
      engine.runStateStore = store
      const start = await engine.startOrchestrated('story2video-compose', {
        text: '你好世界，这是一段测试文案，需要拆分成多个场景来验证。',
        autoAdvance: false,
        checkpointPolicy: 'none',
        story2videoTextConfig: { creation: { mode: 'manual', materialMode: 'all-images' } },
      })
      const runId = start.runId
      const run = engine._runs.get(runId)
      run.status = 'paused'
      run.checkpoint = { type: 'scene_asset_selection', stageName: 'generate_assets', currentStage: run.currentStage, context: run.context }
      store.savePaused(run)
      engine._runs.clear()
      engine._currentPipeline = null
      const restored = await engine.resumeOrchestration(runId)
      expect(restored.success).toBe(true)
      expect(restored.paused).toBe(true)
      const snapshot = engine.getRunSnapshot(runId)
      expect(snapshot.status.status).toBe('paused')
      expect(snapshot.checkpoint.type).toBe('scene_asset_selection')
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })
})
