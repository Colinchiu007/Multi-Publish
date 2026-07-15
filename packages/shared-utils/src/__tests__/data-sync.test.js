/**
 * F3 数据同步系统 — Vitest 单元测试
 *
 * 迁移自 manual-data-sync.js
 */
const DataSyncService = require('../data-sync')

// 模拟 Store（需提供 getSetting / setSetting）
class MockStore {
  constructor () {
    this.data = {}
  }
  setSetting (key, val) { this.data[key] = val }
  getSetting (key) { return this.data[key] || null }
}

describe('数据同步 / 数据格式', () => {
  test('sync 返回标准格式', () => {
    const service = new DataSyncService(new MockStore())
    const result = service._makeSyncResult('douyin', { views: 100 })
    expect(result.platform).toBe('douyin')
    expect(result.syncedAt).toBeTruthy()
    expect(typeof result.articles === 'number' || result.articles === undefined).toBe(true)
  })

  test('sync 失败返回错误格式', () => {
    const service = new DataSyncService(new MockStore())
    const result = service._makeErrorResult('douyin', '网络错误')
    expect(result.platform).toBe('douyin')
    expect(result.error).toBe('网络错误')
    expect(result.syncedAt).toBeTruthy()
  })
})

describe('数据同步 / 数据缓存', () => {
  test('缓存同步数据', () => {
    const store = new MockStore()
    const service = new DataSyncService(store)
    service._cacheData('douyin', service._makeSyncResult('douyin', { views: 100 }))
    const cached = service.getCachedData('douyin')
    expect(cached).toBeTruthy()
    expect(cached.views).toBe(100)
  })

  test('缓存过期返回 null', () => {
    const store = new MockStore()
    const service = new DataSyncService(store, { cacheTTL: -1 }) // 已过期
    service._cacheData('douyin', service._makeSyncResult('douyin', { views: 100 }))
    const cached = service.getCachedData('douyin')
    expect(cached).toBeNull()
  })

  test('未同步返回 null', () => {
    const service = new DataSyncService(new MockStore())
    expect(service.getCachedData('nonexistent')).toBeNull()
  })
})

describe('数据同步 / 同步编排', () => {
  test('syncAll 返回数组', async () => {
    const service = new DataSyncService(new MockStore())
    // mock 同步器（syncAll 依据 _syncers 的键进行编排）
    service._syncers = {
      douyin: async () => service._makeSyncResult('douyin', { views: 100 }),
    }
    const results = await service.syncAll()
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBe(1)
  })

  test('单个平台失败不影响其他', async () => {
    const service = new DataSyncService(new MockStore())
    service._syncers = {
      fail: async () => { throw new Error('失败') },
      ok: async () => service._makeSyncResult('ok', { views: 50 }),
    }
    const results = await service.syncAll()
    expect(results.length).toBe(2)
    expect(results.find(r => r.error)).toBeTruthy()
    expect(results.find(r => !r.error && r.views === 50)).toBeTruthy()
  })
})

describe('数据同步 / 平台列表', () => {
  test('支持配置的5个平台', () => {
    const service = new DataSyncService(new MockStore())
    const platforms = service.getSupportedPlatforms()
    expect(platforms.length).toBeGreaterThanOrEqual(5)
    expect(platforms).toContain('douyin')
    expect(platforms).toContain('bilibili')
    expect(platforms).toContain('xiaohongshu')
    expect(platforms).toContain('tencent_video')
    expect(platforms).toContain('wechat_mp')
  })
})
