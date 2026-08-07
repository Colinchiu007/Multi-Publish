// @vitest-environment node
const {
  registerLocalizationStages,
  LOCALIZATION_STAGE_TYPES,
  buildTranslatePrompt,
  parseTranslations,
  buildSegments,
} = require('./localization-stages')

function makeStageExecutor() {
  const executors = new Map()
  return { executors, register(type, fn) { executors.set(type, fn) } }
}

function makePipeline(aiGenerator, inner) {
  const stageExecutor = makeStageExecutor()
  const pipeline = {
    stageExecutor,
    aiGenerator,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerStageExecutor(type, fn) { stageExecutor.register(type, fn); return { success: true } },
  }
  if (inner) stageExecutor.execute = inner
  const reg = registerLocalizationStages(pipeline)
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

describe('localization-dub 阶段执行器', () => {
  it('注册全部 4 个自定义阶段类型', () => {
    const { reg, get } = makePipeline(makeAi('x'))
    expect(reg.success).toBe(true)
    expect(reg.registered).toHaveLength(4)
    for (const type of Object.values(LOCALIZATION_STAGE_TYPES)) {
      expect(get(type)).toBeTypeOf('function')
    }
  })

  describe('buildSegments / parseTranslations / buildTranslatePrompt', () => {
    it('按行分句并均分时长', () => {
      const segments = buildSegments('第一句。\n第二句。\n第三句。', 9)
      expect(segments).toHaveLength(3)
      expect(segments[0]).toMatchObject({ text: '第一句。', start: 0, end: 3 })
      expect(segments[2].end).toBe(9)
    })

    it('空文案返回空数组', () => {
      expect(buildSegments('', 10)).toHaveLength(0)
    })

    it('翻译提示词带目标语言', () => {
      const { system, user } = buildTranslatePrompt([{ text: '你好' }], '英文')
      expect(system).toContain('英文')
      expect(user).toContain('你好')
    })

    it('解析翻译结果（序号. 译文）', () => {
      const parsed = parseTranslations('1. Hello\n2. Goodbye', 2)
      expect(parsed).toEqual(['Hello', 'Goodbye'])
    })
  })

  describe('transcribe 阶段', () => {
    it('缺少视频时失败', async () => {
      const { get } = makePipeline(makeAi('x'))
      const result = await get(LOCALIZATION_STAGE_TYPES.TRANSCRIBE)({ params: {} })
      expect(result.success).toBe(false)
      expect(result.error).toContain('视频')
    })

    it('视频路径不可读时失败（视频校验先于文案校验）', async () => {
      const { get } = makePipeline(makeAi('x'))
      const result = await get(LOCALIZATION_STAGE_TYPES.TRANSCRIBE)({ params: { video: 'C:/no-such.mp4', text: '台词' } })
      expect(result.success).toBe(false)
      expect(result.error).toContain('视频')
    })
  })

  describe('translate 阶段', () => {
    it('把台词翻译为目标语言并保留时间段', async () => {
      const ai = makeAi('1. Hello\n2. Good morning')
      const { get } = makePipeline(ai)
      const result = await get(LOCALIZATION_STAGE_TYPES.TRANSLATE)({
        stage: {},
        params: {},
        context: {
          transcribe: {
            videoPath: 'C:/v.mp4', duration: 10, targetLanguage: 'en',
            segments: [{ index: 0, text: '你好', start: 0, end: 5 }, { index: 1, text: '早上好', start: 5, end: 10 }],
          },
        },
      })
      expect(result.success).toBe(true)
      expect(result.output.segments[0].translatedText).toBe('Hello')
      expect(result.output.segments[1].translatedText).toBe('Good morning')
      expect(result.output.segments[0].start).toBe(0)
    })

    it('缺少 context.transcribe 时失败', async () => {
      const { get } = makePipeline(makeAi('x'))
      const result = await get(LOCALIZATION_STAGE_TYPES.TRANSLATE)({ stage: {}, params: {}, context: {} })
      expect(result.success).toBe(false)
      expect(result.error).toContain('transcribe')
    })
  })

  describe('tts 阶段', () => {
    it('为每段译文生成配音并透传 audioPath', async () => {
      const inner = vi.fn(async ({ stage }) => ({ success: true, output: { scenes: [] } }))
      const ai = makeAi('x')
      const { get } = makePipeline(ai, inner)
      // 使用带 serviceBus 的 pipeline
      const stageExecutor = makeStageExecutor()
      const serviceBus = {
        _assetGenerator: { generateTTS: vi.fn(async () => ({ path: 'C:/tts/0.mp3' })) },
      }
      const pipeline2 = {
        stageExecutor,
        aiGenerator: ai,
        _assetGenerator: serviceBus._assetGenerator,
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        registerStageExecutor(type, fn) { stageExecutor.register(type, fn); return { success: true } },
      }
      registerLocalizationStages(pipeline2)
      const result = await stageExecutor.executors.get(LOCALIZATION_STAGE_TYPES.TTS)({
        runId: 'run_1',
        stage: { options: {} },
        params: {},
        context: {
          translate: {
            videoPath: 'C:/v.mp4', duration: 10, targetLanguage: 'en',
            segments: [{ index: 0, text: '你好', translatedText: 'Hello', start: 0, end: 5 }],
          },
        },
      })
      expect(result.success).toBe(true)
      expect(result.output.segments[0].audioPath).toBe('C:/tts/0.mp3')
      expect(serviceBus._assetGenerator.generateTTS).toHaveBeenCalledTimes(1)
    })

    it('全部配音失败时返回错误', async () => {
      const ai = makeAi('x')
      const stageExecutor = makeStageExecutor()
      const pipeline2 = {
        stageExecutor,
        aiGenerator: ai,
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        registerStageExecutor(type, fn) { stageExecutor.register(type, fn); return { success: true } },
      }
      registerLocalizationStages(pipeline2)
      const result = await stageExecutor.executors.get(LOCALIZATION_STAGE_TYPES.TTS)({
        runId: 'run_1',
        stage: { options: {} },
        params: {},
        context: { translate: { videoPath: 'C:/v.mp4', segments: [{ index: 0, text: '你好', translatedText: 'Hello' }] } },
      })
      expect(result.success).toBe(false)
    })
  })
})
