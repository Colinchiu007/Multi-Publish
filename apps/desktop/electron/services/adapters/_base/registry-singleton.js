// @ts-check
/**
 * registry-singleton.js — 全局 AdapterRegistry 单例
 *
 * 所有 Adapter 工厂通过此单例注册/查询，替代 model-provider-manager 中的私有 _adapterFactories。
 *
 * @example
 *   const registry = require('./registry-singleton')
 *   registry.registerAdapter('openai', new OpenAIAdapter(config))
 *   const adapter = registry.getAdapter('openai')
 */

'use strict'

const { AdapterRegistry } = require('./registry')

const registry = new AdapterRegistry()

module.exports = registry
