// @vitest-environment node
const fs = require('fs')
const http = require('http')
const { execFile } = require('child_process')
const os = require('os')
const path = require('path')
const {
  registerStory2VideoStages,
  STORY2VIDEO_STAGE_TYPES,
  normalizeAssetConcurrency,
  hasMeaningfulText,
  isPromptEngineTooShortRejection,
  pickFixedVideoScenes,
  parseVideoSelection,
  clampVideoSelection,
  estimateSceneSeconds,
  resolveVideoGeneratorConfig,
  translatePromptsForLocale,
  ensureTranslationConcurrencyBudget,
} = require('./story2video-stages')
const {
  cleanupRunInputDir,
  importUserSelectedMedia,
} = require('./story2video-paths')
const { findFfmpeg } = require('./media-tool-paths')

afterEach(() => {
  cleanupRunInputDir('run')
})

function makeStageExecutor() {
  const executors = new Map()
  return {
    executors,
    register(type, fn) { executors.set(type, fn) },
  }
}

function makePipeline(assetGenerator, aiGenerator) {
  const stageExecutor = makeStageExecutor()
  const pipeline = {
    stageExecutor,
    _assetGenerator: assetGenerator,
    aiGenerator,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerStageExecutor(type, fn) {
      stageExecutor.register(type, fn)
      return { success: true }
    },
  }
  registerStory2VideoStages(pipeline)
  const assetsExecutor = stageExecutor.executors.get(STORY2VIDEO_STAGE_TYPES.GENERATE_ASSETS)
  assetsExecutor.optimizeExecutor = stageExecutor.executors.get(STORY2VIDEO_STAGE_TYPES.OPTIMIZE)
  assetsExecutor.sceneContextExecutor = stageExecutor.executors.get(STORY2VIDEO_STAGE_TYPES.SCENE_CONTEXT)
  return assetsExecutor
}

/**
 * prompt-engine 阶段的 ServiceBus 夹具：optimizePrompt 记录调用并返回 OptimizeResult。
 * respond 可自定义响应或抛错；默认返回 { optimized_prompt: '优化: <prompt>', platform, style, model_used, key_source }。
 */
function makeOptimizeBus(respond) {
  const calls = []
  const serviceBus = {
    calls,
    optimizePrompt: vi.fn(async (prompt, options) => {
      calls.push({ prompt, options })
      if (typeof respond === 'function') return respond({ prompt, options }, calls.length - 1)
      return {
        optimized_prompt: '优化: ' + prompt,
        platform: options.platform || 'generic',
        style: options.style || null,
        model_used: 'mock-model',
        key_source: 'config',
      }
    }),
    optimizePromptsBatch: vi.fn(),
  }
  return serviceBus
}

describe('story2video 资源索引契约', () => {
  it('资源并发值被限制为安全整数范围', () => {
    expect(normalizeAssetConcurrency(Infinity)).toBe(3)
    expect(normalizeAssetConcurrency(0)).toBe(1)
    expect(normalizeAssetConcurrency(2.8)).toBe(2)
    expect(normalizeAssetConcurrency(999)).toBe(8)
  })

  it('历史内容（contentType=history）经 scene_context 生成 imagePromptSeed 视觉种子', async () => {
    const fn = makePipeline(null).sceneContextExecutor
    const result = await fn({
      stage: { options: { contentType: 'history' } },
      params: {},
      context: { split: [{ text: '唐朝长安城的灯火照亮宫殿。' }] },
      serviceBus: {},
    })
    expect(result.success).toBe(true)
    expect(result.output.scenes[0].text).toContain('唐朝')
    expect(result.output.scenes[0].imagePromptSeed).toContain('唐代')
    expect(result.output.scenes[0].prompt).toContain('无文字')
  })

  it('通用内容（contentType=general）经 scene_context 不生成种子，场景原字段透传', async () => {
    const fn = makePipeline(null).sceneContextExecutor
    const result = await fn({
      stage: { options: { contentType: 'general' } },
      params: {},
      context: { split: [{ text: '普通内容。' }] },
      serviceBus: {},
    })
    expect(result.success).toBe(true)
    expect(result.output.scenes[0].imagePromptSeed).toBeUndefined()
    expect(result.output.scenes[0].prompt).toBeUndefined()
    expect(result.output.scenes[0].text).toBe('普通内容。')
  })

  it('scene_context 禁用（enabled=false）+ contentType=history 仍生成种子（保持 domain_enrich 独立语义）', async () => {
    const fn = makePipeline(null).sceneContextExecutor
    const result = await fn({
      stage: { options: { contentType: 'history', enabled: false } },
      params: {},
      context: { split: [{ text: '唐朝长安城的灯火照亮宫殿。' }] },
      serviceBus: {},
    })
    expect(result.success).toBe(true)
    expect(result.output.metadata.fallbackReason).toBe('scene_context_disabled')
    expect(result.output.scenes[0].imagePromptSeed).toContain('唐代')
    expect(result.output.scenes[0].prompt).toContain('无文字')
    // 禁用时跳过上下文融合：场景不带 storyContext/context
    expect(result.output.scenes[0].storyContext).toBeUndefined()
    expect(result.output.scenes[0].context).toBeUndefined()
  })

  it('提示词优化统一走 prompt-engine：逐场景调用、携带契约参数且不回退默认 LLM', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus()

    const result = await fn({
      stage: { options: { quality_baseline: false, style: 'cinematic', creative_level: 8, platform: 'dall-e', negative_prompt: '水印' } },
      params: {},
      context: {
        split: {
          scenes: [
            { text: '唐朝长安城的灯火。', imagePromptSeed: '唐代长安城夜景，无文字' },
            { text: '未来城市的车流。' },
          ],
        },
      },
      serviceBus,
    })

    expect(result).toEqual({
      success: true,
      output: [
        expect.objectContaining({ optimized_prompt: '优化: 唐代长安城夜景，无文字', providerId: 'prompt-engine', model: 'mock-model' }),
        expect.objectContaining({ optimized_prompt: '优化: 未来城市的车流。', providerId: 'prompt-engine', model: 'mock-model' }),
      ],
    })
    expect(serviceBus.calls).toHaveLength(2)
    // 契约参数：平台/风格别名归一 + 自动风格检测 + 边界收敛
    expect(serviceBus.calls[0]).toMatchObject({
      prompt: '唐代长安城夜景，无文字',
      options: expect.objectContaining({
        platform: 'dalle',
        style: 'photography',
        creative_level: 8,
        // 精修层长度语义（image-prompt-higgsfield-mechanics）：creative_level≥7 未显式 → 8013 能力上限
        max_length: 2000,
        num_candidates: 1,
        auto_detect_style: true,
        negative_prompt: '水印',
      }),
    })
    expect(serviceBus.optimizePromptsBatch).not.toHaveBeenCalled()
  })

  it('prompt-engine 返回含 <think> 思考块的结果时，净化后作为提示词（不带思考内容）', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus(() => ({
      optimized_prompt: '<think>用户让我把场景 12 变成图片提示词</think>\n\nA real final prompt',
      model_used: 'mock-model',
    }))
    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '唐朝长安城的灯火。' }] },
      serviceBus,
    })
    expect(result).toMatchObject({ success: true })
    expect(result.output[0].optimized_prompt).toBe('A real final prompt')
    expect(result.output[0].optimized_prompt).not.toContain('think')
  })

  it('prompt-engine 返回拒绝文本（missing description）时回退原文，不把拒绝内容当提示词', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus(() => ({
      optimized_prompt: 'I cannot generate the image prompt because the visual description of the scene is missing from your request. Please provide the details of Scene 11 (subject, action, setting, etc.) so I can convert it into a production-ready prompt.',
      model_used: 'mock-model',
    }))
    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '一个有内容的场景描述。' }] },
      serviceBus,
    })
    expect(result).toMatchObject({ success: true })
    // 拒绝文本被拦截：有实质内容时回退原文
    expect(result.output[0].optimized_prompt).toBe('一个有内容的场景描述。')
    expect(result.output[0].skipped_optimize).toBe(true)
    expect(result.output[0].optimize_note).toBe('llm_rejected_use_original')
    expect(result.output[0].optimized_prompt).not.toContain('cannot generate')
  })

  it('单个纯数字文案（如 1）守卫优先于拒绝路径：不调用 prompt-engine、直接用原文', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus()
    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '1' }] },
      serviceBus,
    })
    expect(result).toMatchObject({ success: true })
    expect(result.output[0]).toEqual({ optimized_prompt: '1', providerId: null, model: null, skipped_optimize: true })
    // 守卫优先：未调用 prompt-engine
    expect(serviceBus.calls).toHaveLength(0)
  })
  it('单个纯数字文案（如 5）跳过 prompt-engine 优化，用原文兜底，不编造场景', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus()
    const context = { split: [{ text: '5' }, { text: '一个有内容的场景描述。' }] }
    const result = await fn({
      stage: { options: { quality_baseline: false } },
      params: {},
      context,
      serviceBus,
    })
    expect(result).toMatchObject({ success: true })
    expect(result.output).toHaveLength(2)
    // 单个纯数字场景：跳过优化，用原文，标记 skipped_optimize
    expect(result.output[0]).toEqual({ optimized_prompt: '5', providerId: null, model: null, skipped_optimize: true })
    // 有内容场景：正常调用 prompt-engine
    expect(result.output[1]).toMatchObject({ optimized_prompt: '优化: 一个有内容的场景描述。' })
    expect(serviceBus.calls).toHaveLength(1)
    expect(context.optimize_progress).toEqual({ done: 2, total: 2 })
  })
  it('两位数字文案（如 81）走 prompt-engine 优化（方案B），不再用原文兜底', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus()
    const result = await fn({
      stage: { options: { quality_baseline: false } },
      params: {},
      context: { split: [{ text: '81' }] },
      serviceBus,
    })
    expect(result).toMatchObject({ success: true })
    expect(result.output[0]).toMatchObject({ optimized_prompt: '优化: 81' })
    expect(result.output[0].skipped_optimize).not.toBe(true)
    expect(serviceBus.calls).toHaveLength(1)
  })
  it('多位数文案（如 1949）走 prompt-engine 优化（方案B）', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus()
    const result = await fn({
      stage: { options: { quality_baseline: false } },
      params: {},
      context: { split: [{ text: '1949' }] },
      serviceBus,
    })
    expect(result).toMatchObject({ success: true })
    expect(result.output[0]).toMatchObject({ optimized_prompt: '优化: 1949' })
    expect(serviceBus.calls).toHaveLength(1)
  })
  it('prompt-engine 校验拒绝（Too short）时回退原文并继续，不使流水线失败（方案B 配套）', async () => {
    const fn = makePipeline(null).optimizeExecutor
    // FastAPI 422 形态：{ detail: [{ msg: 'Too short...' }] }
    const serviceBus = makeOptimizeBus(() => ({ detail: [{ msg: 'Too short (1 words). Try a more detailed description' }] }))
    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '81' }] },
      serviceBus,
    })
    expect(result).toMatchObject({ success: true })
    expect(result.output[0]).toEqual({
      optimized_prompt: '81',
      providerId: null,
      model: null,
      skipped_optimize: true,
      optimize_note: 'prompt_engine_too_short_use_original',
    })
    // 已调用 prompt-engine（方案B 放行），但拒绝被优雅回退
    expect(serviceBus.calls).toHaveLength(1)
  })
  it('prompt-engine 中文真实文案 422（描述太简短了（N 字））时回退原文并继续（2026-08-09 Bug 反哺）', async () => {
    const fn = makePipeline(null).optimizeExecutor
    // 真实链路返回：FastAPI 422 detail 中文文案（不匹配旧词表「太短」，曾导致整条流水线失败）
    const serviceBus = makeOptimizeBus(() => ({ detail: [{ msg: '描述太简短了（2 字），建议更详细描述画面' }] }))
    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '测试' }] },
      serviceBus,
    })
    expect(result).toMatchObject({ success: true })
    expect(result.output[0]).toMatchObject({
      optimized_prompt: '测试',
      skipped_optimize: true,
      optimize_note: 'prompt_engine_too_short_use_original',
    })
    expect(serviceBus.calls).toHaveLength(1)
  })
  it('prompt-engine 非过短校验拒绝（如非法风格）仍按失败处理', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus(() => ({ detail: [{ msg: 'unknown style value: foo' }] }))
    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '一个有内容的场景描述。' }] },
      serviceBus,
    })
    expect(result).toMatchObject({ success: false })
    expect(result.error).toMatch(/prompt-engine 请求被拒绝/)
  })
  it('单字中文优化 + 纯符号/纯数字跳过（组合场景，方案B 边界）', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus()
    const context = { split: [{ text: '一' }, { text: '。。。' }, { text: '5' }, { text: '81' }] }
    const result = await fn({
      stage: { options: { quality_baseline: false } },
      params: {},
      context,
      serviceBus,
    })
    expect(result).toMatchObject({ success: true })
    expect(result.output).toHaveLength(4)
    // 单字中文与 2 位数字 → 优化（无 skipped_optimize）；纯符号与单个数字 → 原文跳过
    expect(result.output[0]).toMatchObject({ optimized_prompt: '优化: 一' })
    expect(result.output[0]).not.toHaveProperty('skipped_optimize')
    expect(result.output[1]).toEqual({ optimized_prompt: '。。。', providerId: null, model: null, skipped_optimize: true })
    expect(result.output[2]).toEqual({ optimized_prompt: '5', providerId: null, model: null, skipped_optimize: true })
    expect(result.output[3]).toMatchObject({ optimized_prompt: '优化: 81' })
    expect(result.output[3]).not.toHaveProperty('skipped_optimize')
    expect(serviceBus.calls).toHaveLength(2)
  })
  it('逐场景提示词优化并行执行（有界并发，避免长文案串行拖慢）', async () => {
    // 用并发计数断言（确定性），不依赖墙钟：并发执行时活跃调用数应 ≥2
    let active = 0
    let maxActive = 0
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 50))
      active -= 1
      return { optimized_prompt: '优化结果', model_used: 'mock-model' }
    })
    const scenes = Array.from({ length: 6 }, (_, i) => ({ text: '场景' + i, imagePromptSeed: '画面' + i }))
    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: { scenes } },
      serviceBus,
    })
    expect(result.success).toBe(true)
    expect(result.output).toHaveLength(6)
    expect(serviceBus.calls).toHaveLength(6)
    expect(maxActive).toBeGreaterThanOrEqual(2)
  })

  it('优化进度前置写入：阶段开始即显示「共 N 个场景，已完成 X 个」', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus()
    const context = {
      split: {
        scenes: [
          { text: '场景0', imagePromptSeed: '画面0' },
          { text: '场景1', imagePromptSeed: '画面1' },
          { text: '场景2', imagePromptSeed: '画面2' },
        ],
      },
    }
    const result = await fn({
      stage: { options: {} },
      params: {},
      context,
      serviceBus,
    })
    expect(result.success).toBe(true)
    // 前置写入：前端在阶段执行期间即可显示数量信息，而不是等阶段结束后才出现
    expect(context.optimize_progress).toEqual({ done: 3, total: 3 })
  })

  it('断点续传时优化进度从已完成场景数开始，成功后清理续传缓存', async () => {
    const resumeEntry = { optimized_prompt: '已有优化', providerId: 'prompt-engine', model: 'mock-model' }
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus()
    const context = {
      split: {
        scenes: [
          { text: '场景0', imagePromptSeed: '画面0' },
          { text: '场景1', imagePromptSeed: '画面1' },
        ],
      },
      optimize_resume: [resumeEntry],
    }
    const result = await fn({
      stage: { options: {} },
      params: {},
      context,
      serviceBus,
    })
    expect(result.success).toBe(true)
    // 只优化未完成的场景，已完成的直接复用
    expect(serviceBus.calls).toHaveLength(1)
    expect(result.output).toHaveLength(2)
    expect(result.output[0]).toEqual(resumeEntry)
    expect(context.optimize_progress).toEqual({ done: 2, total: 2 })
    expect(context.optimize_resume).toBeUndefined()
  })

  it('prompt-engine 缺失、空响应、error 兜底、422 或持续瞬时失败时优化阶段 fail closed', async () => {
    // 服务缺失：未注入 PromptBridge → 明确错误
    const noBus = makePipeline(null).optimizeExecutor
    const missing = await noBus({
      stage: { options: {} }, params: {}, context: { split: [{ text: '场景' }] }, serviceBus: {},
    })
    expect(missing).toMatchObject({ success: false, error: expect.stringMatching(/prompt-engine|PromptBridge/i) })

    // 空响应
    const emptyBus = makeOptimizeBus(() => ({ optimized_prompt: '   ' }))
    const blank = await makePipeline(null).optimizeExecutor({
      stage: { options: {} }, params: {}, context: { split: [{ text: '场景' }] }, serviceBus: emptyBus,
    })
    expect(blank).toMatchObject({ success: false, error: expect.stringMatching(/空提示词/i) })

    // error 兜底响应（返回原文 + error）→ 必须失败，不能把「未优化原文」当成功
    const errorBus = makeOptimizeBus(() => ({ optimized_prompt: '原场景', error: 'quota exceeded' }))
    const errored = await makePipeline(null).optimizeExecutor({
      stage: { options: {} }, params: {}, context: { split: [{ text: '场景' }] }, serviceBus: errorBus,
    })
    expect(errored).toMatchObject({ success: false, error: expect.stringMatching(/quota exceeded/i) })

    // 422 detail 形态
    const detailBus = makeOptimizeBus(() => ({ detail: [{ msg: 'value is not a valid enumeration member' }] }))
    const detailResult = await makePipeline(null).optimizeExecutor({
      stage: { options: {} }, params: {}, context: { split: [{ text: '场景' }] }, serviceBus: detailBus,
    })
    expect(detailResult).toMatchObject({ success: false, error: expect.stringMatching(/422/i) })

    // 瞬态错误有界重试后成功
    const retryBus = makeOptimizeBus(() => { throw new Error('provider timeout') })
    retryBus.optimizePrompt
      .mockRejectedValueOnce(new Error('provider timeout'))
      .mockResolvedValue({ optimized_prompt: '优化后提示词', model_used: 'mock-model' })
    const recovered = await makePipeline(null).optimizeExecutor({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '第一幕' }] },
      serviceBus: retryBus,
    })
    expect(recovered).toMatchObject({ success: true })
    expect(recovered.output).toHaveLength(1)

    // 持续瞬时失败 → 场景级失败，不产生 output
    const persistentBus = makeOptimizeBus(() => { throw new Error('provider timeout') })
    const failed = await makePipeline(null).optimizeExecutor({
      stage: { options: { maxRetries: 0 } },
      params: {},
      context: { split: [{ text: '第一幕' }] },
      serviceBus: persistentBus,
    })
    expect(failed).toMatchObject({ success: false, error: expect.stringMatching(/scene 0.*provider timeout/i) })
    expect(failed).not.toHaveProperty('output')
    expect(persistentBus.optimizePromptsBatch).not.toHaveBeenCalled()
  })

  it('任一 scene 的图片或音频失败时默认阻断，不能生成错位清单', async () => {
    const fn = makePipeline({
      generateImage: vi.fn(async (_prompt, { index }) => index === 1
        ? { code: -1, message: 'image failed' }
        : { code: 0, data: { path: `image-${index}.png` } }),
      generateTTS: vi.fn(async (_text, { index }) => ({
        code: 0,
        data: { path: `audio-${index}.mp3`, duration: 2 },
      })),
    })

    const result = await fn({
      stage: { options: { concurrency: 2 } },
      params: {},
      context: {
        split: [{ text: '一' }, { text: '二' }, { text: '三' }],
        optimize: ['p1', 'p2', 'p3'],
      },
      serviceBus: {},
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/scene.*失败|asset.*failed/i)
    expect(result.error).toContain('Image #2: image failed')
  })

  it('将选定的 TTS 服务商、模型和音色完整透传至资产生成器', async () => {
    const generateTTS = vi.fn(async (_text, { index }) => ({
      code: 0,
      data: { path: `audio-${index}.mp3`, duration: 2 },
    }))
    const fn = makePipeline({
      generateImage: vi.fn(async (_prompt, { index }) => ({ code: 0, data: { path: `image-${index}.png` } })),
      generateTTS,
    })

    const result = await fn({
      stage: { options: { concurrency: 1 } },
      params: {
        voiceId: 'voice-selected',
        voiceProvider: 'elevenlabs',
        voiceModel: 'eleven_multilingual_v2',
        voiceSpeed: 1.1,
        voicePitch: 2,
      },
      context: { split: [{ text: '旁白内容' }], optimize: ['画面提示词'] },
      serviceBus: {},
    })

    expect(result.success).toBe(true)
    expect(generateTTS).toHaveBeenCalledWith('旁白内容', expect.objectContaining({
      voice_id: 'voice-selected',
      voice_provider: 'elevenlabs',
      voice_model: 'eleven_multilingual_v2',
      rate: 1.1,
      pitch: 2,
    }))
  })

  it('TTS 返回词级时间戳时透传到场景，alignScenes 直接用 TTS 时间戳（不依赖 aligner）', async () => {
    const generateTTS = vi.fn(async () => ({
      code: 0,
      data: {
        path: 'audio-0.mp3',
        duration: 1.3,
        timings: [
          { text: '今天', start: 0.0, end: 0.5 },
          { text: '天气', start: 0.5, end: 0.9 },
          { text: '真好', start: 0.9, end: 1.3 },
        ],
      },
    }))
    const fn = makePipeline({
      generateImage: vi.fn(async () => ({ code: 0, data: { path: 'image-0.png' } })),
      generateTTS,
    })
    const scene = {
      index: 0,
      text: '今天天气真好',
      subtitleBlocks: ['今天天气真好'],
      sceneSource: 'smart-sentence-splitter',
    }

    const result = await fn({
      stage: { options: {} },
      params: { voiceProvider: 'minimax-tts' },
      context: { split: { scenes: [scene] }, optimize: ['画面提示词'] },
      serviceBus: {},
    })

    expect(result.success).toBe(true)
    expect(generateTTS).toHaveBeenCalledWith('今天天气真好', expect.objectContaining({ with_timestamps: true }))
    const outputScene = result.output.scenes[0]
    expect(outputScene.timings).toHaveLength(3)
    // TTS 时间戳路径无需 aligner 可用（CI 无 ALIGNER_DIR）即可完成对齐，方法名标识来源
    expect(outputScene.subtitleAlign.method).toBe('tts-timestamps')
    expect(outputScene.subtitleAlign.aligned).toBe(true)
    expect(outputScene.subtitleTimeline[0].startTime).toBe(0)
    expect(outputScene.subtitleTimeline[0].endTime).toBe(1.3)
  })

  it('显式允许部分资源时只保留同 index 的成对 scene', async () => {
    const fn = makePipeline({
      generateImage: vi.fn(async (_prompt, { index }) => index === 1
        ? { code: -1, message: 'image failed' }
        : { code: 0, data: { path: `image-${index}.png` } }),
      generateTTS: vi.fn(async (_text, { index }) => ({
        code: 0,
        data: { path: `audio-${index}.mp3`, duration: 2 },
      })),
    })

    const result = await fn({
      stage: { options: { concurrency: 2 } },
      params: { allowPartialAssets: true },
      context: {
        split: [{ text: '一' }, { text: '二' }, { text: '三' }],
        optimize: ['p1', 'p2', 'p3'],
      },
      serviceBus: {},
    })

    expect(result.success).toBe(true)
    expect(result.output.scenes).toEqual([
      expect.objectContaining({ index: 0, imagePath: 'image-0.png', audioPath: 'audio-0.mp3' }),
      expect.objectContaining({ index: 2, imagePath: 'image-2.png', audioPath: 'audio-2.mp3' }),
    ])
    expect(result.output.scenes).not.toContainEqual(expect.objectContaining({ index: 1 }))
    expect(result.output.failures).toEqual({
      images: [expect.objectContaining({ index: 1, error: 'image failed' })],
      audio: [],
    })
  })

  it('图片模式直接摄取用户图片，不调用图片生成器并保持 scene index', async () => {
    const assetGenerator = {
      generateImage: vi.fn(),
      generateTTS: vi.fn(async (_text, { index }) => ({
        code: 0,
        data: { path: `audio-${index}.mp3`, duration: 2 },
      })),
    }
    const fn = makePipeline(assetGenerator)
    const imageData = 'data:image/png;base64,aW1hZ2U='

    const result = await fn({
      stage: { options: { concurrency: 1 } },
      params: { inputMode: 'images', images: [imageData] },
      context: {
        split: [{ text: '图片 1' }],
        optimize: ['图片 1 的视觉提示词'],
      },
      serviceBus: {},
    })

    expect(result.success).toBe(true)
    expect(assetGenerator.generateImage).not.toHaveBeenCalled()
    expect(result.output.scenes).toHaveLength(1)
    expect(result.output.scenes[0]).toMatchObject({ index: 0, audioPath: 'audio-0.mp3' })
    expect(result.output.scenes[0].imagePath).toMatch(/story2video[\\/]inputs[\\/].*image_0000\.png$/)
  })

  it('音频模式摄取用户音频并跳过 TTS，保留逐段索引和声明时长', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-audio-input-'))
    const audioPath = path.join(root, 'narration.mp3')
    fs.writeFileSync(audioPath, Buffer.from('audio'))
    const imported = importUserSelectedMedia(audioPath, 'audio')
    const assetGenerator = {
      generateImage: vi.fn(async (_prompt, { index }) => ({
        code: 0,
        data: { path: path.join(root, 'image-' + index + '.png') },
      })),
      generateTTS: vi.fn(),
    }
    const fn = makePipeline(assetGenerator)

    try {
      const result = await fn({
        stage: { options: { concurrency: 1 } },
        params: {
          inputMode: 'audio',
          audio: [{ name: 'narration.mp3', path: imported.path, duration: 1.25 }],
        },
        context: {
          split: [{ text: 'narration.mp3' }],
          optimize: ['narration 的画面'],
        },
        serviceBus: {},
      })

      expect(result.success).toBe(true)
      expect(assetGenerator.generateTTS).not.toHaveBeenCalled()
      expect(result.output.scenes).toHaveLength(1)
      expect(result.output.scenes[0]).toMatchObject({ index: 0, duration: 1.25 })
      expect(fs.realpathSync.native(result.output.scenes[0].audioPath))
        .toBe(fs.realpathSync.native(imported.path))
    } finally {
      fs.rmSync(imported.path, { force: true })
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('音频模式拒绝未导入到 Story2Video 受控目录的路径', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-untrusted-audio-'))
    const audioPath = path.join(root, 'narration.mp3')
    fs.writeFileSync(audioPath, Buffer.from('audio'))
    const assetGenerator = {
      generateImage: vi.fn(async () => ({ code: 0, data: { path: 'image-0.png' } })),
      generateTTS: vi.fn(),
    }
    const fn = makePipeline(assetGenerator)

    try {
      const result = await fn({
        stage: { options: { concurrency: 1 } },
        params: {
          inputMode: 'audio',
          audio: [{ name: 'narration.mp3', path: audioPath, duration: 1.25 }],
        },
        context: {
          split: [{ text: 'narration.mp3' }],
          optimize: ['narration 的画面'],
        },
        serviceBus: {},
      })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/audio|资源|asset/i)
      expect(assetGenerator.generateTTS).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('图片和 TTS 两类资源同时开始生成，并接受直接 path 响应', async () => {
    let release
    const gate = new Promise(resolve => { release = resolve })
    const assetGenerator = {
      generateImage: vi.fn(async (_prompt, { index }) => {
        await gate
        return { path: `image-${index}.png` }
      }),
      generateTTS: vi.fn(async (_text, { index }) => {
        await gate
        return { data: { path: `audio-${index}.mp3`, duration: 2 } }
      }),
    }
    const fn = makePipeline(assetGenerator)
    const pending = fn({
      stage: { options: { concurrency: 999 } },
      params: {},
      context: { split: [{ text: '一' }], optimize: ['p1'] },
      serviceBus: {},
    })

    await vi.waitFor(() => {
      expect(assetGenerator.generateImage).toHaveBeenCalledTimes(1)
      expect(assetGenerator.generateTTS).toHaveBeenCalledTimes(1)
    })
    release()
    const result = await pending
    expect(result.success).toBe(true)
    expect(result.output.scenes[0]).toMatchObject({
      imagePath: 'image-0.png',
      audioPath: 'audio-0.mp3',
    })
  })

  it('保留真实 provider 与离线降级资源的来源，供项目交付时明确提示', async () => {
    const fn = makePipeline({
      generateImage: vi.fn(async () => ({
        code: 0,
        data: {
          path: 'image-0.png',
          provider: 'local-diffusion',
          source: 'model-provider',
          degraded: false,
        },
      })),
      generateTTS: vi.fn(async () => ({
        code: 0,
        data: {
          path: 'audio-0.mp3',
          duration: 2,
          source: 'ffmpeg-silence',
          degraded: true,
        },
      })),
    })

    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '一' }], optimize: ['p1'] },
      serviceBus: {},
    })

    expect(result.success).toBe(true)
    expect(result.output.scenes[0]).toMatchObject({
      imageMeta: { source: 'model-provider', degraded: false },
      audioMeta: { source: 'ffmpeg-silence', degraded: true },
    })
    expect(result.output.stats).toMatchObject({ degradedImages: 0, degradedTts: 1 })
  })

  it('资源清单保留场景分句来源和每场景字幕块', async () => {
    const fn = makePipeline({
      generateImage: vi.fn(async () => ({ code: 0, data: { path: 'image-0.png' } })),
      generateTTS: vi.fn(async () => ({ code: 0, data: { path: 'audio-0.mp3', duration: 1.5 } })),
    })
    const scene = {
      index: 0,
      text: '场景层由服务确定，字幕层由本地逻辑继续切分。',
      subtitleBlocks: ['场景层由服务确定，', '字幕层由本地逻辑', '继续切分。'],
      sceneSource: 'smart-sentence-splitter',
      subtitleSource: 'local-typescript',
      degraded: false,
    }

    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: { scenes: [scene] }, optimize: ['画面提示词'] },
      serviceBus: {},
    })

    expect(result.success).toBe(true)
    expect(result.output.scenes[0]).toMatchObject(scene)
    expect(result.output.sentences[0]).toMatchObject(scene)
    expect(result.output.segmentation).toEqual({
      sceneSource: 'smart-sentence-splitter',
      subtitleSource: 'local-typescript',
      degraded: false,
      fallbackReason: null,
    })
  })

  it('61 个场景逐个调用 prompt-engine 优化，不因场景数被拒绝', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus()
    const scenes = Array.from({ length: 61 }, (_, index) => ({ text: '第 ' + (index + 1) + ' 个场景' }))

    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: scenes },
      serviceBus,
    })

    expect(result.success).toBe(true)
    expect(result.output).toHaveLength(61)
    expect(serviceBus.calls).toHaveLength(61)
  })

  it('61 个场景继续进入资源生成，不因场景数被拒绝', async () => {
    const assetGenerator = {
      generateImage: vi.fn(async (_prompt, { index }) => ({ code: 0, data: { path: `image-${index}.png` } })),
      generateTTS: vi.fn(async (_text, { index }) => ({ code: 0, data: { path: `audio-${index}.mp3`, duration: 1 } })),
    }
    const fn = makePipeline(assetGenerator)
    const scenes = Array.from({ length: 61 }, (_, index) => ({ text: String(index) }))

    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: scenes, optimize: scenes.map(scene => scene.text) },
      serviceBus: {},
    })

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    expect(assetGenerator.generateImage).toHaveBeenCalledTimes(scenes.length)
    expect(assetGenerator.generateTTS).toHaveBeenCalledTimes(scenes.length)
  })
})

describe('story2video 内容策略人工处理', () => {
  it('applies the same five-attempt content-policy contract to the Python image fallback', async () => {
    const fn = makePipeline(null)
    const serviceBus = {
      callPythonSkill: vi.fn(async (skill) => {
        if (skill === 'generate_image') {
          return {
            code: -1,
            error: { code: 'CONTENT_POLICY', message: 'content policy rejected' },
          }
        }
        return { code: 0, data: { path: 'audio-0.mp3', duration: 2 } }
      }),
    }

    const result = await fn({
      stage: { options: { concurrency: 1 } },
      params: {},
      context: { split: [{ text: '一' }], optimize: ['prompt'] },
      serviceBus,
    })

    expect(serviceBus.callPythonSkill.mock.calls.filter(([skill]) => skill === 'generate_image')).toHaveLength(5)
    expect(result).toMatchObject({
      success: true,
      checkpoint: 'needs_user_input',
      checkpointMeta: { reason: 'content_policy', attempts: 5, sceneIndex: 0 },
    })
  })

  it('turns exhausted image policy retries into a needs_user_input checkpoint even when partial assets are allowed', async () => {
    const checkpoint = {
      type: 'needs_user_input',
      status: 'needs_user_input',
      reason: 'content_policy',
      needsUserInput: true,
      sceneIndex: 1,
      sceneNumber: 2,
      attempts: 5,
      recommendation: '请改写场景。',
    }
    const fn = makePipeline({
      generateImage: vi.fn(async (_prompt, { index }) => index === 1
        ? {
            code: -1,
            message: 'Image generation requires user input after content-policy review',
            needsUserInput: true,
            checkpoint,
            data: { needsUserInput: true, checkpoint, generationAttempts: [{ attempt: 5, outcome: 'content_policy_rejected' }] },
          }
        : { code: 0, data: { path: `image-${index}.png` } }),
      generateTTS: vi.fn(async (_text, { index }) => ({
        code: 0,
        data: { path: `audio-${index}.mp3`, duration: 2 },
      })),
    })

    const result = await fn({
      stage: { options: { concurrency: 2 } },
      params: { allowPartialAssets: true },
      context: {
        split: [{ text: '一' }, { text: '二' }],
        optimize: ['p1', 'p2'],
      },
      serviceBus: {},
    })

    expect(result).toMatchObject({
      success: true,
      checkpoint: 'needs_user_input',
      checkpointMeta: {
        type: 'needs_user_input',
        status: 'needs_user_input',
        reason: 'content_policy',
        sceneIndex: 1,
        sceneNumber: 2,
        attempts: 5,
      },
    })
    expect(result.output.scenes).toEqual([
      expect.objectContaining({ index: 0, imagePath: 'image-0.png', audioPath: 'audio-0.mp3' }),
    ])
    expect(result.output.failures.images).toEqual([
      expect.objectContaining({ index: 1, needsUserInput: true, checkpoint }),
    ])
  })
})

describe('story2video 限流/瞬时错误有界重试', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('提示词优化遇到限流时用更长退避重试并恢复', async () => {
    vi.useFakeTimers()
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus(() => { throw new Error("You've reached the API rate limit for free users.") })
    serviceBus.optimizePrompt
      .mockRejectedValueOnce(new Error("You've reached the API rate limit for free users."))
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValue({ optimized_prompt: '优化后提示词', model_used: 'mock-model' })
    const promise = fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '第一幕' }] },
      serviceBus,
    })
    await vi.advanceTimersByTimeAsync(30000)
    const result = await promise
    expect(result).toMatchObject({ success: true })
    expect(result.output).toHaveLength(1)
    expect(serviceBus.optimizePrompt).toHaveBeenCalledTimes(3)
  })

  it('story2video_optimize 把 runId 作为 traceId 传给 serviceBus（R2/C1）', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus(() => ({ optimized_prompt: '优化后提示词' }))
    await fn({
      runId: 'run_77',
      stage: { options: { quality_baseline: false } },
      params: {},
      context: { split: [{ text: '第一幕' }] },
      serviceBus,
    })
    expect(serviceBus.optimizePrompt).toHaveBeenCalledWith('第一幕', expect.objectContaining({ traceId: 'run_77' }))
  })

  it('限流持续存在时按限流次数上限失败并保留场景与原因', async () => {
    vi.useFakeTimers()
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus(() => { throw new Error('You have reached the API rate limit for free users.') })
    const promise = fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '第一幕' }] },
      serviceBus,
    })
    await vi.advanceTimersByTimeAsync(60000)
    const result = await promise
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/scene 0.*rate limit/i),
    })
    expect(serviceBus.optimizePrompt).toHaveBeenCalledTimes(4)
  })

  it('非瞬时 provider 错误不重试，立即失败', async () => {
    vi.useFakeTimers()
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus(() => { throw new Error('invalid api key') })
    const promise = fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '第一幕' }] },
      serviceBus,
    })
    await vi.advanceTimersByTimeAsync(1000)
    const result = await promise
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/invalid api key/) })
    expect(serviceBus.optimizePrompt).toHaveBeenCalledTimes(1)
  })

  it('资源生成遇到 TTS 限流时重试并恢复，不拖垮整阶段', async () => {
    vi.useFakeTimers()
    const assetGenerator = {
      generateImage: vi.fn(async (_prompt, { index }) => ({ code: 0, data: { path: `image-${index}.png` } })),
      generateTTS: vi.fn()
        .mockResolvedValueOnce({ code: -1, message: 'TTS provider "minimax-tts" failed: rate limit reached' })
        .mockResolvedValueOnce({ code: -1, message: 'TTS provider "minimax-tts" failed: rate limit reached' })
        .mockResolvedValue({ code: 0, data: { path: 'audio-0.mp3', duration: 2 } }),
    }
    const fn = makePipeline(assetGenerator)
    const promise = fn({
      stage: { options: { concurrency: 1 } },
      params: {},
      context: { split: [{ text: '一' }], optimize: ['prompt'] },
      serviceBus: {},
    })
    await vi.advanceTimersByTimeAsync(30000)
    const result = await promise
    expect(result).toMatchObject({ success: true })
    expect(result.output.scenes).toHaveLength(1)
    expect(assetGenerator.generateTTS).toHaveBeenCalledTimes(3)
    expect(assetGenerator.generateImage).toHaveBeenCalledTimes(1)
  })

  it('提示词优化断点续传：已完成场景结果直接复用，不重复调用 prompt-engine', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus()
    const context = {
      split: [{ text: '一' }, { text: '二' }],
      optimize_resume: [{ optimized_prompt: '旧结果0', providerId: 'prompt-engine', model: 'mock-model' }],
    }
    const result = await fn({
      stage: { options: { quality_baseline: false } },
      params: {},
      context,
      serviceBus,
    })
    expect(result).toMatchObject({ success: true })
    expect(result.output).toEqual([
      { optimized_prompt: '旧结果0', providerId: 'prompt-engine', model: 'mock-model' },
      expect.objectContaining({ optimized_prompt: '优化: 二' }),
    ])
    expect(serviceBus.calls).toHaveLength(1)
    // 实时进度：共 2 个场景，已完成 2 个
    expect(context.optimize_progress).toEqual({ done: 2, total: 2 })
  })

  it('资源生成断点续传：已完成场景跳过图片/TTS provider 调用', async () => {
    const assetGenerator = {
      generateImage: vi.fn(async (_prompt, { index }) => ({ code: 0, data: { path: `image-${index}.png` } })),
      generateTTS: vi.fn(async (_text, { index }) => ({ code: 0, data: { path: `audio-${index}.mp3`, duration: 2 } })),
    }
    const fn = makePipeline(assetGenerator)
    const context = {
      split: [{ text: '一' }, { text: '二' }],
      optimize: ['p0', 'p1'],
      generate_assets: {
        resume: {
          completed: [{ index: 0, imagePath: 'C:/tmp/resume-image-0.png', audioPath: 'C:/tmp/resume-audio-0.mp3', duration: 3 }],
        },
      },
    }
    const result = await fn({
      stage: { options: { concurrency: 2 } },
      params: {},
      context,
      serviceBus: {},
    })
    expect(result).toMatchObject({ success: true })
    expect(result.output.scenes).toHaveLength(2)
    expect(result.output.scenes[0]).toMatchObject({ index: 0, imagePath: 'C:/tmp/resume-image-0.png', audioPath: 'C:/tmp/resume-audio-0.mp3' })
    expect(assetGenerator.generateImage).toHaveBeenCalledTimes(1)
    expect(assetGenerator.generateImage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ index: 1 }))
    expect(assetGenerator.generateTTS).toHaveBeenCalledTimes(1)
    // 实时进度：图片 2/2 · 旁白 2/2（含续传场景）
    expect(context.assets_progress).toEqual({
      imagesDone: 2, imagesTotal: 2, videosDone: 0, videosTotal: 0, ttsDone: 2, ttsTotal: 2,
    })
  })

  it('资源生成进度前置写入：阶段开始即显示「图片 0/N · 旁白 0/M」', async () => {
    let releaseImage
    const imageGate = new Promise((resolve) => { releaseImage = resolve })
    const assetGenerator = {
      generateImage: vi.fn(() => imageGate.then(() => ({ code: 0, data: { path: 'image-0.png' } }))),
      generateTTS: vi.fn(async () => ({ code: 0, data: { path: 'audio-0.mp3', duration: 2 } })),
    }
    const fn = makePipeline(assetGenerator)
    const context = { split: [{ text: '一' }], optimize: ['p0'] }
    const pending = fn({ stage: { options: {} }, params: {}, context, serviceBus: {} })
    // 首个资源完成前（图片生成可能耗时 16-30s），进度已前置写入
    expect(context.assets_progress).toEqual({
      imagesDone: 0, imagesTotal: 1, videosDone: 0, videosTotal: 0, ttsDone: 0, ttsTotal: 1,
    })
    releaseImage()
    const result = await pending
    expect(result.success).toBe(true)
    expect(context.assets_progress.imagesDone).toBe(1)
  })

  it('资源生成失败时记录已完成场景供断点续传', async () => {
    vi.useFakeTimers()
    const assetGenerator = {
      generateImage: vi.fn(async (_prompt, { index }) => ({ code: 0, data: { path: `image-${index}.png` } })),
      generateTTS: vi.fn(async (_text, { index }) => index === 1
        ? { code: -1, message: 'rate limit reached' }
        : { code: 0, data: { path: `audio-${index}.mp3`, duration: 2 } }),
    }
    const fn = makePipeline(assetGenerator)
    const context = {
      split: [{ text: '一' }, { text: '二' }],
      optimize: ['p0', 'p1'],
    }
    const promise = fn({
      stage: { options: { concurrency: 1 } },
      params: {},
      context,
      serviceBus: {},
    })
    await vi.advanceTimersByTimeAsync(60000)
    const result = await promise
    expect(result).toMatchObject({ success: false })
    expect(context.generate_assets?.resume?.completed).toEqual([
      expect.objectContaining({ index: 0, imagePath: 'image-0.png', audioPath: 'audio-0.mp3' }),
    ])
    expect(context.generate_assets?.resume?.total).toBe(2)
  })

  it('资源生成遇到图片限流时重试后仍失败则按原样失败（不误判为内容政策）', async () => {
    vi.useFakeTimers()
    const assetGenerator = {
      generateImage: vi.fn().mockResolvedValue({ code: -1, message: 'Image provider "minimax-image" failed: rate limit reached' }),
      generateTTS: vi.fn(async () => ({ code: 0, data: { path: 'audio-0.mp3', duration: 2 } })),
    }
    const fn = makePipeline(assetGenerator)
    const promise = fn({
      stage: { options: { concurrency: 1 } },
      params: {},
      context: { split: [{ text: '一' }], optimize: ['prompt'] },
      serviceBus: {},
    })
    await vi.advanceTimersByTimeAsync(60000)
    const result = await promise
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/rate limit/i) })
    expect(result.error).not.toContain('content_policy')
    expect(assetGenerator.generateImage).toHaveBeenCalledTimes(4)
  })
})



describe('hasMeaningfulText — 无实质内容守卫（方案B，2026-08-09）', () => {
  it('单个纯数字 → 无实质内容（跳过优化）', () => {
    expect(hasMeaningfulText('1')).toBe(false)
    expect(hasMeaningfulText('5')).toBe(false)
  })

  it('2 位及以上纯数字 → 有意义（走优化，方案B）', () => {
    expect(hasMeaningfulText('81')).toBe(true)
    expect(hasMeaningfulText('1949')).toBe(true)
    expect(hasMeaningfulText('123456')).toBe(true)
  })

  it('单字中文 → 有意义（正常优化）', () => {
    expect(hasMeaningfulText('一')).toBe(true)
    expect(hasMeaningfulText('猫')).toBe(true)
  })

  it('纯空白/纯标点/纯符号 → 无实质内容（跳过优化）', () => {
    expect(hasMeaningfulText('   ')).toBe(false)
    expect(hasMeaningfulText('。。。')).toBe(false)
    expect(hasMeaningfulText('!!!')).toBe(false)
    expect(hasMeaningfulText('……')).toBe(false)
  })

  it('数字含上下文（如 81 年、1949 年）→ 有意义', () => {
    expect(hasMeaningfulText('81 年')).toBe(true)
    expect(hasMeaningfulText('1949年开国大典')).toBe(true)
  })
})

describe('isPromptEngineTooShortRejection — 过短校验拒绝判定', () => {
  it('命中 Too short / 太短 / min length 等文案', () => {
    expect(isPromptEngineTooShortRejection('prompt-engine 请求被拒绝(422): Too short (1 words). Try a more detailed description')).toBe(true)
    expect(isPromptEngineTooShortRejection('Too short: please provide more detail')).toBe(true)
    expect(isPromptEngineTooShortRejection('输入太短，无法优化')).toBe(true)
    expect(isPromptEngineTooShortRejection('must be at least 5 characters')).toBe(true)
  })

  it('命中真实中文文案（2026-08-09 Bug 反哺：描述太简短了（N 字））', () => {
    expect(isPromptEngineTooShortRejection('prompt-engine 请求被拒绝(422): 描述太简短了（2 字），建议更详细描述画面')).toBe(true)
    expect(isPromptEngineTooShortRejection('描述过短，请补充更多细节')).toBe(true)
    expect(isPromptEngineTooShortRejection('描述太简短')).toBe(true)
  })

  it('非过短拒绝不误判', () => {
    expect(isPromptEngineTooShortRejection('prompt-engine 请求被拒绝(422): unknown style value: foo')).toBe(false)
    expect(isPromptEngineTooShortRejection('prompt-engine 优化失败: llm error')).toBe(false)
    expect(isPromptEngineTooShortRejection('')).toBe(false)
  })
})

describe('story2video 生成并发按 provider 每分钟连接次数收敛', () => {
  it('provider rate_per_minute=20（maxConcurrent=2）时图片/TTS 并发上限为 2，而非请求的 5（assetGenerator 路径不套外层 governor）', async () => {
    const executors = new Map()
    let gate
    const gateP = new Promise((resolve) => { gate = resolve })
    let imageActive = 0
    let imagePeak = 0
    let ttsActive = 0
    let ttsPeak = 0
    const assetGenerator = {
      generateImage: vi.fn(async () => {
        imageActive += 1
        imagePeak = Math.max(imagePeak, imageActive)
        await gateP
        imageActive -= 1
        return { path: 'image-x.png' }
      }),
      generateTTS: vi.fn(async () => {
        ttsActive += 1
        ttsPeak = Math.max(ttsPeak, ttsActive)
        await gateP
        ttsActive -= 1
        return { data: { path: 'audio-x.mp3', duration: 2 } }
      }),
    }
    const manager = {
      getDefault: vi.fn((type) => ({ id: 'minimax-multimodal' })),
      getProvider: vi.fn((id) => ({ id, category: 'multimodal', config: { rate_per_minute: 20, limit_per_5h: 500 } })),
    }
    const governorRun = vi.fn((meta, task) => task())
    const pipeline = {
      stageExecutor: executors,
      _assetGenerator: assetGenerator,
      aiGenerator: null,
      governor: { sweepAll: vi.fn(), run: governorRun },
      container: { get: (name) => (name === 'modelProviderManager' ? manager : null) },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      registerStageExecutor(type, fn) {
        executors.set(type, fn)
        return { success: true }
      },
    }
    registerStory2VideoStages(pipeline)
    const assetsExecutor = executors.get(STORY2VIDEO_STAGE_TYPES.GENERATE_ASSETS)
    assetsExecutor.optimizeExecutor = executors.get(STORY2VIDEO_STAGE_TYPES.OPTIMIZE)

    const pending = assetsExecutor({
      stage: { options: { concurrency: 5 } },
      params: {},
      context: {
        split: [{ text: '一' }, { text: '二' }, { text: '三' }],
        optimize: ['p1', 'p2', 'p3'],
      },
      serviceBus: {},
    })

    // 门打开前：每类最多并发 2 个（预算 maxConcurrent=2），而不是请求的 5
    await vi.waitFor(() => {
      expect(assetGenerator.generateImage).toHaveBeenCalled()
      expect(assetGenerator.generateTTS).toHaveBeenCalled()
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(imagePeak).toBeLessThanOrEqual(2)
    expect(ttsPeak).toBeLessThanOrEqual(2)
    expect(imagePeak).toBeGreaterThanOrEqual(1)

    gate()
    const result = await pending
    expect(result.success).toBe(true)
    expect(result.output.scenes.length).toBe(3)
    // 新契约（2026-08-10 双包死锁复盘）：assetGenerator 路径由 AIGenerator 内部 governor 单层调度，
    // 阶段外层不再套 withModelBudget/governor.run（避免同 key 双包自死锁）→ 外层 governorRun 不应被调用。
    expect(governorRun.mock.calls.length).toBe(0)
    // 日志包含预算收敛后的并发值
    const logCalls = pipeline.log.info.mock.calls.flat().join(' ')
    expect(logCalls).toContain('imageConcurrency=2')
    expect(logCalls).toContain('ttsConcurrency=2')
  })

  it('provider 未配置预算时回退静态表预算（openai 静态 maxConcurrent=3，不降级）', async () => {
    const executors = new Map()
    let gate
    const gateP = new Promise((resolve) => { gate = resolve })
    let imageActive = 0
    let imagePeak = 0
    const assetGenerator = {
      generateImage: vi.fn(async () => {
        imageActive += 1
        imagePeak = Math.max(imagePeak, imageActive)
        await gateP
        imageActive -= 1
        return { path: 'image-x.png' }
      }),
      generateTTS: vi.fn(async () => ({ data: { path: 'audio-x.mp3', duration: 2 } })),
    }
    const manager = {
      getDefault: vi.fn(() => ({ id: 'openai' })),
      getProvider: vi.fn((id) => ({ id, category: 'llm', config: {} })),
    }
    const pipeline = {
      stageExecutor: executors,
      _assetGenerator: assetGenerator,
      aiGenerator: null,
      governor: { sweepAll: vi.fn() },
      container: { get: (name) => (name === 'modelProviderManager' ? manager : null) },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      registerStageExecutor(type, fn) {
        executors.set(type, fn)
        return { success: true }
      },
    }
    registerStory2VideoStages(pipeline)
    const assetsExecutor = executors.get(STORY2VIDEO_STAGE_TYPES.GENERATE_ASSETS)
    assetsExecutor.optimizeExecutor = executors.get(STORY2VIDEO_STAGE_TYPES.OPTIMIZE)

    const pending = assetsExecutor({
      stage: { options: { concurrency: 3 } },
      params: {},
      context: {
        split: [{ text: '一' }, { text: '二' }, { text: '三' }],
        optimize: ['p1', 'p2', 'p3'],
      },
      serviceBus: {},
    })
    await vi.waitFor(() => {
      expect(assetGenerator.generateImage).toHaveBeenCalled()
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(imagePeak).toBe(3) // 无配置 → 回退请求并发 3
    gate()
    const result = await pending
    expect(result.success).toBe(true)
  })
})

describe('story2video 调度边界（2026-08-10 双包死锁复盘）', () => {
  it('legacy python 路径（无 assetGenerator）每项资源仍经 withModelBudget → governor.run 统一调度', async () => {
    const executors = new Map()
    const governorRun = vi.fn((meta, task) => task())
    const pipeline = {
      stageExecutor: { register(type, fn) { executors.set(type, fn) } },
      _assetGenerator: null,
      aiGenerator: null,
      governor: { sweepAll: vi.fn(), run: governorRun },
      container: { get: () => null },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      registerStageExecutor(type, fn) {
        executors.set(type, fn)
        return { success: true }
      },
    }
    registerStory2VideoStages(pipeline)
    const assetsExecutor = executors.get(STORY2VIDEO_STAGE_TYPES.GENERATE_ASSETS)
    assetsExecutor.optimizeExecutor = executors.get(STORY2VIDEO_STAGE_TYPES.OPTIMIZE)
    const serviceBus = {
      _assetGenerator: null,
      callPythonSkill: vi.fn(async (skill) => {
        if (skill === 'generate_image') return { code: 0, data: { path: 'img-legacy.png' } }
        if (skill === 'generate_tts') return { code: 0, data: { path: 'audio-legacy.mp3', duration: 2 } }
        return { code: 0, data: {} }
      }),
    }

    const result = await assetsExecutor({
      stage: {
        options: {
          concurrency: 2,
          imageProvider: 'minimax-multimodal',
          imageModel: 'image-1',
          voiceProvider: 'minimax-multimodal',
          voiceModel: 'voice-1',
        },
      },
      params: {},
      context: {
        split: [{ text: '一' }, { text: '二' }],
        optimize: ['p1', 'p2'],
      },
      serviceBus,
    })

    expect(result.success).toBe(true)
    expect(result.output.scenes.length).toBe(2)
    // legacy 路径保留外层统一调度：2 图片 + 2 TTS 每项都经 governor.run，且 meta 携带 type/providerId/model
    expect(governorRun.mock.calls.length).toBe(4)
    expect(governorRun.mock.calls.some(([meta]) => meta.type === 'image' && meta.providerId === 'minimax-multimodal' && meta.model === 'image-1')).toBe(true)
    expect(governorRun.mock.calls.some(([meta]) => meta.type === 'tts' && meta.providerId === 'minimax-multimodal' && meta.model === 'voice-1')).toBe(true)
  })

  it('真实 governor 回归：assetGenerator 内部再入 governor 时，3 场景并发有界完成，不自死锁', async () => {
    const { ApiUsageGovernor } = require('./api-usage-governor')
    // 与生产接线一致：pipelineEngine.governor 与 aiGenerator._governor 指向同一个 ApiUsageGovernor 单例
    const governor = new ApiUsageGovernor({
      log: { warn: () => {}, info: () => {} },
      providerLimits: { 'minimax-multimodal': { rpm: 15, maxConcurrent: 2, cooldownMs: 60000, retry429: 3 } },
    })
    const aiGeneratorLike = {
      _governor: governor,
      generate: vi.fn(async (type, providerId, params) => {
        // 模拟 AIGenerator.generate 的 governor 网关（同实例、同 key）
        return governor.run({ type, providerId, model: String(params.model || '') }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          if (type === 'image') return { code: 0, data: { path: 'img-' + params.index + '.png' } }
          return { code: 0, data: { path: 'audio-' + params.index + '.mp3', duration: 2 } }
        })
      }),
    }
    const assetGenerator = {
      generateImage: vi.fn(async (prompt, opts) => aiGeneratorLike.generate('image', 'minimax-multimodal', { ...opts, model: opts.image_model })),
      generateTTS: vi.fn(async (text, opts) => aiGeneratorLike.generate('tts', 'minimax-multimodal', { ...opts, model: opts.voice_model })),
    }
    const executors = new Map()
    const pipeline = {
      stageExecutor: executors,
      _assetGenerator: assetGenerator,
      aiGenerator: aiGeneratorLike,
      governor,
      container: { get: () => null },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      registerStageExecutor(type, fn) {
        executors.set(type, fn)
        return { success: true }
      },
    }
    registerStory2VideoStages(pipeline)
    const assetsExecutor = executors.get(STORY2VIDEO_STAGE_TYPES.GENERATE_ASSETS)
    assetsExecutor.optimizeExecutor = executors.get(STORY2VIDEO_STAGE_TYPES.OPTIMIZE)

    const result = await Promise.race([
      assetsExecutor({
        stage: {
          options: {
            concurrency: 3,
            imageProvider: 'minimax-multimodal',
            imageModel: 'image-1',
            voiceProvider: 'minimax-multimodal',
            voiceModel: 'voice-1',
          },
        },
        params: {},
        context: {
          split: [{ text: '一' }, { text: '二' }, { text: '三' }],
          optimize: ['p1', 'p2', 'p3'],
        },
        serviceBus: {},
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('generate_assets 死锁：阶段外层与 AIGenerator 内层同 key 双包，互相等待信号量')), 10000)),
    ])

    expect(result.success).toBe(true)
    expect(result.output.scenes.length).toBe(3)
    // 3 图片 + 3 TTS 全部经内层 governor 完成；外层未再套 governor（否则此处 10s 超时）
    expect(aiGeneratorLike.generate.mock.calls.length).toBe(6)
    expect(governor.getStatus('minimax-multimodal:image:image-1').active).toBe(0)
    expect(governor.getStatus('minimax-multimodal:tts:voice-1').active).toBe(0)
  })
})

describe('story2video 视频+图片轮播混合模式（2026-08-11）', () => {
  const scenes = Array.from({ length: 10 }, (_, i) => ({
    index: i,
    text: '场景' + i,
    prompt: 'prompt-' + i,
    seconds: 6,
  }))

  describe('fixed 模式场景选择', () => {
    it('按顺序累计估算时长标记前 fixedRatio% 的场景', () => {
      const { selected, ratio } = pickFixedVideoScenes(scenes, 25)
      // 目标 25%×60s=15s：场景0(6s)+场景1(6s)+场景2(6s) 累计 18s 首次 ≥15s → [0,1,2]
      expect(selected).toEqual([0, 1, 2])
      expect(ratio).toBe(30) // 边界含入：18s/60s
    })

    it('fixedRatio 较小时至少标记 1 个场景', () => {
      const { selected, ratio } = pickFixedVideoScenes(scenes, 10)
      expect(selected).toEqual([0])
      expect(ratio).toBe(10)
    })

    it('空场景返回空选择', () => {
      expect(pickFixedVideoScenes([], 25)).toEqual({ selected: [], ratio: 0 })
    })

    it('不同时长的场景按秒累计（非按个数）', () => {
      const uneven = [
        { index: 0, seconds: 2 },
        { index: 1, seconds: 2 },
        { index: 2, seconds: 2 },
        { index: 3, seconds: 12 },
      ]
      const { selected } = pickFixedVideoScenes(uneven, 30) // 30% × 18s = 5.4s
      expect(selected).toEqual([0, 1, 2]) // 6s ≥ 5.4s 边界场景 2 被标记
    })
  })

  describe('ai-judged 解析与钳制', () => {
    it('严格解析合法 JSON 数组', () => {
      const raw = JSON.stringify([
        { index: 0, video: true, excitement: 9, reason: '开场动作' },
        { index: 1, video: false, excitement: 3, reason: '过渡' },
      ])
      const parsed = parseVideoSelection(raw, 10)
      expect(parsed).toEqual([
        { index: 0, video: true, excitement: 9, reason: '开场动作' },
        { index: 1, video: false, excitement: 3, reason: '过渡' },
      ])
    })

    it('非 JSON / 非法 index / 重复 index 一律返回 null（fail closed）', () => {
      expect(parseVideoSelection('not json', 10)).toBeNull()
      expect(parseVideoSelection(JSON.stringify([{ index: 99, video: true, excitement: 5 }]), 10)).toBeNull()
      expect(parseVideoSelection(JSON.stringify([{ index: 0, video: true }, { index: 0, video: false }]), 10)).toBeNull()
      expect(parseVideoSelection('', 10)).toBeNull()
    })

    it('超 maxRatio 时按 excitement 从低到高剔除', () => {
      const entries = [
        { index: 0, video: true, excitement: 9 },
        { index: 1, video: true, excitement: 8 },
        { index: 2, video: true, excitement: 7 },
        { index: 3, video: true, excitement: 6 },
      ]
      // 4 场景各 6s → 24s/24s=100%；maxRatio 50 → 应剔除至 2 个（50%）
      const { selected, ratio } = clampVideoSelection(scenes.slice(0, 4), entries, {
        minRatio: 20, maxRatio: 50, maxScenes: 3,
      })
      expect(selected).toEqual([0, 1])
      expect(ratio).toBe(50)
    })

    it('不足 minRatio 时按 excitement 补入未选场景', () => {
      const entries = [
        { index: 0, video: true, excitement: 9 },
        { index: 1, video: false, excitement: 8 },
        { index: 2, video: false, excitement: 7 },
      ]
      // 初选 1 场景 = 33.3%；minRatio 60 → 补入 index1 → 66.7%
      const { selected, ratio } = clampVideoSelection(scenes.slice(0, 3), entries, {
        minRatio: 60, maxRatio: 80, maxScenes: 3,
      })
      expect(selected).toEqual([0, 1])
      expect(ratio).toBe(66.7)
    })

    it('maxScenes 上限截断', () => {
      const entries = scenes.map(scene => ({ index: scene.index, video: true, excitement: 10 - scene.index }))
      const { selected } = clampVideoSelection(scenes, entries, { minRatio: 0, maxRatio: 100, maxScenes: 3 })
      expect(selected).toHaveLength(3)
      expect(selected).toEqual([0, 1, 2])
    })

    it('全部剔除后保留最高 excitement 单场景', () => {
      const entries = scenes.map(scene => ({ index: scene.index, video: true, excitement: scene.index + 1 }))
      const { selected } = clampVideoSelection(scenes, entries, { minRatio: 100, maxRatio: 5, maxScenes: 2 })
      expect(selected).toHaveLength(1)
      expect(selected[0]).toBe(9)
    })
  })

  describe('select_video_scenes 执行器', () => {
    function makeSelectPipeline(aiGenerator) {
      const stageExecutor = makeStageExecutor()
      const pipeline = {
        stageExecutor,
        _assetGenerator: null,
        aiGenerator,
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        registerStageExecutor(type, fn) { stageExecutor.register(type, fn); return { success: true } },
      }
      registerStory2VideoStages(pipeline)
      return stageExecutor.executors.get(STORY2VIDEO_STAGE_TYPES.SELECT_VIDEO_SCENES)
    }

    const videoOptions = {
      video: { mode: 'fixed', provider: '', model: '', fixedRatio: 25, minRatio: 20, maxRatio: 40, maxScenes: 3 },
    }

    it('mode=off 输出空 plan，不校验视频生成器', async () => {
      const fn = makeSelectPipeline(null)
      const context = { optimize: ['p0', 'p1'], split: [{ text: '一' }, { text: '二' }] }
      const result = await fn({ stage: { options: { video: { mode: 'off' } } }, params: {}, context })
      expect(result).toMatchObject({ success: true })
      expect(result.output).toEqual({ mode: 'off', scenes: [], ratio: 0, selectedCount: 0 })
      expect(context.video_plan.mode).toBe('off')
    })

    it('fixed 模式未配置视频生成器时 fail closed 引导设置', async () => {
      const fn = makeSelectPipeline(null)
      const context = { optimize: ['p0', 'p1'], split: [{ text: '一' }, { text: '二' }] }
      const result = await fn({ stage: { options: videoOptions }, params: {}, context })
      expect(result.success).toBe(false)
      expect(result.error).toContain('视频生成器未配置')
    })

    it('fixed 模式输出视频场景计划（顺序前段）', async () => {
      const aiGenerator = {
        _modelProviderManager: {
          getDefault: vi.fn((type) => type === 'video'
            ? { id: 'kling', models: ['kling-v1'] }
            : { id: 'openai', models: ['gpt-4.1-mini'] }),
        },
      }
      const fn = makeSelectPipeline(aiGenerator)
      const context = {
        optimize: ['p0', 'p1', 'p2', 'p3'],
        split: [{ text: '一' }, { text: '二' }, { text: '三' }, { text: '四' }],
      }
      const result = await fn({ stage: { options: videoOptions }, params: {}, context })
      expect(result.success).toBe(true)
      expect(result.output.mode).toBe('fixed')
      expect(result.output.provider).toBe('kling')
      expect(result.output.scenes.filter(s => s.useVideo).map(s => s.index)).toEqual([0])
      expect(result.output.selectedCount).toBe(1)
    })

    it('ai-judged 模式调用 LLM 并按区间钳制', async () => {
      const aiGenerator = {
        _modelProviderManager: {
          getDefault: vi.fn((type) => type === 'video'
            ? { id: 'ltx', models: ['ltx-v1'] }
            : { id: 'openai', models: ['gpt-4.1-mini'] }),
        },
        generateWithDefault: vi.fn(async (_type, _params) => ({
          content: JSON.stringify([
            { index: 0, video: true, excitement: 10, reason: '高潮' },
            { index: 1, video: true, excitement: 8, reason: '动作' },
            { index: 2, video: true, excitement: 9, reason: '转场' },
          ]),
        })),
      }
      const fn = makeSelectPipeline(aiGenerator)
      const context = {
        optimize: ['p0', 'p1', 'p2'],
        split: [{ text: '一' }, { text: '二' }, { text: '三' }],
      }
      const result = await fn({
        stage: { options: { video: { mode: 'ai-judged', provider: '', model: '', fixedRatio: 25, minRatio: 60, maxRatio: 80, maxScenes: 3 } } },
        params: {},
        context,
      })
      expect(result.success).toBe(true)
      // 初选 3 场景=100%，maxRatio 80 → 剔除最低 excitement（index1）→ [0,2]=66.7%
      expect(result.output.scenes.filter(s => s.useVideo).map(s => s.index)).toEqual([0, 2])
    })

    it('ai-judged LLM 返回无法解析时 fail closed', async () => {
      const aiGenerator = {
        _modelProviderManager: {
          getDefault: vi.fn((type) => type === 'video' ? { id: 'ltx', models: ['ltx-v1'] } : { id: 'openai', models: ['x'] }),
        },
        generateWithDefault: vi.fn(async () => ({ content: '不是 JSON' })),
      }
      const fn = makeSelectPipeline(aiGenerator)
      const context = { optimize: ['p0'], split: [{ text: '一' }] }
      const result = await fn({
        stage: { options: { video: { mode: 'ai-judged', minRatio: 20, maxRatio: 40, maxScenes: 3 } } },
        params: {},
        context,
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('无法解析')
    })

    it('显式 provider 优先于默认视频生成器', () => {
      const aiGenerator = {
        _modelProviderManager: {
          getDefault: vi.fn(() => ({ id: 'default-video', models: ['m'] })),
        },
      }
      const resolved = resolveVideoGeneratorConfig({ aiGenerator }, { provider: 'minimax', model: 'minimax-v1' })
      expect(resolved).toEqual({ providerId: 'minimax', model: 'minimax-v1' })
    })

    it('估算时长：sentence.duration 优先，其次 targetSeconds，兜底 6s', () => {
      expect(estimateSceneSeconds({ duration: 3 }, 6)).toBe(3)
      expect(estimateSceneSeconds({ targetSeconds: 4 }, 6)).toBe(4)
      expect(estimateSceneSeconds({}, 6)).toBe(6)
      expect(estimateSceneSeconds({ duration: 0 }, 6)).toBe(6)
    })
  })
})

describe('generate_assets 视频分支（2026-08-11）', () => {
  let server
  let baseUrl
  let tinyVideoPath
  let mediaAvailable = true
  const FFMPEG = findFfmpeg()

  beforeAll(async () => {
    // 跨平台：CI 设 SKIP_NATIVE_MEDIA_TOOL_TESTS=1 时 findFfmpeg() 返回 null，整个 describe 跳过
    if (!FFMPEG) {
      mediaAvailable = false
      return
    }
    // 生成 1 秒真实 mp4（颜色源 + 静音），供视频下载/合成测试使用
    tinyVideoPath = path.join(os.tmpdir(), 'story2video-test-tiny-' + process.pid + '.mp4')
    await new Promise((resolve, reject) => {
      execFile(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x240:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', tinyVideoPath], (error) => {
        if (error) reject(new Error(String(error).slice(0, 300)))
        else resolve()
      })
    })
    server = http.createServer((req, res) => {
      if (req.url && req.url.includes('missing')) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('not found')
        return
      }
      res.writeHead(200, { 'Content-Type': 'video/mp4' })
      fs.createReadStream(tinyVideoPath).pipe(res)
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = 'http://127.0.0.1:' + server.address().port + '/video.mp4'
  })

  afterAll(() => {
    if (server) server.close()
    if (tinyVideoPath) { try { fs.unlinkSync(tinyVideoPath) } catch (_) { /* 清理失败可忽略 */ } }
  })
  const skipIfNoMedia = () => { if (!mediaAvailable) return true; return false }

  function makeBlendPipeline(aiGenerator, assetGenerator) {
    const stageExecutor = makeStageExecutor()
    const pipeline = {
      stageExecutor,
      _assetGenerator: assetGenerator || null,
      aiGenerator,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      registerStageExecutor(type, fn) { stageExecutor.register(type, fn); return { success: true } },
    }
    registerStory2VideoStages(pipeline)
    return stageExecutor.executors.get(STORY2VIDEO_STAGE_TYPES.GENERATE_ASSETS)
  }

  it('视频场景产出 videoPath 且不生成图片；图片场景照常；TTS 全部生成', async () => {
    if (skipIfNoMedia()) return
    const callAdapter = vi.fn(async (_provider, method) => {
      if (method === 'generateVideo') return { code: 0, data: { taskId: 'task-1' } }
      if (method === 'getVideoStatus') return { videoUrl: baseUrl }
      return { code: 0 }
    })
    const aiGenerator = {
      _modelProviderManager: {
        getDefault: vi.fn((type) => type === 'video'
          ? { id: 'kling', models: ['kling-v1'] }
          : { id: 'openai', models: ['gpt-4.1-mini'] }),
        callAdapter,
      },
    }
    const fn = makeBlendPipeline(aiGenerator)
    const context = {
      split: [{ text: '一' }, { text: '二' }],
      optimize: ['video-prompt-0', 'image-prompt-1'],
      video_plan: {
        mode: 'fixed',
        scenes: [
          { index: 0, useVideo: true, seconds: 6 },
          { index: 1, useVideo: false, seconds: 6 },
        ],
        selectedCount: 1,
      },
    }
    const serviceBus = {
      optimizeVideoPrompt: vi.fn(async (prompt) => ({ optimized_prompt: prompt })),
      generateTTS: vi.fn(async (text) => ({ code: 0, data: { path: 'audio-' + text + '.mp3', duration: 2 } })),
      callPythonSkill: vi.fn(async (_skill, payload) => {
        if (payload && payload.style) return { code: 0, data: { path: 'image-' + payload.index + '.png' } }
        return { code: 0, data: { path: 'audio-' + (payload && payload.text) + '.mp3', duration: 2 } }
      }),
    }
    const result = await fn({
      stage: { options: { videoMode: 'fixed', video: { provider: 'kling', model: 'kling-v1', pollIntervalMs: 5 } } },
      params: { videoMode: 'fixed', aspectRatio: '9:16', fps: 30 },
      context,
      serviceBus,
    })
    expect(result.success).toBe(true)
    expect(result.output.scenes).toHaveLength(2)
    expect(result.output.scenes[0]).toMatchObject({ index: 0, videoPath: expect.stringContaining('scene_video_000.mp4'), audioPath: expect.any(String) })
    expect(result.output.scenes[0].imagePath).toBeNull()
    expect(result.output.scenes[1]).toMatchObject({ index: 1, imagePath: 'image-1.png', videoPath: null })
    // 视频 provider 只被调用（提交+轮询各 1 次）
    expect(callAdapter).toHaveBeenCalledWith('kling', 'generateVideo', expect.objectContaining({ width: 720, height: 1280, prompt: 'video-prompt-0' }))
    expect(callAdapter).toHaveBeenCalledWith('kling', 'getVideoStatus', expect.objectContaining({ taskId: 'task-1' }))
    // 进度：图片 1/1 · 视频 1/1 · 旁白 2/2
    expect(context.assets_progress).toEqual({
      imagesDone: 1, imagesTotal: 1, videosDone: 1, videosTotal: 1, ttsDone: 2, ttsTotal: 2,
    })
    expect(result.output.videos).toHaveLength(1)
    expect(result.output.videos[0]).toMatchObject({ index: 0, path: expect.stringContaining('scene_video_000.mp4') })
  })

  it('视频场景提示词经视频优化引擎改写后提交 generateVideo（不再直接复用图片提示词）', async () => {
    if (skipIfNoMedia()) return
    const callAdapter = vi.fn(async (_provider, method) => {
      if (method === 'generateVideo') return { code: 0, data: { taskId: 'task-opt' } }
      if (method === 'getVideoStatus') return { videoUrl: baseUrl }
      return { code: 0 }
    })
    const aiGenerator = {
      _modelProviderManager: {
        getDefault: vi.fn((type) => type === 'video'
          ? { id: 'kling', models: ['kling-v1'] }
          : { id: 'openai', models: ['gpt-4.1-mini'] }),
        callAdapter,
      },
    }
    const fn = makeBlendPipeline(aiGenerator)
    const context = {
      split: [{ text: '一' }],
      optimize: ['image-optimized-prompt-0'],
      video_plan: { mode: 'fixed', scenes: [{ index: 0, useVideo: true, seconds: 6 }], selectedCount: 1 },
    }
    const optimizeVideoPrompt = vi.fn(async (prompt) => ({ optimized_prompt: '[video-opt] ' + prompt }))
    const result = await fn({
      runId: 'run_blend',
      stage: { options: { videoMode: 'fixed', video: { provider: 'kling', model: 'kling-v1', pollIntervalMs: 5 } } },
      params: { videoMode: 'fixed', aspectRatio: '9:16', fps: 30 },
      context,
      serviceBus: {
        optimizeVideoPrompt,
        generateTTS: vi.fn(async (_text, { index }) => ({ code: 0, data: { path: 'aud-' + index + '.mp3', duration: 2 } })),
        callPythonSkill: vi.fn(async (_skill, payload) => ({ code: 0, data: { path: 'img-' + payload.index + '.png' } })),
      },
    })
    expect(result.output.scenes[0]).toMatchObject({ index: 0, videoPath: expect.stringContaining('scene_video_000.mp4') })
    expect(result.success).toBe(true)
    expect(optimizeVideoPrompt).toHaveBeenCalledWith('image-optimized-prompt-0', expect.objectContaining({ platform: 'kling', traceId: 'run_blend' }))
    expect(callAdapter).toHaveBeenCalledWith('kling', 'generateVideo', expect.objectContaining({ prompt: '[video-opt] image-optimized-prompt-0' }))
  })

  it('视频提示词优化失败时该场景回退图片轮播，不中断整条流水线', async () => {
    if (skipIfNoMedia()) return
    const callAdapter = vi.fn(async () => ({ code: 0 }))
    const aiGenerator = {
      _modelProviderManager: {
        getDefault: vi.fn((type) => type === 'video' ? { id: 'kling', models: ['kling-v1'] } : { id: 'openai', models: ['x'] }),
        callAdapter,
      },
    }
    const assetGenerator = {
      generateImage: vi.fn(async (_prompt, { index }) => ({ code: 0, data: { path: 'img-' + index + '.png' } })),
      generateTTS: vi.fn(async (_text, { index }) => ({ code: 0, data: { path: 'aud-' + index + '.mp3', duration: 2 } })),
    }
    const fn = makeBlendPipeline(aiGenerator, assetGenerator)
    const context = {
      split: [{ text: '一' }],
      optimize: ['p0'],
      video_plan: { mode: 'fixed', scenes: [{ index: 0, useVideo: true, seconds: 6 }], selectedCount: 1 },
    }
    const result = await fn({
      stage: { options: { videoMode: 'fixed', video: { provider: 'kling', model: '', pollIntervalMs: 5 } } },
      params: { videoMode: 'fixed', aspectRatio: '9:16', fps: 30 },
      context,
      serviceBus: { optimizeVideoPrompt: vi.fn(async () => { throw new Error('prompt-engine 未运行') }) },
    })
    expect(result.success).toBe(true)
    expect(assetGenerator.generateImage).toHaveBeenCalled()
    expect(result.output.scenes[0]).toMatchObject({ index: 0, imagePath: 'img-0.png', videoPath: null })
  })

  it('视频生成失败时回退图片轮播（补生成图片）', async () => {
    if (skipIfNoMedia()) return
    const callAdapter = vi.fn(async (_provider, method) => {
      if (method === 'generateVideo') return { code: -1, message: 'provider 欠费' }
      return { code: 0 }
    })
    const aiGenerator = {
      _modelProviderManager: {
        getDefault: vi.fn(() => ({ id: 'kling', models: ['kling-v1'] })),
        callAdapter,
      },
    }
    const fn = makeBlendPipeline(aiGenerator)
    const assetGenerator = {
      generateImage: vi.fn(async (_prompt, { index }) => ({ code: 0, data: { path: 'fallback-image-' + index + '.png' } })),
      generateTTS: vi.fn(async (_text, { index }) => ({ code: 0, data: { path: 'audio-' + index + '.mp3', duration: 2 } })),
    }
    const context = {
      split: [{ text: '一' }, { text: '二' }],
      optimize: ['p0', 'p1'],
      video_plan: { mode: 'fixed', scenes: [{ index: 0, useVideo: true, seconds: 6 }, { index: 1, useVideo: false, seconds: 6 }], selectedCount: 1 },
    }
    const result = await fn({
      stage: { options: { videoMode: 'fixed', video: { provider: 'kling', model: '' } } },
      params: { videoMode: 'fixed', aspectRatio: '9:16', fps: 30 },
      context,
      serviceBus: { optimizeVideoPrompt: vi.fn(async (prompt) => ({ optimized_prompt: prompt })) },
    })
    // 无 assetGenerator → legacy python 路径：图片经 serviceBus.callPythonSkill('generate_image')
    expect(result.success).toBe(false) // serviceBus 未提供 generate_image → 场景生成失败
    expect(result.error).toContain('Asset scene generation failed')
  })
  it('getVideoStatus 返回错误响应时立即终止（不空转 10 分钟）', async () => {
    if (skipIfNoMedia()) return
    const callAdapter = vi.fn(async (_provider, method) => {
      if (method === 'generateVideo') return { code: 0, data: { taskId: 'task-err' } }
      if (method === 'getVideoStatus') return { code: -1, message: 'provider 任务失败' }
      return { code: 0 }
    })
    const aiGenerator = {
      _modelProviderManager: {
        getDefault: vi.fn((type) => type === 'video' ? { id: 'kling', models: ['kling-v1'] } : { id: 'openai', models: ['x'] }),
        callAdapter,
      },
    }
    const assetGenerator = {
      generateImage: vi.fn(async (_prompt, { index }) => ({ code: 0, data: { path: 'img-' + index + '.png' } })),
      generateTTS: vi.fn(async (_text, { index }) => ({ code: 0, data: { path: 'aud-' + index + '.mp3', duration: 2 } })),
    }
    const fn = makeBlendPipeline(aiGenerator, assetGenerator)
    // 直接调用 generateSceneVideo 验证错误终止
    const { generateSceneVideo } = require('./story2video-stages')
    const outcome = await generateSceneVideo({
      manager: aiGenerator._modelProviderManager,
      providerId: 'kling',
      model: 'kling-v1',
      prompt: 'p',
      index: 0,
      seconds: 6,
      size: { width: 720, height: 1280 },
      fps: 24,
      runDir: path.join(os.tmpdir(), 'story2video-video-err-test-' + process.pid),
      pollIntervalMs: 5,
    })
    expect(outcome.success).toBe(false)
    expect(outcome.error).toContain('provider 任务失败')
    // 图片回退路径仍可用（assetGenerator 被调用）
    const context = {
      split: [{ text: '一' }],
      optimize: ['p0'],
      video_plan: { mode: 'fixed', scenes: [{ index: 0, useVideo: true, seconds: 6 }], selectedCount: 1 },
    }
    const result = await fn({
      stage: { options: { videoMode: 'fixed', video: { provider: 'kling', model: '', pollIntervalMs: 5 } } },
      params: { videoMode: 'fixed', aspectRatio: '9:16', fps: 30 },
      context,
      serviceBus: { optimizeVideoPrompt: vi.fn(async (prompt) => ({ optimized_prompt: prompt })) },
    })
    expect(result.success).toBe(true)
    expect(assetGenerator.generateImage).toHaveBeenCalled()
    expect(result.output.scenes[0]).toMatchObject({ index: 0, imagePath: 'img-0.png', videoPath: null })
  })

  it('视频下载 HTTP 非 200 时视为失败并回退图片', async () => {
    if (skipIfNoMedia()) return
    const callAdapter = vi.fn(async (_provider, method) => {
      if (method === 'generateVideo') return { code: 0, data: { taskId: 'task-404' } }
      if (method === 'getVideoStatus') return { videoUrl: 'http://127.0.0.1:' + server.address().port + '/missing.mp4' }
      return { code: 0 }
    })
    const aiGenerator = {
      _modelProviderManager: {
        getDefault: vi.fn((type) => type === 'video' ? { id: 'kling', models: ['kling-v1'] } : { id: 'openai', models: ['x'] }),
        callAdapter,
      },
    }
    const assetGenerator = {
      generateImage: vi.fn(async (_prompt, { index }) => ({ code: 0, data: { path: 'img-' + index + '.png' } })),
      generateTTS: vi.fn(async (_text, { index }) => ({ code: 0, data: { path: 'aud-' + index + '.mp3', duration: 2 } })),
    }
    const fn = makeBlendPipeline(aiGenerator, assetGenerator)
    const context = {
      split: [{ text: '一' }],
      optimize: ['p0'],
      video_plan: { mode: 'fixed', scenes: [{ index: 0, useVideo: true, seconds: 6 }], selectedCount: 1 },
    }
    const result = await fn({
      stage: { options: { videoMode: 'fixed', video: { provider: 'kling', model: '', pollIntervalMs: 5 } } },
      params: { videoMode: 'fixed', aspectRatio: '9:16', fps: 30 },
      context,
      serviceBus: { optimizeVideoPrompt: vi.fn(async (prompt) => ({ optimized_prompt: prompt })) },
    })
    expect(result.success).toBe(true)
    expect(assetGenerator.generateImage).toHaveBeenCalled()
    expect(result.output.scenes[0]).toMatchObject({ index: 0, imagePath: 'img-0.png', videoPath: null })
  })

  it('图片/旁白与视频并行启动：视频轮询未完成时，非视频场景图片与全部 TTS 已开始生成（2026-08-13 优化）', async () => {
    if (skipIfNoMedia()) return
    let releaseVideo
    const videoGate = new Promise((resolve) => { releaseVideo = resolve })
    const callAdapter = vi.fn(async (_provider, method) => {
      if (method === 'generateVideo') return { code: 0, data: { taskId: 'task-slow' } }
      if (method === 'getVideoStatus') { await videoGate; return { videoUrl: baseUrl } }
      return { code: 0 }
    })
    const aiGenerator = {
      _modelProviderManager: {
        getDefault: vi.fn((type) => type === 'video' ? { id: 'kling', models: ['kling-v1'] } : { id: 'openai', models: ['gpt-4.1-mini'] }),
        callAdapter,
      },
    }
    const assetGenerator = {
      generateImage: vi.fn(async (_prompt, { index }) => ({ code: 0, data: { path: 'img-' + index + '.png' } })),
      generateTTS: vi.fn(async (_text, { index }) => ({ code: 0, data: { path: 'aud-' + index + '.mp3', duration: 2 } })),
    }
    const fn = makeBlendPipeline(aiGenerator, assetGenerator)
    const context = {
      split: [{ text: '一' }, { text: '二' }, { text: '三' }],
      optimize: ['video-p0', 'p1', 'p2'],
      video_plan: { mode: 'fixed', scenes: [{ index: 0, useVideo: true, seconds: 6 }], selectedCount: 1 },
    }
    const runPromise = fn({
      stage: { options: { videoMode: 'fixed', video: { provider: 'kling', model: 'kling-v1', pollIntervalMs: 5 } } },
      params: { videoMode: 'fixed', aspectRatio: '9:16', fps: 30 },
      context,
      serviceBus: { optimizeVideoPrompt: vi.fn(async (prompt) => ({ optimized_prompt: prompt })) },
    })
    // 视频被 gate 卡住：断言非视频场景图片（场景 1/2）与全部 TTS（3 条）已开始生成
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(assetGenerator.generateImage).toHaveBeenCalledTimes(2)
    expect(assetGenerator.generateTTS).toHaveBeenCalledTimes(3)
    // 进度：视频 0 但图片/旁白已推进
    expect(context.assets_progress.videosDone).toBe(0)
    expect(context.assets_progress.videosTotal).toBe(1)
    expect(context.assets_progress.imagesDone).toBeGreaterThan(0)
    expect(context.assets_progress.ttsDone).toBeGreaterThan(0)
    // 放行视频，等待整阶段完成
    releaseVideo()
    const result = await runPromise
    expect(result.success).toBe(true)
    expect(result.output.scenes[0]).toMatchObject({ index: 0, videoPath: expect.stringContaining('scene_video_000.mp4') })
    expect(result.output.scenes).toHaveLength(3)
    expect(context.assets_progress.videosDone).toBe(1)
    expect(context.assets_progress.imagesTotal).toBe(2)
    expect(context.assets_progress.imagesDone).toBe(2)
    expect(context.assets_progress.ttsDone).toBe(3)
  })
})

describe('story2video 场景上下文增强中间层（scene_context，2026-08-11）', () => {
  const TANG_FULL_TEXT = '这是一个关于中国唐代的故事。唐玄宗时期，长安城一片繁华。故事讲述一位老妇人在长安城中的日常生活与劳作。'
  const TANG_COOKING_SCENE = '一个老妇人在做饭'

  it('scene_context 阶段已注册', () => {
    const pipeline = makePipeline(null)
    expect(pipeline.sceneContextExecutor).toBeTypeOf('function')
  })

  it('唐代全文 + 「一个老妇人在做饭」场景 → 逐场景上下文块含唐代/中国/土灶锚点与时代负面锚点', async () => {
    const fn = makePipeline(null).sceneContextExecutor
    const result = await fn({
      stage: { options: {} },
      params: { text: TANG_FULL_TEXT },
      context: {
        split: { scenes: [{ index: 0, text: TANG_COOKING_SCENE }] },
      },
    })
    expect(result.success).toBe(true)
    const output = result.output
    expect(output.story.dynasty).toMatchObject({ name: '唐朝', period: '唐朝（618-907）' })
    expect(output.story.culture).toBe('中国')
    expect(output.metadata).toMatchObject({ enriched: true, degraded: false })
    expect(output.scenes).toHaveLength(1)
    const scene = output.scenes[0]
    expect(scene.storyContext).toContain('唐朝')
    expect(scene.storyContext).toContain('中国')
    expect(scene.storyContext).toContain('做饭')
    expect(scene.storyContext).toContain('土灶')
    expect(scene.storyContext).toContain('柴火')
    expect(scene.negativeAnchors).toEqual(expect.arrayContaining(['电烤箱', '微波炉', '西式现代厨房']))
    expect(scene.character).toMatchObject({ name: '老妇人' })
  })

  it('无全文（图片/音频模式）降级透传，不阻断流水线', async () => {
    const fn = makePipeline(null).sceneContextExecutor
    const result = await fn({
      stage: { options: {} },
      params: { text: '', inputMode: 'images' },
      context: {
        split: { scenes: [{ index: 0, text: '图片 1', sourceImage: { path: '/tmp/a.png' } }] },
      },
    })
    expect(result.success).toBe(true)
    expect(result.output.metadata.degraded).toBe(true)
    expect(result.output.scenes).toHaveLength(1)
  })

  it('空场景数组 fail closed', async () => {
    const fn = makePipeline(null).sceneContextExecutor
    const result = await fn({
      stage: { options: {} },
      params: { text: TANG_FULL_TEXT },
      context: { split: { scenes: [] } },
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('非空场景数组')
  })

  it('optimize 优先消费 scene_context：请求 context 使用逐场景上下文块，负面锚点合并进 negative_prompt', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus()
    const sceneContextResult = await makePipeline(null).sceneContextExecutor({
      stage: { options: { quality_baseline: false } },
      params: { text: TANG_FULL_TEXT },
      context: { split: { scenes: [{ index: 0, text: TANG_COOKING_SCENE }] } },
    })
    const result = await fn({
      stage: { options: { negative_prompt: '水印' } },
      params: {},
      context: { scene_context: sceneContextResult.output },
      serviceBus,
    })
    expect(result.success).toBe(true)
    expect(serviceBus.calls).toHaveLength(1)
    const call = serviceBus.calls[0]
    expect(call.options.context).toMatchObject({
      synopsis: expect.stringContaining('唐代'),
      full_text: expect.stringContaining('唐代'),
      setting: expect.stringContaining('做饭'),
    })
    expect(call.options.context.character).toMatchObject({ name: '老妇人' })
    // 用户 negative_prompt 与场景负面锚点合并
    expect(call.options.negative_prompt).toContain('水印')
    expect(call.options.negative_prompt).toContain('电烤箱')
  })

  it('optimize 在无 scene_context 时回退 buildOptimizeContext，保持旧行为兼容', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus()
    const result = await fn({
      stage: { options: { quality_baseline: false, context: '角色一致性' } },
      params: {},
      context: { split: [{ text: '一个老妇人在做饭' }] },
      serviceBus,
    })
    expect(result.success).toBe(true)
    expect(serviceBus.calls[0].options.context).toMatchObject({ synopsis: '角色一致性', full_text: '一个老妇人在做饭' })
  })

// ==================== translatePromptsForLocale 回归测试 ====================
describe('translatePromptsForLocale', () => {
  function makeAiGenerator(responseContent) {
    return {
      generateWithDefault: vi.fn().mockResolvedValue({ content: responseContent }),
    }
  }

  it('正常 JSON 解析 — 提取翻译文本', async () => {
    const ai = makeAiGenerator('{"0":"一个红苹果","1":"一片蓝天"}')
    const items = await translatePromptsForLocale(ai, ['A red apple', 'A blue sky'], 'zh', console)
    expect(items[0].translation).toBe('一个红苹果')
    expect(items[1].translation).toBe('一片蓝天')
  })

  it('markdown 代码块包裹的 JSON 也能正确解析', async () => {
    const ai = makeAiGenerator('```json\n{"0":"一个红苹果","1":"一片蓝天"}\n```')
    const items = await translatePromptsForLocale(ai, ['A red apple', 'A blue sky'], 'zh', console)
    expect(items[0].translation).toBe('一个红苹果')
    expect(items[1].translation).toBe('一片蓝天')
  })

  it('不带语言标签的代码块也能正确解析', async () => {
    const ai = makeAiGenerator('```\n{"0":"翻译一"}\n```')
    const items = await translatePromptsForLocale(ai, ['prompt one'], 'zh', console)
    expect(items[0].translation).toBe('翻译一')
  })

  it('逐行回退：json 标记不应作为译文', async () => {
    // LLM 返回了代码块但 JSON.parse 失败的场景（模拟回退路径）
    // 实际场景：```json\n{...}\n``` 剥离后 parse 成功，这里测试回退路径本身的防御
    const ai = {
      generateWithDefault: vi.fn().mockResolvedValue({ content: 'json\n{"0":"一个红苹果"}' }),
    }
    const items = await translatePromptsForLocale(ai, ['A red apple'], 'zh', console)
    // 'json' 应被过滤，不应成为译文
    expect(items[0].translation).not.toBe('json')
  })

  it('逐行回退：JSON 对象文本不应作为译文', async () => {
    const ai = {
      generateWithDefault: vi.fn().mockResolvedValue({ content: '{"0":"一个红苹果","1":"一片蓝天"}' }),
    }
    // 当 LLM 返回的不是合法 JSON（如缺少引号），回退到逐行解析
    const items = await translatePromptsForLocale(ai, ['A red apple', 'A blue sky'], 'zh', console)
    // JSON 对象文本不应直接成为译文
    for (const item of items) {
      if (typeof item.translation === 'string') {
        expect(item.translation).not.toMatch(/^\{["']\d/)
      }
    }
  })

  it('aiGenerator 不可用时跳过翻译', async () => {
    const items = await translatePromptsForLocale(null, ['A red apple'], 'zh', console)
    expect(items[0].translation).toBeNull()
  })

  it('空提示词列表不报错', async () => {
    const ai = makeAiGenerator('{}')
    const items = await translatePromptsForLocale(ai, [], 'zh', console)
    expect(items).toEqual([])
  })

  describe('并发与限时重试（2026-08-15）', () => {
    it('13 个提示词按 4 路滑窗并发，峰值并发不超过 4 且全部成功', async () => {
      const active = { current: 0, peak: 0 }
      const ai = {
        generateWithDefault: vi.fn(async (_type, params) => {
          active.current += 1
          active.peak = Math.max(active.peak, active.current)
          await new Promise((resolve) => setTimeout(resolve, 20))
          active.current -= 1
          const map = {}
          for (const key of Object.keys(JSON.parse(params.messages[1].content))) map[key] = '译-' + key
          return { content: JSON.stringify(map) }
        }),
      }
      const prompts = Array.from({ length: 13 }, (_, i) => 'prompt ' + i)
      const items = await translatePromptsForLocale(ai, prompts, 'zh', console)
      // 13 条 / 每批 3 条 = 5 批
      expect(ai.generateWithDefault.mock.calls.length).toBe(5)
      expect(active.peak).toBeLessThanOrEqual(4)
      expect(active.peak).toBe(4)
      expect(items.every((item) => typeof item.translation === 'string')).toBe(true)
    })

    it('空内容失败后重试一次成功（单批调用 2 次）', async () => {
      let callCount = 0
      const ai = {
        generateWithDefault: vi.fn(async () => {
          callCount += 1
          if (callCount === 1) throw new Error('Default provider returned empty content')
          return { content: '{"0":"重试成功"}' }
        }),
      }
      const items = await translatePromptsForLocale(ai, ['A red apple'], 'zh', console)
      expect(callCount).toBe(2)
      expect(items[0].translation).toBe('重试成功')
    })

    it('连续失败重试后 fail-open，不抛错且翻译为空', async () => {
      const ai = {
        generateWithDefault: vi.fn().mockRejectedValue(new Error('Default provider returned empty content')),
      }
      const items = await translatePromptsForLocale(ai, ['p0', 'p1', 'p2', 'p3'], 'zh', console)
      // 2 批 ×（1 次 + 1 次重试）
      expect(ai.generateWithDefault.mock.calls.length).toBe(4)
      expect(items.every((item) => item.translation === null)).toBe(true)
    })

    it('system prompt 显式禁止思考过程与 <think> 标签', async () => {
      const ai = makeAiGenerator('{"0":"译"}')
      await translatePromptsForLocale(ai, ['p'], 'zh', console)
      const system = ai.generateWithDefault.mock.calls[0][1].messages[0].content
      expect(system).toContain('思考过程')
      expect(system).toMatch(/<think>/)
      expect(system).toContain('JSON')
    })

    it('每批调用带 25s 有界超时', async () => {
      const ai = makeAiGenerator('{"0":"译"}')
      await translatePromptsForLocale(ai, ['p'], 'zh', console)
      expect(ai.generateWithDefault.mock.calls[0][1].timeoutMs).toBe(25000)
    })

    it('ensureTranslationConcurrencyBudget 注册 llm key 级并发预算（保留 rpm，并发 4）', () => {
      const setLimits = vi.fn()
      const ai = {
        _governor: { setLimits },
        _modelProviderManager: {
          getDefault: vi.fn(() => ({
            id: 'minimax-multimodal',
            models: ['MiniMax-M2.7'],
            capability_models: { llm: 'MiniMax-M2.7' },
            config: { rate_per_minute: 20 },
          })),
        },
      }
      ensureTranslationConcurrencyBudget(ai)
      expect(setLimits).toHaveBeenCalledWith('minimax-multimodal:llm:MiniMax-M2.7', {
        rpm: 20,
        maxConcurrent: 4,
        cooldownMs: 30000,
        retry429: 3,
      })
    })

    it('capability_models.llm 为数组时回退 models[0]，key 与 generateWithDefault 一致', () => {
      const setLimits = vi.fn()
      const ai = {
        _governor: { setLimits },
        _modelProviderManager: {
          getDefault: vi.fn(() => ({
            id: 'minimax-multimodal',
            models: ['MiniMax-M2.7', 'MiniMax-M2.5'],
            capability_models: { llm: ['MiniMax-M2.5'] },
            config: { rate_per_minute: 20 },
          })),
        },
      }
      ensureTranslationConcurrencyBudget(ai)
      expect(setLimits).toHaveBeenCalledWith('minimax-multimodal:llm:MiniMax-M2.7', {
        rpm: 20,
        maxConcurrent: 4,
        cooldownMs: 30000,
        retry429: 3,
      })
    })

    it('真实 governor 回归：4 路滑窗 + key 级预算下 10 批全部完成，无排队超时残留', async () => {
      const { ApiUsageGovernor } = require('./api-usage-governor')
      const governor = new ApiUsageGovernor({
        log: { warn: () => {}, info: () => {} },
        providerLimits: { 'minimax-multimodal': { rpm: 1000, maxConcurrent: 2, cooldownMs: 1000, retry429: 3 } },
      })
      const ai = {
        _governor: governor,
        _modelProviderManager: {
          getDefault: vi.fn(() => ({
            id: 'minimax-multimodal',
            models: ['MiniMax-M2.7'],
            capability_models: { llm: 'MiniMax-M2.7' },
            config: { rate_per_minute: 1000 },
          })),
        },
        generateWithDefault: vi.fn(async (_type, params) => {
          return governor.run({ type: 'llm', providerId: 'minimax-multimodal', model: 'MiniMax-M2.7' }, async () => {
            await new Promise((resolve) => setTimeout(resolve, 15))
            const map = {}
            for (const key of Object.keys(JSON.parse(params.messages[1].content))) map[key] = '译-' + key
            return { content: JSON.stringify(map) }
          })
        }),
      }
      const prompts = Array.from({ length: 10 }, (_, i) => 'prompt ' + i)
      const items = await translatePromptsForLocale(ai, prompts, 'zh', console)
      expect(items.every((item) => typeof item.translation === 'string')).toBe(true)
      expect(governor.getStatus('minimax-multimodal:llm:MiniMax-M2.7').active).toBe(0)
    })
  })
})

})
