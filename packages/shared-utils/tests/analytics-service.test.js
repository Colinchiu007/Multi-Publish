/**
 * Test: analytics-service.js — 数据分析服务
 * 测试: 平台数据获取、Provider 注册、数据归一化、事件、错误处理
 */
const AnalyticsService = require('../src/analytics-service')

// 模拟 platform provider
const mockXiaohongshuProvider = vi.fn().mockResolvedValue({
  platform: 'xiaohongshu',
  period: 'day',
  metrics: {
    fans: 12345,
    likes: 5432,
    collects: 3210,
    comments: 1890,
    shares: 670,
    views: 98765,
  },
  trend: [
    { date: '2026-06-01', value: 100 },
    { date: '2026-06-02', value: 150 },
  ],
})

const mockDouyinProvider = vi.fn().mockResolvedValue({
  platform: 'douyin',
  period: 'day',
  metrics: {
    fans: 5678,
    likes: 2100,
    comments: 890,
    shares: 340,
    views: 45678,
  },
  trend: [
    { date: '2026-06-01', value: 200 },
  ],
})

const mockFailingProvider = vi.fn().mockRejectedValue(new Error('API rate limited'))

describe('AnalyticsService', () => {
  let service

  beforeEach(() => {
    service = new AnalyticsService()
  })

  // ── Constructor ─────────────────────────────────────────────────

  test('creates empty provider registry', () => {
    expect(service.getRegisteredPlatforms()).toEqual([])
  })

  test('extends EventEmitter', () => {
    expect(typeof service.on).toBe('function')
  })

  test('accepts pre-configured providers via constructor', () => {
    const s = new AnalyticsService({
      providers: {
        xiaohongshu: mockXiaohongshuProvider,
        douyin: mockDouyinProvider,
      },
    })
    expect(s.getRegisteredPlatforms()).toEqual(['xiaohongshu', 'douyin'])
  })

  // ── registerProvider ────────────────────────────────────────────

  test('registerProvider registers a platform data provider', () => {
    service.registerProvider('xiaohongshu', mockXiaohongshuProvider)
    expect(service.getRegisteredPlatforms()).toEqual(['xiaohongshu'])
  })

  test('registerProvider overwrites existing provider', () => {
    service.registerProvider('xiaohongshu', mockXiaohongshuProvider)
    const newProvider = vi.fn()
    service.registerProvider('xiaohongshu', newProvider)
    expect(service.getProvider('xiaohongshu')).toBe(newProvider)
  })

  test('registerProvider emits provider:registered', () => {
    const emitted = []
    service.on('provider:registered', (data) => emitted.push(data))
    service.registerProvider('xiaohongshu', mockXiaohongshuProvider)
    expect(emitted).toHaveLength(1)
    expect(emitted[0].platform).toBe('xiaohongshu')
  })

  // ── fetchPlatformData ──────────────────────────────────────────

  test('fetchPlatformData returns normalized data for a platform', async () => {
    service.registerProvider('xiaohongshu', mockXiaohongshuProvider)
    const data = await service.fetchPlatformData('xiaohongshu')

    expect(data).toBeDefined()
    expect(data.platform).toBe('xiaohongshu')
    expect(data.metrics.fans).toBe(12345)
    expect(data.metrics.views).toBe(98765)
    expect(data.trend).toHaveLength(2)
  })

  test('fetchPlatformData passes credentials to provider', async () => {
    const provider = vi.fn().mockResolvedValue({ platform: 'test', metrics: {} })
    service.registerProvider('test', provider)

    await service.fetchPlatformData('test', { cookie: 'test-cookie' })
    expect(provider).toHaveBeenCalledWith('test', { cookie: 'test-cookie' })
  })

  test('fetchPlatformData throws for unregistered platform', async () => {
    await expect(
      service.fetchPlatformData('nonexistent')
    ).rejects.toThrow(/no provider registered/i)
  })

  test('fetchPlatformData throws when provider fails', async () => {
    service.registerProvider('douyin', mockFailingProvider)
    await expect(
      service.fetchPlatformData('douyin')
    ).rejects.toThrow('API rate limited')
  })

  test('fetchPlatformData emits data:fetched on success', async () => {
    const emitted = []
    service.on('data:fetched', (data) => emitted.push(data))
    service.registerProvider('xiaohongshu', mockXiaohongshuProvider)

    await service.fetchPlatformData('xiaohongshu')

    expect(emitted).toHaveLength(1)
    expect(emitted[0].platform).toBe('xiaohongshu')
  })

  test('fetchPlatformData emits data:error on failure', async () => {
    const errors = []
    service.on('data:error', (err) => errors.push(err))
    service.registerProvider('douyin', mockFailingProvider)

    await expect(
      service.fetchPlatformData('douyin')
    ).rejects.toThrow()

    expect(errors).toHaveLength(1)
    expect(errors[0].platform).toBe('douyin')
  })

  // ── fetchOverview ──────────────────────────────────────────────

  test('fetchOverview fetches data for multiple platforms', async () => {
    service.registerProvider('xiaohongshu', mockXiaohongshuProvider)
    service.registerProvider('douyin', mockDouyinProvider)

    const results = await service.fetchOverview(['xiaohongshu', 'douyin'])

    expect(results).toHaveLength(2)
    expect(results[0].platform).toBe('xiaohongshu')
    expect(results[1].platform).toBe('douyin')
  })

  test('fetchOverview skips unregistered platforms with error entry', async () => {
    service.registerProvider('xiaohongshu', mockXiaohongshuProvider)

    const results = await service.fetchOverview(['xiaohongshu', 'nonexistent'])

    expect(results).toHaveLength(2)
    expect(results[0].platform).toBe('xiaohongshu')
    expect(results[1].platform).toBe('nonexistent')
    expect(results[1].error).toBeDefined()
  })

  test('fetchOverview runs providers in parallel', async () => {
    const slowProvider = vi.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ platform: 'slow', metrics: {} }), 50))
    )
    const fastProvider = vi.fn().mockResolvedValue({ platform: 'fast', metrics: {} })

    service.registerProvider('slow', slowProvider)
    service.registerProvider('fast', fastProvider)

    const start = Date.now()
    await service.fetchOverview(['slow', 'fast'])
    const elapsed = Date.now() - start

    // If parallel, elapsed should be ~50ms not ~100ms
    expect(elapsed).toBeLessThan(100)
  })

  // ── Data normalization ─────────────────────────────────────────

  test('normalizeMetrics ensures consistent metric shape', () => {
    const raw = { likes: 100, views: 200 }
    const normalized = AnalyticsService.normalizeMetrics(raw)
    expect(normalized).toEqual({
      fans: 0,
      likes: 100,
      collects: 0,
      comments: 0,
      shares: 0,
      views: 200,
    })
  })

  test('normalizeTrend ensures consistent trend shape', () => {
    const raw = [
      { date: '2026-06-01', value: 50 },
    ]
    const normalized = AnalyticsService.normalizeTrend(raw)
    expect(normalized).toHaveLength(1)
    expect(normalized[0].date).toBe('2026-06-01')
    expect(normalized[0].value).toBe(50)
  })

  // ── Edge cases ─────────────────────────────────────────────────

  test('fetchOverview with empty array returns empty array', async () => {
    const results = await service.fetchOverview([])
    expect(results).toEqual([])
  })

  test('removeProvider unregisters a platform', () => {
    service.registerProvider('xiaohongshu', mockXiaohongshuProvider)
    service.removeProvider('xiaohongshu')
    expect(service.getRegisteredPlatforms()).toEqual([])
  })

  test('removeProvider emits provider:removed', () => {
    const emitted = []
    service.on('provider:removed', (data) => emitted.push(data))
    service.registerProvider('xiaohongshu', mockXiaohongshuProvider)
    service.removeProvider('xiaohongshu')
    expect(emitted).toHaveLength(1)
  })
})
