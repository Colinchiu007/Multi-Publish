/**
 * CircuitBreaker — L5 熔断器
 *
 * 三态状态机：
 *   CLOSED → (连续 failureThreshold 次失败) → OPEN
 *   OPEN   → (cooldownMs 到期) → HALF_OPEN
 *   HALF_OPEN → (试探成功) → CLOSED
 *   HALF_OPEN → (试探失败) → OPEN（重置冷却）
 *
 * 纯 Node，可单测。时间通过注入 clock 控制。
 */

const STATE = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
}

class CircuitBreaker {
  constructor (opts = {}) {
    this._now = opts.now || (() => Date.now())
    this._states = new Map() // key -> { state, failures, openedAt, halfOpenTries }
  }

  _key (platform, accountId = 'default') {
    return platform + ':' + accountId
  }

  _entry (key) {
    if (!this._states.has(key)) {
      this._states.set(key, {
        state: STATE.CLOSED,
        failures: 0,
        openedAt: 0,
        halfOpenTries: 0,
      })
    }
    return this._states.get(key)
  }

  /** 熔断器是否处于打开状态（阻断请求） */
  isOpen (platform, accountId = 'default', config = {}) {
    const entry = this._entry(this._key(platform, accountId))
    if (entry.state !== STATE.OPEN) return false

    const cooldownMs = config.cooldownMs ?? 1800000
    const elapsed = this._now() - entry.openedAt
    if (elapsed >= cooldownMs) {
      // 进入半开试探
      entry.state = STATE.HALF_OPEN
      entry.halfOpenTries = 0
      return false
    }
    return true
  }

  /**
   * 记录成功
   */
  recordSuccess (platform, accountId = 'default') {
    const entry = this._entry(this._key(platform, accountId))
    entry.state = STATE.CLOSED
    entry.failures = 0
    entry.halfOpenTries = 0
    return entry.state
  }

  /**
   * 记录失败
   * @returns {string} 新状态
   */
  recordFailure (platform, accountId = 'default', config = {}) {
    const entry = this._entry(this._key(platform, accountId))
    const threshold = config.failureThreshold ?? 3

    if (entry.state === STATE.HALF_OPEN) {
      // 半开试探失败 → 重新打开，重置冷却
      entry.state = STATE.OPEN
      entry.openedAt = this._now()
      entry.halfOpenTries = 0
      return entry.state
    }

    entry.failures += 1
    if (entry.failures >= threshold) {
      entry.state = STATE.OPEN
      entry.openedAt = this._now()
      entry.failures = 0
    }
    return entry.state
  }

  /** 获取当前状态详情 */
  getState (platform, accountId = 'default') {
    const key = this._key(platform, accountId)
    const entry = this._entry(key)
    return {
      state: entry.state,
      failures: entry.failures,
      openedAt: entry.openedAt,
      cooldownRemaining: entry.state === STATE.OPEN
        ? Math.max(0, (entry.openedAt || 0) + 1800000 - this._now())
        : 0,
    }
  }

  /** 重置某账号的熔断状态 */
  reset (platform, accountId = 'default') {
    this._states.delete(this._key(platform, accountId))
  }
}

module.exports = {
  CircuitBreaker,
  STATE,
}
