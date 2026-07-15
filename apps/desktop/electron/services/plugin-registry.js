// @ts-check
/**
 * PluginRegistry — 插件标准化注册中心
 *
 * 支持三种插件类型：
 *   - pipeline:    流水线插件（扩展内容生成流程）
 *   - service:     服务插件（提供外部服务调用）
 *   - data_source: 数据源插件（提供数据采集）
 *
 * 插件契约（ModulePlugin 接口）：
 *   {
 *     name: string,          // 唯一标识（kebab-case）
 *     type: 'pipeline'|'service'|'data_source',
 *     version: string,       // 语义化版本（如 "1.0.0"）
 *     start: Function,       // 启动（可选，接收 serviceBus, container）
 *     stop: Function,        // 停止（可选）
 *     ...typeSpecificFields  // 类型相关字段
 *   }
 *
 * 类型相关字段：
 *   - pipeline:  { pipelineDef: object, stageExecutors?: Map<string, Function> }
 *   - service:   { serviceBusMethods?: object }  // 注入到 ServiceBus 的方法
 *   - data_source: { fetch: Function, pollInterval?: number }
 *
 * 接入示例：
 *   // my-plugin.js
 *   module.exports = {
 *     name: 'trending-collector',
 *     type: 'data_source',
 *     version: '1.0.0',
 *     async start(serviceBus, container) {
 *       // 注册数据获取方法到 serviceBus
 *       serviceBus.registerMethod('fetchTrending', async (opts) => { ... })
 *     },
 *     async stop() { /* 清理资源 *\/ }
 *   }
 *
 *   // 在 container.setup.js 中注册：
 *   const myPlugin = require('./my-plugin')
 *   container.get('pluginRegistry').register(myPlugin)
 *
 * 生命周期：
 *   1. register(plugin)  — 契约校验 + 注册到 Map
 *   2. startAll()        — 按注册顺序调用 plugin.start(serviceBus, container)
 *   3. stopAll()         — 逆序调用 plugin.stop()
 *
 * 设计意图：
 *   未来第三方模块（采集、热榜数据等）可通过标准插件契约接入 Multi-Publish，
 *   无需修改核心代码。PluginRegistry 负责生命周期管理和契约校验。
 */
'use strict'

const VALID_TYPES = new Set(['pipeline', 'service', 'data_source'])

class PluginRegistry {
  /**
   * @param {object} deps
   * @param {object} deps.serviceBus - ServiceBus 实例
   * @param {object} deps.container - DI 容器
   * @param {object} deps.log - 日志模块
   */
  constructor({ serviceBus, container, log }) {
    this.serviceBus = serviceBus
    this.container = container
    this.log = log || require('./logger')
    /** @type {Map<string, object>} */
    this.plugins = new Map()
  }

  /**
   * 验证插件契约并注册
   * @param {object} plugin - 插件对象
   * @throws {Error} 契约不合法时抛出
   */
  register (plugin) {
    if (!plugin || typeof plugin !== 'object') {
      throw new Error('Plugin must be an object')
    }
    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new Error('Plugin must have a string "name" field')
    }
    if (!VALID_TYPES.has(plugin.type)) {
      throw new Error(`Plugin "${plugin.name}" has invalid type "${plugin.type}", must be one of: ${[...VALID_TYPES].join(', ')}`)
    }
    if (!plugin.version || typeof plugin.version !== 'string') {
      throw new Error(`Plugin "${plugin.name}" must have a string "version" field`)
    }
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`)
    }

    this.plugins.set(plugin.name, plugin)
    this.log.info('PluginRegistry', `Registered plugin: ${plugin.name} (type=${plugin.type}, version=${plugin.version})`)
  }

  /**
   * 启动所有已注册插件（按注册顺序）
   * 插件的 start 方法接收 (serviceBus, container) 参数
   */
  async startAll () {
    this.log.info('PluginRegistry', `Starting ${this.plugins.size} plugin(s)...`)
    for (const [name, plugin] of this.plugins) {
      if (typeof plugin.start === 'function') {
        try {
          await plugin.start(this.serviceBus, this.container)
          this.log.info('PluginRegistry', `Plugin started: ${name}`)
        } catch (e) {
          this.log.error('PluginRegistry', `Plugin "${name}" start failed: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
  }

  /**
   * 停止所有已注册插件（逆序停止，与启动顺序相反）
   */
  async stopAll () {
    const entries = [...this.plugins.entries()].reverse()
    this.log.info('PluginRegistry', `Stopping ${entries.length} plugin(s)...`)
    for (const [name, plugin] of entries) {
      if (typeof plugin.stop === 'function') {
        try {
          await plugin.stop()
          this.log.info('PluginRegistry', `Plugin stopped: ${name}`)
        } catch (e) {
          this.log.warn('PluginRegistry', `Plugin "${name}" stop failed: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
  }

  /**
   * 列出所有已注册插件
   * @returns {object[]} 插件信息数组
   */
  list () {
    return [...this.plugins.values()].map(p => ({
      name: p.name,
      type: p.type,
      version: p.version
    }))
  }
}

module.exports = PluginRegistry
