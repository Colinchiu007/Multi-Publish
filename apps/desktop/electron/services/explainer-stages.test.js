// @vitest-environment node
const {
  registerExplainerStages,
  EXPLAINER_STAGE_TYPES,
  parseScenesJson,
  normalizeScenes,
} = require('./explainer-stages')

function makeStageExecutor() {
  const executors = new Map()
  return {
    executors,
    register(type, fn) { executors.set(type, fn) },
  }
}

function makePipeline(aiGenerator, innerExecutor) {
  const stageExecutor = makeStageExecutor()
  const pipeline = {
    stageExecutor,
    aiGenerator,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerStageExecutor(type, fn) {
      stageExecutor.register(type, fn)
      return { success: true }
    },
  }
  if (innerExecutor) {
    stageExecutor.execute = innerExecutor
  }
  const reg = registerExplainerStages(pipeline)
  const get = (type) => stageExecutor.executors.get(type)
  return { pipeline, get, reg }
}

function makeAi(content) {
  return {
    _modelProviderManager: {
      getDefault: () => ({ id: 'agnes-llm', models: ['agnes-2.0-flash'] }),
    },
    generateWithDefault: vi.fn(async () => ({ content, model: 'agnes-2.0-flash' })),
  }
}

describe('animated-explainer 阶段执行器', () => {
  it('注册全部 6 个自定义阶段类型', () => {
    const { reg, get } = makePipeline(makeAi('x'))
    expect(reg.success).toBe(true)
    expect(reg.registered).toHaveLength(6)
    for (const type of Object.values(EXPLAINER_STAGE_TYPES)) {
      expect(get(type)).toBeTypeOf('function')
    }
  })

  describe('research 阶段', () => {
    it('用默认 LLM 生成大纲', async () => {
      const ai = makeAi('1. 起源：…\n2. 发展：…')
      const { get } = makePipeline(ai)
      const result = await get(EXPLAINER_STAGE_TYPES.RESEARCH)({
        stage: {},
        params: { text: '人工智能的历史' },
        context: {},
      })
      expect(result.success).toBe(true)
      expect(result.output).toContain('起源')
      expect(ai.generateWithDefault).toHaveBeenCalledWith('llm', expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: expect.stringContaining('人工智能的历史') }),
        ]),
      }))
    })

    it('缺少主题时失败', async () => {
      const { get } = makePipeline(makeAi('x'))
      const result = await get(EXPLAINER_STAGE_TYPES.RESEARCH)({
        stage: {}, params: {}, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('非空主题')
    })

    it('未配置默认 LLM 时失败', async () => {
      const { get } = makePipeline({
        generateWithDefault: vi.fn(async () => ({ content: 'x' })),
      })
      const result = await get(EXPLAINER_STAGE_TYPES.RESEARCH)({
        stage: {}, params: { text: '主题' }, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('未找到需要的相关模型')
    })

    it('LLM 返回空内容时失败', async () => {
      const { get } = makePipeline(makeAi('   '))
      const result = await get(EXPLAINER_STAGE_TYPES.RESEARCH)({
        stage: {}, params: { text: '主题' }, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('返回空内容')
    })
  })

  describe('proposal / script 阶段', () => {
    it('proposal 依赖 context.research', async () => {
      const { get } = makePipeline(makeAi('分镜1：… | 要点'))
      const missing = await get(EXPLAINER_STAGE_TYPES.PROPOSAL)({
        stage: {}, params: {}, context: {},
      })
      expect(missing.success).toBe(false)
      const ok = await get(EXPLAINER_STAGE_TYPES.PROPOSAL)({
        stage: {}, params: {}, context: { research: '大纲' },
      })
      expect(ok.success).toBe(true)
    })

    it('script 依赖 context.proposal', async () => {
      const { get } = makePipeline(makeAi('第一段旁白。\n\n第二段旁白。'))
      const missing = await get(EXPLAINER_STAGE_TYPES.SCRIPT)({
        stage: {}, params: {}, context: {},
      })
      expect(missing.success).toBe(false)
      const ok = await get(EXPLAINER_STAGE_TYPES.SCRIPT)({
        stage: {}, params: {}, context: { proposal: '方案' },
      })
      expect(ok.success).toBe(true)
    })
  })
})

describe('scenes 阶段与 JSON 解析', () => {
  const scenesJson = JSON.stringify([
    { prompt: '海边日出，暖色调', text: '清晨，太阳从海平面升起。', duration: 6 },
    { prompt: '沙滩上的脚印', text: '潮水轻轻拍打沙滩。', duration: 5 },
  ])

  it('解析带 markdown 围栏的 LLM 输出', () => {
    expect(parseScenesJson('```json\n' + scenesJson + '\n```')).toHaveLength(2)
    expect(parseScenesJson('说明文字。' + scenesJson + '结束。')).toHaveLength(2)
    expect(parseScenesJson('没有数组')).toBeNull()
  })

  it('normalizeScenes 过滤无效项并限制数量与默认时长', () => {
    const normalized = normalizeScenes([
      { prompt: 'p1', text: 't1' },
      { prompt: '', text: 'bad prompt' },
      { text: 'no prompt' },
      { prompt: 'p3', text: 't3', duration: 99 },
    ])
    expect(normalized).toHaveLength(2)
    expect(normalized[0].duration).toBe(6)
    expect(normalized[1].duration).toBe(99)
    const many = normalizeScenes(
      Array.from({ length: 40 }, (_, i) => ({ prompt: 'p' + i, text: 't' + i })),
    )
    expect(many).toHaveLength(30)
  })

  it('scenes 阶段输出规范化场景数组', async () => {
    const ai = makeAi('```json\n' + scenesJson + '\n```')
    const { get } = makePipeline(ai)
    const result = await get(EXPLAINER_STAGE_TYPES.SCENES)({
      stage: {},
      params: {},
      context: { script: '旁白文案。' },
    })
    expect(result.success).toBe(true)
    expect(result.output).toHaveLength(2)
    expect(result.output[0]).toMatchObject({ prompt: '海边日出，暖色调', text: '清晨，太阳从海平面升起。', duration: 6 })
  })

  it('scenes 阶段解析失败时报可行动错误', async () => {
    const { get } = makePipeline(makeAi('抱歉，我无法生成。'))
    const result = await get(EXPLAINER_STAGE_TYPES.SCENES)({
      stage: {},
      params: {},
      context: { script: '旁白文案。' },
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('解析出有效场景数组')
  })
})

describe('generate_assets 适配与 editing', () => {
  it('generate_assets 通过适配 context 复用 story2video 执行器', async () => {
    const inner = vi.fn(async () => ({ success: true, output: { scenes: [{ text: 'x' }] } }))
    const { get } = makePipeline(makeAi('x'), inner)
    const scenes = [{ prompt: 'p1', text: 't1', duration: 6 }]
    const result = await get(EXPLAINER_STAGE_TYPES.GENERATE_ASSETS)({
      runId: 'run_1',
      stage: { options: { concurrency: 2 } },
      params: {},
      context: { scenes },
    })
    expect(result.success).toBe(true)
    expect(inner).toHaveBeenCalledWith(expect.objectContaining({
      stage: expect.objectContaining({ name: 'assets', type: 'story2video_generate_assets' }),
      context: expect.objectContaining({
        optimize: [{ optimized_prompt: 'p1', prompt: 'p1' }],
        split: scenes,
      }),
    }))
  })

  it('generate_assets 缺少场景或提示词时失败', async () => {
    const { get } = makePipeline(makeAi('x'), vi.fn())
    const noScenes = await get(EXPLAINER_STAGE_TYPES.GENERATE_ASSETS)({
      runId: 'r', stage: {}, params: {}, context: {},
    })
    expect(noScenes.success).toBe(false)
    const noPrompt = await get(EXPLAINER_STAGE_TYPES.GENERATE_ASSETS)({
      runId: 'r', stage: {}, params: {},
      context: { scenes: [{ prompt: '', text: 't' }] },
    })
    expect(noPrompt.success).toBe(false)
    expect(noPrompt.error).toContain('缺少画面提示词')
  })

  it('editing 校验资源清单并透传', async () => {
    const manifest = { scenes: [{ text: 't', imagePath: 'a.jpg' }] }
    const { get } = makePipeline(makeAi('x'))
    const ok = await get(EXPLAINER_STAGE_TYPES.EDITING)({
      stage: {}, params: {}, context: { assets: manifest },
    })
    expect(ok.success).toBe(true)
    expect(ok.output).toBe(manifest)
    const bad = await get(EXPLAINER_STAGE_TYPES.EDITING)({
      stage: {}, params: {}, context: {},
    })
    expect(bad.success).toBe(false)
  })
})
