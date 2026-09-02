// @ts-check
/**
 * registry-singleton.js — 全局 AdapterRegistry 单例（Stage 1.2 第一步）
 *
 * 所有 Adapter 通过此单例自注册，model-provider-manager.js 通过此单例查询。
 * 渐进迁移策略：先创建单例，再逐个迁移 Adapter 自注册，最后替换 manager 中的硬编码 require。
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
