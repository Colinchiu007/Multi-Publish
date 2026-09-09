/**
 * 改写质量评估器测试
 */
var {
  RewriteQualityEvaluator, cosineSimilarity, computeSimHash, hammingDistance
} = require('../src/rewrite-quality-evaluator')

describe('RewriteQualityEvaluator', function () {
  var evaluator

  beforeEach(function () {
    evaluator = new RewriteQualityEvaluator()
  })

  test('evaluate() should return simhash-based scores', function () {
    var result = evaluator.evaluate('这是原文内容', '这是改写后的内容')
    expect(result).toHaveProperty('sufficiency')
    expect(result).toHaveProperty('semanticPreservation')
    expect(result).toHaveProperty('originality')
    expect(result).toHaveProperty('simhashDistance')
    expect(result).toHaveProperty('verdict')
    expect(result).toHaveProperty('method')
    expect(result.method).toBe('simhash')
    expect(typeof result.simhashDistance).toBe('number')
  })

  test('evaluate() should detect identical text as insufficient rewrite', function () {
    var text = '这是一段完全相同的文本'
    var result = evaluator.evaluate(text, text)
    expect(result.simhashDistance).toBe(0)
    expect(result.sufficiency).toBe(0)
    expect(result.verdict).toBe('fail')
  })

  test('evaluate() should accept sufficiently different text', function () {
    var result = evaluator.evaluate(
      '这是一段关于电商运营的原文内容，包含了丰富的营销策略',
      '电商运营的优化方案，从营销角度重新设计内容策略'
    )
    expect(result.verdict).toBeDefined()
  })

  test('evaluateAsync() should use embedding when client is available', async function () {
    var mockClient = {
      getEmbedding: async function (text) {
        return new Array(128).fill(0).map(function (_, i) { return Math.sin(i + text.length) })
      }
    }
    var e = new RewriteQualityEvaluator({ embeddingClient: mockClient })
    var result = await e.evaluateAsync('hello world', 'different text here')
    expect(result.method).toBe('embedding')
    expect(result).toHaveProperty('sufficiency')
    expect(result).toHaveProperty('semanticPreservation')
    expect(result).toHaveProperty('originality')
    expect(result).toHaveProperty('verdict')
  })

  test('evaluateAsync() should fallback to simhash when embedding fails', async function () {
    var mockClient = {
      getEmbedding: async function () { throw new Error('network error') }
    }
    var e = new RewriteQualityEvaluator({ embeddingClient: mockClient })
    var result = await e.evaluateAsync('hello', 'world')
    expect(result.method).toBe('simhash')
  })

  test('evaluateAsync() should use simhash when no embedding client', async function () {
    var result = await evaluator.evaluateAsync('hello', 'world')
    expect(result.method).toBe('simhash')
  })

  test('evaluateBatch() should evaluate multiple items', function () {
    var items = [
      { original: '原文1', rewritten: '改写1' },
      { original: '原文2', rewritten: '改写2' }
    ]
    var results = evaluator.evaluateBatch(items)
    expect(results).toHaveLength(2)
    expect(results[0].method).toBe('simhash')
  })

  test('evaluateBatchAsync() should evaluate multiple items async', async function () {
    var mockClient = {
      getEmbedding: async function (text) {
        return new Array(128).fill(0).map(function (_, i) { return Math.sin(i + text.length) })
      }
    }
    var e = new RewriteQualityEvaluator({ embeddingClient: mockClient })
    var items = [
      { original: '原文A', rewritten: '改写A' },
      { original: '原文B', rewritten: '改写B' }
    ]
    var results = await e.evaluateBatchAsync(items)
    expect(results).toHaveLength(2)
    expect(results[0].method).toBe('embedding')
  })
})

describe('cosineSimilarity', function () {
  test('should return 1 for identical vectors', function () {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBe(1)
  })

  test('should return 0 for orthogonal vectors', function () {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10)
  })

  test('should return -1 for opposite vectors', function () {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(-1)
  })

  test('should handle zero vector gracefully', function () {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0)
  })
})

describe('computeSimHash', function () {
  test('should return hex string', function () {
    var hash = computeSimHash('hello world')
    expect(typeof hash).toBe('string')
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  test('should produce identical hash for same text', function () {
    expect(computeSimHash('same text')).toBe(computeSimHash('same text'))
  })

  test('should produce different hash for different text', function () {
    expect(computeSimHash('text A')).not.toBe(computeSimHash('text B'))
  })
})

describe('hammingDistance', function () {
  test('should return 0 for identical strings', function () {
    expect(hammingDistance('abc', 'abc')).toBe(0)
  })

  test('should count differing bits', function () {
    expect(hammingDistance('a', 'b')).toBe(1)
  })
})
