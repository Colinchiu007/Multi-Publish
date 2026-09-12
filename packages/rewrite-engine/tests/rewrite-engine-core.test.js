/**
 * RewriteEngine core regression tests
 *
 * Regression coverage:
 * - P1: rewrite() must include quality field (historical TDZ bug)
 * - P2: knowledge-base persistence failure must not block main flow
 * - P3: evaluateAsync preferred -> evaluate fallback
 */
var { RewriteEngine } = require('../src/rewrite-engine-core')
var { KnowledgeBase } = require('../src/knowledge-base')

describe('RewriteEngine', function () {
  function sampleStrategy() {
    return {
      id: 'test-imitate-v1',
      name: 'test-rewrite',
      category: 'imitate',
      systemPrompt: 'professional rewrite assistant.',
      userPromptTemplate: 'rewrite: {content}',
      industry: ['generic'],
      tone: ['casual'],
      platforms: ['generic'],
      postProcess: { removeAITaste: false, maxLength: 6000 }
    }
  }
  function mockLlmClient(t) { return { chat: async function () { return t } } }
  function wireStrategy(engine) {
    engine._strategyManager._strategies = [sampleStrategy()]
    engine._strategyManager.listEnabled = function () { return [sampleStrategy()] }
    engine._strategyManager.get = function () { return sampleStrategy() }
    engine._strategyManager.clearRemote = function () {}
    engine._strategyManager.mergeRemote = function () {}
  }

  test('P1 rewrite() returns quality field', async function () {
    var engine = new RewriteEngine({ llmClient: mockLlmClient('rewritten content completely different'), knowledgeBase: new KnowledgeBase() })
    wireStrategy(engine)
    var result = await engine.rewrite({ mode: 'imitate', content: 'this is original article content long enough to pass validation', userSettings: { industry: 'ecommerce', tone: 'casual' } })
    expect(result.success).toBe(true)
    expect(result.quality).not.toBeUndefined()
    expect(result.quality).toHaveProperty('sufficiency')
    expect(result.quality).toHaveProperty('semanticPreservation')
    expect(result.quality).toHaveProperty('originality')
    expect(result.quality).toHaveProperty('verdict')
    expect(result.quality).toHaveProperty('method')
  })

  test('P2 rewrite() returns normally when KB persistence fails', async function () {
    var engine = new RewriteEngine({ llmClient: mockLlmClient('rewritten content different from original'), knowledgeBase: new KnowledgeBase() })
    wireStrategy(engine)
    engine._knowledgeBase.recordFeedback = function () { throw new Error('DB write failure') }
    var result = await engine.rewrite({ mode: 'imitate', content: 'test original text long enough to pass validation', userSettings: {} })
    expect(result.success).toBe(true)
    expect(result.quality).not.toBeUndefined()
    expect(result.quality.verdict).toBeDefined()
  })

  test('P3a evaluateAsync preferred (embedding path)', async function () {
    var a = false, b = false
    var ev = {
      evaluateAsync: async function () { a = true; return { method: 'embedding', verdict: 'pass' } },
      evaluate: function () { b = true; return { method: 'simhash', verdict: 'pass' } }
    }
    var engine = new RewriteEngine({ llmClient: mockLlmClient('rewritten'), qualityEvaluator: ev, knowledgeBase: new KnowledgeBase() })
    wireStrategy(engine)
    var result = await engine.rewrite({ mode: 'imitate', content: 'test original text long enough', userSettings: {} })
    expect(result.success).toBe(true)
    expect(a).toBe(true)
    expect(b).toBe(false)
    expect(result.quality.method).toBe('embedding')
  })

  test('P3b evaluateAsync failure falls back to evaluate', async function () {
    var b = false
    var ev = {
      evaluateAsync: async function () { throw new Error('Embedding unavailable') },
      evaluate: function () { b = true; return { method: 'simhash', verdict: 'pass' } }
    }
    var engine = new RewriteEngine({ llmClient: mockLlmClient('rewritten'), qualityEvaluator: ev, knowledgeBase: new KnowledgeBase() })
    wireStrategy(engine)
    var result = await engine.rewrite({ mode: 'imitate', content: 'test original text long enough', userSettings: {} })
    expect(result.success).toBe(true)
    expect(b).toBe(true)
    expect(result.quality.method).toBe('simhash')
  })

  // ── 字数区间控制（2026-09-12）：移除 20 字下限 + wordCountRange + 2500 默认输出上限 ──

  test('W1 短内容（<20 字）不再被拒绝', async function () {
    var engine = new RewriteEngine({ llmClient: mockLlmClient('改写结果'), knowledgeBase: new KnowledgeBase() })
    wireStrategy(engine)
    var result = await engine.rewrite({ mode: 'imitate', content: '短文案', userSettings: {} })
    expect(result.success).toBe(true)
  })

  test('W2 空内容仍被拒绝（EMPTY_CONTENT）', async function () {
    var engine = new RewriteEngine({ llmClient: mockLlmClient('x'), knowledgeBase: new KnowledgeBase() })
    wireStrategy(engine)
    var result = await engine.rewrite({ mode: 'imitate', content: '   ', userSettings: {} })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('EMPTY_CONTENT')
  })

  test('W3 超长内容仍被拒绝（TOO_LONG, >6000）', async function () {
    var engine = new RewriteEngine({ llmClient: mockLlmClient('x'), knowledgeBase: new KnowledgeBase() })
    wireStrategy(engine)
    var result = await engine.rewrite({ mode: 'imitate', content: 'a'.repeat(6001), userSettings: {} })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('TOO_LONG')
  })

  test('W4 wordCountRange 注入 prompt 字数区间指令', async function () {
    var captured = null
    var llm = { chat: async function (sys, user) { captured = { sys, user }; return '结果' } }
    var engine = new RewriteEngine({ llmClient: llm, knowledgeBase: new KnowledgeBase() })
    wireStrategy(engine)
    await engine.rewrite({ mode: 'imitate', content: '任意内容', userSettings: { wordCountRange: { min: 800, max: 2000 } } })
    expect(captured.sys).toContain('800')
    expect(captured.sys).toContain('2000')
    expect(captured.sys).toContain('字数要求')
  })

  test('W5 无字数控制时 postProcess 默认上限 2500', async function () {
    var longText = 'x'.repeat(3000)
    var strategy = sampleStrategy()
    strategy.postProcess = { removeAITaste: false }
    var engine = new RewriteEngine({ llmClient: mockLlmClient(longText), knowledgeBase: new KnowledgeBase() })
    engine._strategyManager._strategies = [strategy]
    engine._strategyManager.listEnabled = function () { return [strategy] }
    engine._strategyManager.get = function () { return strategy }
    var result = await engine.rewrite({ mode: 'imitate', content: '任意内容', userSettings: {} })
    expect(result.result.length).toBeLessThanOrEqual(2500)
  })

  test('W6 wordCountRange.max 覆盖 postProcess 上限', async function () {
    var longText = 'x'.repeat(3000)
    var strategy = sampleStrategy()
    strategy.postProcess = { removeAITaste: false }
    var engine = new RewriteEngine({ llmClient: mockLlmClient(longText), knowledgeBase: new KnowledgeBase() })
    engine._strategyManager._strategies = [strategy]
    engine._strategyManager.listEnabled = function () { return [strategy] }
    engine._strategyManager.get = function () { return strategy }
    var result = await engine.rewrite({ mode: 'imitate', content: '任意内容', userSettings: { wordCountRange: { min: 100, max: 2000 } } })
    expect(result.result.length).toBeLessThanOrEqual(2000)
  })
})

