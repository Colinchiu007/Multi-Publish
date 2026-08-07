// @vitest-environment node
const {
  registerVideoGenStages,
  VIDEOGEN_STAGE_TYPES,
  buildConceptPrompt,
  buildStoryboardPrompt,
  parseJsonArray,
} = require('./videogen-stages')

function makeStageExecutor() {
  const executors = new Map()
  return { executors, register(type, fn) { executors.set(type, fn) } }
}

function makePipeline(aiGenerator, manager) {
  const stageExecutor = makeStageExecutor()
  const pipeline = {
    stageExecutor,
    aiGenerator,
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
