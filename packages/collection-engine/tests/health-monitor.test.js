import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
const req = createRequire(import.meta.url)
const { HealthMonitor } = req('../src/health-monitor')

describe('HealthMonitor', () => {
  let clock, hm

  beforeEach(() => {
    clock = { current: Date.now() }
    hm = new HealthMonitor({ now: () => clock.current })
  })

  it('should track success rate', () => {
    hm.record('wechat_mp', 'acc1', { success: true })
    hm.record('wechat_mp', 'acc1', { success: true })
    hm.record('wechat_mp', 'acc1', { success: false, reason: 'captcha' })
    const snap = hm.snapshot('wechat_mp', 'acc1')
    expect(snap.total).toBe(3)
    expect(snap.successRate).toBeCloseTo(2 / 3)
    expect(snap.captchaRate).toBeCloseTo(1 / 3)
  })

  it('should classify failure reasons correctly', () => {
    hm.record('p', 'a', { success: false, reason: 'captcha' })
    hm.record('p', 'a', { success: false, reason: 'forbidden' })
    hm.record('p', 'a', { success: false, reason: 'rate_limited' })
    hm.record('p', 'a', { success: false, reason: 'login_expired' })
    hm.record('p', 'a', { success: false, reason: 'timeout' })
    hm.record('p', 'a', { success: false, reason: 'other' })
    const snap = hm.snapshot('p', 'a')
    expect(snap.total).toBe(6)
    expect(snap.captchaRate).toBeCloseTo(1 / 6)
    expect(snap.forbiddenRate).toBeCloseTo(1 / 6)
    expect(snap.rateLimitedRate).toBeCloseTo(1 / 6)
  })

  it('should trigger alert on high captcha rate', () => {
    hm.record('p', 'a', { success: false, reason: 'captcha' })
    hm.record('p', 'a', { success: false, reason: 'captcha' })
    hm.record('p', 'a', { success: true })
    const alerts = hm.alerts({ captchaRate: 0.5, forbiddenRate: 0.5 })
    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts[0].alert).toBe('captcha-high')
  })

  it('should trigger alert on high forbidden rate', () => {
    hm.record('p', 'a', { success: false, reason: 'forbidden' })
    hm.record('p', 'a', { success: false, reason: 'forbidden' })
    const alerts = hm.alerts({ captchaRate: 0.9, forbiddenRate: 0.5 })
    expect(alerts.some(a => a.alert === 'forbidden-high')).toBe(true)
  })

  it('should parse accountId with colon correctly', () => {
    hm.record('p', 'user:123', { success: true })
    const snap = hm.snapshot('p', 'user:123')
    expect(snap.accountId).toBe('user:123')
    expect(snap.total).toBe(1)
    // alerts 使用 indexOf 分割，冒号 accountId 不应被截断
    const alerts = hm.alerts({ captchaRate: 0.9, forbiddenRate: 0.9 })
    expect(alerts.length).toBe(0)
  })

  it('should reset metrics', () => {
    hm.record('p', 'a', { success: true })
    hm.reset('p', 'a')
    expect(hm.snapshot('p', 'a').total).toBe(1) // reset 后重新创建空 entry
  })
})
