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
