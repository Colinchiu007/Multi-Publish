// @vitest-environment node
const {
  registerVideoGenStages,
  VIDEOGEN_STAGE_TYPES,
  buildConceptPrompt,
  buildStoryboardPrompt,
  parseJsonArray,
  isReasoningLlmModel,
  callDefaultLlm,
  DEFAULT_LLM_MAX_TOKENS,
  REASONING_LLM_MAX_TOKENS,
} = require('./videogen-stages')

// 本地 HTTP 视频源：generate 成功路径会真实下载（downloadToFile），不能用外网 URL
const http = require('http')
const __videoServer = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'video/mp4' }); res.end(Buffer.from([0, 0, 0, 0])) })
let VIDEO_URL = ''
async function waitForVideoUrl () {
  const deadline = Date.now() + 3000
  while (!VIDEO_URL && Date.now() < deadline) { await new Promise(r => setTimeout(r, 10)) }
  if (!VIDEO_URL) throw new Error('video server not ready')
}
__videoServer.listen(0, '127.0.0.1', () => { VIDEO_URL = 'http://127.0.0.1:' + __videoServer.address().port + '/v.mp4' })
__videoServer.unref()

function makeStageExecutor() {
  const executors = new Map()
  return { executors, register(type, fn) { executors.set(type, fn) } }
}

function makePipeline(aiGenerator, manager, opts = {}) {
  const stageExecutor = makeStageExecutor()
  // 视频提示词统一走 prompt-engine：默认 pass-through mock；opts.optimizeVideoPromptsBatch 可定制行为；
  // opts.noPromptBridge=true 模拟 PromptBridge 未注入（无视频优化方法）
  const serviceBus = opts.noPromptBridge
    ? {}
    : {
        optimizeVideoPromptsBatch: opts.optimizeVideoPromptsBatch ||
          vi.fn(async (prompts) => (prompts || []).map(p => ({ optimized_prompt: p }))),
      }
  const pipeline = {
    stageExecutor,
    aiGenerator,
    serviceBus,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerStageExecutor(type, fn) { stageExecutor.register(type, fn); return { success: true } },
  }
  const reg = registerVideoGenStages(pipeline)
  const get = (type) => stageExecutor.executors.get(type)
  return { pipeline, get, reg }
}

function makeAi(content) {
  return {
    _modelProviderManager: {
      getDefault: (type) => type === 'llm' ? { id: 'agnes-llm', models: ['agnes-2.0-flash'] } : null,
    },
    generateWithDefault: vi.fn(async () => ({ content, model: 'agnes-2.0-flash' })),
  }
}

describe('videogen 共享阶段执行器', () => {
  it('注册全部 7 个共享阶段类型', () => {
    const { reg, get } = makePipeline(makeAi('x'))
    expect(reg.success).toBe(true)
    expect(reg.registered).toHaveLength(7)
    for (const type of Object.values(VIDEOGEN_STAGE_TYPES)) {
      expect(get(type)).toBeTypeOf('function')
    }
  })

  describe('concept 阶段', () => {
    it('用默认 LLM 生成创意概念', async () => {
      const ai = makeAi('{"role_design": "机器人主角", "visual_style": "赛博朋克", "hook": "觉醒"}')
      const { get } = makePipeline(ai)
      const result = await get(VIDEOGEN_STAGE_TYPES.CONCEPT)({ stage: { kind: 'animation' }, params: { text: 'AI 觉醒' }, context: {} })
      expect(result.success).toBe(true)
      expect(result.output.topic).toBe('AI 觉醒')
    })

    it('缺少主题时失败', async () => {
      const { get } = makePipeline(makeAi('x'))
      const result = await get(VIDEOGEN_STAGE_TYPES.CONCEPT)({ stage: {}, params: {}, context: {} })
      expect(result.success).toBe(false)
    })

    it('默认 LLM 未配置时提示', async () => {
      const { get } = makePipeline({})
      const result = await get(VIDEOGEN_STAGE_TYPES.CONCEPT)({ stage: {}, params: { text: '主题' }, context: {} })
      expect(result.success).toBe(false)
      expect(result.error).toContain('模型设置')
    })
  })

  describe('storyboard 阶段', () => {
    it('把概念拆分为场景数组', async () => {
      const ai = makeAi(JSON.stringify([
        { prompt: '机器人城市全景', text: '开场', duration: 5 },
        { prompt: '机器人觉醒特写', text: '转折', duration: 6 },
      ]))
      const { get } = makePipeline(ai)
      const result = await get(VIDEOGEN_STAGE_TYPES.STORYBOARD)({
        stage: { kind: 'animation' }, params: {}, context: { concept: { concept: '赛博朋克机器人' } },
      })
      expect(result.success).toBe(true)
      expect(result.output).toHaveLength(2)
      expect(result.output[0].prompt).toBe('机器人城市全景')
    })

    it('JSON 解析失败时返回错误', async () => {
      const ai = makeAi('不是 JSON')
      const { get } = makePipeline(ai)
      const result = await get(VIDEOGEN_STAGE_TYPES.STORYBOARD)({
        stage: {}, params: {}, context: { concept: { concept: 'x' } },
      })
      expect(result.success).toBe(false)
    })

    it('从 character-animation 的 character_design 阶段输出解析概念（E2E 回归）', async () => {
      const ai = makeAi(JSON.stringify([{ prompt: '角色慢镜头', text: '开场', duration: 5 }]))
      const { get } = makePipeline(ai)
      const result = await get(VIDEOGEN_STAGE_TYPES.STORYBOARD)({
        stage: { kind: 'character-animation' },
        params: {},
        context: { character_design: { concept: { visual_style: '卡通' }, topic: '主角' } },
      })
      expect(result.success).toBe(true)
      expect(result.output).toHaveLength(1)
      expect(result.output[0].prompt).toBe('角色慢镜头')
    })

    it('从 hybrid 的 plan 阶段文案解析概念（E2E 回归）', async () => {
      const ai = makeAi(JSON.stringify([{ prompt: '混合场景', text: '开场', duration: 5 }]))
      const { get } = makePipeline(ai)
      const result = await get(VIDEOGEN_STAGE_TYPES.STORYBOARD)({
        stage: { kind: 'hybrid' },
        params: {},
        context: { plan: '一条混合口播文案' },
      })
      expect(result.success).toBe(true)
    })
  })

  describe('generate 阶段（provider 门控）', () => {
    it('未配置视频模型时 fail closed 并给出设置引导', async () => {
      const ai = makeAi('x')
      const { get } = makePipeline(ai)
      const result = await get(VIDEOGEN_STAGE_TYPES.GENERATE)({
        runId: 'run_1', stage: {}, params: { text: '主题' }, context: { storyboard: [{ prompt: 'p1' }] },
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('视频生成模型')
      expect(result.errorCode).toBe('VIDEO_MODEL_NOT_CONFIGURED')
    })

    it('从 character-animation 的 rigging 阶段输出解析场景（E2E 回归）', async () => {
      const ai = makeAi('x')
      const { get } = makePipeline(ai)
      const result = await get(VIDEOGEN_STAGE_TYPES.GENERATE)({
        runId: 'run_1', stage: {}, params: { text: '主题' },
        context: { rigging: [{ prompt: '角色动画场景' }] },
      })
      // 场景已解析，随后因缺视频模型 fail closed（不再报 storyboard 缺 context）
      expect(result.success).toBe(false)
      expect(result.error).toContain('视频生成模型')
    })
  })

  describe('generate 阶段（provider 门控）', () => {
    it('未配置视频模型时 fail closed 并给出设置引导', async () => {
      const ai = makeAi('x')
      const { get } = makePipeline(ai)
      const result = await get(VIDEOGEN_STAGE_TYPES.GENERATE)({
        runId: 'run_1', stage: {}, params: { text: '主题' }, context: { storyboard: [{ prompt: 'p1' }] },
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('视频生成模型')
      expect(result.errorCode).toBe('VIDEO_MODEL_NOT_CONFIGURED')
    })
  })


  describe('generate 阶段（视频提示词统一走 prompt-engine）', () => {
    function makeVideoAi (callAdapterImpl) {
      return {
        _modelProviderManager: {
          getDefault: (type) => type === 'llm' ? { id: 'agnes-llm', models: ['agnes-2.0-flash'] } : (type === 'video' ? { id: 'agnes-video', models: ['agnes-video-v2.0'] } : null),
          callAdapter: vi.fn(callAdapterImpl),
        },
        generateWithDefault: vi.fn(async () => ({ content: 'x', model: 'agnes-2.0-flash' })),
      }
    }

    it('场景提示词经 optimizeVideoPromptsBatch 优化后传给 generateVideo', async () => {
      await waitForVideoUrl()
      let captured
      const ai = makeVideoAi(async () => ({ code: 0, data: { taskId: 't1' } }))
      const { get } = makePipeline(ai, null, {
        optimizeVideoPromptsBatch: vi.fn(async (prompts) => prompts.map(p => ({ optimized_prompt: '[opt] ' + p }))),
      })
      ai._modelProviderManager.callAdapter = vi.fn(async (providerId, method, args) => {
        if (method === 'getVideoStatus') return { code: 0, data: { status: 'completed', videoUrl: VIDEO_URL } }
        captured = args
        return { code: 0, data: { taskId: 't1' } }
      })
      const result = await get(VIDEOGEN_STAGE_TYPES.GENERATE)({
        runId: 'run_1', stage: { options: {} }, params: { text: '主题' },
        context: { storyboard: [{ prompt: 'p1' }] },
      })
      expect(result.success).toBe(true)
      expect(ai._modelProviderManager.callAdapter).toHaveBeenCalledWith(
        'agnes-video', 'generateVideo', expect.objectContaining({ prompt: '[opt] p1' }),
      )
      expect(captured.prompt).toBe('[opt] p1')
    }, 20000)

    it('优化结果数量与场景不一致时 fail closed', async () => {
      const ai = makeVideoAi(async () => ({ code: 0, data: { taskId: 't1' } }))
      const { get } = makePipeline(ai, null, {
        optimizeVideoPromptsBatch: vi.fn(async () => [{ optimized_prompt: 'only one' }]),
      })
      const result = await get(VIDEOGEN_STAGE_TYPES.GENERATE)({
        runId: 'run_1', stage: { options: {} }, params: { text: '主题' },
        context: { storyboard: [{ prompt: 'p1' }, { prompt: 'p2' }] },
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('数量与场景不一致')
    })

    it('优化结果含空提示词时 fail closed', async () => {
      const ai = makeVideoAi(async () => ({ code: 0, data: { taskId: 't1' } }))
      const { get } = makePipeline(ai, null, {
        optimizeVideoPromptsBatch: vi.fn(async () => [{ optimized_prompt: '' }]),
      })
      const result = await get(VIDEOGEN_STAGE_TYPES.GENERATE)({
        runId: 'run_1', stage: { options: {} }, params: { text: '主题' },
        context: { storyboard: [{ prompt: 'p1' }] },
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('返回空提示词')
    })

    it('PromptBridge 未注入时明确失败（不静默绕过）', async () => {
      const ai = makeVideoAi(async () => ({ code: 0, data: { taskId: 't1' } }))
      const { get } = makePipeline(ai, null, { noPromptBridge: true })
      const result = await get(VIDEOGEN_STAGE_TYPES.GENERATE)({
        runId: 'run_1', stage: { options: {} }, params: { text: '主题' },
        context: { storyboard: [{ prompt: 'p1' }] },
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('PromptBridge 未注入')
    })

    it('8013 服务异常时明确失败（不静默回退）', async () => {
      const ai = makeVideoAi(async () => ({ code: 0, data: { taskId: 't1' } }))
      const { get } = makePipeline(ai, null, {
        optimizeVideoPromptsBatch: vi.fn(async () => { throw new Error('prompt-engine 未运行') }),
      })
      const result = await get(VIDEOGEN_STAGE_TYPES.GENERATE)({
        runId: 'run_1', stage: { options: {} }, params: { text: '主题' },
        context: { storyboard: [{ prompt: 'p1' }] },
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('视频提示词优化失败')
    })
  })


  describe('generate 阶段（错误透传）', () => {
    function makeAiWithVideoManager (callAdapterImpl) {
      return {
        _modelProviderManager: {
          getDefault: (type) => type === 'llm' ? { id: 'agnes-llm', models: ['agnes-2.0-flash'] } : (type === 'video' ? { id: 'agnes-video', models: ['agnes-video-v2.0'] } : null),
          callAdapter: vi.fn(callAdapterImpl),
        },
        generateWithDefault: vi.fn(async () => ({ content: 'x', model: 'agnes-2.0-flash' })),
      }
    }

    it('callAdapter 返回失败码时透传真实 provider 错误（不再吞成「未返回任务 ID」）', async () => {
      const ai = makeAiWithVideoManager(async () => ({ code: -1, message: 'Missing task_id in response' }))
      const { get } = makePipeline(ai)
      const result = await get(VIDEOGEN_STAGE_TYPES.GENERATE)({
        runId: 'run_1', stage: {}, params: { text: '主题' }, context: { storyboard: [{ prompt: 'p1' }] },
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Missing task_id in response')
      expect(ai._modelProviderManager.callAdapter).toHaveBeenCalledWith('agnes-video', 'generateVideo', expect.any(Object))
    })

    it('callAdapter 成功但响应无 taskId 时保留「未返回任务 ID」提示', async () => {
      const ai = makeAiWithVideoManager(async () => ({ code: 0, data: {} }))
      const { get } = makePipeline(ai)
      const result = await get(VIDEOGEN_STAGE_TYPES.GENERATE)({
        runId: 'run_1', stage: {}, params: { text: '主题' }, context: { storyboard: [{ prompt: 'p1' }] },
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('视频生成未返回任务 ID')
    })

  it('generateVideo 参数契约：双写驼峰+下划线（适配 agnes/ltx）', async () => {
    await waitForVideoUrl()
    let captured
    const ai = makeAiWithVideoManager(async () => ({ code: 0, data: { taskId: 't1' } }))
    const { get } = makePipeline(ai)
    ai._modelProviderManager.callAdapter = vi.fn(async (providerId, method, args) => {
      if (method === 'getVideoStatus') return { code: 0, data: { status: 'completed', videoUrl: VIDEO_URL } }
      captured = args
      return { code: 0, data: { taskId: 't1' } }
    })
    const result = await get(VIDEOGEN_STAGE_TYPES.GENERATE)({
      runId: 'run_1', stage: { options: {} }, params: { text: '主题' },
      context: { storyboard: [{ prompt: 'p1', duration: 5 }] },
    })
    expect(result.success).toBe(true)
    expect(captured.numFrames).toBe(121)
    expect(captured.num_frames).toBe(121)
    expect(captured.frameRate).toBe(24)
    expect(captured.frame_rate).toBe(24)
  }, 20000)

  it('storyboard duration 映射帧数（8 秒场景 → 201 帧）', async () => {
    await waitForVideoUrl()
    let captured
    const ai = makeAiWithVideoManager(async () => ({ code: 0, data: { taskId: 't1' } }))
    const { get } = makePipeline(ai)
    ai._modelProviderManager.callAdapter = vi.fn(async (providerId, method, args) => {
      if (method === 'getVideoStatus') return { code: 0, data: { status: 'completed', videoUrl: VIDEO_URL } }
      captured = args
      return { code: 0, data: { taskId: 't1' } }
    })
    const result = await get(VIDEOGEN_STAGE_TYPES.GENERATE)({
      runId: 'run_1', stage: { options: {} }, params: { text: '主题' },
      context: { storyboard: [{ prompt: 'p1', duration: 8 }] },
    })
    expect(result.success).toBe(true)
    expect(captured.numFrames).toBe(201)
    expect(captured.num_frames).toBe(201)
  }, 20000)

  it('stageOptions.numFrames 显式覆盖优先于 duration 映射', async () => {
    await waitForVideoUrl()
    let captured
    const ai = makeAiWithVideoManager(async () => ({ code: 0, data: { taskId: 't1' } }))
    const { get } = makePipeline(ai)
    ai._modelProviderManager.callAdapter = vi.fn(async (providerId, method, args) => {
      if (method === 'getVideoStatus') return { code: 0, data: { status: 'completed', videoUrl: VIDEO_URL } }
      captured = args
      return { code: 0, data: { taskId: 't1' } }
    })
    const result = await get(VIDEOGEN_STAGE_TYPES.GENERATE)({
      runId: 'run_1', stage: { options: { numFrames: 241, frameRate: 30 } }, params: { text: '主题' },
      context: { storyboard: [{ prompt: 'p1', duration: 5 }] },
    })
    expect(result.success).toBe(true)
    expect(captured.numFrames).toBe(241)
    expect(captured.frameRate).toBe(30)
  }, 20000)

  })

  describe('merge 阶段（context 键兼容）', () => {
    it('animation 流水线生成阶段名为 animate 时也能找到 videos（E2E 回归）', async () => {
      const { get } = makePipeline(makeAi('x'))
      const result = await get(VIDEOGEN_STAGE_TYPES.MERGE)({
        runId: 'run_1', stage: {}, params: {}, context: { animate: { videos: [{ path: 'a.mp4' }, { path: 'b.mp4' }] } },
      })
      // 已成功读取 animate.videos 进入 ffmpeg 拼接；测试环境若 ffmpeg 缺失报「ffmpeg 不可用」，
      // 但不允许再报「需要 context.generate/merge.videos」（即 videos 查找成功）
      expect(result.success).toBe(false)
      expect(result.error).not.toContain('需要 context.generate/merge.videos')
    })

    it('context 完全无 videos 时保持原错误', async () => {
      const { get } = makePipeline(makeAi('x'))
      const result = await get(VIDEOGEN_STAGE_TYPES.MERGE)({
        runId: 'run_1', stage: {}, params: {}, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('需要 context.generate/merge.videos')
    })
  })

  describe('工具函数', () => {
    it('concept 提示词按流水线类型区分', () => {
      expect(buildConceptPrompt('x', 'animation').system).toContain('动画视频')
      expect(buildConceptPrompt('x', 'character-animation').system).toContain('角色动画')
    })

    it('storyboard 提示词要求 JSON', () => {
      expect(buildStoryboardPrompt('概念', 'animation').system).toContain('JSON')
    })

    it('parseJsonArray 容忍说明文字', () => {
      const parsed = parseJsonArray('以下是场景：\n```json\n[{"prompt": "p"}]\n```')
      expect(parsed).toHaveLength(1)
    })
  })
})

describe('推理型 LLM 的默认 max_tokens 预算', () => {
  function makeAiWithLlmModel(model, content) {
    return {
      _modelProviderManager: {
        getDefault: (type) => type === 'llm' ? { id: 'test-llm', models: [model] } : null,
      },
      generateWithDefault: vi.fn(async () => ({ content, model })),
    }
  }

  it('isReasoningLlmModel 识别常见推理型模型', () => {
    expect(isReasoningLlmModel('MiniMax-M3')).toBe(true)
    expect(isReasoningLlmModel('deepseek-reasoner')).toBe(true)
    expect(isReasoningLlmModel('deepseek-v4-flash')).toBe(true)
    expect(isReasoningLlmModel('o3-mini')).toBe(true)
    expect(isReasoningLlmModel('kimi-k2.7')).toBe(true)
    expect(isReasoningLlmModel('agnes-2.0-flash')).toBe(false)
    expect(isReasoningLlmModel('claude-sonnet-4-20250514')).toBe(false)
    expect(isReasoningLlmModel('')).toBe(false)
  })

  it('默认 LLM 为推理型时 storyboard 自动放大 max_tokens 到 5000（防思考块截断 JSON）', async () => {
    const content = JSON.stringify([{ prompt: '机器人城市全景', text: '开场', duration: 5 }])
    const ai = makeAiWithLlmModel('MiniMax-M3', content)
    const { get } = makePipeline(ai)
    const result = await get(VIDEOGEN_STAGE_TYPES.STORYBOARD)({
      stage: { kind: 'animation' }, params: {}, context: { concept: { concept: 'x' } },
    })
    expect(result.success).toBe(true)
    expect(ai.generateWithDefault.mock.calls[0][1].max_tokens).toBe(REASONING_LLM_MAX_TOKENS)
  })

  it('默认 LLM 为非推理型时保持 1600', async () => {
    const content = JSON.stringify([{ prompt: 'p', text: 't', duration: 5 }])
    const ai = makeAiWithLlmModel('agnes-2.0-flash', content)
    const { get } = makePipeline(ai)
    const result = await get(VIDEOGEN_STAGE_TYPES.STORYBOARD)({
      stage: { kind: 'animation' }, params: {}, context: { concept: { concept: 'x' } },
    })
    expect(result.success).toBe(true)
    expect(ai.generateWithDefault.mock.calls[0][1].max_tokens).toBe(DEFAULT_LLM_MAX_TOKENS)
  })

  it('显式 maxTokens 覆盖推理型默认预算', async () => {
    const ai = makeAiWithLlmModel('MiniMax-M3', 'ok')
    await callDefaultLlm(ai, 'system', 'user', 1234)
    expect(ai.generateWithDefault.mock.calls[0][1].max_tokens).toBe(1234)
  })
})
