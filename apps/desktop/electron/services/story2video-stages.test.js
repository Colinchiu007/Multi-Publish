// @vitest-environment node
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  registerStory2VideoStages,
  STORY2VIDEO_STAGE_TYPES,
  normalizeAssetConcurrency,
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

  it('提示词优化只调用当前默认 LLM，逐场景保序且不回退 PromptBridge', async () => {
    const aiGenerator = {
      _modelProviderManager: {
        getDefault: vi.fn(() => ({ id: 'openai', models: ['gpt-4.1-mini'] })),
      },
      generateWithDefault: vi.fn(async (_type, params) => ({
        content: params.messages[1].content.includes('唐代')
          ? '唐代长安城，电影感广角镜头'
          : '未来城市夜景，电影感航拍镜头',
        model: 'gpt-4.1-mini',
      })),
    }
    const fn = makePipeline(null, aiGenerator).optimizeExecutor
    const serviceBus = { optimizePromptsBatch: vi.fn() }

    const result = await fn({
      stage: { options: { style: 'cinematic', creative_level: 8 } },
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
        { optimized_prompt: '唐代长安城，电影感广角镜头', providerId: 'openai', model: 'gpt-4.1-mini' },
        { optimized_prompt: '未来城市夜景，电影感航拍镜头', providerId: 'openai', model: 'gpt-4.1-mini' },
      ],
    })
    expect(aiGenerator.generateWithDefault).toHaveBeenCalledTimes(2)
    expect(aiGenerator.generateWithDefault).toHaveBeenNthCalledWith(
      1,
      'llm',
      expect.objectContaining({
        messages: expect.arrayContaining([expect.objectContaining({ role: 'system' })]),
      }),
    )
    expect(serviceBus.optimizePromptsBatch).not.toHaveBeenCalled()
  })

  it('LLM 返回含 <think> 思考块的 content 时，净化后作为提示词（不带思考内容）', async () => {
    const aiGenerator = {
      _modelProviderManager: { getDefault: vi.fn(() => ({ id: 'minimax', models: ['MiniMax-M2.7'] })) },
      generateWithDefault: vi.fn(async () => ({
        content: '<think>用户让我把场景 12 变成图片提示词</think>\n\nA real final prompt',
        model: 'MiniMax-M2.7',
      })),
    }
    const fn = makePipeline(null, aiGenerator).optimizeExecutor
    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '唐朝长安城的灯火。' }] },
      serviceBus: {},
    })
    expect(result).toMatchObject({ success: true })
    expect(result.output[0].optimized_prompt).toBe('A real final prompt')
    expect(result.output[0].optimized_prompt).not.toContain('think')
  })

  it('LLM 返回拒绝文本（missing description）时回退原文，不把拒绝内容当提示词', async () => {
    const aiGenerator = {
      _modelProviderManager: { getDefault: vi.fn(() => ({ id: 'minimax', models: ['MiniMax-M2.7'] })) },
      generateWithDefault: vi.fn(async () => ({
        content: 'I cannot generate the image prompt because the visual description of the scene is missing from your request. Please provide the details of Scene 11 (subject, action, setting, etc.) so I can convert it into a production-ready prompt.',
        model: 'MiniMax-M2.7',
      })),
    }
    const fn = makePipeline(null, aiGenerator).optimizeExecutor
    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '一个有内容的场景描述。' }] },
      serviceBus: {},
    })
    expect(result).toMatchObject({ success: true })
    // 拒绝文本被拦截：有实质内容时回退原文
    expect(result.output[0].optimized_prompt).toBe('一个有内容的场景描述。')
    expect(result.output[0].skipped_optimize).toBe(true)
    expect(result.output[0].optimize_note).toBe('llm_rejected_use_original')
    expect(result.output[0].optimized_prompt).not.toContain('cannot generate')
  })

  it('纯数字文案（如 11）守卫优先于 LLM 拒绝路径：不调用 LLM、直接用原文', async () => {
    const aiGenerator = {
      _modelProviderManager: { getDefault: vi.fn(() => ({ id: 'minimax', models: ['MiniMax-M2.7'] })) },
      generateWithDefault: vi.fn(async () => ({
        content: 'I cannot generate the image prompt because the visual description of the scene is missing from your request.',
        model: 'MiniMax-M2.7',
      })),
    }
    const fn = makePipeline(null, aiGenerator).optimizeExecutor
    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '11' }] },
      serviceBus: {},
    })
    expect(result).toMatchObject({ success: true })
    expect(result.output[0]).toEqual({ optimized_prompt: '11', providerId: null, model: null, skipped_optimize: true })
    // 守卫优先：未调用 LLM，避免产生拒绝文本
    expect(aiGenerator.generateWithDefault).not.toHaveBeenCalled()
  })
  it('纯数字文案（如 12）跳过 LLM 优化，用原文兜底，不编造场景', async () => {
    const aiGenerator = {
      _modelProviderManager: { getDefault: vi.fn(() => ({ id: 'minimax', models: ['MiniMax-M2.7'] })) },
      generateWithDefault: vi.fn(async () => ({ content: '编造的场景', model: 'MiniMax-M2.7' })),
    }
    const fn = makePipeline(null, aiGenerator).optimizeExecutor
    const context = { split: [{ text: '12' }, { text: '一个有内容的场景描述。' }] }
    const result = await fn({
      stage: { options: {} },
      params: {},
      context,
      serviceBus: {},
    })
    expect(result).toMatchObject({ success: true })
    expect(result.output).toHaveLength(2)
    // 纯数字场景：跳过优化，用原文，标记 skipped_optimize
    expect(result.output[0]).toEqual({ optimized_prompt: '12', providerId: null, model: null, skipped_optimize: true })
    // 有内容场景：正常调用 LLM
    expect(result.output[1]).toMatchObject({ optimized_prompt: '编造的场景' })
    expect(aiGenerator.generateWithDefault).toHaveBeenCalledTimes(1)
    expect(context.optimize_progress).toEqual({ done: 2, total: 2 })
  })
  it('逐场景提示词优化并行执行（有界并发，避免长文案串行拖慢）', async () => {
    // 用并发计数断言（确定性），不依赖墙钟：并发执行时活跃调用数应 ≥2
    let active = 0
    let maxActive = 0
    const aiGenerator = {
      _modelProviderManager: { getDefault: vi.fn(() => ({ id: 'openai', models: ['gpt-4.1-mini'] })) },
      generateWithDefault: vi.fn(async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise(resolve => setTimeout(resolve, 50))
        active -= 1
        return { content: '优化结果', model: 'gpt-4.1-mini' }
      }),
    }
    const fn = makePipeline(null, aiGenerator).optimizeExecutor
    const scenes = Array.from({ length: 6 }, (_, i) => ({ text: '场景' + i, imagePromptSeed: '画面' + i }))
    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { domain_enrich: { scenes } },
      serviceBus: { optimizePromptsBatch: vi.fn() },
    })
    expect(result.success).toBe(true)
    expect(result.output).toHaveLength(6)
    expect(aiGenerator.generateWithDefault).toHaveBeenCalledTimes(6)
    expect(maxActive).toBeGreaterThanOrEqual(2)
  })

  it('优化进度前置写入：阶段开始即显示「共 N 个场景，已完成 X 个」', async () => {
    const aiGenerator = {
      _modelProviderManager: { getDefault: vi.fn(() => ({ id: 'openai', models: ['gpt-4.1-mini'] })) },
      generateWithDefault: vi.fn(async () => ({ content: '优化后', model: 'gpt-4.1-mini' })),
    }
    const fn = makePipeline(null, aiGenerator).optimizeExecutor
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
      serviceBus: { optimizePromptsBatch: vi.fn() },
    })
    expect(result.success).toBe(true)
    // 前置写入：前端在阶段执行期间即可显示数量信息，而不是等阶段结束后才出现
    expect(context.optimize_progress).toEqual({ done: 3, total: 3 })
  })

  it('断点续传时优化进度从已完成场景数开始，成功后清理续传缓存', async () => {
    const resumeEntry = { optimized_prompt: '已有优化', providerId: 'openai', model: 'gpt-4.1-mini' }
    const aiGenerator = {
      _modelProviderManager: { getDefault: vi.fn(() => ({ id: 'openai', models: ['gpt-4.1-mini'] })) },
      generateWithDefault: vi.fn(async () => ({ content: '新优化', model: 'gpt-4.1-mini' })),
    }
    const fn = makePipeline(null, aiGenerator).optimizeExecutor
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
      serviceBus: { optimizePromptsBatch: vi.fn() },
    })
    expect(result.success).toBe(true)
    // 只优化未完成的场景，已完成的直接复用
    expect(aiGenerator.generateWithDefault).toHaveBeenCalledTimes(1)
    expect(result.output).toHaveLength(2)
    expect(result.output[0]).toEqual(resumeEntry)
    expect(context.optimize_progress).toEqual({ done: 2, total: 2 })
    expect(context.optimize_resume).toBeUndefined()
  })

  it('默认 LLM 缺失、空响应或中途失败时优化阶段 fail closed', async () => {
    const noDefault = makePipeline(null, {
      _modelProviderManager: { getDefault: vi.fn(() => null) },
      generateWithDefault: vi.fn(),
    }).optimizeExecutor
    const missing = await noDefault({
      stage: { options: {} }, params: {}, context: { split: [{ text: '场景' }] }, serviceBus: {},
    })
    expect(missing).toEqual({
      success: false,
      error: '未找到需要的相关模型，请在设置中添加模型',
    })

    const empty = makePipeline(null, {
      _modelProviderManager: { getDefault: vi.fn(() => ({ id: 'openai', models: ['gpt-4.1-mini'] })) },
      generateWithDefault: vi.fn(async () => ({ content: '   ' })),
    }).optimizeExecutor
    const blank = await empty({
      stage: { options: {} }, params: {}, context: { split: [{ text: '场景' }] }, serviceBus: {},
    })
    expect(blank).toMatchObject({ success: false, error: expect.stringMatching(/empty|为空/i) })

    const serviceBus = { optimizePromptsBatch: vi.fn() }
    const retryRecovers = makePipeline(null, {
      _modelProviderManager: { getDefault: vi.fn(() => ({ id: 'openai', models: ['gpt-4.1-mini'] })) },
      generateWithDefault: vi.fn()
        .mockRejectedValueOnce(new Error('provider timeout'))
        .mockResolvedValue({ content: '优化后提示词', model: 'gpt-4.1-mini' }),
    }).optimizeExecutor
    const recovered = await retryRecovers({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '第一幕' }] },
      serviceBus,
    })
    // 瞬态 provider 错误触发有界重试后成功
    expect(recovered).toMatchObject({ success: true })
    expect(retryRecovers).toBeDefined()
    expect(recovered.output).toHaveLength(1)

    const persistent = makePipeline(null, {
      _modelProviderManager: { getDefault: vi.fn(() => ({ id: 'openai', models: ['gpt-4.1-mini'] })) },
      generateWithDefault: vi.fn().mockRejectedValue(new Error('provider timeout')),
    }).optimizeExecutor
    const failed = await persistent({
      stage: { options: { maxRetries: 0 } },
      params: {},
      context: { split: [{ text: '第一幕' }] },
      serviceBus,
    })
    expect(failed).toMatchObject({ success: false, error: expect.stringMatching(/scene 0.*provider timeout/i) })
    expect(failed).not.toHaveProperty('output')
    expect(serviceBus.optimizePromptsBatch).not.toHaveBeenCalled()
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

  it('61 个场景逐个调用默认 LLM 优化，不因场景数被拒绝', async () => {
    const aiGenerator = {
      _modelProviderManager: {
        getDefault: vi.fn(() => ({ id: 'openai', models: ['gpt-4.1-mini'] })),
      },
      generateWithDefault: vi.fn(async () => ({ content: '安全的画面提示词', model: 'gpt-4.1-mini' })),
    }
    const fn = makePipeline(null, aiGenerator).optimizeExecutor
    const scenes = Array.from({ length: 61 }, (_, index) => ({ text: '第 ' + (index + 1) + ' 个场景' }))

    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: scenes },
      serviceBus: {},
    })

    expect(result.success).toBe(true)
    expect(result.output).toHaveLength(61)
    expect(aiGenerator.generateWithDefault).toHaveBeenCalledTimes(61)
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
    const aiGenerator = {
      _modelProviderManager: { getDefault: vi.fn(() => ({ id: 'minimax', models: ['MiniMax-Text-01'] })) },
      generateWithDefault: vi.fn()
        .mockRejectedValueOnce(new Error("You've reached the API rate limit for free users."))
        .mockRejectedValueOnce(new Error('rate limit'))
        .mockResolvedValue({ content: '优化后提示词', model: 'MiniMax-Text-01' }),
    }
    const fn = makePipeline(null, aiGenerator).optimizeExecutor
    const promise = fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '第一幕' }] },
      serviceBus: {},
    })
    await vi.advanceTimersByTimeAsync(30000)
    const result = await promise
    expect(result).toMatchObject({ success: true })
    expect(result.output).toHaveLength(1)
    expect(aiGenerator.generateWithDefault).toHaveBeenCalledTimes(3)
  })

  it('限流持续存在时按限流次数上限失败并保留场景与原因', async () => {
    vi.useFakeTimers()
    const aiGenerator = {
      _modelProviderManager: { getDefault: vi.fn(() => ({ id: 'minimax', models: ['MiniMax-Text-01'] })) },
      generateWithDefault: vi.fn().mockRejectedValue(new Error('You have reached the API rate limit for free users.')),
    }
    const fn = makePipeline(null, aiGenerator).optimizeExecutor
    const promise = fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '第一幕' }] },
      serviceBus: {},
    })
    await vi.advanceTimersByTimeAsync(60000)
    const result = await promise
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/scene 0.*rate limit/i),
    })
    expect(aiGenerator.generateWithDefault).toHaveBeenCalledTimes(4)
  })

  it('非瞬时 provider 错误不重试，立即失败', async () => {
    vi.useFakeTimers()
    const aiGenerator = {
      _modelProviderManager: { getDefault: vi.fn(() => ({ id: 'minimax', models: ['MiniMax-Text-01'] })) },
      generateWithDefault: vi.fn().mockRejectedValue(new Error('invalid api key')),
    }
    const fn = makePipeline(null, aiGenerator).optimizeExecutor
    const promise = fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '第一幕' }] },
      serviceBus: {},
    })
    await vi.advanceTimersByTimeAsync(1000)
    const result = await promise
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/invalid api key/) })
    expect(aiGenerator.generateWithDefault).toHaveBeenCalledTimes(1)
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

  it('提示词优化断点续传：已完成场景结果直接复用，不重复调用 LLM', async () => {
    const aiGenerator = {
      _modelProviderManager: { getDefault: vi.fn(() => ({ id: 'minimax', models: ['MiniMax-Text-01'] })) },
      generateWithDefault: vi.fn(async () => ({ content: '新结果', model: 'MiniMax-Text-01' })),
    }
    const fn = makePipeline(null, aiGenerator).optimizeExecutor
    const context = {
      split: [{ text: '一' }, { text: '二' }],
      optimize_resume: [{ optimized_prompt: '旧结果0', providerId: 'minimax', model: 'MiniMax-Text-01' }],
    }
    const result = await fn({
      stage: { options: {} },
      params: {},
      context,
      serviceBus: {},
    })
    expect(result).toMatchObject({ success: true })
    expect(result.output).toEqual([
      { optimized_prompt: '旧结果0', providerId: 'minimax', model: 'MiniMax-Text-01' },
      expect.objectContaining({ optimized_prompt: '新结果' }),
    ])
    expect(aiGenerator.generateWithDefault).toHaveBeenCalledTimes(1)
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


