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
