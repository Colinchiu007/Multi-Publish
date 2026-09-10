/**
 * CollectionStrategy — L0 采集策略配置与运行时解析
 *
 * 职责：
 * 1. 加载默认策略 JSON（default-strategies.json）
 * 2. 支持平台级覆盖（runtime override）
 * 3. 预算检查（滑动窗口）
 * 4. 热加载（文件监听，5 秒内生效）
 *
 * 纯 Node，无 Electron 依赖，可单测。
 */

const fs = require('fs')
const path = require('path')

const DEFAULTS_FILE = path.join(__dirname, 'default-strategies.json')

function deepMerge (base, override) {
  if (override === undefined || override === null) return base
  if (Array.isArray(base) || Array.isArray(override)) {
    return override === undefined ? base : override
  }
  if (typeof base !== 'object' || typeof override !== 'object') {
    return override
  }
  const out = { ...base }
  for (const key of Object.keys(override)) {
    out[key] = deepMerge(base[key], override[key])
  }
  return out
}

const DEFAULT_STRATEGY_VALUES = {
  riskLevel: 'medium',
  dailyBudget: 100,
  interval: { min: 8000, max: 25000 },
  activeHours: { start: 8, end: 22 },
  weekendFactor: 0.6,
  backoff: { baseMs: 60000, maxMs: 3600000, factor: 2 },
  circuitBreaker: { failureThreshold: 3, cooldownMs: 1800000, halfOpenMaxRequests: 1 },
  fetcher: { primary: 'http', fallback: 'electron' },
  needsLogin: false,
  warmup: false,
  behaviorIntensity: 'light',
}

function createDefaultStrategies (defaultsRaw) {
  const defaults = (defaultsRaw.defaults && Object.keys(defaultsRaw.defaults).length > 0)
    ? defaultsRaw.defaults
    : DEFAULT_STRATEGY_VALUES
  return {
    version: 1,
    defaults,
    platforms: defaultsRaw.platforms || {},
  }
}

class CollectionStrategy {
  constructor (opts = {}) {
    this.strategyFile = opts.strategyFile || DEFAULTS_FILE
    this._overrides = opts.overrides || {}
    this._strategies = this._load()
    this._dailyCounters = new Map() // key: platform:account -> { date: 'YYYY-MM-DD', count: number }
  }

  _load () {
    if (!fs.existsSync(this.strategyFile)) {
      return createDefaultStrategies({ defaults: {}, platforms: {} })
    }
    const raw = JSON.parse(fs.readFileSync(this.strategyFile, 'utf8'))
    return createDefaultStrategies(raw)
  }

  /** 重新加载策略（热加载入口） */
  reload () {
    this._strategies = this._load()
    return this
  }

  /** 平台级运行时覆盖（深合并，不落盘） */
  setOverride (platform, override) {
    this._overrides[platform] = deepMerge(this._overrides[platform] || {}, override)
    return this
  }

  /** 获取合并后的运行时策略 */
  getStrategy (platform, accountId = 'default') {
    const base = this._strategies.defaults || {}
    const platformCfg = this._strategies.platforms[platform] || {}
    const override = this._overrides[platform] || {}
    const merged = deepMerge(deepMerge(base, platformCfg), override)
    return {
      platform,
      accountId,
      ...merged,
    }
  }

  /**
   * 预算检查：滑动 24h 窗口（简化为按自然日计数）
   * @returns {{allowed: boolean, remaining: number, used: number}}
   */
  checkBudget (platform, accountId = 'default') {
    const strategy = this.getStrategy(platform, accountId)
    const budget = strategy.dailyBudget || 100
    const today = new Date().toISOString().slice(0, 10)
    const key = platform + ':' + accountId
    let counter = this._dailyCounters.get(key)
    if (!counter || counter.date !== today) {
      counter = { date: today, count: 0 }
      this._dailyCounters.set(key, counter)
    }
    const used = counter.count
    const remaining = Math.max(0, budget - used)
    return { allowed: used < budget, remaining, used }
  }

  /** 记录一次请求消费预算 */
  consumeBudget (platform, accountId = 'default') {
    const check = this.checkBudget(platform, accountId)
    if (!check.allowed) return check
    const today = new Date().toISOString().slice(0, 10)
    const key = platform + ':' + accountId
    let counter = this._dailyCounters.get(key)
    if (!counter || counter.date !== today) {
      counter = { date: today, count: 0 }
    }
    counter.count += 1
    this._dailyCounters.set(key, counter)
    return this.checkBudget(platform, accountId)
  }

  /** 重置某账号预算（测试/手动干预） */
  resetBudget (platform, accountId = 'default') {
    this._dailyCounters.delete(platform + ':' + accountId)
  }
}

module.exports = {
  CollectionStrategy,
  deepMerge,
  createDefaultStrategies,
}
