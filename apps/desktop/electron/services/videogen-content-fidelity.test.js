// @vitest-environment node
/**
 * video-content-fidelity：分镜双模式 + 段落化 + 内容对齐门禁 + context 注入 测试
 */
const {
  registerVideoGenStages,
  VIDEOGEN_STAGE_TYPES,
  resolveStoryboardMode,
  buildConceptPrompt,
  buildStoryboardPrompt,
  buildVideoOptimizeContext,
} = require('./videogen-stages')
const { checkSceneAlignment, assessVisualConsistency } = require('./video-content-alignment')
const { segmentScript } = require('./video-script-segmentation')

function makeStageExecutor () {
  const executors = new Map()
  return { executors, register (type, fn) { executors.set(type, fn) } }
}

function makePipeline (aiGenerator) {
  const stageExecutor = makeStageExecutor()
  const serviceBus = {
    optimizeVideoPromptsBatch: (prompts) => Promise.resolve((prompts || []).map(p => ({ optimized_prompt: p }))),
  }
  const pipeline = {
    stageExecutor,
    aiGenerator,
    serviceBus,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerStageExecutor (type, fn) { stageExecutor.register(type, fn); return { success: true } },
  }
  registerVideoGenStages(pipeline)
  const get = (type) => stageExecutor.executors.get(type)
  return { pipeline, get }
}

function makeAi (content) {
  return {
    _modelProviderManager: {
      getDefault: (type) => type === 'llm' ? { id: 'agnes-llm', models: ['agnes-2.0-flash'] } : null,
    },
    generateWithDefault: vi.fn(async () => ({ content, model: 'agnes-2.0-flash' })),
  }
}

const LONG_TEXT = '关羽那么厉害，为什么三国志里没有细节描写？假如你是个混过职场、或者懂点晋升规律的人。' +
  '当你翻开陈寿的《三国志·蜀书》，会觉得特别别扭。我们先瞅瞅曹魏阵营的将领是怎么升职的。' +
  '张辽、徐晃、张郃，这些五子良将，履历表上写满了清晰记录。跟过哪个领导，打过哪场硬仗。' +
  '怎么一步步从基层小官，混成独当一面的大军区司令，陈寿记录得一清二楚。' +
  '可是，当你转头看刘备、关羽、张飞这哥仨，画风突变。刘备是涿县卖草鞋的底层宗室。' +
  '关羽是河东杀了人跑路到涿郡的通缉犯。张飞是卖酒杀猪的屠夫。' +
  '他们得交无数次的学费，才能弄明白怎么带兵打仗。' +
  '可《三国志》是怎么记的？书里对这三人早期的战斗经历，几乎是全空白、零描写。' +
  '关羽、张飞皆称万人之敌，为世虎臣。程昱和郭嘉，更是直接在曹操跟前盖章。' +
  '随后的白马之战，策马刺良于万众之中，斩其首还，遂解白马围。' +
  '到了建安二十四年的襄樊之战，关羽水淹七军，威震华夏，曹操想迁都。'

describe('resolveStoryboardMode 自动判定', () => {
  it('短句（≤80 字且 ≤2 句）→ creative', () => {
    const r = resolveStoryboardMode('一只戴帽子的猫在月球上喝茶', undefined)
    expect(r.mode).toBe('creative')
    expect(r.reason).toContain('auto:creative')
  })

  it('长文案（≥300 字或句数多）→ fidelity', () => {
    const r = resolveStoryboardMode(LONG_TEXT, undefined)
    expect(r.mode).toBe('fidelity')
    expect(r.reason).toContain('auto:fidelity')
  })

  it('中间态 → hybrid', () => {
    const r = resolveStoryboardMode('这是中等长度的文案。有明确主题。分三个论点展开。最后总结。', undefined)
    expect(r.mode).toBe('hybrid')
  })

  it('显式 storyboardMode 覆盖自动判定', () => {
    expect(resolveStoryboardMode('短句', 'fidelity').mode).toBe('fidelity')
    expect(resolveStoryboardMode(LONG_TEXT, 'creative').mode).toBe('creative')
  })

  it('非法显式值归一化为 auto 规则', () => {
    expect(resolveStoryboardMode('短句', 'bogus').mode).toBe('creative')
  })
})

describe('buildConceptPrompt 双模式', () => {
  it('creative 保留原始 prompt（无保真约束）', () => {
    const p = buildConceptPrompt('主题', 'animation', 'creative')
    expect(p.system).not.toContain('忠实原文')
    expect(p.system).not.toContain('key_facts')
  })

  it('fidelity 注入硬保真约束 + key_facts/entities', () => {
    const p = buildConceptPrompt('主题', 'animation', 'fidelity')
    expect(p.system).toContain('忠实原文')
    expect(p.system).toContain('key_facts')
    expect(p.system).toContain('不得改变人物身份')
  })

  it('hybrid 允许可视化演绎', () => {
    const p = buildConceptPrompt('主题', 'animation', 'hybrid')
    expect(p.system).toContain('允许合理可视化演绎')
  })
})

describe('buildStoryboardPrompt 保真注入', () => {
  it('fidelity 注入分段 + key_facts/entities + source_paras 约束', () => {
    const p = buildStoryboardPrompt({ visual_style: '历史纪实' }, 'animation', {
      mode: 'fidelity',
      paragraphs: [{ index: 0, text: '段落一' }, { index: 1, text: '段落二' }],
      keyFacts: ['关羽水淹七军'],
      entities: ['关羽', '水淹七军'],
    })
    expect(p.user).toContain('[0] 段落一')
    expect(p.user).toContain('关键事实：关羽水淹七军')
    expect(p.user).toContain('关键实体：关羽、水淹七军')
    expect(p.system).toContain('source_paras')
    expect(p.system).toContain('关键事件')
  })

  it('creative 不注入分段与保真约束', () => {
    const p = buildStoryboardPrompt('创意概念', 'animation', { mode: 'creative' })
    expect(p.system).not.toContain('source_paras')
    expect(p.user).not.toContain('原文分段')
  })

  it('重试提示追加到 user 消息', () => {
    const p = buildStoryboardPrompt({ visual_style: 'x' }, 'animation', {
      mode: 'fidelity',
      paragraphs: [],
      retryHint: '请补充水淹七军场景',
    })
    expect(p.user).toContain('补充要求：请补充水淹七军场景')
  })
})

describe('buildVideoOptimizeContext', () => {
  it('构造白名单 context 键', () => {
    const ctx = buildVideoOptimizeContext(
      { hook: '三国历史揭秘', key_facts: ['关羽北伐'], entities: ['关羽', '曹操'], role_design: '关羽', visual_style: '历史纪实' },
      [{ index: 0, text: '文案段落' }],
    )
    expect(Object.keys(ctx).sort()).toEqual(['character', 'character_list', 'full_text', 'setting', 'synopsis'])
    expect(ctx.full_text).toContain('文案段落')
    expect(ctx.character_list).toEqual(['关羽', '曹操'])
  })

  it('无内容时返回 undefined', () => {
    expect(buildVideoOptimizeContext({}, [])).toBeUndefined()
  })
})

describe('CONCEPT 阶段双模式', () => {
  it('fidelity 解析 key_facts/entities/mode', async () => {
    const ai = makeAi(JSON.stringify({
      role_design: '关羽', visual_style: '历史纪实', hook: '被抹去的战绩',
      key_facts: ['关羽水淹七军'], entities: ['关羽', '水淹七军'], mode: 'fidelity',
    }))
    const { get } = makePipeline(ai)
    const result = await get(VIDEOGEN_STAGE_TYPES.CONCEPT)({
      stage: { kind: 'animation' }, params: { text: LONG_TEXT }, context: {},
    })
    expect(result.success).toBe(true)
    expect(result.output.storyboardMode).toBe('fidelity')
    expect(result.output.concept.key_facts).toContain('关羽水淹七军')
    expect(result.output.concept.entities).toContain('关羽')
  })

  it('fidelity 缺 key_facts 时重试一次后成功', async () => {
    const ai = makeAi('x')
    ai.generateWithDefault
      .mockReturnValueOnce({ content: '{"role_design":"a","visual_style":"b","hook":"c"}' })
      .mockReturnValueOnce({ content: JSON.stringify({ role_design: 'a', visual_style: 'b', hook: 'c', key_facts: ['f'], entities: ['e'], mode: 'fidelity' }) })
    const { get } = makePipeline(ai)
    const result = await get(VIDEOGEN_STAGE_TYPES.CONCEPT)({
      stage: { kind: 'animation' }, params: { text: LONG_TEXT }, context: {},
    })
    expect(result.success).toBe(true)
    expect(ai.generateWithDefault).toHaveBeenCalledTimes(2)
  })

  it('fidelity 两次都缺 key_facts → fail closed CONCEPT_FACTS_MISSING', async () => {
    const ai = makeAi('{"role_design":"a","visual_style":"b","hook":"c"}')
    const { get } = makePipeline(ai)
    const result = await get(VIDEOGEN_STAGE_TYPES.CONCEPT)({
      stage: { kind: 'animation' }, params: { text: LONG_TEXT }, context: {},
    })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('CONCEPT_FACTS_MISSING')
  })

  it('creative 短输入保持原行为（输出 topic）', async () => {
    const ai = makeAi('{"role_design":"机器人","visual_style":"赛博","hook":"觉醒"}')
    const { get } = makePipeline(ai)
    const result = await get(VIDEOGEN_STAGE_TYPES.CONCEPT)({
      stage: { kind: 'animation' }, params: { text: 'AI 觉醒' }, context: {},
    })
    expect(result.success).toBe(true)
    expect(result.output.storyboardMode).toBe('creative')
    expect(result.output.topic).toBe('AI 觉醒')
  })
})

describe('STORYBOARD 阶段保真 + 对齐门禁', () => {
  function fidelityContext (opts = {}) {
    // 精简文案：只命中 5 个词典实体（关羽/刘备/曹操/三国志/水淹七军），门禁覆盖度可精确控制
    const shortText = opts.fullText || '关羽与刘备在三国志中有记载。曹操评价关羽。关羽水淹七军。'
    return {
      stage: { kind: 'animation' },
      params: {},
      context: {
        params: { text: shortText },
        concept: {
          concept: { visual_style: '历史纪实' },
          topic: shortText,
          storyboardMode: 'fidelity',
          key_facts: ['关羽水淹七军'],
          entities: opts.entities || ['关羽', '刘备', '曹操', '三国志', '水淹七军'],
        },
      },
    }
  }

  it('fidelity 保留 source_paras 且覆盖达标通过', async () => {
    const ai = makeAi(JSON.stringify([
      { prompt: '关羽率军北伐，水淹七军', text: '襄樊之战', duration: 6, source_paras: [0] },
      { prompt: '曹操与刘备对峙，三国志记载', text: '曹刘', duration: 5, source_paras: [1] },
      { prompt: '关羽策马刺颜良，三国志白马之战', text: '白马', duration: 6, source_paras: [2] },
    ]))
    const { get } = makePipeline(ai)
    const result = await get(VIDEOGEN_STAGE_TYPES.STORYBOARD)(fidelityContext())
    expect(result.success).toBe(true)
    expect(result.output[0].source_paras).toEqual([0])
    expect(result.output).toHaveLength(3)
  })

  it('覆盖不足时带缺失清单重试，第二次通过', async () => {
    const ai = makeAi('x')
    ai.generateWithDefault
      .mockReturnValueOnce({ content: JSON.stringify([{ prompt: '关羽领军', text: 't', duration: 5 }]) })
      .mockReturnValueOnce({ content: JSON.stringify([
        { prompt: '关羽领军，水淹七军', text: 't', duration: 5 },
        { prompt: '三国志记载曹操与刘备', text: 't', duration: 5 },
        { prompt: '关羽', text: 't', duration: 5 },
        { prompt: '刘备', text: 't', duration: 5 },
      ]) })
    const { get, pipeline } = makePipeline(ai)
    const result = await get(VIDEOGEN_STAGE_TYPES.STORYBOARD)(fidelityContext())
    expect(result.success).toBe(true)
    expect(ai.generateWithDefault).toHaveBeenCalledTimes(2)
    expect(pipeline.log.info).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('对齐不足'))
  })

  it('重试耗尽仍不覆盖 → fail closed STORYBOARD_ALIGNMENT_FAILED', async () => {
    const ai = makeAi('x')
    ai.generateWithDefault.mockReturnValue({ content: JSON.stringify([{ prompt: '无关画面', text: 't', duration: 5 }]) })
    const { get } = makePipeline(ai)
    const result = await get(VIDEOGEN_STAGE_TYPES.STORYBOARD)(fidelityContext())
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('STORYBOARD_ALIGNMENT_FAILED')
    expect(result.error).toContain('未覆盖文案关键内容')
  })

  it('空场景数组 fail closed STORYBOARD_EMPTY_SCENES', async () => {
    const ai = makeAi('不是JSON')
    const { get } = makePipeline(ai)
    const result = await get(VIDEOGEN_STAGE_TYPES.STORYBOARD)(fidelityContext())
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('STORYBOARD_EMPTY_SCENES')
  })

  it('对齐报告写入 run 上下文 videoContentFidelity', async () => {
    const ai = makeAi(JSON.stringify([
      { prompt: '关羽率军北伐，水淹七军', text: 't', duration: 5 },
      { prompt: '三国志记载曹操与刘备', text: 't', duration: 5 },
      { prompt: '关羽', text: 't', duration: 5 },
      { prompt: '刘备', text: 't', duration: 5 },
    ]))
    const { get } = makePipeline(ai)
    const input = fidelityContext()
    await get(VIDEOGEN_STAGE_TYPES.STORYBOARD)(input)
    expect(input.context.videoContentFidelity).toBeTruthy()
    expect(input.context.videoContentFidelity.mode).toBe('fidelity')
    expect(typeof input.context.videoContentFidelity.coverage).toBe('number')
    expect(input.context.videoContentFidelity.assessVisual.status).toBe('not_implemented')
  })
})

describe('段落化与对齐工具', () => {
  it('segmentScript 多段切分 + 句切分', () => {
    const r = segmentScript('第一段。第二句！\n\n第二段内容。')
    expect(r.paragraphs).toHaveLength(2)
    expect(r.paragraphs[0].sentences.length).toBeGreaterThanOrEqual(2)
  })

  it('segmentScript 空输入返回空数组', () => {
    expect(segmentScript('  ').paragraphs).toHaveLength(0)
  })

  it('checkSceneAlignment 覆盖度计算', () => {
    const r = checkSceneAlignment([{ prompt: '关羽与水淹七军' }], ['关羽', '水淹七军', '曹操'], 0.8)
    expect(r.pass).toBe(false)
    expect(r.coverage).toBeCloseTo(0.67, 2)
    expect(r.missing).toEqual(['曹操'])
  })

  it('checkSceneAlignment 空场景 fail closed', () => {
    expect(checkSceneAlignment([], ['关羽']).isValid).toBe(false)
  })

  it('assessVisualConsistency 返回 not_implemented', () => {
    expect(assessVisualConsistency()).toEqual({ status: 'not_implemented' })
  })
})

describe('storyboard 鲁棒性加固（fidelity 输出预算 + JSON 失败重试）', () => {
  function fidelityCtx () {
    const shortText = '关羽与刘备在三国志中有记载。曹操评价关羽。关羽水淹七军。'
    return {
      stage: { kind: 'animation' },
      params: {},
      context: {
        params: { text: shortText },
        concept: {
          concept: { visual_style: '历史纪实' },
          topic: shortText,
          storyboardMode: 'fidelity',
          key_facts: ['关羽水淹七军'],
          entities: ['关羽', '刘备', '曹操', '三国志', '水淹七军'],
        },
      },
    }
  }

  it('fidelity storyboard 显式放大输出预算到 8000 tokens', async () => {
    const ai = makeAi(JSON.stringify([
      { prompt: '关羽率军北伐，水淹七军', text: 't', duration: 5 },
      { prompt: '三国志记载曹操与刘备', text: 't', duration: 5 },
      { prompt: '关羽', text: 't', duration: 5 },
      { prompt: '刘备', text: 't', duration: 5 },
    ]))
    const { get } = makePipeline(ai)
    const result = await get(VIDEOGEN_STAGE_TYPES.STORYBOARD)(fidelityCtx())
    expect(result.success).toBe(true)
    expect(ai.generateWithDefault.mock.calls[0][1].max_tokens).toBe(8000)
  })

  it('storyboard JSON 解析失败时重试，第二次成功', async () => {
    const ai = makeAi('x')
    ai.generateWithDefault
      .mockReturnValueOnce({ content: '这不是 JSON，模型输出了多余文字，可能被截断。' })
      .mockReturnValueOnce({ content: JSON.stringify([
        { prompt: '关羽率军北伐，水淹七军', text: 't', duration: 5 },
        { prompt: '三国志记载曹操与刘备', text: 't', duration: 5 },
        { prompt: '关羽', text: 't', duration: 5 },
        { prompt: '刘备', text: 't', duration: 5 },
      ]) })
    const { get, pipeline } = makePipeline(ai)
    const result = await get(VIDEOGEN_STAGE_TYPES.STORYBOARD)(fidelityCtx())
    expect(result.success).toBe(true)
    expect(ai.generateWithDefault).toHaveBeenCalledTimes(2)
    expect(pipeline.log.info).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('JSON 解析失败'))
  })

  it('storyboard JSON 连续失败（重试耗尽）→ fail closed', async () => {
    const ai = makeAi('x')
    ai.generateWithDefault.mockReturnValue({ content: '非 JSON 输出' })
    const { get } = makePipeline(ai)
    const result = await get(VIDEOGEN_STAGE_TYPES.STORYBOARD)(fidelityCtx())
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('STORYBOARD_EMPTY_SCENES')
    expect(ai.generateWithDefault.mock.calls.length).toBeGreaterThan(1)
  })
})
