// @ts-check
/**
 * router.js — P3.3 ProviderRouter 路由策略 + 故障转移
 *
 * 策略类型：
 * 1. default     — 使用 is_default=1 的供应商
 * 2. priority    — 按 priority 字段降序尝试，失败则降级
 * 3. round_robin — 轮询所有 enabled 的供应商
 * 4. failover    — 默认优先，失败自动切换到下一个 enabled 的
 *
 * 参考: CoAI PreflightSequence 路由模式
 *
 * 设计决策:
 * - 不直接依赖 Adapter，通过 manager 间接调用（解耦）
 * - _lastUsedIndex 按 category 独立维护（不同类别互不干扰）
 * - executeWithFailover 通过 excludeId 排除已失败 provider
 * - _logCall 钩子供子类或调用方记录日志（默认空实现）
 */

const log = require('../logger')

class ProviderRouter {
  /**
   * @param {object} manager - ModelProviderManager 实例
   *   需要 listEnabledProviders(category) / getDefault(category) 方法
   */
  constructor(manager) {
    this._manager = manager
    this._lastUsedIndex = new Map() // category -> index
  }

  /**
   * 获取下一个可用的 provider
   * @param {string} category - llm/tts/image/video/audio
   * @param {string} strategy - default/priority/round_robin/failover
   * @param {string|string[]|Set} [excludeIds=null] - 故障转移时排除的 provider ID（单值或集合）
   * @returns {object|null} provider config，无可用时返回 null
   */
  getNext(category, strategy = 'default', excludeIds = null) {
    // 兼容三种形式：null/string/Array|Set
    const excludeSet = excludeIds == null
      ? new Set()
      : (excludeIds instanceof Set
          ? excludeIds
          : new Set(Array.isArray(excludeIds) ? excludeIds : [excludeIds]))

    const providers = (this._manager.listEnabledProviders(category) || [])
      .filter(p => !excludeSet.has(p.id))

    if (providers.length === 0) return null

    switch (strategy) {
      case 'default':
        return this._manager.getDefault(category) || providers[0]

      case 'priority':
        return providers.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0))[0]

      case 'round_robin': {
        const idx = (this._lastUsedIndex.get(category) || 0) % providers.length
        this._lastUsedIndex.set(category, idx + 1)
        return providers[idx]
      }

      case 'failover': {
        // 默认优先，排除 excludeIds 后取第一个
        const def = this._manager.getDefault(category)
        if (def && !excludeSet.has(def.id)) return def
        return providers[0]
      }

      default:
        // 未知策略 fallback 到第一个
        return providers[0]
    }
  }

  /**
   * 执行带故障转移的调用
   * @param {string} category - llm/tts/image/video/audio
   * @param {function} fn - async (provider) => result，抛错则触发故障转移
   * @param {object} [options={}]
   * @param {number} [options.maxRetries=3] - 最大重试次数（含首次）
   * @param {string} [options.strategy='failover'] - 路由策略
   * @returns {Promise<any>} fn 的返回值
   * @throws {Error} 所有重试都失败后抛最后错误
   */
  async executeWithFailover(category, fn, options = {}) {
    const { maxRetries = 3, strategy = 'failover' } = options

    if (maxRetries <= 0) {
      throw new Error('maxRetries must be positive')
    }

    let lastError = null
    // 累积所有已失败 provider ID，避免重复尝试
    // 修复：原实现 excludeId 只记录最后一次，导致已失败 provider 可能被重复尝试
    const excludeIds = new Set()

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const provider = this.getNext(category, strategy, excludeIds)
      if (!provider) {
        throw new Error(`No available provider for category "${category}"`)
      }

      try {
        const result = await fn(provider)
        this._logCall(provider, 'success')
        return result
      } catch (e) {
        lastError = e
        excludeIds.add(provider.id)
        this._logCall(provider, 'error', e.message)
        log.warn('ProviderRouter',
          `Provider "${provider.id}" failed (attempt ${attempt + 1}/${maxRetries}): ${e.message}`)
      }
    }

    throw lastError || new Error('All retries exhausted')
  }

  /**
   * 记录调用日志（钩子方法，可被子类覆盖或通过 monkey-patch 替换）
   * 默认实现：空（生产环境可写入 model_provider_logs 表）
   * @param {object} provider - provider config
   * @param {string} status - 'success' | 'error'
   * @param {string} [error=null] - 错误消息（status=error 时）
   */
  _logCall(provider, status, _error = null) {
    // 默认空实现 — 子类或调用方可覆盖
    // 设计决策：不强制依赖 db，保持 router 可独立测试
    // 参数 _error 前缀下划线表示子类覆盖时会使用
  }

  /**
   * 重置轮询索引（测试用）
   * @param {string} [category] - 指定类别，不指定则重置所有
   */
  resetIndex(category) {
    if (category) {
      this._lastUsedIndex.delete(category)
    } else {
      this._lastUsedIndex.clear()
    }
  }
}

module.exports = { ProviderRouter }
