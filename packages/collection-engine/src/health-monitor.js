/**
 * HealthMonitor — L7 健康监控
 *
 * 职责：
 * 1. 每平台/每账号记录请求成功/失败计数
 * 2. 计算核心指标（成功率、验证码率、403 率）
 * 3. 阈值告警
 */

class HealthMonitor {
  constructor (opts = {}) {
    this._now = opts.now || (() => Date.now())
    this._metrics = new Map()
  }

  _key (platform, accountId = 'default') {
    return platform + ':' + accountId
  }

  _entry (key) {
    if (!this._metrics.has(key)) {
      this._metrics.set(key, {
        total: 0, success: 0,
        captcha: 0, forbidden: 0, rateLimited: 0,
        loginExpired: 0, timeout: 0, otherError: 0,
        firstRequestAt: null, lastRequestAt: null,
      })
    }
    return this._metrics.get(key)
  }

  record (platform, accountId = 'default', result = {}) {
    const entry = this._entry(this._key(platform, accountId))
    const now = this._now()
    entry.total += 1
    entry.lastRequestAt = now
    if (!entry.firstRequestAt) entry.firstRequestAt = now

    if (result.success) {
      entry.success += 1
      return
    }

    switch (result.reason) {
    case 'captcha': entry.captcha += 1; break
    case 'forbidden': entry.forbidden += 1; break
    case 'rate_limited': entry.rateLimited += 1; break
    case 'login_expired': entry.loginExpired += 1; break
    case 'timeout': entry.timeout += 1; break
    default: entry.otherError += 1; break
    }
  }

  snapshot (platform, accountId = 'default') {
    const e = this._entry(this._key(platform, accountId))
    const total = e.total || 1
    return {
      platform,
      accountId,
      total,
      successRate: e.success / total,
      captchaRate: e.captcha / total,
      forbiddenRate: e.forbidden / total,
      rateLimitedRate: e.rateLimited / total,
      firstRequestAt: e.firstRequestAt,
      lastRequestAt: e.lastRequestAt,
    }
  }

  /**
   * 检查是否触发告警阈值
   * @returns {Array<{platform, accountId, alert, value}>}
   */
  alerts (thresholds = {}) {
    const captchaThresh = thresholds.captchaRate ?? 0.3
    const forbiddenThresh = thresholds.forbiddenRate ?? 0.2
    const results = []
    for (const [key, e] of this._metrics) {
      const total = e.total || 1
      const [platform, accountId] = key.split(':')
      if (e.captcha / total > captchaThresh) {
        results.push({ platform, accountId, alert: 'captcha-high', value: e.captcha / total })
      }
      if (e.forbidden / total > forbiddenThresh) {
        results.push({ platform, accountId, alert: 'forbidden-high', value: e.forbidden / total })
      }
    }
    return results
  }

  reset (platform, accountId = 'default') {
    this._metrics.delete(this._key(platform, accountId))
  }
}

module.exports = { HealthMonitor }
