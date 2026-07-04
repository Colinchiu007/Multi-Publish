/**
 * Container ? ????????
 *
 * ????????????????
 * ?????? singleton????????????
 *
 * ??:
 *   var c = new Container()
 *   c.register('store', new Store())          // ?
 *   c.register('db', function(container) {    // ?????????
 *     return new Database(container.get('config'))
 *   })
 *   c.assertRequired(['store', 'db'])          // ?????
 *   c.get('store')                             // ????
 */

function Container() {
  this._registry = {}  // name -> { value, factory, singleton }
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
  for (var key in map) {
    if (map.hasOwnProperty(key)) this.register(key, map[key])
  }
}

/**
 * ??????
 * @param {string} name
 * @returns {*}
 */
Container.prototype.get = function(name) {
  var entry = this._registry[name]
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
  var missing = []
  for (var i = 0; i < requiredNames.length; i++) {
    if (!this._registry[requiredNames[i]]) missing.push(requiredNames[i])
  }
  if (missing.length > 0) {
    throw new Error("Missing required services: " + missing.join(", "))
  }
}

module.exports = Container
