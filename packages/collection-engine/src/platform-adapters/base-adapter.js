/**
 * BaseAdapter — 平台适配器抽象基类
 */
class BaseAdapter {
  constructor (opts = {}) {
    this.platform = opts.platform || 'unknown'
    this.strategy = opts.strategy || null
    this.rateLimiter = opts.rateLimiter || null
    this.circuitBreaker = opts.circuitBreaker || null
    this.contentCache = opts.contentCache || null
    this.healthMonitor = opts.healthMonitor || null
    this.auditLogger = opts.auditLogger || null
  }

  extractContent (response) {
    throw new Error('extractContent not implemented')
  }

  detectBlock (response) {
    if (!response) return { blocked: false }
    if (response.status === 403) return { blocked: true, reason: 'forbidden' }
    if (response.status === 429) return { blocked: true, reason: 'rate_limited' }
    return { blocked: false }
  }

  buildUrl (target) {
    return target.url || target
  }

  async collect (target, accountId = 'default') {
    const platform = this.platform
    const strategy = this.strategy ? this.strategy.getStrategy(platform, accountId) : {}
    const log = this.auditLogger

    // L6 缓存优先：已缓存内容不发网络请求，也不消耗预算/频率
    const url = this.buildUrl(target)
    if (this.contentCache && this.contentCache.hasUrl(url)) {
      return { success: true, reason: 'cache_hit', content: null }
    }

    if (this.strategy) {
      const budget = this.strategy.checkBudget(platform, accountId)
      if (!budget.allowed) {
        if (log) log.blocked(platform, accountId, 'budget_exhausted')
        return { success: false, reason: 'budget_exhausted', content: null }
      }
    }

    if (this.rateLimiter) {
      const ev = this.rateLimiter.evaluate({ ...strategy, platform, accountId })
      if (!ev.allowed) {
        if (log) log.blocked(platform, accountId, ev.reason, { waitMs: ev.waitMs })
        return { success: false, reason: ev.reason, waitMs: ev.waitMs, content: null }
      }
    }

    if (this.circuitBreaker && this.circuitBreaker.isOpen(platform, accountId, strategy.circuitBreaker)) {
      if (log) log.blocked(platform, accountId, 'circuit_open')
      return { success: false, reason: 'circuit_open', content: null }
    }

    let response
    const startMs = Date.now()
    try {
      response = await this._doFetch(url, strategy)
    } catch (err) {
      if (log) log.error(platform, accountId, err, { url })
      const errReason = (err && (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT')) ? 'timeout' : 'network_error'
      if (this.healthMonitor) this.healthMonitor.record(platform, accountId, { success: false, reason: errReason })
      if (this.circuitBreaker) this.circuitBreaker.recordFailure(platform, accountId, strategy.circuitBreaker)
      return { success: false, reason: 'error', content: null, error: err.message }
    }
    const durationMs = Date.now() - startMs

    const blockCheck = this.detectBlock(response)
    if (blockCheck.blocked) {
      if (log) log.blocked(platform, accountId, blockCheck.reason, { url, status: response.status })
      if (this.healthMonitor) this.healthMonitor.record(platform, accountId, { success: false, reason: blockCheck.reason })
      if (this.circuitBreaker) this.circuitBreaker.recordFailure(platform, accountId, strategy.circuitBreaker)
      return { success: false, reason: blockCheck.reason, content: null }
    }

    const content = this.extractContent(response)

    if (this.contentCache && content) {
      this.contentCache.mark(url, String(content.text || content).slice(0, 256), { platform, accountId })
    }
    if (this.rateLimiter) this.rateLimiter.recordRequest(platform, accountId)
    if (this.strategy) this.strategy.consumeBudget(platform, accountId)
    if (this.circuitBreaker) this.circuitBreaker.recordSuccess(platform, accountId)
    if (this.healthMonitor) this.healthMonitor.record(platform, accountId, { success: true })
    if (log) log.request(platform, accountId, url, response.status || 200, durationMs)
    return { success: true, content }
  }

  async _doFetch (url, strategy) {
    throw new Error('_doFetch not implemented')
  }
}

module.exports = { BaseAdapter }
