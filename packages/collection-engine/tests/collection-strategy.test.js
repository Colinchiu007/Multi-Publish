/**
 * CollectionStrategy 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
const req = createRequire(import.meta.url)
const { CollectionStrategy, deepMerge } = req('../src/collection-strategy')


describe('deepMerge', () => {
  it('should override scalar values', () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 })
  })

  it('should deep merge nested objects', () => {
    const base = { a: { b: 1, c: 2 }, d: 3 }
    const override = { a: { b: 10 } }
    expect(deepMerge(base, override)).toEqual({ a: { b: 10, c: 2 }, d: 3 })
  })

  it('should handle null override', () => {
    expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 })
  })

  it('should handle undefined override', () => {
    expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 })
  })
})

describe('CollectionStrategy', () => {
  let strategy

  beforeEach(() => {
    strategy = new CollectionStrategy({
      strategyFile: '/nonexistent/file.json'
    })
  })

  it('should return defaults when no config file exists', () => {
    const s = strategy.getStrategy('unknown_platform')
    expect(s.platform).toBe('unknown_platform')
    expect(s.riskLevel).toBe('medium')
    expect(s.dailyBudget).toBe(100)
  })

  it('should merge platform config with defaults', () => {
    strategy._strategies = {
      version: 1,
      defaults: { dailyBudget: 100, interval: { min: 5000 } },
      platforms: {
        wechat_mp: { dailyBudget: 200, interval: { max: 10000 } }
      }
    }
    const s = strategy.getStrategy('wechat_mp')
    expect(s.dailyBudget).toBe(200)
    expect(s.interval.min).toBe(5000)
    expect(s.interval.max).toBe(10000)
  })

  it('should apply runtime override', () => {
    strategy._strategies = {
      version: 1,
      defaults: { dailyBudget: 100 },
      platforms: {}
    }
    strategy.setOverride('wechat_mp', { dailyBudget: 300 })
    expect(strategy.getStrategy('wechat_mp').dailyBudget).toBe(300)
  })

  it('should check budget correctly', () => {
    strategy._strategies = {
      version: 1,
      defaults: { dailyBudget: 3 },
      platforms: {}
    }

    const check1 = strategy.checkBudget('test', 'acc1')
    expect(check1.allowed).toBe(true)
    expect(check1.remaining).toBe(3)
    expect(check1.used).toBe(0)

    strategy.consumeBudget('test', 'acc1')
    strategy.consumeBudget('test', 'acc1')

    const check2 = strategy.checkBudget('test', 'acc1')
    expect(check2.allowed).toBe(true)
    expect(check2.remaining).toBe(1)
    expect(check2.used).toBe(2)

    strategy.consumeBudget('test', 'acc1')
    const check3 = strategy.checkBudget('test', 'acc1')
    expect(check3.allowed).toBe(false)
    expect(check3.remaining).toBe(0)
  })

  it('should reset budget', () => {
    strategy._strategies = {
      version: 1,
      defaults: { dailyBudget: 100 },
      platforms: {}
    }
    strategy.consumeBudget('test', 'acc1')
    strategy.resetBudget('test', 'acc1')
    expect(strategy.checkBudget('test', 'acc1').used).toBe(0)
  })

  it('should reload strategies', () => {
    strategy._strategies = {
      version: 1,
      defaults: { dailyBudget: 50 },
      platforms: {}
    }
    expect(strategy.getStrategy('test').dailyBudget).toBe(50)

    // Simulate file change
    strategy._load = () => ({
      version: 1,
      defaults: { dailyBudget: 80 },
      platforms: {}
    })
    strategy.reload()
    expect(strategy.getStrategy('test').dailyBudget).toBe(80)
  })
})
