var { StrategyManager, BUILTIN_STRATEGIES } = require('../src/strategy-manager')

describe('StrategyManager', function() {
  var sm

  beforeEach(function() {
    sm = new StrategyManager()
  })

  test('should load builtin strategies', function() {
    sm.loadBuiltins()
    var all = sm.listEnabled()
    expect(all.length).toBe(BUILTIN_STRATEGIES.length)
  })

  test('should get strategy by id', function() {
    var s = sm.get('strategy-viral-storytelling')
    expect(s).toBeTruthy()
    expect(s.name).toBe('故事化爆款策略')
    expect(s.category).toBe('viral')
  })

  test('should return null for unknown id', function() {
    expect(sm.get('non-existent')).toBeNull()
  })

  test('should filter by category', function() {
    var viral = sm.listByCategory('viral')
    expect(viral.length).toBeGreaterThanOrEqual(1)
    for (var i = 0; i < viral.length; i++) {
      expect(viral[i].category).toBe('viral')
    }
  })

  test('should merge remote strategies', function() {
    sm.mergeRemote([
      { id: 'custom-1', name: 'Custom Strategy', category: 'custom', enabled: true, systemPrompt: '', userPromptTemplate: '' }
    ])
    var custom = sm.get('custom-1')
    expect(custom).toBeTruthy()
    expect(custom.source).toBe('remote')
  })

  test('should clear remote strategies', function() {
    sm.mergeRemote([{ id: 'custom-1', name: 'Custom', category: 'custom', enabled: true }])
    sm.clearRemote()
    expect(sm.get('custom-1')).toBeNull()
    expect(sm.get('strategy-viral-storytelling')).toBeTruthy()
  })

  test('should filter disabled strategies', function() {
    sm.mergeRemote([
      { id: 'disabled-1', name: 'Disabled', category: 'viral', enabled: false }
    ])
    var all = sm.listEnabled()
    var disabled = all.find(function(s) { return s.id === 'disabled-1' })
    expect(disabled).toBeUndefined()
  })
})
