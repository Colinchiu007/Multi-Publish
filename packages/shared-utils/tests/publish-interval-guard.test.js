/**
 * Test: publish-interval-guard.js — 发布频率控制
 * 测试: 同账号发布间隔检测、记录、等待时间
 */

const PublishIntervalGuard = require('../src/publish-interval-guard')

// 5 分钟 = 300000ms
const MIN_INTERVAL = 5 * 60 * 1000

describe('PublishIntervalGuard', () => {
  describe('canPublish', () => {
    test('无发布记录时返回 true', () => {
      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
      expect(guard.canPublish('wechat_mp', 'acc_001')).toBe(true)
    })

    test('上次发布不足 5 分钟时返回 false', () => {
      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
      guard.recordPublish('wechat_mp', 'acc_001')
      expect(guard.canPublish('wechat_mp', 'acc_001')).toBe(false)
    })

    test('上次发布超过 5 分钟后返回 true', () => {
      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
      // mock: 记录 6 分钟前的时间
      guard.recordPublish('wechat_mp', 'acc_001', Date.now() - MIN_INTERVAL - 60000)
      expect(guard.canPublish('wechat_mp', 'acc_001')).toBe(true)
    })

    test('不同账号同一平台互不影响', () => {
      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
      guard.recordPublish('wechat_mp', 'acc_001')
      expect(guard.canPublish('wechat_mp', 'acc_002')).toBe(true)
    })

    test('同一账号不同平台互不影响', () => {
      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
      guard.recordPublish('wechat_mp', 'acc_001')
      expect(guard.canPublish('zhihu', 'acc_001')).toBe(true)
    })

    test('边界情况：恰好 5 分钟时返回 true', () => {
      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
      guard.recordPublish('wechat_mp', 'acc_001', Date.now() - MIN_INTERVAL)
      expect(guard.canPublish('wechat_mp', 'acc_001')).toBe(true)
    })
  })

  describe('recordPublish', () => {
    test('记录发布后存储时间戳', () => {
      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
      guard.recordPublish('wechat_mp', 'acc_001')
      const remaining = guard.getRemainingWait('wechat_mp', 'acc_001')
      expect(remaining).toBeGreaterThan(0)
      expect(remaining).toBeLessThanOrEqual(MIN_INTERVAL)
    })

    test('私有 key 不暴露', () => {
      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
      guard.recordPublish('wechat_mp', 'acc_001')
      // 检查不能通过直接访问对象属性找到存储的时间
      const keys = Object.keys(guard)
      expect(keys).not.toContain('wechat_mp:acc_001')
    })
  })

  describe('getRemainingWait', () => {
    test('无发布记录时返回 0', () => {
      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
      expect(guard.getRemainingWait('wechat_mp', 'acc_001')).toBe(0)
    })

    test('发布后返回正确剩余等待时间', () => {
      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
      guard.recordPublish('wechat_mp', 'acc_001', Date.now() - 60000) // 1 分钟前
      const remaining = guard.getRemainingWait('wechat_mp', 'acc_001')
      // 应剩余约 4 分钟 (240000ms)，允许 100ms 误差
      expect(remaining).toBeGreaterThan(230000)
      expect(remaining).toBeLessThanOrEqual(240000)
    })
  })

  describe('自定义 minInterval', () => {
    test('支持构造函数传入自定义间隔', () => {
      const guard = new PublishIntervalGuard({ minInterval: 10000 }) // 10 秒
      guard.recordPublish('wechat_mp', 'acc_001')
      expect(guard.canPublish('wechat_mp', 'acc_001')).toBe(false)
      // 1 秒后还在间隔内
      guard.recordPublish('wechat_mp', 'acc_001', Date.now() - 5000) // 5 秒前
      expect(guard.canPublish('wechat_mp', 'acc_001')).toBe(false)
    })
  })

  describe('可插拔存储', () => {
    test('支持外部 store 实现', () => {
      const externalStore = new Map()
      const store = {
        get: (key) => externalStore.get(key) ?? null,
        set: (key, value) => { externalStore.set(key, value) }
      }
      const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL, store })
      guard.recordPublish('wechat_mp', 'acc_001')
      // 数据应存储在外部的 store 中
      const storedKey = [...externalStore.keys()].find(k => k.startsWith('wechat_mp'))
      expect(storedKey).toBeTruthy()
      expect(externalStore.get(storedKey)).toBeGreaterThan(0)
    })
  })
})
