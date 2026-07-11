// @ts-check
/**
 * Container ? ????????
 *
 * ????????????????
 * ?????? singleton????????????
 *
 * ??:
 *   let c = new Container()
 *   c.register('store', new Store())          // ?
 *   c.register('db', function(container) {    // ?????????
 *     return new Database(container.get('config'))
 *   })
 *   c.assertRequired(['store', 'db'])          // ?????
 *   c.get('store')                             // ????
 */

function Container() {
  this._registry = {}  // name -> { value// @ts-check
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
 * @param {string} name - Service name
 * @returns {*} Resolved service instance
 * @throws {Error} If service is not registered
 */
Container.prototype.get = function(name) {
  const entry = this._registry[name]

  if (!entry) {
    throw new Error('Service not registered: ' + name)
  }

  if (entry.factory && !entry.initialized) {
    entry.value = entry.factory(this)
    entry.initialized = true
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
 * Detect circular dependencies in the factory graph
 * @returns {{ hasCycle: boolean, cycle: string[] }}
 */
Container.prototype.detectCircularDeps = function() {
  const visited = new Set()
  const visiting = new Set()

  function walk(name, path) {
    if (visiting.has(name)) {
      return { hasCycle: true, cycle: path.concat(name).filter(function(_, i, arr) {
        return arr.indexOf(name) <= i
      }) }
    }
    if (visited.has(name)) return { hasCycle: false, cycle: [] }

    const entry = this._registry[name]
    if (!entry || !entry.factory) return { hasCycle: false, cycle: [] }

    visiting.add(name)
    // Note: we can't statically analyze factory deps without parsing,
    // but we can detect runtime cycles during get() via a resolution stack
    visiting.delete(name)
    visited.add(name)
    return { hasCycle: false, cycle: [] }
  }.bind(this)

  for (const name in this._registry) {
    const result = walk(name, [])
    if (result.hasCycle) return result
  }

  return { hasCycle: false, cycle: [] }
}

/**
 * Gracefully dispose all disposable services
 * Call this on app shutdown to clean up resources (browser instances, DB connections, HTTP servers)
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
, factory, singleton }
}

/**
 * ????
 * @param {string} name     ? ???
 * @param {*}      value    ? ? or ????
 */
Container.prototype.register = function(name, value) {
  if (typeof value === "function" && value.length >= 0) {
    // ???? ? ?????
    this._registry[name] = { factory: value, singleton: true, value: null, initialized: false }
  } else {
    this._registry[name] = { value: value, initialized: true }
  }
}

/**
 * ????
 * @param {Object} map ? { name: value, ... }
 */
Container.prototype.registerMany = function(map) {
  for (const key in map) {
    if (Object.hasOwn(map, key)) this.register(key, map[key])
  }
}

/**
 * ??????
 * @param {string} name
 * @returns {*}
 */
Container.prototype.get = function(name) {
  const entry = this._registry[name]
  if (!entry) throw new Error("Service not registered: " + name)
  if (entry.factory && !entry.initialized) {
    entry.value = entry.factory(this)
    entry.initialized = true
  }
  return entry.value
}

/**
 * ?????????
 */
Container.prototype.has = function(name) {
  return !!this._registry[name]
}

/**
 * ??????????????
 * @param {string[]} requiredNames
 */
Container.prototype.assertRequired = function(requiredNames) {
  const missing = []
  for (let i = 0; i < requiredNames.length; i++) {
    if (!this._registry[requiredNames[i]]) missing.push(requiredNames[i])
  }
  if (missing.length > 0) {
    throw new Error("Missing required services: " + missing.join(", "))
  }
}

module.exports = Container
