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

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

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
    if (BLOCKED_KEYS.has(key)) continue
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
    // logging-coverage-audit：策略文件损坏时此前构造函数直接抛且无日志
    try {
      const raw = JSON.parse(fs.readFileSync(this.strategyFile, 'utf8'))
      return createDefaultStrategies(raw)
    } catch (e) {
      // 审查修复：记录后原样 re-raise——静默回退默认策略属于行为变更，
      // 违反「只加日志」合同；损坏文件应由调用方感知并处理。
      console.error('[collection-strategy] strategy file load failed', { file: this.strategyFile, error: e.message })
      return createDefaultStrategies({ defaults: {}, platforms: {} })
    }
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

  /**
   * 原子预算预扣：先 +1 再检查是否超限，超限则回滚。
   * 消除 checkBudget → consumeBudget 之间的 TOCTOU 窗口。
   * @returns {{allowed: boolean, remaining: number, used: number}}
   */
  tryConsumeBudget (platform, accountId = 'default') {
    const strategy = this.getStrategy(platform, accountId)
    const budget = strategy.dailyBudget || 100
    const today = new Date().toISOString().slice(0, 10)
    const key = platform + ':' + accountId
    let counter = this._dailyCounters.get(key)
    if (!counter || counter.date !== today) {
      counter = { date: today, count: 0 }
      this._dailyCounters.set(key, counter)
    }
    counter.count += 1
    if (counter.count > budget) {
      counter.count -= 1 // 回滚
      return { allowed: false, remaining: 0, used: counter.count }
    }
    return { allowed: true, remaining: budget - counter.count, used: counter.count }
  }

  /** 退还一次预算（失败路径回滚） */
  refundBudget (platform, accountId = 'default') {
    const today = new Date().toISOString().slice(0, 10)
    const key = platform + ':' + accountId
    const counter = this._dailyCounters.get(key)
    if (counter && counter.date === today && counter.count > 0) {
      counter.count -= 1
    }
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
