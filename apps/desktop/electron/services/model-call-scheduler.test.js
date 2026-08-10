// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
const {
  resolveProviderBudget,
  withModelBudget,
  mapWithModelBudget,
  normalizeRatePerMinute,
  normalizeLimitPer5h,
} = require('./model-call-scheduler')

describe('model-call-scheduler 预算解析', () => {
  it('provider 配置 rate_per_minute 优先于静态表，并发=clamp(round(rpm/10),1,4)', () => {
    const budget = resolveProviderBudget({
      provider: { id: 'openai', category: 'llm', config: { rate_per_minute: 120, limit_per_5h: 3000 } },
      type: 'llm',
    })
    expect(budget.rpm).toBe(120)
    expect(budget.maxConcurrent).toBe(4)
    expect(budget.limitPer5h).toBe(3000)
    expect(budget.source).toBe('config')
  })

  it('低 rpm 配置并发下限为 1', () => {
    const budget = resolveProviderBudget({
      provider: { id: 'minimax', category: 'video', config: { rate_per_minute: 3 } },
      type: 'video',
    })
    expect(budget.maxConcurrent).toBe(1)
  })

  it('未配置时回退静态表（静态 source）', () => {
    const budget = resolveProviderBudget({ provider: { id: 'openai', category: 'llm', config: {} }, type: 'llm' })
    expect(budget.source).toBe('static')
    expect(budget.rpm).toBeGreaterThanOrEqual(1)
  })

  it('视频/音频未配置预算时并发保持 1', () => {
    const budget = resolveProviderBudget({ provider: { id: 'unknown-video', category: 'video', config: {} }, type: 'video' })
    expect(budget.maxConcurrent).toBe(1)
    expect(budget.source).toBe('default')
  })

  it('无 provider 时使用默认预算', () => {
    const budget = resolveProviderBudget({ provider: null, type: 'llm' })
    expect(budget.maxConcurrent).toBeGreaterThanOrEqual(1)
    expect(budget.source).toBe('default')
  })

  it('归一化：非法/非正数返回 null', () => {
    expect(normalizeRatePerMinute('abc')).toBeNull()
    expect(normalizeRatePerMinute(0)).toBeNull()
    expect(normalizeRatePerMinute(-5)).toBeNull()
    expect(normalizeRatePerMinute(30)).toBe(30)
    expect(normalizeLimitPer5h('')).toBeNull()
    expect(normalizeLimitPer5h(1000)).toBe(1000)
  })
})

describe('model-call-scheduler 有界并发 map', () => {
  it('并发上限 = min(请求并发, provider maxConcurrent)，结果保序', async () => {
    const order = []
    const items = [1, 2, 3, 4, 5]
    const budget = { maxConcurrent: 2 }
    let active = 0
    let peak = 0
    const results = await mapWithModelBudget({
      items,
      requestedConcurrency: 5,
      type: 'llm',
      provider: { id: 'p', category: 'llm', config: { rate_per_minute: 20 } },
      fn: async (item, index) => {
        active += 1
        peak = Math.max(peak, active)
        order.push(item)
        await new Promise((r) => setTimeout(r, 5))
        active -= 1
        return item * 10
      },
    })
    expect(results).toEqual([10, 20, 30, 40, 50])
    expect(order).toEqual([1, 2, 3, 4, 5])
    expect(peak).toBe(2)
    expect(budget.maxConcurrent).toBe(2)
  })

  it('未配置预算时回退静态表预算（openai 静态 maxConcurrent=3，不降级）', async () => {
    const items = [1, 2, 3]
    let peak = 0
    let active = 0
    await mapWithModelBudget({
      items,
      requestedConcurrency: 3,
      provider: { id: 'openai', category: 'llm', config: {} },
      fn: async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 5))
        active -= 1
        return true
      },
    })
    expect(peak).toBe(3)
  })

  it('未知 provider 且无配置时使用类别默认并发（llm=2），请求并发被收敛', async () => {
    const items = [1, 2, 3, 4]
    let peak = 0
    let active = 0
    await mapWithModelBudget({
      items,
      requestedConcurrency: 4,
      provider: { id: 'brand-new', category: 'llm', config: {} },
      fn: async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 5))
        active -= 1
        return true
      },
    })
    expect(peak).toBe(2)
  })

  it('空 items 返回空数组', async () => {
    const results = await mapWithModelBudget({ items: [], fn: async () => 1 })
    expect(results).toEqual([])
  })

  it('fn 抛错时向上传播', async () => {
    await expect(mapWithModelBudget({
      items: [1, 2],
      fn: async () => { throw new Error('boom') },
    })).rejects.toThrow('boom')
  })
})

describe('model-call-scheduler withModelBudget', () => {
  it('有 governor 与 providerId 时经 governor.run', async () => {
    const run = vi.fn(async () => 'ok')
    const governor = { run }
    const result = await withModelBudget({ governor, type: 'llm', providerId: 'openai', model: 'gpt-4o' }, async () => 'ok')
    expect(result).toBe('ok')
    expect(run).toHaveBeenCalledWith({ type: 'llm', providerId: 'openai', model: 'gpt-4o' }, expect.any(Function))
  })

  it('无 governor 时直接执行（回退）', async () => {
    const fn = vi.fn(async () => 'direct')
    const result = await withModelBudget({ governor: null, providerId: 'openai' }, fn)
    expect(result).toBe('direct')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})