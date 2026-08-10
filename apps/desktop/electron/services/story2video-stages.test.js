// @vitest-environment node
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  registerStory2VideoStages,
  STORY2VIDEO_STAGE_TYPES,
  normalizeAssetConcurrency,
  hasMeaningfulText,
  isPromptEngineTooShortRejection,
} = require('./story2video-stages')
const {
  cleanupRunInputDir,
  importUserSelectedMedia,
} = require('./story2video-paths')

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
  assetsExecutor.domainExecutor = stageExecutor.executors.get(STORY2VIDEO_STAGE_TYPES.DOMAIN_ENRICH)
  assetsExecutor.optimizeExecutor = stageExecutor.executors.get(STORY2VIDEO_STAGE_TYPES.OPTIMIZE)
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

  it('历史内容先经过 domain_enrich，输出保留原文并生成可优化的视觉提示词', async () => {
    const fn = makePipeline(null)
    const result = await fn.domainExecutor({
      stage: { options: { contentType: 'general' } },
      params: { contentType: 'history' },
      context: { split: [{ text: '唐朝长安城的灯火照亮宫殿。' }] },
      serviceBus: {},
    })
    expect(result.success).toBe(true)
    expect(result.output.domainEnriched).toBe(true)
    expect(result.output.scenes[0].text).toContain('唐朝')
    expect(result.output.scenes[0].imagePromptSeed).toContain('唐代')
    expect(result.output.scenes[0].prompt).toContain('无文字')
  })

  it('通用内容在 domain_enrich 中透传，不改变原始句子', async () => {
    const fn = makePipeline(null)
    const result = await fn.domainExecutor({
      stage: { options: { contentType: 'general' } },
      params: {},
      context: { split: [{ text: '普通内容。' }] },
      serviceBus: {},
    })
    expect(result.success).toBe(true)
    expect(result.output.domainEnriched).toBe(false)
    expect(result.output.scenes).toEqual([{ text: '普通内容。' }])
  })

  it('提示词优化统一走 prompt-engine：逐场景调用、携带契约参数且不回退默认 LLM', async () => {
    const fn = makePipeline(null).optimizeExecutor
    const serviceBus = makeOptimizeBus()

    const result = await fn({
      stage: { options: { style: 'cinematic', creative_level: 8, platform: 'dall-e', negative_prompt: '水印' } },
      params: {},
      context: {
        domain_enrich: {
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
    expect(serviceBus.calls[0]).toEqual({
      prompt: '唐代长安城夜景，无文字',
      options: expect.objectContaining({
        platform: 'dalle',
        style: 'photography',
        creative_level: 8,
        max_length: 300,
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
      stage: { options: {} },
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
      stage: { options: {} },
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
      stage: { options: {} },
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
      stage: { options: {} },
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
      context: { domain_enrich: { scenes } },
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
      domain_enrich: {
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
      domain_enrich: {
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
      stage: { options: {} },
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
      imagesDone: 2, imagesTotal: 2, ttsDone: 2, ttsTotal: 2,
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
      imagesDone: 0, imagesTotal: 1, ttsDone: 0, ttsTotal: 1,
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
    assetsExecutor.domainExecutor = executors.get(STORY2VIDEO_STAGE_TYPES.DOMAIN_ENRICH)
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
    assetsExecutor.domainExecutor = executors.get(STORY2VIDEO_STAGE_TYPES.DOMAIN_ENRICH)
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
    assetsExecutor.domainExecutor = executors.get(STORY2VIDEO_STAGE_TYPES.DOMAIN_ENRICH)
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
    assetsExecutor.domainExecutor = executors.get(STORY2VIDEO_STAGE_TYPES.DOMAIN_ENRICH)
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
