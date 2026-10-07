const { IdentityError } = require('./identity-errors')
const { normalizeClockTolerance, verifyEntitlementToken } = require('./entitlement')

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function normalizeApiUrl(value) {
  let url
  try { url = new URL(String(value || '').trim()) } catch (error) {
    throw new IdentityError('ENTITLEMENT_CONFIG_INVALID', '业务 API 地址无效', error)
  }
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)))) {
    throw new IdentityError('ENTITLEMENT_CONFIG_INVALID', '业务 API 必须使用 HTTPS（本机开发可使用回环 HTTP）')
  }
  return url.toString().replace(/\/+$/, '')
}

function normalizeEntitlement(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    plan: typeof source.plan === 'string' && source.plan ? source.plan : 'free',
    features: Array.from(new Set(Array.isArray(source.features)
      ? source.features.filter((feature) => typeof feature === 'string' && feature.length <= 100)
      : [])),
    ...(source.quota && typeof source.quota === 'object' && !Array.isArray(source.quota)
      ? { quota: JSON.parse(JSON.stringify(source.quota)) } : {}),
  }
}

// 单条套餐的规范化：id 必填字符串，价格必须是**非负整数（单位：分）**。
// 价格用整数分而非元，是为了避免浮点误差；非整数（如字符串 '2900'）一律判非法，
// 宁可丢弃该条也不要显示错价。
function normalizePlanEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const { id, label, currency, priceMonthlyCents, priceYearlyCents } = entry
  if (typeof id !== 'string' || !id) return null
  if (!Number.isInteger(priceMonthlyCents) || priceMonthlyCents < 0) return null
  if (!Number.isInteger(priceYearlyCents) || priceYearlyCents < 0) return null
  return {
    id,
    label: typeof label === 'string' && label ? label : id,
    currency: typeof currency === 'string' && currency ? currency : 'CNY',
    priceMonthlyCents,
    priceYearlyCents,
  }
}

class EntitlementService {
  constructor(options = {}) {
    this._apiUrl = normalizeApiUrl(options.apiUrl)
    this._deviceId = String(options.deviceId || '')
    if (!this._deviceId || this._deviceId.length > 200) throw new IdentityError('ENTITLEMENT_CONFIG_INVALID', '设备标识无效')
    this._publicKeys = options.publicKeys || {}
    this._storage = options.storage || null
    this._fetcher = options.fetcher || globalThis.fetch
    this._now = typeof options.now === 'function' ? options.now : () => Math.floor(Date.now() / 1000)
    this._clockTolerance = normalizeClockTolerance(options.clockTolerance)
    if (typeof this._fetcher !== 'function') throw new IdentityError('ENTITLEMENT_FETCH_UNAVAILABLE', '系统缺少 fetch')
    this._current = null
    this._generation = 0
    this._storageQueue = Promise.resolve()
  }

  getState() {
    return this._current ? JSON.parse(JSON.stringify(this._current)) : null
  }

  _queueStorageTask(task) {
    const queued = this._storageQueue.then(task, task)
    this._storageQueue = queued.then(() => undefined, () => undefined)
    return queued
  }

  _beginOperation() {
    return this._queueStorageTask(async () => ++this._generation)
  }

  _isCurrentGeneration(generation) {
    return generation === this._generation
  }

  async _clearForGeneration(generation) {
    if (!this._isCurrentGeneration(generation)) return false
    this._current = null
    return this._queueStorageTask(async () => {
      if (!this._isCurrentGeneration(generation)) return false
      if (this._storage && typeof this._storage.clear === 'function') await this._storage.clear()
      return true
    })
  }

  /**
   * 取服务端价目目录（`GET /api/v1/plans`，需 `profile:read`）。
   *
   * 2026-10-07 新增：此前 UI 完全不显示价格，营销文档里的金额是手写的。
   * 「凭记忆写死价格」与「从服务端取价」在测试视角下等价，因此没有测试覆盖
   * 价格的来源——这是本方法要消除的盲区。`plan-matrix.js` 是定价唯一真源。
   *
   * 契约（**故意不返回空数组**）：
   * - 任何失败（网络/非 2xx/结构非法）都**抛错**，由调用方降级为 `null`。
   *   返回 `[]` 会让 UI 渲染出「无套餐」的空目录，与「取价失败」混淆。
   * - 只丢弃**单条**非法条目并保留其余合法条目；全部非法时抛错。
   */
  async fetchPlans({ accessToken } = {}) {
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new IdentityError('ENTITLEMENT_REQUEST_INVALID', '获取价目目录参数无效')
    }
    let response
    try {
      response = await this._fetcher(`${this._apiUrl}/api/v1/plans`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'X-Device-Id': this._deviceId },
      })
    } catch (error) {
      throw new IdentityError('ENTITLEMENT_PLANS_FAILED', '价目服务暂时不可用', error)
    }
    if (!response || response.ok !== true) {
      throw new IdentityError('ENTITLEMENT_PLANS_FAILED', '价目服务拒绝请求')
    }
    let body
    try { body = await response.json() } catch (error) {
      throw new IdentityError('ENTITLEMENT_PLANS_FAILED', '价目响应格式无效', error)
    }
    if (!body || !Array.isArray(body.plans)) {
      throw new IdentityError('ENTITLEMENT_PLANS_FAILED', '价目响应缺少 plans 列表')
    }
    const plans = body.plans.map(normalizePlanEntry).filter(Boolean)
    if (plans.length === 0) {
      throw new IdentityError('ENTITLEMENT_PLANS_FAILED', '价目响应无有效套餐')
    }
    return plans
  }

  async sync({ subject, accessToken } = {}) {
    if (typeof subject !== 'string' || !subject || typeof accessToken !== 'string' || !accessToken) {
      throw new IdentityError('ENTITLEMENT_REQUEST_INVALID', '同步权益参数无效')
    }
    const generation = await this._beginOperation()
    if (this._current && this._current.subject !== subject) this._current = null
    let response
    try {
      response = await this._fetcher(`${this._apiUrl}/api/v1/me`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'X-Device-Id': this._deviceId },
      })
    } catch (error) {
      throw new IdentityError('ENTITLEMENT_SYNC_FAILED', '权益服务暂时不可用', error)
    }
    if (!response || response.ok !== true || typeof response.json !== 'function') {
      await this._clearForGeneration(generation)
      throw new IdentityError('ENTITLEMENT_SYNC_FAILED', '权益服务拒绝请求')
    }
    let body
    try { body = await response.json() } catch (error) {
      await this._clearForGeneration(generation)
      throw new IdentityError('ENTITLEMENT_SYNC_FAILED', '权益响应格式无效', error)
    }
    if (body && body.user && body.user.status && body.user.status !== 'active') {
      await this._clearForGeneration(generation)
      throw new IdentityError('ENTITLEMENT_USER_INACTIVE', '当前账号不可用')
    }
    const entitlement = normalizeEntitlement(body && body.entitlement)
    const snapshotValue = body && body.entitlementSnapshot
    const token = typeof snapshotValue === 'string' ? snapshotValue : snapshotValue && snapshotValue.token
    let snapshot = null
    if (token && Object.keys(this._publicKeys).length > 0) {
      snapshot = verifyEntitlementToken(token, {
        publicKeys: this._publicKeys, subject, deviceId: this._deviceId,
        now: this._now(), clockTolerance: this._clockTolerance,
      })
      await this._queueStorageTask(async () => {
        if (!this._isCurrentGeneration(generation)) return false
        await this._storage?.save({ token })
        return true
      })
    } else if (this._storage) {
      await this._queueStorageTask(async () => {
        if (!this._isCurrentGeneration(generation)) return false
        await this._storage.clear()
        return true
      })
    }
    if (!this._isCurrentGeneration(generation)) return null
    this._current = {
      ...entitlement,
      subject,
      deviceId: this._deviceId,
      source: 'online',
      ...(snapshot ? { expiresAt: snapshot.exp } : {}),
    }
    return this.getState()
  }

  async restore(subject) {
    if (!this._storage || typeof subject !== 'string' || !subject || Object.keys(this._publicKeys).length === 0) return null
    const generation = await this._beginOperation()
    try {
      const cached = await this._storage.load()
      if (!this._isCurrentGeneration(generation)) return null
      if (!cached || typeof cached.token !== 'string') return null
      const snapshot = verifyEntitlementToken(cached.token, {
        publicKeys: this._publicKeys, subject, deviceId: this._deviceId,
        now: this._now(), clockTolerance: this._clockTolerance,
      })
      if (!this._isCurrentGeneration(generation)) return null
      this._current = {
        ...normalizeEntitlement(snapshot), subject, deviceId: this._deviceId, source: 'offline', expiresAt: snapshot.exp,
      }
      return this.getState()
    } catch (_) {
      await this._clearForGeneration(generation)
      return null
    }
  }

  /** 受控请求原语（仅供 member-api-service 白名单路径使用，不暴露内部状态）。 */
  get fetcher() { return this._fetcher }

  get deviceId() { return this._deviceId }

  get apiUrl() { return this._apiUrl }

  /** subject 与当前权益会话一致才放行（sign-out/换账号后旧 subject 即拒绝）。 */
  canReadMembership(subject) {
    return Boolean(this._current && subject && this._current.subject === subject)
  }

  hasFeature(feature, { onlineOnly = false } = {}) {
    return Boolean(this._current && (!onlineOnly || this._current.source === 'online') && this._current.features.includes(feature))
  }

  async clear() {
    await this._queueStorageTask(async () => {
      const generation = ++this._generation
      this._current = null
      if (this._storage && typeof this._storage.clear === 'function') await this._storage.clear()
      return generation
    })
  }
}

module.exports = { EntitlementService, normalizeApiUrl, normalizeEntitlement }
