/**
 * F3 数据同步系统 — TDD 测试
 *
 * 运行：node test-data-sync.js
 */
const assert = require('assert')

let DataSyncService
try {
  DataSyncService = require('../data-sync')
} catch (e) {
  console.error('[SETUP] Module not yet implemented — tests will fail (TDD RED phase)')
  DataSyncService = null
}

let passed = 0
let failed = 0

function ok (name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`) }
}

function section (name) { console.log(`\n## ${name}`) }

// 模拟 Store
class MockStore {
  constructor () {
    this.data = {}
  }
  setSetting (key, val) { this.data[key] = val }
  getSetting (key) { return this.data[key] || null }
}

// ─── 数据格式 ─────────────────────────────
section('数据格式')
ok('sync 返回标准格式', () => {
  if (!DataSyncService) throw new Error('Module not implemented')
  const service = new DataSyncService(new MockStore())
  const result = service._makeSyncResult('douyin', { views: 100 })
  assert.equal(result.platform, 'douyin')
  assert.ok(result.syncedAt)
  assert.ok(typeof result.articles === 'number' || result.articles === undefined)
})

ok('sync 失败返回错误格式', () => {
  if (!DataSyncService) throw new Error('Module not implemented')
  const service = new DataSyncService(new MockStore())
  const result = service._makeErrorResult('douyin', '网络错误')
  assert.equal(result.platform, 'douyin')
  assert.equal(result.error, '网络错误')
  assert.ok(result.syncedAt)
})

// ─── 缓存测试 ─────────────────────────────
section('数据缓存')
ok('缓存同步数据', () => {
  if (!DataSyncService) throw new Error('Module not implemented')
  const store = new MockStore()
  const service = new DataSyncService(store)
  service._cacheData('douyin', service._makeSyncResult('douyin', { views: 100 }))
  const cached = service.getCachedData('douyin')
  assert.ok(cached)
  assert.equal(cached.views, 100)
})

ok('缓存过期返回 null', () => {
  if (!DataSyncService) throw new Error('Module not implemented')
  const store = new MockStore()
  const service = new DataSyncService(store, { cacheTTL: -1 }) // 过期
  service._cacheData('douyin', service._makeSyncResult('douyin', { views: 100 }))
  const cached = service.getCachedData('douyin')
  assert.equal(cached, null)
})

ok('未同步返回 null', () => {
  if (!DataSyncService) throw new Error('Module not implemented')
  const service = new DataSyncService(new MockStore())
  assert.equal(service.getCachedData('nonexistent'), null)
})

// ─── 同步编排 ─────────────────────────────
section('同步编排')
ok('syncAll 返回数组', async () => {
  if (!DataSyncService) throw new Error('Module not implemented')
  const service = new DataSyncService(new MockStore())
  // mock 所有 sync 方法
  service._syncers = {
    douyin: async () => service._makeSyncResult('douyin', { views: 100 }),
  }
  service._platforms = ['douyin']
  const results = await service.syncAll()
  assert.ok(Array.isArray(results))
  assert.equal(results.length, 1)
})

ok('单个平台失败不影响其他', async () => {
  if (!DataSyncService) throw new Error('Module not implemented')
  const service = new DataSyncService(new MockStore())
  service._syncers = {
    fail: async () => { throw new Error('失败') },
    ok: async () => service._makeSyncResult('ok', { views: 50 }),
  }
  service._platforms = ['fail', 'ok']
  const results = await service.syncAll()
  assert.equal(results.length, 2)
  assert.ok(results.find(r => r.error))
  assert.ok(results.find(r => !r.error && r.views === 50))
})

// ─── 平台列表 ─────────────────────────────
section('平台列表')
ok('支持配置的5个平台', () => {
  if (!DataSyncService) throw new Error('Module not implemented')
  const service = new DataSyncService(new MockStore())
  const platforms = service.getSupportedPlatforms()
  assert.ok(platforms.length >= 5)
  assert.ok(platforms.includes('douyin'))
  assert.ok(platforms.includes('bilibili'))
  assert.ok(platforms.includes('xiaohongshu'))
  assert.ok(platforms.includes('tencent_video'))
  assert.ok(platforms.includes('wechat_mp'))
})

// ─── 汇总 ─────────────────────────────────
console.log(`\n${'='.repeat(50)}`)
console.log(`结果: ${passed} 通过, ${failed} 失败, ${passed + failed} 总计`)
if (failed > 0) process.exit(1)
else console.log('全部通过 ✅')
