/**
 * F2 敏感词预检 — Vitest 单元测试
 *
 * 迁移自 manual-sensitive-filter.js
 */
const SensitiveFilter = require('../sensitive-filter')

describe('敏感词过滤器 / 基础功能', () => {
  test('正常文本无命中', () => {
    const filter = new SensitiveFilter(['敏感词'])
    const result = filter.check('这是一段正常文本')
    expect(result.hasSensitive).toBe(false)
    expect(result.words.length).toBe(0)
  })

  test('命中单个敏感词', () => {
    const filter = new SensitiveFilter(['敏感'])
    const result = filter.check('这句话包含敏感内容')
    expect(result.hasSensitive).toBe(true)
    expect(result.words).toContain('敏感')
  })

  test('命中多个敏感词', () => {
    const filter = new SensitiveFilter(['词A', '词B'])
    const result = filter.check('词A和词B都在')
    expect(result.hasSensitive).toBe(true)
    expect(result.words).toContain('词A')
    expect(result.words).toContain('词B')
  })

  test('返回命中位置', () => {
    const filter = new SensitiveFilter('词A')
    const result = filter.check('测试词A在文本中')
    expect(result.positions.length).toBeGreaterThan(0)
    expect(result.positions[0].word).toBe('词A')
    expect(result.positions[0].index).toBeGreaterThanOrEqual(0)
  })

  test('空文本不崩溃', () => {
    const filter = new SensitiveFilter(['敏感'])
    expect(() => filter.check('')).not.toThrow()
    expect(() => filter.check(null)).not.toThrow()
    expect(() => filter.check(undefined)).not.toThrow()
  })

  test('空词库不崩溃', () => {
    const filter = new SensitiveFilter([])
    const result = filter.check('test')
    expect(result.hasSensitive).toBe(false)
  })
})

describe('敏感词过滤器 / 替换功能', () => {
  test('替换敏感词为 ***', () => {
    const filter = new SensitiveFilter(['敏感'])
    const result = filter.replace('这句话包含敏感内容')
    expect(result).toContain('***')
    expect(result).not.toContain('敏感')
  })

  test('替换多个敏感词', () => {
    const filter = new SensitiveFilter(['词A', '词B'])
    const result = filter.replace('词A和词B')
    expect(result).toContain('***')
    expect(result).not.toContain('词A')
    expect(result).not.toContain('词B')
  })

  test('无敏感词不替换', () => {
    const filter = new SensitiveFilter(['敏感'])
    const result = filter.replace('正常内容')
    expect(result).toBe('正常内容')
  })
})

describe('敏感词过滤器 / 内置词库', () => {
  test('内置词库加载不崩溃', () => {
    const filter = SensitiveFilter.createWithBuiltin()
    expect(filter).toBeTruthy()
  })

  test('内置词库能检测到词', () => {
    const filter = SensitiveFilter.createWithBuiltin()
    const result = filter.check('法轮功')
    // 内置词库应该包含基本敏感词
    expect(result.hasSensitive).toBe(true)
  })
})
