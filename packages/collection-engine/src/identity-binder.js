/**
 * IdentityBinder — L1 身份绑定管理器
 *
 * 职责：
 * 1. 维护账号 ↔ 设备指纹 ↔ 代理 IP 的绑定关系
 * 2. 禁止交叉使用（一个账号不能同时从多个源请求）
 * 3. 复用 rpa-engine browser-data.js 的 per-account session 分区
 */

class IdentityBinder {
  constructor (opts = {}) {
    this._bindings = new Map()
    this._browserData = opts.browserData || null
  }

  bind (platform, accountId, fingerprint = '', ip = '') {
    const key = platform + ':' + accountId
    const binding = {
      platform,
      accountId,
      fingerprint,
      ip,
      sessionPartition: this._browserData
        ? this._browserData.getPartition(platform, accountId)
        : 'persist:rpa-' + platform + '-' + (accountId || 'default'),
      boundAt: Date.now(),
    }
    this._bindings.set(key, binding)
    return binding
  }

  resolve (platform, accountId) {
    return this._bindings.get(platform + ':' + accountId) || null
  }

  unbind (platform, accountId) {
    return this._bindings.delete(platform + ':' + accountId)
  }

  list () {
    return [...this._bindings.values()].map(b => ({ ...b }))
  }
}

module.exports = { IdentityBinder }
