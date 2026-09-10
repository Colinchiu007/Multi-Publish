import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
const req = createRequire(import.meta.url)
const { CircuitBreaker, STATE } = req('../src/circuit-breaker')

describe('CircuitBreaker', () => {
  let clock
  let cb

  beforeEach(() => {
    clock = { current: Date.now() }
    cb = new CircuitBreaker({ now: () => clock.current })
  })

  function tick (ms) { clock.current += ms }

  it('should start in CLOSED state', () => {
    const state = cb.getState('test', 'acc1')
    expect(state.state).toBe(STATE.CLOSED)
    expect(state.failures).toBe(0)
  })

  it('should not be open initially', () => {
    expect(cb.isOpen('test', 'acc1')).toBe(false)
  })

  it('should open after threshold failures', () => {
    const config = { failureThreshold: 3, cooldownMs: 1000 }
    cb.recordFailure('test', 'acc1', config)
    expect(cb.getState('test', 'acc1').state).toBe(STATE.CLOSED)
    expect(cb.getState('test', 'acc1').failures).toBe(1)

    cb.recordFailure('test', 'acc1', config)
    expect(cb.getState('test', 'acc1').failures).toBe(2)

    cb.recordFailure('test', 'acc1', config)
    expect(cb.getState('test', 'acc1').state).toBe(STATE.OPEN)
  })

  it('should block requests while OPEN', () => {
    const config = { failureThreshold: 1, cooldownMs: 1000 }
    cb.recordFailure('test', 'acc1', config)
    expect(cb.isOpen('test', 'acc1', config)).toBe(true)
  })

  it('should enter HALF_OPEN after cooldown', () => {
    const config = { failureThreshold: 1, cooldownMs: 1000 }
    cb.recordFailure('test', 'acc1', config)
    expect(cb.isOpen('test', 'acc1', config)).toBe(true)

    tick(1001)
    // 首次 isOpen 调用会检测冷却到期 → 进入 half_open
    expect(cb.isOpen('test', 'acc1', config)).toBe(false)
    expect(cb.getState('test', 'acc1').state).toBe(STATE.HALF_OPEN)
  })

  it('should close on success', () => {
    cb.recordFailure('test', 'acc1', { failureThreshold: 1 })
    cb.recordSuccess('test', 'acc1')
    expect(cb.getState('test', 'acc1').state).toBe(STATE.CLOSED)
  })

  it('should re-open on HALF_OPEN failure', () => {
    const config = { failureThreshold: 2, cooldownMs: 1000 }
    cb.recordFailure('test', 'acc1', config)
    cb.recordFailure('test', 'acc1', config)
    // OPEN
    tick(1001)
    cb.isOpen('test', 'acc1', config) // transitions to HALF_OPEN
    expect(cb.getState('test', 'acc1').state).toBe(STATE.HALF_OPEN)

    // Probe fails
    cb.recordFailure('test', 'acc1', config)
    expect(cb.getState('test', 'acc1').state).toBe(STATE.OPEN)
  })

  it('should reset state', () => {
    cb.recordFailure('test', 'acc1', { failureThreshold: 1 })
    cb.reset('test', 'acc1')
    expect(cb.getState('test', 'acc1').state).toBe(STATE.CLOSED)
    expect(cb.getState('test', 'acc1').failures).toBe(0)
  })

  it('should track separate accounts independently', () => {
    const config = { failureThreshold: 1, cooldownMs: 1000 }
    cb.recordFailure('test', 'acc1', config)
    expect(cb.isOpen('test', 'acc1', config)).toBe(true)
    expect(cb.isOpen('test', 'acc2', config)).toBe(false)
  })
})
