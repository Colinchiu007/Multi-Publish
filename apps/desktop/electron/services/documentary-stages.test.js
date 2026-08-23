// @vitest-environment node
const {
  registerDocumentaryStages,
  DOCUMENTARY_STAGE_TYPES,
  buildResearchPrompt,
  buildIngestPrompt,
  parseScenesJson,
  normalizeScenes,
} = require('./documentary-stages')

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
  const reg = registerDocumentaryStages(pipeline)
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

describe('documentary-montage 阶段执行器', () => {
  it('注册全部 4 个自定义阶段类型', () => {
    const { reg, get } = makePipeline(makeAi('x'))
    expect(reg.success).toBe(true)
    expect(reg.registered).toHaveLength(4)
    for (const type of Object.values(DOCUMENTARY_STAGE_TYPES)) {
      expect(get(type)).toBeTypeOf('function')
    }
  })

  describe('research 阶段', () => {
    it('用默认 LLM 生成纪录片大纲', async () => {
      const ai = makeAi('1. 背景：…\n2. 现场：…')
      const { get } = makePipeline(ai)
      const events = []
      const result = await get(DOCUMENTARY_STAGE_TYPES.RESEARCH)({
        stage: {},
        params: { text: '长江大桥的历史' },
        context: {},
        onProgress: event => events.push(event),
      })
      expect(result.success).toBe(true)
      expect(result.output).toContain('背景')
      expect(ai.generateWithDefault).toHaveBeenCalledWith('llm', expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: expect.stringContaining('长江大桥的历史') }),
        ]),
      }))
      expect(events).toEqual([
        expect.objectContaining({ percent: 0, messageKey: 'stageProgress.documentaryResearch' }),
        expect.objectContaining({ percent: 100, summaryKey: 'stageProgress.documentaryResearchSummary' }),
      ])
    })

    it('缺少主题时失败', async () => {
      const { get } = makePipeline(makeAi('x'))
      const result = await get(DOCUMENTARY_STAGE_TYPES.RESEARCH)({
        stage: {}, params: {}, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('非空主题')
    })

    it('默认 LLM 未配置时提示添加模型', async () => {
      const { get } = makePipeline({})
      const result = await get(DOCUMENTARY_STAGE_TYPES.RESEARCH)({
        stage: {}, params: { text: '主题' }, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('模型设置')
    })
  })

  describe('ingest 阶段', () => {
    it('把大纲转为场景数组（JSON）', async () => {
      const ai = makeAi(JSON.stringify([
        { prompt: '长江大桥全景，清晨光线', text: '长江大桥始建于上世纪。', duration: 6 },
        { prompt: '桥面车流特写', text: '如今每天数十万车辆通过。', duration: 5 },
      ]))
      const { get } = makePipeline(ai)
      const result = await get(DOCUMENTARY_STAGE_TYPES.INGEST)({
        stage: {},
        params: {},
        context: { research: '1. 建设历程：…' },
      })
      expect(result.success).toBe(true)
      expect(result.output).toHaveLength(2)
      expect(result.output[0]).toMatchObject({ prompt: '长江大桥全景，清晨光线', text: '长江大桥始建于上世纪。', duration: 6 })
    })

    it('JSON 解析失败时走行级兜底', async () => {
      const ai = makeAi('这不是 JSON\n只是普通大纲文本')
      const { get } = makePipeline(ai)
      const result = await get(DOCUMENTARY_STAGE_TYPES.INGEST)({
        stage: {},
        params: {},
        context: { research: '1. 建设历程：\n2. 桥梁结构：' },
      })
      expect(result.success).toBe(true)
      expect(result.output.length).toBeGreaterThan(0)
      expect(result.output[0].text).toBeTruthy()
    })

    it('缺少 context.research 时失败', async () => {
      const { get } = makePipeline(makeAi('x'))
      const result = await get(DOCUMENTARY_STAGE_TYPES.INGEST)({
        stage: {}, params: {}, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('context.research')
    })
  })

  describe('edit 阶段（复用 generate_assets）', () => {
    it('透传场景并调用内层 story2video_generate_assets', async () => {
      const inner = vi.fn(async ({ stage }) => {
        expect(stage.type).toBe('story2video_generate_assets')
        return { success: true, output: { scenes: [] } }
      })
      const ai = makeAi('x')
      const { get } = makePipeline(ai, inner)
      const scenes = [
        { prompt: '纪实画面A', text: '旁白A', duration: 6 },
        { prompt: '纪实画面B', text: '旁白B', duration: 6 },
      ]
      const result = await get(DOCUMENTARY_STAGE_TYPES.EDIT)({
        runId: 'run_1',
        stage: { options: {} },
        params: { inputMode: 'text' },
        context: { ingest: scenes },
      })
      expect(result.success).toBe(true)
      expect(inner).toHaveBeenCalledTimes(1)
      expect(inner.mock.calls[0][0].context.optimize).toHaveLength(2)
      expect(inner.mock.calls[0][0].context.split).toHaveLength(2)
    })

    it('缺少 context.ingest 时失败', async () => {
      const { get } = makePipeline(makeAi('x'))
      const result = await get(DOCUMENTARY_STAGE_TYPES.EDIT)({
        runId: 'run_1', stage: { options: {} }, params: {}, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('context.ingest')
    })
  })

  describe('narrate 阶段', () => {
    it('校验通过并透传资源清单', async () => {
      const { get } = makePipeline(makeAi('x'))
      const manifest = { scenes: [{ imagePath: '/img/0.png', audioPath: '/tts/0.mp3' }] }
      const result = await get(DOCUMENTARY_STAGE_TYPES.NARRATE)({
        stage: {}, params: {}, context: { edit: manifest },
      })
      expect(result.success).toBe(true)
      expect(result.output).toBe(manifest)
    })

    it('存在缺少旁白的场景时失败', async () => {
      const { get } = makePipeline(makeAi('x'))
      const manifest = { scenes: [{ imagePath: '/img/0.png' }] }
      const result = await get(DOCUMENTARY_STAGE_TYPES.NARRATE)({
        stage: {}, params: {}, context: { edit: manifest },
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('缺少旁白')
    })

    it('资源清单缺失时失败', async () => {
      const { get } = makePipeline(makeAi('x'))
      const result = await get(DOCUMENTARY_STAGE_TYPES.NARRATE)({
        stage: {}, params: {}, context: {},
      })
      expect(result.success).toBe(false)
    })
  })

  describe('提示词与解析工具', () => {
    it('research 提示词为纪录片风格', () => {
      const { system, user } = buildResearchPrompt('长江大桥')
      expect(system).toContain('纪录片')
      expect(user).toContain('长江大桥')
    })

    it('ingest 提示词要求纪实风格画面', () => {
      const { system } = buildIngestPrompt('大纲文本')
      expect(system).toContain('纪实')
      expect(system).toContain('JSON')
    })

    it('parseScenesJson 容忍 markdown 围栏与包装对象', () => {
      const raw = '```json\n{"scenes": [{"prompt": "p", "text": "t", "duration": 6}]}\n```'
      const parsed = parseScenesJson(raw)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].text).toBe('t')
    })

    it('normalizeScenes 过滤无效项并截断上限', () => {
      const scenes = [
        { prompt: 'p1', text: 't1', duration: 5 },
        { prompt: '', text: 't2', duration: 5 },
        null,
      ]
      const normalized = normalizeScenes(scenes, 'fallback')
      expect(normalized).toHaveLength(1)
      expect(normalized[0].prompt).toBe('p1')
    })
  })
})
