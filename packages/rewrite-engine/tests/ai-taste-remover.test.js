var { AITasteRemover, AI_PHRASE_MAP } = require('../src/ai-taste-remover')

describe('AITasteRemover', function() {
  test('should replace AI phrases', function() {
    var remover = new AITasteRemover({ enabled: true, intensity: 2 })
    var result = remover.process('综上所述，这个产品很好。')
    expect(result).not.toContain('综上所述')
    expect(result).toContain('说到底')
  })

  test('should replace forbidden opening patterns', function() {
    var remover = new AITasteRemover({ enabled: true, intensity: 2 })
    var result = remover.process('在当今社会，人们越来越关注健康。')
    expect(result).not.toContain('在当今社会')
  })

  test('should not process when disabled', function() {
    var remover = new AITasteRemover({ enabled: false })
    var result = remover.process('综上所述，这个产品很好。')
    expect(result).toContain('综上所述')
  })

  test('should handle empty text', function() {
    var remover = new AITasteRemover({ enabled: true })
    expect(remover.process('')).toBe('')
  })

  test('should detect AI taste level', function() {
    var remover = new AITasteRemover({ enabled: true })
    var aiText = '综上所述，在当今社会，随着科技的发展，值得注意的是，人工智能正在改变我们的生活。'
    var level = remover.detectAITasteLevel(aiText)
    expect(level).toBeGreaterThan(0.1)
  })

  test('should give low AI taste for natural text', function() {
    var remover = new AITasteRemover({ enabled: true })
    var naturalText = '家人们谁懂啊，今天终于找到这个好东西了！用了一周，真的是绝绝子。'
    var level = remover.detectAITasteLevel(naturalText)
    expect(level).toBeLessThan(0.2)
  })
})

// ── 段落结构保留（2026-10-03 Bug 修复回归锁）──
// 历史 Bug：Pass 3 _mergeUniformSentences 用 splitSentences 全文切句后 join('。')，
// 把 LLM 按空行分段的改写结果压平成一整段（用户反馈「改写后文案没有正常分段」）。
// 结构不变量：任何 pass 不得改变输入的换行/分段结构；只允许在段内做句级重组。
describe('AITasteRemover 段落结构保留', function() {
  // 6 个近似等长句（长度差 ≤20%），确定触发 sentence-rhythm 合并路径
  var paragraphText = [
    '这台机器性能很强。续航表现也不错。',
    '',
    '外观设计很时尚。价格也非常实惠。',
    '',
    '拍照效果很清晰。系统运行很流畅。'
  ].join('\n')

  test('R1 等长句触发合并时，空行分段必须原样保留', function() {
    var remover = new AITasteRemover({ enabled: true, intensity: 2, tone: 'casual' })
    // 前置守卫：该输入确实命中句长节奏信号（否则本测试失去针对性）
    var findings = remover.detect(paragraphText)
    expect(findings.some(function (p) { return p.pattern === 'sentence-rhythm' })).toBe(true)
    var result = remover.process(paragraphText)
    expect(result).toContain('\n\n')
  })

  test('R2 单换行分隔同样保留（不被压平）', function() {
    var remover = new AITasteRemover({ enabled: true, intensity: 2 })
    var single = '这台机器性能很强。续航表现也不错。\n外观设计很时尚。价格也非常实惠。\n拍照效果很清晰。系统运行很流畅。'
    var result = remover.process(single)
    expect(result).toContain('\n')
  })

  test('R3 单段文本行为保持（段内合并照常发生，不引入换行）', function() {
    var remover = new AITasteRemover({ enabled: true, intensity: 2 })
    var single = '这台机器性能很强。续航表现也不错。外观设计很时尚。价格也非常实惠。拍照效果很清晰。系统运行很流畅。'
    var result = remover.process(single)
    expect(result).not.toContain('\n')
    expect(result).toContain('，')
  })

  test('R4 段尾终止标点不丢失（切分剥离的句号/叹号重组后必须补回）', function() {
    var remover = new AITasteRemover({ enabled: true, intensity: 2 })
    var text = '性能很强。续航也很顶。拍照很清晰。充电速度很快。'
    var result = remover.process(text)
    expect(result.endsWith('。')).toBe(true)
  })

  test('R5 无结尾标点的段落不被追加标点', function() {
    var remover = new AITasteRemover({ enabled: true, intensity: 2 })
    var text = '性能很强。续航也很顶。拍照很清晰。充电速度很快'
    var result = remover.process(text)
    expect(result.endsWith('。')).toBe(false)
    expect(result.endsWith('快')).toBe(true)
  })
})

// ── 词表注入与强度（ai-taste-ops-center，2026-10-03）──
// 运营中心词库运营：phraseMap 覆盖层 + disabledWords 禁用表 + severityMap + intensity 参数面。
// 结构不变量与缺省行为锁（T3）是本 describe 的基石：未注入/空注入必须与现状逐字节一致。
describe('AITasteRemover 词表注入与强度', function() {
  test('T1 注入 phraseMap 覆盖内置键（同键覆盖 + 新词生效）', function() {
    var remover = new AITasteRemover({
      enabled: true,
      phraseMap: { '综上所述': '归根结底', '绝对干货': '真材实料' }
    })
    var out = remover.process('综上所述，这是绝对干货。')
    expect(out).toContain('归根结底')
    expect(out).toContain('真材实料')
    expect(out).not.toContain('说到底')
    expect(out).not.toContain('综上所述')
  })

  test('T2 disabledWords 跳过替换（内置词与注入词均受控）', function() {
    var remover = new AITasteRemover({
      enabled: true,
      disabledWords: ['综上所述', '绝对干货'],
      phraseMap: { '绝对干货': '真材实料' }
    })
    var out = remover.process('综上所述，这是绝对干货。')
    expect(out).toContain('综上所述')
    expect(out).toContain('绝对干货')
    expect(out).not.toContain('归根结底')
    expect(out).not.toContain('说到底')
  })

  test('T3 缺省构造行为逐字节不变（回退内置常量锁）', function() {
    var text = '综上所述，在当今社会，值得注意的是，人工智能正在改变我们的生活。性能很强。续航也很顶。拍照很清晰。'
    var legacy = new AITasteRemover({ enabled: true, intensity: 2 }).process(text)
    var emptyInject = new AITasteRemover({ enabled: true, intensity: 2, phraseMap: undefined, disabledWords: undefined, severityMap: undefined }).process(text)
    var emptyObj = new AITasteRemover({ enabled: true, intensity: 2, phraseMap: {}, disabledWords: [] }).process(text)
    expect(emptyInject).toBe(legacy)
    expect(emptyObj).toBe(legacy)
  })

  test('T4 severityMap 影响评分（S1 词权重高于 S2）', function() {
    var base = new AITasteRemover({ enabled: true })
    var withMap = new AITasteRemover({ enabled: true, severityMap: { '绝对干货': 'S1' } })
    var phraseMap = { '绝对干货': '真材实料' }
    // 注入自定义词后：severityMap 标 S1 → 分值增量 0.1；无 severityMap → 缺省 S2 → 0.05
    var low = base.process.bind(base)
    var levelDefault = new AITasteRemover({ enabled: true, phraseMap: phraseMap }).detectAITasteLevel('这绝对是绝对干货。')
    var levelS1 = new AITasteRemover({ enabled: true, phraseMap: phraseMap, severityMap: { '绝对干货': 'S1' } }).detectAITasteLevel('这绝对是绝对干货。')
    expect(levelS1).toBeGreaterThan(levelDefault)
    expect(low).toBeDefined()
  })

  test('T5 intensity=1 跳过 Pass 3（等长句保留句号不合并）', function() {
    var text = '性能很强。续航也很顶。拍照很清晰。充电速度很快。'
    var i2 = new AITasteRemover({ enabled: true, intensity: 2 }).process(text)
    var i1 = new AITasteRemover({ enabled: true, intensity: 1 }).process(text)
    // intensity 2 触发句长合并（等长句变逗号衔接）；intensity 1 不合并
    expect(i1).toBe(text)
    expect(i1).not.toBe(i2)
  })

  test('T6 intensity=3 且 casual 启用口语化', function() {
    var i3 = new AITasteRemover({ enabled: true, intensity: 3, tone: 'casual' }).process('我们怎么做呢。')
    expect(i3).toContain('咱')
    expect(i3).toContain('咋')
  })

  test('T7 词表遍历键序确定（同输入多次 process 同输出）', function() {
    var phraseMap = { '甲词': '壹', '乙词': '贰', '丙词': '叁' }
    var r1 = new AITasteRemover({ enabled: true, phraseMap: phraseMap }).process('甲词和乙词还有丙词。')
    var r2 = new AITasteRemover({ enabled: true, phraseMap: phraseMap }).process('甲词和乙词还有丙词。')
    expect(r1).toBe(r2)
  })

  test('T8 word 大小写不敏感替换（英文条目）', function() {
    var remover = new AITasteRemover({ enabled: true, phraseMap: { 'Absolutely Great': '真不错' } })
    var out = remover.process('This is absolutely great stuff.')
    expect(out).toContain('真不错')
  })
})
