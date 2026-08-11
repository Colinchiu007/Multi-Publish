// @vitest-environment node
const {
  buildPromptEngineSceneContext,
  buildSceneContextBlock,
  buildSceneContextResult,
  enrichSceneWithContext,
  extractStoryContext,
  mergeNegativePrompt,
  normalizeSceneContextOptions,
  CONTEXT_KEY_WHITELIST,
} = require('./story-context-engine')

const TANG_FULL_TEXT = [
  '这是一个关于中国唐代的故事。',
  '唐玄宗时期，长安城一片繁华，市井百姓安居乐业。',
  '故事讲述一位老妇人在长安城中的日常生活与劳作。',
].join('')

const TANG_COOKING_SCENE = '一个老妇人在做饭'

describe('Story2Video 场景上下文增强中间层（story-context-engine）', () => {
  describe('全局故事上下文提取 extractStoryContext', () => {
    it('用户示例：唐代全文 → 识别唐朝/中国/长安，并给出一致性锚点与时代负面锚点', () => {
      const story = extractStoryContext(TANG_FULL_TEXT)
      expect(story.era).toBe('ancient')
      expect(story.dynasty).toMatchObject({ name: '唐朝', period: '唐朝（618-907）' })
      expect(story.culture).toBe('中国')
      expect(story.region).toContain('长安')
      expect(story.genre).toBe('历史')
      expect(story.anchors).toEqual(expect.arrayContaining(['唐代', '中国', '长安']))
      expect(story.negativeAnchors).toEqual(expect.arrayContaining(['电烤箱', '西式现代厨房']))
      expect(story.method).toBe('rule-based')
      expect(story.confidence).toBeGreaterThan(0)
    })

    it('无关键词文案：不编造时代/地域/题材，era=mixed 且负面锚点为空', () => {
      const story = extractStoryContext('今天天气很好，我去公园散步。')
      expect(story.era).toBe('mixed')
      expect(story.dynasty).toBeNull()
      expect(story.culture).toBe('')
      expect(story.genre).toBe('general')
      expect(story.anchors).toHaveLength(0)
      expect(story.negativeAnchors).toHaveLength(0)
      expect(story.summary).toContain('今天天气很好')
    })

    it('现代关键词 → era=modern，负面锚点为古代道具', () => {
      const story = extractStoryContext('小明在写字楼里用手机点外卖，晚上坐地铁回家。')
      expect(story.era).toBe('modern')
      expect(story.dynasty).toBeNull()
      expect(story.props.modern.length).toBeGreaterThan(0)
      expect(story.props.ancient).toHaveLength(0)
      expect(story.negativeAnchors).toContain('油灯')
    })

    it('时代道具互斥：ancient 只输出古代道具，modern 只输出现代道具', () => {
      const ancient = extractStoryContext('唐朝长安城中，老妇人用土灶柴火做饭。')
      expect(ancient.props.ancient).toContain('土灶')
      expect(ancient.props.modern).toHaveLength(0)
      const modern = extractStoryContext('她用微波炉加热食物，打开冰箱拿牛奶。')
      expect(modern.props.modern).toContain('微波炉')
      expect(modern.props.ancient).toHaveLength(0)
    })

    it('多文化命中：按证据数排序保留多候选并带置信度', () => {
      const story = extractStoryContext('故事发生在长安与东京之间，既有中国唐代的宫殿，也有日本京都的庭院。')
      // 中国命中（长安/唐代/宫殿/中国），日本命中（东京/日本/京都/庭院）→ 中国应排前
      expect(story.culture).toBe('中国')
      expect(story.multiCandidates && story.multiCandidates.length >= 2).toBe(true)
    })

    it('朝代表扩展：宋/明/清/民国等关键词命中对应朝代', () => {
      for (const [keyword, name] of [
        ['宋徽宗','宋朝'], ['明朝','明朝'], ['康熙','清朝'], ['上海滩','民国'],
      ]) {
        const story = extractStoryContext('故事发生在' + keyword + '时期。')
        if (name === '民国') {
          expect(story.era).toBe('modern')
        } else {
          expect(story.dynasty && story.dynasty.name).toBe(name)
        }
      }
    })

    it('角色提取：识别人物名与修饰语', () => {
      const story = extractStoryContext('一位慈祥的老妇人在河边洗衣服，旁边是年轻的书生。')
      const names = story.characters.map(c => c.name)
      expect(names).toContain('老妇人')
      expect(names).toContain('书生')
      const granny = story.characters.find(c => c.name === '老妇人')
      expect(granny.descriptor).toContain('慈祥')
    })

    it('summary 不超 maxSummaryLength，锚点数量不超 maxAnchors', () => {
      const story = extractStoryContext(TANG_FULL_TEXT, { maxSummaryLength: 50, maxAnchors: 3 })
      expect(Array.from(story.summary).length).toBeLessThanOrEqual(50)
      expect(story.anchors.length).toBeLessThanOrEqual(3)
    })
  })

  describe('逐场景上下文融合 buildSceneContextBlock / enrichSceneWithContext', () => {
    it('用户示例：做饭场景获得唐代/中国/土灶/柴火锚点与电烤箱负面锚点', () => {
      const story = extractStoryContext(TANG_FULL_TEXT)
      const scene = { index: 0, text: TANG_COOKING_SCENE }
      const block = buildSceneContextBlock(scene, story)
      expect(block.contextBlock).toContain('唐朝')
      expect(block.contextBlock).toContain('中国')
      expect(block.contextBlock).toContain('做饭')
      expect(block.contextBlock).toContain('土灶')
      expect(block.contextBlock).toContain('柴火')
      expect(block.negativeAnchors).toEqual(expect.arrayContaining(['电烤箱', '微波炉', '西式现代厨房']))
      expect(block.character).toMatchObject({ name: '老妇人' })
    })

    it('上下文块长度受 contextBlockMaxChars 约束（按断句截断）', () => {
      const story = extractStoryContext(TANG_FULL_TEXT)
      const scene = { index: 0, text: TANG_COOKING_SCENE }
      const block = buildSceneContextBlock(scene, story, { contextBlockMaxChars: 60 })
      expect(Array.from(block.contextBlock).length).toBeLessThanOrEqual(60)
    })

    it('enrichSceneWithContext 输出 scene.storyContext / scene.context / 负面锚点', () => {
      const story = extractStoryContext(TANG_FULL_TEXT)
      const scene = { index: 0, text: TANG_COOKING_SCENE, imagePromptSeed: '老妇人在灶台前做饭' }
      const enriched = enrichSceneWithContext(scene, story, TANG_FULL_TEXT)
      expect(enriched.storyContext).toContain('唐朝')
      expect(Array.isArray(enriched.negativeAnchors)).toBe(true)
      expect(enriched.negativeAnchors).toContain('电烤箱')
      expect(enriched.context).toBeDefined()
    })

    it('现代做饭场景不注入古代道具负面锚点，反而排除土灶/柴火', () => {
      const story = extractStoryContext('现代都市里，一位主妇在家做饭。')
      const scene = { index: 0, text: '一位主妇在厨房用电烤箱做饭' }
      const block = buildSceneContextBlock(scene, story)
      expect(block.negativeAnchors).toEqual(expect.arrayContaining(['土灶', '柴火']))
      expect(block.negativeAnchors).not.toContain('电烤箱')
    })
  })

  describe('提示词优化上下文 buildPromptEngineSceneContext', () => {
    it('只输出白名单七键（synopsis/full_text/setting/narrative_intent/scene_type/character_list/character）', () => {
      const story = extractStoryContext(TANG_FULL_TEXT)
      const scene = { index: 0, text: TANG_COOKING_SCENE }
      const ctx = buildPromptEngineSceneContext(scene, story, TANG_FULL_TEXT)
      expect(Object.keys(ctx).sort()).toEqual([...CONTEXT_KEY_WHITELIST].sort())
      expect(ctx.synopsis).toContain('唐代')
      expect(ctx.full_text).toContain('唐代')
      expect(ctx.setting).toContain('做饭')
      expect(ctx.character).toMatchObject({ name: '老妇人' })
      expect(Array.isArray(ctx.character_list)).toBe(true)
      // 白名单键中不得出现敏感键名
      for (const key of Object.keys(ctx)) {
        expect(key.toLowerCase()).not.toMatch(/token|secret|password|api_key|authorization/)
      }
    })

    it('无全局设定时 setting 回退场景文字，不编造', () => {
      const story = extractStoryContext('今天天气很好，我去公园散步。')
      const scene = { index: 0, text: '我在公园散步' }
      const ctx = buildPromptEngineSceneContext(scene, story, '今天天气很好，我去公园散步。')
      expect(ctx.setting).toContain('公园散步')
      expect(ctx.setting).not.toContain('唐朝')
    })
  })

  describe('阶段主入口 buildSceneContextResult', () => {
    it('输入场景为空/非法 → fail closed 抛错', () => {
      expect(() => buildSceneContextResult([], '文案')).toThrow(/非空场景数组/)
      expect(() => buildSceneContextResult(null, '文案')).toThrow(/非空场景数组/)
      expect(() => buildSceneContextResult([{ index: 0, text: 'a' }], '')).toThrow(/非空文案/)
    })

    it('正常输出 { story, scenes, metadata }，scenes 每项带增强字段', () => {
      const result = buildSceneContextResult(
        [{ index: 0, text: TANG_COOKING_SCENE }],
        TANG_FULL_TEXT,
      )
      expect(result.story.dynasty.name).toBe('唐朝')
      expect(result.scenes).toHaveLength(1)
      expect(result.scenes[0].storyContext).toContain('唐朝')
      expect(result.metadata).toMatchObject({ enriched: true, degraded: false, extractor: 'rule-based' })
    })

    it('enabled=false → 透传并标记 degraded（reason: disabled）', () => {
      const result = buildSceneContextResult(
        [{ index: 0, text: TANG_COOKING_SCENE }],
        TANG_FULL_TEXT,
        { enabled: false },
      )
      expect(result.metadata.degraded).toBe(true)
      expect(result.metadata.fallbackReason).toContain('disabled')
      expect(result.scenes[0].storyContext).toBeUndefined()
    })
  })

  describe('配置归一 normalizeSceneContextOptions', () => {
    it('越界值收敛到边界，非法类型回退默认', () => {
      expect(normalizeSceneContextOptions({ maxSummaryLength: 99999 }).maxSummaryLength).toBe(1000)
      expect(normalizeSceneContextOptions({ maxSummaryLength: -5 }).maxSummaryLength).toBe(50)
      expect(normalizeSceneContextOptions({ maxSummaryLength: 'abc' }).maxSummaryLength).toBe(300)
      expect(normalizeSceneContextOptions({ maxAnchors: 99 }).maxAnchors).toBe(20)
      expect(normalizeSceneContextOptions({ maxAnchors: 0 }).maxAnchors).toBe(1)
      expect(normalizeSceneContextOptions({ enabled: 'yes' }).enabled).toBe(true)
      expect(normalizeSceneContextOptions({ contextBlockMaxChars: 20000 }).contextBlockMaxChars).toBe(1000)
    })

    it('默认值：enabled=true / maxSummaryLength=300 / maxAnchors=8 / includeNegativeAnchors=true / contextBlockMaxChars=400', () => {
      const options = normalizeSceneContextOptions({})
      expect(options).toMatchObject({
        enabled: true,
        maxSummaryLength: 300,
        maxAnchors: 8,
        includeNegativeAnchors: true,
        contextBlockMaxChars: 400,
      })
    })
  })

  describe('负面提示合并 mergeNegativePrompt', () => {
    it('合并去重并按上限截断', () => {
      const merged = mergeNegativePrompt('现代电器', ['电烤箱', '微波炉', '电烤箱'], 30)
      expect(merged).toContain('现代电器')
      expect(merged).toContain('电烤箱')
      expect(merged).toContain('微波炉')
      expect(Array.from(merged).length).toBeLessThanOrEqual(30)
    })

    it('base 为空时仅输出锚点', () => {
      const merged = mergeNegativePrompt('', ['土灶', '柴火'])
      expect(merged).toBe('土灶, 柴火')
    })
  })
})

describe('scene_context 审查修复回归（2026-08-11 双模型审查 C1/W2/W3/W4）', () => {
  it('C1: snake_case 布尔开关端到端生效（include_negative_anchors=false 关闭负面锚点）', () => {
    expect(normalizeSceneContextOptions({ include_negative_anchors: false }).includeNegativeAnchors).toBe(false)
    const story = extractStoryContext('唐朝长安城中，老妇人在做饭。', { include_negative_anchors: false })
    expect(story.negativeAnchors).toHaveLength(0)
    const result = buildSceneContextResult(
      [{ index: 0, text: '一个老妇人在做饭' }],
      '唐朝长安城中，老妇人在做饭。',
      { include_negative_anchors: false },
    )
    expect(result.scenes[0].negativeAnchors).toHaveLength(0)
  })

  it('W2: 单关键词时代误判不注入全局负面锚点（寺庙→ancient 弱信号）', () => {
    const story = extractStoryContext('她在寺庙里虔诚地祈祷。')
    expect(story.era).toBe('ancient')
    expect(story.negativeAnchors).toHaveLength(0)
  })

  it('W3: 无地域关键词时不编造默认城市（城堡→欧洲但 region 为空）', () => {
    const story = extractStoryContext('城堡里的公主和王子过着幸福的生活。')
    expect(story.culture).toBe('欧洲')
    expect(story.region).toBe('')
    expect(story.anchors).not.toContain('伦敦')
  })

  it('W4: full_text 发送上限受 MAX_FULL_TEXT_CHARS 约束', () => {
    const longText = '长文。'.repeat(1500)
    const story = extractStoryContext(longText)
    const scene = { index: 0, text: '一个场景' }
    const ctx = buildPromptEngineSceneContext(scene, story, longText)
    expect(Array.from(ctx.full_text).length).toBeLessThanOrEqual(2000)
  })
})
