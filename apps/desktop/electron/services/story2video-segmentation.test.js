// @vitest-environment node
const {
  buildSubtitleTimeline,
  createLocalSplitResult,
  isSplitterUnavailableError,
  normalizeServiceSplitResult,
  normalizeSubtitleContent,
  splitScenesLocally,
  splitSubtitleBlocks,
} = require('./story2video-segmentation')
const { findProtectedPhraseAtBoundary } = require('./story2video-segmentation-engine')

const USER_SAMPLE = '那时候蒙古统治者水平有限，对汉地的管理极其粗放，江南士绅摇身一变成了蒙元的包税人。大汗把权力一下放，收税成本蹭蹭往下降。'
const SEMANTIC_PACING_SAMPLE = '其实是跟南宋的老爷们提前谈妥了。之前蒙哥非要死磕，还搞屠城，吓得这些老爷们拼死抵抗。汉族地主阶级最爽的日子绝对是元朝。他们甚至嚣张到把大量蒙古人都卖去当奴隶。'
const WORD_BOUNDARY_SAMPLE = '这种士大夫做大的局面，哪怕朱元璋建立大明也没能彻底翻转。暂时没法彻底打破士绅垄断。只是这里的\"宽\"被那些狼心狗肺的人硬说成是\"宽仁\"。那些人用实际行动展现出结果。居然还写诗怀念前朝。\"字里行间全在抱怨元末的群雄挡了他给蒙元当奴才的路。'

describe('Story2Video 双层分句合同', () => {
  it('字幕只在单个场景内部二次切分，并保持原文顺序（v0.15.2 清理块尾标点）', () => {
    const firstScene = '俄罗斯在欧洲挡着北约东扩，我们也支持。'
    const secondScene = '可这两个兄弟偏偏都各怀鬼胎。'

    const firstBlocks = splitSubtitleBlocks(firstScene, { minChars: 8, maxChars: 15 })
    const secondBlocks = splitSubtitleBlocks(secondScene, { minChars: 8, maxChars: 15 })

    // v0.15.2 clean 步骤去掉每块尾部标点；块序保持原文顺序
    expect(firstBlocks.join('')).toBe('俄罗斯在欧洲挡着北约东扩我们也支持')
    expect(secondBlocks.join('')).toBe('可这两个兄弟偏偏都各怀鬼胎')
    expect(firstBlocks).not.toContain(expect.stringContaining('各怀鬼胎'))
    expect([...firstBlocks, ...secondBlocks].every(block => block.length <= 15)).toBe(true)
  })

  it.each([
    ['短于最小值的单页', '短字幕', [3]],
    ['恰好最小值', '一二三四五六七八', [8]],
    ['恰好最大值', '一二三四五六七八九十甲乙丙丁戊', [15]],
  ])('字幕%s时不丢字', (_label, text, expectedLengths) => {
    const blocks = splitSubtitleBlocks(text, { minChars: 8, maxChars: 15 })

    expect(blocks.join('')).toBe(text)
    expect(blocks.map(block => Array.from(block).length)).toEqual(expectedLengths)
  })

  it.each([
    ['超长无标点文本', '甲'.repeat(31)],
    ['emoji 文本', '😀'.repeat(31)],
  ])('%s按引擎字数边界分页并保持原文拼接', (_label, text) => {
    const blocks = splitSubtitleBlocks(text, { minChars: 8, maxChars: 15 })
    // 与引擎一致：block.length 为 UTF-16 码元计数（emoji 每个占 2 码元）
    const lengths = blocks.map(block => block.length)

    expect(blocks.join('')).toBe(text)
    expect(lengths.every(length => length >= 8 && length <= 15)).toBe(true)
  })

  it('v1.2.3 回归：挥刀自宫句按用户期望切成 4 块且不劈成词', () => {
    const blocks = splitSubtitleBlocks(
      '这套政策根本经不起扒，说白了就是逼着全体华人为了挤进西方圈子，挥刀自宫搞文化阉割。',
      { minChars: 8, maxChars: 15 },
    )
    expect(blocks).toEqual([
      '这套政策根本经不起扒',
      '说白了就是逼着全体华人',
      '为了挤进西方圈子',
      '挥刀自宫搞文化阉割',
    ])
  })

  it('v1.2.3 回归：文帝进京句三块切分、成词完好', () => {
    const blocks = splitSubtitleBlocks(
      '要理解文帝进京这件事，得先搞清楚一个前提：功臣集团为什么选他？',
      { minChars: 8, maxChars: 15 },
    )
    expect(blocks).toEqual([
      '要理解文帝进京这件事',
      '得先搞清楚一个前提：',
      '功臣集团为什么选他',
    ])
  })

  it.each([
    ['713.3 毫米数字中小数点不劈', '今年夏天，台风肆虐导致广西暴雨如注，降雨量狂飙到一天713.3毫米。', '713.3毫米'],
    ['扶余国不劈', '因此，在韩国的历史教科书里，能看到大量关于扶余国和扶余人的记载。', '扶余国'],
    ['电视剧不劈', '2005年，韩国收视率最高的电视剧《朱蒙》播出，里面讲述的正是这位扶余王子的故事。', '电视剧'],
    ['高高在上不劈', '他们觉得自己是高高在上的现代国家，把文化和国家认同搅在一起，是落后操作。', '高高在上'],
    ['脖子不劈', '说到底，新加坡华人也不想被掐着脖子不让说方言，也不想硬演一家亲，也怀疑政府在偷偷引进印度人。', '脖子'],
    ['城邦不劈', '新加坡本质上就是个西方体系下的华人城邦', '城邦'],
    ['做成不劈', '于是深圳干了一件全世界都没干成的事：把AI空域调度做成城市标配基建。', '做成'],
    ['枪声枚举整块', '枪声、爆炸声、呐喊声混成一锅滚烫的粥。', '枪声、爆炸声、呐喊声'],
  ])('%s：成词/数字以完整块出现', (_label, text, word) => {
    const blocks = splitSubtitleBlocks(text, { minChars: 8, maxChars: 15 })
    expect(blocks.some(block => block.includes(word))).toBe(true)
  })

  it('用户样例按语义边界切分，并保护蒙古、江南、包税人和大汗', () => {
    const blocks = splitSubtitleBlocks(USER_SAMPLE, { minChars: 8, maxChars: 15 })
    expect(blocks).toEqual([
      '那时候蒙古统治者水平有限',
      '对汉地的管理极其粗放',
      '江南士绅摇身一变',
      '成了蒙元的包税人',
      '大汗把权力一下放',
      '收税成本蹭蹭往下降',
    ])

    expect(normalizeSubtitleContent(blocks.join(''))).toBe(normalizeSubtitleContent(USER_SAMPLE))
    for (const phrase of ['蒙古', '江南', '包税人', '大汗']) {
      expect(blocks.some(block => block.includes(phrase))).toBe(true)
    }
    let offset = 0
    const normalizedSample = normalizeSubtitleContent(USER_SAMPLE)
    for (const block of blocks.slice(0, -1)) {
      offset += normalizeSubtitleContent(block).length
      expect(findProtectedPhraseAtBoundary(normalizedSample, offset)).toBe('')
    }
  })

  it('保护短语长度超过 maxChars 时仍整体保留，避免流式硬切前缀', () => {
    const blocks = splitSubtitleBlocks('蒙古江南包税人大汗', { minChars: 1, maxChars: 1 })

    expect(blocks).toEqual(['蒙古', '江南', '包税人', '大汗'])
  })

  it('语义停顿不因短尾合并而丢失动作边界', () => {
    const blocks = splitSubtitleBlocks(SEMANTIC_PACING_SAMPLE, { minChars: 8, maxChars: 15 })

    expect(blocks).toEqual([
      '其实是跟南宋的老爷们',
      '提前谈妥了',
      '之前蒙哥非要死磕',
      '还搞屠城',
      '吓得这些老爷们拼死抵抗',
      '汉族地主阶级最爽的日子',
      '绝对是元朝',
      '他们甚至嚣张到',
      '把大量蒙古人都卖去当奴隶',
    ])
  })

  it('常用双字词不被硬切，未闭合引号后的正文保留', () => {
    const blocks = splitSubtitleBlocks(WORD_BOUNDARY_SAMPLE, { minChars: 8, maxChars: 15 })
    expect(normalizeSubtitleContent(blocks.join(''))).toBe(normalizeSubtitleContent(WORD_BOUNDARY_SAMPLE))
    expect(blocks.some(block => block.includes('哪怕'))).toBe(true)
    expect(blocks.some(block => block.includes('没法'))).toBe(true)
    expect(blocks.some(block => block.includes('那些'))).toBe(true)
    expect(blocks.some(block => block.includes('字里行间全在抱怨'))).toBe(true)
    expect(blocks.some(block => block.includes('展现'))).toBe(true)
    expect(blocks.some(block => block.includes('\"宽\"'))).toBe(true)
  })

  it('服务场景保持原边界，并为每个场景附加本地字幕块和来源', () => {
    const result = normalizeServiceSplitResult({
      tier_used: 'tier3_rule',
      scenes: [
        { text: '俄乌这场仗一打就是四年多，普京最近罕见发声。' },
        { text: '为啥这么说？看看战场就知道了。' },
      ],
      sentences: ['俄乌这场仗一打就是四年多，', '普京最近罕见发声。'],
    }, { subtitleMinChars: 8, subtitleMaxChars: 15 })

    expect(result).toMatchObject({
      source: 'smart-sentence-splitter',
      sceneSource: 'smart-sentence-splitter',
      subtitleSource: 'local-typescript',
      degraded: false,
      tier_used: 'tier3_rule',
    })
    expect(result.scenes.map(scene => scene.text)).toEqual([
      '俄乌这场仗一打就是四年多，普京最近罕见发声。',
      '为啥这么说？看看战场就知道了。',
    ])
    // v0.15.2 本地分块清理块尾标点：join 等于去掉块界标点后的文本，块序保持原文
    expect(result.scenes.map(scene => scene.subtitleBlocks.join(''))).toEqual([
      '俄乌这场仗一打就是四年多普京最近罕见发声',
      '为啥这么说看看战场就知道了',
    ])
    expect(result.scenes.every(scene => scene.subtitleSource === 'local-typescript')).toBe(true)
  })

  it('引擎返回字幕时直接采纳，标记 smart-sentence-splitter', () => {
    const result = normalizeServiceSplitResult({
      tier_used: 'tier2_semantic',
      scenes: [
        { text: '第一句话。', subtitles: [{ text: '第一句话', display_order: 0 }] },
        { text: '第二句话介绍产品，它包含苹果、香蕉和橘子。', subtitles: [{ text: '第二句话介绍产品' }, { text: '它包含苹果、香蕉和橘子' }] },
      ],
      sentences: ['第一句话。', '第二句话介绍产品，它包含苹果、香蕉和橘子。'],
    }, { subtitleMinChars: 8, subtitleMaxChars: 15 })

    expect(result).toMatchObject({
      source: 'smart-sentence-splitter',
      sceneSource: 'smart-sentence-splitter',
      subtitleSource: 'smart-sentence-splitter',
      degraded: false,
      tier_used: 'tier2_semantic',
    })
    expect(result.scenes[0].subtitleBlocks).toEqual(['第一句话'])
    expect(result.scenes[0].subtitleSource).toBe('smart-sentence-splitter')
    expect(result.scenes[1].subtitleBlocks).toEqual(['第二句话介绍产品', '它包含苹果、香蕉和橘子'])
    expect(result.scenes[1].subtitleSource).toBe('smart-sentence-splitter')
  })

  it('引擎字幕包含空块或纯标点块时按旧合同忽略，剩余内容完整仍采纳', () => {
    const result = normalizeServiceSplitResult({
      tier_used: 'tier2_semantic',
      scenes: [{
        text: '第一句话。',
        subtitles: [{ text: '第一句话' }, { text: '' }, { text: '。' }],
      }],
    }, { subtitleMinChars: 8, subtitleMaxChars: 15 })

    expect(result.scenes[0].subtitleSource).toBe('smart-sentence-splitter')
    expect(result.scenes[0].subtitleBlocks).toEqual(['第一句话'])
  })

  it('引擎字幕覆盖率足够但拆开江南时回退本地并记录原因', () => {
    const result = normalizeServiceSplitResult({
      tier_used: 'tier2_semantic',
      scenes: [{
        text: USER_SAMPLE,
        subtitles: [
          { text: '那时候蒙古统治者水平有限' },
          { text: '对汉地的管理极其粗放，江' },
          { text: '南士绅摇身一变成了蒙元的包税人' },
          { text: '大汗把权力一下放' },
          { text: '收税成本蹭蹭往下降' },
        ],
      }],
    }, { subtitleMinChars: 8, subtitleMaxChars: 15 })

    expect(result.scenes[0]).toMatchObject({
      text: USER_SAMPLE,
      subtitleSource: 'local-typescript',
      fallbackReason: expect.stringContaining('江南'),
    })
    expect(result.scenes[0].fallbackReason).toBe('online-subtitle-unsafe-boundary:江南')
    expect(result.scenes[0].subtitleBlocks.some(block => block.includes('江南'))).toBe(true)
    expect(result.subtitleSource).toBe('local-typescript')
  })

  it('引擎字幕覆盖率足够但内容错序/重复时回退本地', () => {
    const text = '第一段内容用于测试在线字幕顺序，第二段内容继续提供足够文字。'
    const result = normalizeServiceSplitResult({
      tier_used: 'tier2_semantic',
      scenes: [{
        text,
        subtitles: [
          { text: '第一段内容用于测试在线字幕顺序' },
          { text: '第一段内容继续提供足够文字' },
        ],
      }],
    }, { subtitleMinChars: 8, subtitleMaxChars: 15 })

    expect(result.scenes[0].subtitleSource).toBe('local-typescript')
    expect(result.scenes[0].fallbackReason).toContain('content-mismatch')
    expect(normalizeSubtitleContent(result.scenes[0].subtitleBlocks.join(''))).toBe(normalizeSubtitleContent(text))
  })

  it('引擎字幕覆盖率不足（残缺）时回退本地分块，不静默丢内容', () => {
    const result = normalizeServiceSplitResult({
      tier_used: 'tier2_semantic',
      scenes: [
        // 引擎只回了 1 句，覆盖率远低于场景全文（40 字 vs 4 字）
        { text: '第一幕包含足够长的画面说明，随后继续补充细节。', subtitles: [{ text: '第一幕' }] },
      ],
      sentences: ['第一幕包含足够长的画面说明，随后继续补充细节。'],
    }, { subtitleMinChars: 8, subtitleMaxChars: 15 })

    expect(result.scenes[0].subtitleSource).toBe('local-typescript')
    expect(result.scenes[0].subtitleBlocks.join('')).toBe('第一幕包含足够长的画面说明随后继续补充细节')
  })

  it('引擎部分场景缺字幕时逐场景回退本地分块并保持来源可追溯', () => {
    const result = normalizeServiceSplitResult({
      tier_used: 'tier2_semantic',
      scenes: [
        { text: '第一句话。', subtitles: [{ text: '第一句话' }] },
        { text: '可这两个兄弟偏偏都各怀鬼胎。' },
      ],
      sentences: ['第一句话。', '可这两个兄弟偏偏都各怀鬼胎。'],
    }, { subtitleMinChars: 8, subtitleMaxChars: 15 })

    expect(result.scenes[0].subtitleSource).toBe('smart-sentence-splitter')
    expect(result.scenes[1].subtitleSource).toBe('local-typescript')
    expect(result.subtitleSource).toBe('smart-sentence-splitter')
    expect(result.scenes[1].subtitleBlocks).toEqual(['可这两个兄弟偏偏都各怀鬼胎'])
  })

  it('本地降级结果明确标记来源，同时提供场景和字幕两层结果', () => {
    const result = createLocalSplitResult(
      '第一句话用于建立场景。第二句话继续补充信息。第三句话切换到新的画面。',
      { targetDuration: 6, subtitleMinChars: 8, subtitleMaxChars: 15 },
      new Error('connect ECONNREFUSED 127.0.0.1:8002'),
    )

    expect(result).toMatchObject({
      source: 'local-typescript-fallback',
      sceneSource: 'local-typescript-fallback',
      subtitleSource: 'local-typescript',
      degraded: true,
      fallbackReason: expect.stringContaining('ECONNREFUSED'),
    })
    expect(result.scenes.length).toBeGreaterThan(0)
    expect(result.scenes.every(scene => Array.isArray(scene.subtitleBlocks))).toBe(true)
    expect(result.scenes.map(scene => scene.text).join('')).toBe(
      '第一句话用于建立场景。第二句话继续补充信息。第三句话切换到新的画面。',
    )
  })
})

describe('Story2Video 本地切分 — 分镜字数主控', () => {
  it('显式 targetCharsPerScene 优先于 targetDuration 换算，并保持原文拼接', () => {
    const text = '第一句话。第二句话。第三句话。第四句话。第五句话。第六句话。第七句话。第八句话。'
    // 40 字：20 字/场景 → 2 场景；targetDuration=60 → 198 字/场景 → 1 场景
    const by20 = splitScenesLocally(text, { targetCharsPerScene: 20, targetDuration: 60 })
    const byDuration = splitScenesLocally(text, { targetDuration: 60 })
    expect(by20.scenes.length).toBe(2)
    expect(byDuration.scenes.length).toBe(1)
    expect(by20.scenes.join('')).toBe('第一句话。第二句话。第三句话。第四句话。第五句话。第六句话。第七句话。第八句话。')
  })

  it('targetCharsPerScene 缺省时回退 targetDuration×bps×speechRate 旧公式', () => {
    const text = '第一句话。第二句话。第三句话。第四句话。第五句话。第六句话。'
    // 30 字：targetDuration=6 × 3.3 = 19.8 → 20 字/场景 → 2 场景
    const result = splitScenesLocally(text, { targetDuration: 6 })
    expect(result.scenes.length).toBe(2)
  })

  it('snake_case 端到端：本地降级从 stage.options 直读 target_chars_per_scene', () => {
    const text = '第一句话。第二句话。第三句话。第四句话。'
    // 模拟 text-config stageOptions.split 真实结构（snake_case；8002 请求不含该键）
    const result = createLocalSplitResult(text, {
      target_duration: 60,
      target_chars_per_scene: 10,
      min_words: 1,
      max_words: 50,
      subtitle_min_chars: 8,
      subtitle_max_chars: 15,
    }, new Error('connect ECONNREFUSED 127.0.0.1:8002'))
    // 20 字 ÷ 10 字/场景 = 2 场景（target_duration=60 的 198 字换算被主控覆盖）
    expect(result.scenes.length).toBe(2)
    expect(result.scenes.map(s => s.text).join('')).toBe(text)
    expect(result.degraded).toBe(true)
  })
})

describe('Story2Video 字幕时间轴', () => {
  it('按可见字符权重连续分配真实音频时长，末块精确结束', () => {
    const blocks = ['俄罗斯在欧洲挡着北约东扩，', '我们也支持。']
    const timeline = buildSubtitleTimeline(blocks, 2)

    expect(timeline[0].startTime).toBe(0)
    expect(timeline[0].endTime).toBe(timeline[1].startTime)
    expect(timeline[1].endTime).toBe(2)
    expect(timeline.every(item => item.endTime > item.startTime)).toBe(true)
  })

  it('TTS 音频从 2 秒变为 4 秒时，所有字幕时间点等比例缩放', () => {
    const blocks = ['第一屏字幕内容。', '第二屏字幕内容。']
    const shortTimeline = buildSubtitleTimeline(blocks, 2)
    const slowTimeline = buildSubtitleTimeline(blocks, 4)

    expect(slowTimeline).toHaveLength(shortTimeline.length)
    slowTimeline.forEach((item, index) => {
      expect(item.startTime).toBeCloseTo(shortTimeline[index].startTime * 2, 6)
      expect(item.endTime).toBeCloseTo(shortTimeline[index].endTime * 2, 6)
    })
    expect(slowTimeline.at(-1).endTime).toBe(4)
  })
})

describe('Story2Video 分句引擎不可用判定（降级触发面）', () => {
  it('socket hang up（无 code）仍触发降级', () => {
    expect(isSplitterUnavailableError(new Error('socket hang up'))).toBe(true)
  })

  it('嵌套 { error: { code: ECONNREFUSED } } 形状触发降级', () => {
    expect(isSplitterUnavailableError({ error: { code: 'ECONNREFUSED' } })).toBe(true)
  })

  it('ECONNREFUSED code 触发降级', () => {
    expect(isSplitterUnavailableError(Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' }))).toBe(true)
  })

  it('业务错误不触发降级', () => {
    expect(isSplitterUnavailableError(new Error('smart-sentence-splitter 响应缺少有效 scenes'))).toBe(false)
  })
})
