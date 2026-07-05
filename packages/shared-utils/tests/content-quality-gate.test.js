/**
 * Test: ContentQualityGate — 发布内容质量门禁
 */
const ContentQualityGate = require('../src/content-quality-gate')

describe('ContentQualityGate', () => {
  let gate
  const validCtx = {
    title: '这是一篇测试文章的标题',
    content: '这是一篇用于测试的正文内容，包含足够的文字来通过内容完整度检测。本文旨在测试内容质量门禁的各项功能，确保发布内容符合质量标准。还包含更多文字以确保超过20字和满足其他检测条件。',
    platform: 'wechat_mp',
    images: ['https://example.com/img1.jpg'],
    tags: ['测试'],
  }

  beforeEach(() => {
    gate = new ContentQualityGate({ passThreshold: 0.6 })
  })

  describe('evaluate', () => {
    test('valid content passes all checks', () => {
      const result = gate.evaluate(validCtx)
      expect(result.passed).toBe(true)
      expect(result.score).toBeGreaterThanOrEqual(60)
      expect(result.signals).toBe(0)
    })

    test('returns structured result object', () => {
      const result = gate.evaluate(validCtx)
      expect(result).toHaveProperty('passed')
      expect(result).toHaveProperty('score')
      expect(result).toHaveProperty('passRate')
      expect(result).toHaveProperty('failures')
      expect(result).toHaveProperty('signals')
      expect(result).toHaveProperty('highSignal')
      expect(result).toHaveProperty('details')
      expect(result.details).toHaveProperty('passCriteria')
      expect(result.details).toHaveProperty('failureSignals')
    })

    test('empty title fails PC-1 (title structure)', () => {
      const result = gate.evaluate({ ...validCtx, title: '' })
      expect(result.details.passCriteria.find(p => p.id === 'PC-1').pass).toBe(false)
    })

    test('empty content fails PC-2 (content completeness)', () => {
      const result = gate.evaluate({ ...validCtx, content: '' })
      expect(result.details.passCriteria.find(p => p.id === 'PC-2').pass).toBe(false)
    })

    test('template residuals in content fail PC-2', () => {
      const result = gate.evaluate({ ...validCtx, content: '内容包含 {{template}} 残留' })
      expect(result.details.passCriteria.find(p => p.id === 'PC-2').pass).toBe(false)
    })

    test('keeps going even with some failures (not pass/fail)', () => {
      const result = gate.evaluate({ title: '短', content: '', platform: 'unknown' })
      expect(result).toHaveProperty('score')
      expect(result.score).toBeLessThan(60)
    })

    test('evaluate handles minimal input without throwing', () => {
      expect(() => gate.evaluate({})).not.toThrow()
    })
  })

  describe('detectFailureSignals', () => {
    test('returns clean result for valid content', () => {
      const result = gate.detectFailureSignals(validCtx)
      expect(result.hasSignal).toBe(false)
    })

    test('returns hasSignal without throw for empty input', () => {
      const result = gate.detectFailureSignals({})
      expect(result).toHaveProperty('hasSignal')
      expect(result).toHaveProperty('triggered')
    })

    test('triggers FS-4 (Tag Compliance high) for suspicious tags', () => {
      const ctx = { ...validCtx, tags: ['赌博', '色情'] }
      const result = gate.detectFailureSignals(ctx)
      expect(result.hasSignal).toBe(true)
    })
  })

  describe('computePassRate', () => {
    test('valid content has high pass rate', () => {
      const result = gate.computePassRate(validCtx)
      expect(result.rate).toBeGreaterThanOrEqual(0.6)
    })

    test('returns details array for each criterion', () => {
      const result = gate.computePassRate(validCtx)
      expect(result.details).toHaveLength(13)
      expect(result.details[0]).toHaveProperty('id')
      expect(result.details[0]).toHaveProperty('pass')
      expect(result.details[0]).toHaveProperty('reason')
    })
  })

  describe('constructor', () => {
    test('default passThreshold is 0.6', () => {
      const g = new ContentQualityGate()
      expect(g.passThreshold).toBe(0.6)
    })

    test('custom passThreshold is applied', () => {
      const g = new ContentQualityGate({ passThreshold: 0.8 })
      expect(g.passThreshold).toBe(0.8)
    })

    test('static properties expose rules', () => {
      expect(ContentQualityGate.PASS_CRITERIA).toHaveLength(13)
      expect(ContentQualityGate.FAILURE_SIGNALS).toHaveLength(11)
    })
  })
})