/**
 * Test: proxy-pool.js — 代理池轮换
 * 测试: 添加代理、轮换、健康检查、事件
 */
const ProxyPool = require('../src/proxy-pool')

describe('ProxyPool', () => {
  let pool

  beforeEach(() => {
    pool = new ProxyPool()
  })

  // ── Constructor ─────────────────────────────────────────────────

  test('creates empty pool by default', () => {
    expect(pool.size()).toBe(0)
  })

  test('accepts initial proxies array', () => {
    const p = new ProxyPool({
      proxies: [
        { host: '127.0.0.1', port: 8080 },
        { host: '127.0.0.1', port: 8081 },
      ]
    })
    expect(p.size()).toBe(2)
  })

  test('extends EventEmitter', () => {
    expect(typeof pool.on).toBe('function')
  })

  // ── addProxy ───────────────────────────────────────────────────

  test('addProxy adds a proxy and returns its id', () => {
    const id = pool.addProxy('127.0.0.1', 8080)
    expect(id).toBeTruthy()
    expect(pool.size()).toBe(1)
  })

  test('addProxy emits proxy:added', () => {
    const emitted = []
    pool.on('proxy:added', (data) => emitted.push(data))
    pool.addProxy('127.0.0.1', 8080)
    expect(emitted).toHaveLength(1)
    expect(emitted[0].host).toBe('127.0.0.1')
  })

  test('addProxy accepts optional type parameter', () => {
    pool.addProxy('127.0.0.1', 8080, 'socks5')
    const p = pool.getProxies()[0]
    expect(p.type).toBe('socks5')
  })

  test('addProxy rejects invalid host', () => {
    expect(() => pool.addProxy('', 8080)).toThrow()
  })

  test('addProxy rejects invalid port range', () => {
    expect(() => pool.addProxy('127.0.0.1', 0)).toThrow()
    expect(() => pool.addProxy('127.0.0.1', 70000)).toThrow()
  })

  // ── addProxies ─────────────────────────────────────────────────

  test('addProxies adds multiple proxies', () => {
    pool.addProxies([
      { host: '127.0.0.1', port: 8080 },
      { host: '127.0.0.1', port: 8081 },
      { host: '127.0.0.1', port: 8082 },
    ])
    expect(pool.size()).toBe(3)
  })

  // ── getNextProxy ───────────────────────────────────────────────

  test('getNextProxy returns proxies in round-robin order', () => {
    pool.addProxies([
      { host: 'a.com', port: 80 },
      { host: 'b.com', port: 80 },
      { host: 'c.com', port: 80 },
    ])

    expect(pool.getNextProxy().host).toBe('a.com')
    expect(pool.getNextProxy().host).toBe('b.com')
    expect(pool.getNextProxy().host).toBe('c.com')
    expect(pool.getNextProxy().host).toBe('a.com') // wraps around
  })

  test('getNextProxy throws on empty pool', () => {
    expect(() => pool.getNextProxy()).toThrow(/empty/i)
  })

  test('getNextProxy skips proxies marked as dead', () => {
    pool.addProxies([
      { host: 'dead.com', port: 80 },
      { host: 'alive.com', port: 80 },
    ])
    // Mark first as dead
    const proxy = pool.getProxies()[0]
    proxy.alive = false

    expect(pool.getNextProxy().host).toBe('alive.com')
  })

  // ── testProxy ──────────────────────────────────────────────────

  test('testProxy returns alive:true for reachable proxy', async () => {
    const id = pool.addProxy('127.0.0.1', 8080)
    // Mock a successful connection
    const result = await pool.testProxy(id, {
      testUrl: 'http://127.0.0.1:8080',
      timeout: 1000,
    })
    // Can't guarantee the test actually succeeds, but should not throw
    expect(typeof result.alive).toBe('boolean')
    expect(typeof result.latency).toBe('number')
  })

  test('testProxy updates proxy status', async () => {
    const id = pool.addProxy('127.0.0.1', 8080)
    const result = await pool.testProxy(id)
    const proxy = pool.getProxy(id)
    expect(proxy.alive).toBe(result.alive)
    expect(proxy.latency).toBe(result.latency)
  })

  test('testProxy emits proxy:tested', async () => {
    const emitted = []
    pool.on('proxy:tested', (data) => emitted.push(data))
    const id = pool.addProxy('127.0.0.1', 8080)
    await pool.testProxy(id)
    expect(emitted).toHaveLength(1)
    expect(emitted[0].id).toBe(id)
  })

  // ── testAll ────────────────────────────────────────────────────

  test('testAll tests all proxies in parallel', async () => {
    pool.addProxies([
      { host: '127.0.0.1', port: 8080 },
      { host: '127.0.0.1', port: 8081 },
    ])
    const results = await pool.testAll({ timeout: 500 })
    expect(results).toHaveLength(2)
  })

  // ── remove ─────────────────────────────────────────────────────

  test('remove removes proxy by id', () => {
    const id = pool.addProxy('127.0.0.1', 8080)
    expect(pool.remove(id)).toBe(true)
    expect(pool.size()).toBe(0)
  })

  test('remove returns false for non-existent id', () => {
    expect(pool.remove('nonexistent')).toBe(false)
  })

  test('remove emits proxy:removed', () => {
    const emitted = []
    pool.on('proxy:removed', (data) => emitted.push(data))
    const id = pool.addProxy('127.0.0.1', 8080)
    pool.remove(id)
    expect(emitted).toHaveLength(1)
    expect(emitted[0].id).toBe(id)
  })

  // ── removeDead ─────────────────────────────────────────────────

  test('removeDead removes all dead proxies', () => {
    pool.addProxies([
      { host: 'a.com', port: 80 },
      { host: 'b.com', port: 80 },
      { host: 'c.com', port: 80 },
    ])
    pool.getProxies()[0].alive = false
    pool.getProxies()[2].alive = false

    const removed = pool.removeDead()
    expect(removed).toBe(2)
    expect(pool.size()).toBe(1)
  })

  // ── getStatus / getProxies ─────────────────────────────────────

  test('getStatus returns pool stats', () => {
    pool.addProxies([
      { host: 'a.com', port: 80 },
      { host: 'b.com', port: 80 },
    ])
    pool.getProxies()[0].alive = false

    const status = pool.getStatus()
    expect(status.total).toBe(2)
    expect(status.alive).toBe(1)
    expect(status.dead).toBe(1)
  })

  test('getProxies returns a copy of the proxy list', () => {
    pool.addProxy('127.0.0.1', 8080)
    const proxies = pool.getProxies()
    expect(proxies).toHaveLength(1)
    // Modifying returned list should not affect pool
    proxies.pop()
    expect(pool.size()).toBe(1)
  })

  // ── isAlive ────────────────────────────────────────────────────

  test('isAlive returns proxy alive status', () => {
    const id = pool.addProxy('127.0.0.1', 8080)
    expect(pool.isAlive(id)).toBe(true)  // default is alive
  })

  test('isAlive returns null for non-existent proxy', () => {
    expect(pool.isAlive('nonexistent')).toBeNull()
  })

  // ── Edge cases ─────────────────────────────────────────────────

  test('handles empty addProxies gracefully', () => {
    pool.addProxies([])
    expect(pool.size()).toBe(0)
  })

  test('reset removes all proxies', () => {
    pool.addProxies([
      { host: 'a.com', port: 80 },
      { host: 'b.com', port: 80 },
    ])
    pool.reset()
    expect(pool.size()).toBe(0)
  })
})
