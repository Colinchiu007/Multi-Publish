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
})

