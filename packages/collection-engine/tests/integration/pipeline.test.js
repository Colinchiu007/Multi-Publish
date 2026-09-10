import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
const req = createRequire(import.meta.url)
const {
  CollectionStrategy,
  RateLimiter,
  CircuitBreaker,
  ContentCache,
  AuditLogger,
  HealthMonitor,
  WechatMpAdapter,
} = req('../../src/index.js')

function buildPipeline () {
  const strategy = new CollectionStrategy({ strategyFile: '/nonexistent/file.json' })
  strategy._strategies = {
    version: 1,
    defaults: { dailyBudget: 100, interval: { min: 100, max: 100 }, activeHours: { start: 0, end: 24 }, weekendFactor: 1 },
    platforms: {},
  }
  const rateLimiter = new RateLimiter()
  const circuitBreaker = new CircuitBreaker()
  const contentCache = new ContentCache()
  const healthMonitor = new HealthMonitor()
  const auditLogger = new AuditLogger({ enabled: false })
  const adapter = new WechatMpAdapter({
    strategy, rateLimiter, circuitBreaker, contentCache, healthMonitor, auditLogger,
  })
  adapter._doFetch = async (url) => ({
    status: 200,
    body: '<div id="js_content"><p>测试正文内容</p></div>',
    title: '测试标题',
    url,
  })
  return { adapter, strategy, circuitBreaker, contentCache, healthMonitor }
}

describe('Pipeline 集成测试', () => {
  let pipeline
  beforeEach(() => { pipeline = buildPipeline() })

  it('should collect content successfully', async () => {
    const result = await pipeline.adapter.collect('https://mp.weixin.qq.com/s/abc', 'acc1')
    expect(result.success).toBe(true)
    expect(result.content.text).toContain('测试正文内容')
  })

  it('should hit cache on second identical collect', async () => {
    await pipeline.adapter.collect('https://mp.weixin.qq.com/s/abc', 'acc1')
    const result = await pipeline.adapter.collect('https://mp.weixin.qq.com/s/abc', 'acc1')
    expect(result.reason).toBe('cache_hit')
  })

  it('should block when budget exhausted', async () => {
    pipeline.strategy._strategies = {
      version: 1,
      defaults: { dailyBudget: 1, interval: { min: 100, max: 100 }, activeHours: { start: 0, end: 24 }, weekendFactor: 1 },
      platforms: {},
    }
    await pipeline.adapter.collect('https://mp.weixin.qq.com/s/a', 'acc1')
    const result = await pipeline.adapter.collect('https://mp.weixin.qq.com/s/b', 'acc1')
    expect(result.reason).toBe('budget_exhausted')
  })

  it('should open circuit after repeated failures', async () => {
    pipeline.adapter._doFetch = async () => ({ status: 403, body: '' })
    await pipeline.adapter.collect('https://mp.weixin.qq.com/s/1', 'acc1')
    await pipeline.adapter.collect('https://mp.weixin.qq.com/s/2', 'acc1')
    await pipeline.adapter.collect('https://mp.weixin.qq.com/s/3', 'acc1')
    // 3 consecutive failures → open
    const state = pipeline.circuitBreaker.getState('wechat_mp', 'acc1')
    expect(state.state).toBe('open')
  })

  it('should track health metrics', async () => {
    await pipeline.adapter.collect('https://mp.weixin.qq.com/s/ok', 'acc1')
    const snap = pipeline.healthMonitor.snapshot('wechat_mp', 'acc1')
    expect(snap.total).toBeGreaterThan(0)
    expect(snap.successRate).toBe(1)
  })
})
