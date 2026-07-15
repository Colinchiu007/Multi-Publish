// @ts-check
/**
 * registry.js — P3.0 AdapterRegistry 注册表
 *
 * 设计决策（devex review 1.1/3.2/4.2/7.1）：
 * - registerAdapter 时自动调用 validateConfig
 * - 重复注册错误包含已注册 Adapter ID
 * - 接口版本号检查（ADAPTER_VERSION 兼容性）
 * - getAdaptersByCapability 按能力筛选
 */

const log = require('../../logger')
const { ADAPTER_VERSION } = require('./base')
const { ProviderError, ERROR_CODES } = require('./provider-error')

/**
 * AdapterRegistry — Adapter 工厂注册表
 *
 * @example
 *   const registry = new AdapterRegistry()
 *   registry.registerAdapter('openai', new OpenAIAdapter(config))
 *   const adapter = registry.getAdapter('openai')
 */
class AdapterRegistry {
  constructor() {
    this._adapters = new Map()
  }

  /**
   * 注册 Adapter
   *
   * @param {string} id - 唯一标识（如 'openai'）
   * @param {BaseAdapter} adapter - Adapter 实例
   * @throws {ProviderError} 重复注册 / 版本不匹配 / 配置无效
   */
  registerAdapter(id, adapter) {
    if (!id || typeof id !== 'string') {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'Adapter id must be a non-empty string')
    }
    if (!adapter) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'Adapter instance is required')
    }

    // 重复注册检测
    if (this._adapters.has(id)) {
      throw new ProviderError(
        ERROR_CODES.INVALID_CONFIG,
        `Adapter "${id}" is already registered`
      )
    }

    // 接口版本号检查
    if (adapter.version !== ADAPTER_VERSION) {
      throw new ProviderError(
        ERROR_CODES.INVALID_CONFIG,
        `Adapter "${id}" version mismatch: expected ${ADAPTER_VERSION}, got ${adapter.version}`
      )
    }

    // 自动调用 validateConfig
    if (typeof adapter.validateConfig === 'function') {
      const result = adapter.validateConfig()
      if (!result || !result.valid) {
        const errors = (result && result.errors) ? result.errors.join(', ') : 'unknown'
        throw new ProviderError(
          ERROR_CODES.INVALID_CONFIG,
          `Adapter "${id}" has invalid config: ${errors}`
        )
      }
    }

    this._adapters.set(id, adapter)
    log.info('AdapterRegistry', `Registered adapter: ${id} (capabilities: ${adapter.capabilities().join(', ') || 'none'})`)
  }

  /**
   * 获取 Adapter
   * @param {string} id
   * @returns {BaseAdapter|undefined}
   */
  getAdapter(id) {
    return this._adapters.get(id)
  }

  /**
   * 列出所有已注册 Adapter
   * @returns {BaseAdapter[]}
   */
  listAdapters() {
    return Array.from(this._adapters.values())
  }

  /**
   * 按能力筛选 Adapter
   * @param {string} capability - 方法名（如 'chatCompletion'）
   * @returns {BaseAdapter[]}
   */
  getAdaptersByCapability(capability) {
    return this.listAdapters().filter(a => a.supports(capability))
  }

  /**
   * 注销 Adapter
   * @param {string} id
   */
  unregister(id) {
    if (this._adapters.has(id)) {
      this._adapters.delete(id)
      log.info('AdapterRegistry', `Unregistered adapter: ${id}`)
    }
  }

  /**
   * 清空所有注册
   */
  clear() {
    this._adapters.clear()
  }
}

module.exports = { AdapterRegistry }
