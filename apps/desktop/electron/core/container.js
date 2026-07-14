// @ts-check
/**
 * Container - Lightweight Dependency Injection Container
 *
 * Provides lazy singleton initialization for Electron main process services.
 * Supports factory functions with dependency injection.
 *
 * Usage:
 *   let c = new Container()
 *   c.register('store', new Store())          // value
 *   c.register('db', function(container) {     // factory (lazy)
 *     return new Database(container.get('config'))
 *   })
 *   c.assertRequired(['store', 'db'])          // validate
 *   c.get('store')                             // resolve
 */
function Container() {
  this._registry = {}  // name -> { value, factory, singleton, initialized, disposable }
  this._resolving = new Set()  // 运行时循环依赖检测栈
  this._lastCycle = null  // 上次检测到的循环 { hasCycle, cycle }
}

/**
 * Register a service by name
 * @param {string} name    - Service name identifier
 * @param {*}      value   - Instance value or factory function
 * @param {Object} [options] - Registration options
 * @param {boolean} [options.singleton=true] - Whether to cache the resolved value
 * @param {boolean} [options.disposable=false] - Whether the service has a dispose method
 */
Container.prototype.register = function(name, value, options) {
  const opts = options || {}
  const isFactory = typeof value === 'function' && !opts.forceValue

  if (isFactory) {
    this._registry[name] = {
      factory: value,
      singleton: opts.singleton !== false,
      value: null,
      initialized: false,
      disposable: opts.disposable || false,
    }
  } else {
    this._registry[name] = {
      value: value,
      initialized: true,
      disposable: opts.disposable || false,
    }
  }

  return this  // chainable
}

/**
 * Batch register multiple services from an object map
 * @param {Object} map - { name: value, ... }
 */
Container.prototype.registerMany = function(map) {
  for (const key in map) {
    if (Object.hasOwn(map, key)) {
      this.register(key, map[key])
    }
  }
  return this  // chainable
}

/**
 * Resolve a service by name (lazy initialization for factories)
 * 运行时循环依赖检测：通过 _resolving 栈跟踪解析路径，发现环则抛错
 * @param {string} name - Service name
 * @returns {*} Resolved service instance
 * @throws {Error} If service is not registered or circular dependency detected
 */
Container.prototype.get = function(name) {
  const entry = this._registry[name]

  if (!entry) {
    throw new Error('Service not registered: ' + name)
  }

  // 已初始化的单例直接返回，不进入 resolving 栈
  if (entry.initialized) {
    return entry.value
  }

  // 运行时循环依赖检测
  if (this._resolving.has(name)) {
    const cycle = Array.from(this._resolving).concat([name])
    this._lastCycle = { hasCycle: true, cycle: cycle }
    throw new Error('Circular dependency detected: ' + cycle.join(' -> '))
  }

  if (entry.factory) {
    this._resolving.add(name)
    try {
      entry.value = entry.factory(this)
      entry.initialized = true
    } finally {
      this._resolving.delete(name)
    }
  }

  return entry.value
}

/**
 * Check if a service is registered
 * @param {string} name - Service name
 * @returns {boolean}
 */
Container.prototype.has = function(name) {
  return !!this._registry[name]
}

/**
 * Assert that required services are registered
 * @param {string[]} names - Array of required service names
 * @throws {Error} If any required service is missing
 */
Container.prototype.assertRequired = function(names) {
  const missing = names.filter(function(n) { return !this._registry[n] }.bind(this))
  if (missing.length > 0) {
    throw new Error('Missing required services: ' + missing.join(', '))
  }
}

/**
 * Detect circular dependencies in the factory graph.
 *
 * JS factory 是动态代码，无法纯静态分析依赖图。
 * 本方法采用"探测式"检测：对每个未初始化的 factory，尝试执行解析路径，
 * 若在解析过程中触发 _resolving 栈的环检测，则记录并返回该环。
 *
 * 已初始化的单例不参与检测（其依赖已在首次解析时验证过）。
 *
 * @returns {{ hasCycle: boolean, cycle: string[] }}
 */
Container.prototype.detectCircularDeps = function() {
  // 优先返回上次运行时检测到的循环（来自 get() 调用）
  if (this._lastCycle) {
    return this._lastCycle
  }

  // 主动探测：遍历所有未初始化 factory，尝试解析以触发环检测
  for (const name of Object.keys(this._registry)) {
    const entry = this._registry[name]
    if (entry.factory && !entry.initialized) {
      try {
        this.get(name)
      } catch (e) {
        if (e.message && e.message.startsWith('Circular dependency detected:')) {
          // _lastCycle 已在 get() 中设置
          return this._lastCycle
        }
        // 其他错误（如 factory 内部异常）不是循环依赖，继续探测下一个
      }
    }
  }

  return { hasCycle: false, cycle: [] }
}

/**
 * Gracefully dispose all disposable services.
 * Call this on app shutdown to clean up resources:
 * browser instances, DB connections, HTTP servers, etc.
 * @returns {Promise<void>}
 */
Container.prototype.dispose = async function() {
  const disposePromises = []
  for (const [name, entry] of Object.entries(this._registry)) {
    if (entry.disposable && entry.value && typeof entry.value.dispose === 'function') {
      try {
        const p = entry.value.dispose()
        if (p && typeof p.then === 'function') {
          disposePromises.push(p)
        }
      } catch (e) {
        console.error('[Container] Error disposing ' + name + ':', e.message)
      }
    }
  }
  await Promise.allSettled(disposePromises)
  this._registry = {}
}

/**
 * Get all registered service names (for debugging/inspection)
 * @returns {string[]}
 */
Container.prototype.list = function() {
  return Object.keys(this._registry)
}

module.exports = Container
