import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
const req = createRequire(import.meta.url)
const { CoolDownPool, cooldownDurationMs, BAN_LEVELS } = req('../src/cool-down-pool')

describe('cooldownDurationMs', () => {
  it('should return 30min for level 0', () => {
    expect(cooldownDurationMs(0)).toBe(BAN_LEVELS[0])
  })

  it('should return 24h for max level', () => {
    expect(cooldownDurationMs(5)).toBe(BAN_LEVELS[5])
  })

  it('should clamp to max level', () => {
    expect(cooldownDurationMs(99)).toBe(BAN_LEVELS[5])
  })
})

describe('CoolDownPool', () => {
  let clock, pool

  beforeEach(() => {
    clock = { current: Date.now() }
    pool = new CoolDownPool({ now: () => clock.current })
  })

  function tick (ms) { clock.current += ms }

  it('should ban and detect', () => {
    pool.ban('account', 'zhihu:user1', '连续403')
    expect(pool.isBanned('account', 'zhihu:user1')).toBe(true)
  })

  it('should not detect unbanned id', () => {
    expect(pool.isBanned('account', 'unknown')).toBe(false)
  })

  it('should auto-expire after cooldown', () => {
    pool.ban('account', 'test', '', 0)
    expect(pool.isBanned('account', 'test')).toBe(true)
    tick(BAN_LEVELS[0] + 1)
    expect(pool.isBanned('account', 'test')).toBe(false)
  })

  it('should escalate level on re-ban', () => {
    const r1 = pool.ban('account', 'test', '', 0)
    expect(r1.level).toBe(0)
    const r2 = pool.ban('account', 'test', '再次403')
    expect(r2.level).toBe(1)
  })

  it('should cap escalation at max level', () => {
    for (let i = 0; i < 10; i++) {
      pool.ban('account', 'test')
    }
    const r = pool.ban('account', 'test')
    expect(r.level).toBe(5)
  })

  it('should unban manually', () => {
    pool.ban('account', 'test')
    expect(pool.isBanned('account', 'test')).toBe(true)
    pool.unban('account', 'test')
    expect(pool.isBanned('account', 'test')).toBe(false)
  })

  it('should unfreeze expired in batch', () => {
    pool.ban('account', 'a', '', 0)
    pool.ban('account', 'b', '', 0)
    tick(BAN_LEVELS[0] + 100)
    const count = pool.unfreezeExpired()
    expect(count).toBe(2)
    expect(pool.list().length).toBe(0)
  })

  it('should separate account and ip bans', () => {
    pool.ban('account', 'test')
    pool.ban('ip', '1.2.3.4')
    expect(pool.isBanned('account', 'test')).toBe(true)
    expect(pool.isBanned('ip', '1.2.3.4')).toBe(true)
    expect(pool.isBanned('account', '1.2.3.4')).toBe(false)
  })
})
