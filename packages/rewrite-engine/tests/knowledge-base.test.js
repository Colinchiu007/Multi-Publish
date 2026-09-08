var { KnowledgeBase, MemoryStorage } = require('../src/knowledge-base')

describe('KnowledgeBase', function() {
  var kb, storage

  beforeEach(function() {
    storage = new MemoryStorage()
    kb = new KnowledgeBase({ storage: storage })
  })

  test('should init with default values', function() {
    kb.init()
    expect(kb._data.version).toBe(1)
    expect(kb._data.preferences).toBeTruthy()
  })

  test('should get context summary', function() {
    kb.init()
    kb._data.preferences.industries = { '电商': 0.9, 'IP打造': 0.7 }
    kb._data.styleFingerprint.commonPhrases = ['家人们', '绝绝子']
    var summary = kb.getContextSummary()
    expect(summary).toContain('电商')
    expect(summary).toContain('家人们')
  })

  test('should record feedback and update preferences', function() {
    kb.init()
    kb.recordFeedback({
      action: 'adopted',
      strategyId: 'strategy-viral-storytelling',
      resultContent: '家人们，今天给大家分享一个超好用的方法！',
      userSettings: { industry: 'lifestyle', tone: 'casual' }
    })
    expect(kb._data.feedbackLog.length).toBe(1)
    expect(kb._data.preferences.preferredStrategies).toContain('strategy-viral-storytelling')
    expect(kb._data.styleFingerprint.avgSentenceLength).toBeGreaterThan(0)
  })

  test('should get strategy rating', function() {
    kb.init()
    kb.recordFeedback({ action: 'adopted', strategyId: 's1' })
    kb.recordFeedback({ action: 'adopted', strategyId: 's1' })
    kb.recordFeedback({ action: 'rejected', strategyId: 's1' })
    var rating = kb.getStrategyRating('s1')
    expect(rating).toBeLessThan(5)
    expect(rating).toBeGreaterThan(1)
  })

  test('should return null for unknown strategy rating', function() {
    kb.init()
    expect(kb.getStrategyRating('unknown')).toBeNull()
  })

  test('should limit feedback log length', function() {
    kb.init()
    for (var i = 0; i < 600; i++) {
      kb.recordFeedback({ action: 'adopted', strategyId: 's' + (i % 10) })
    }
    expect(kb._data.feedbackLog.length).toBeLessThanOrEqual(500)
  })
})
