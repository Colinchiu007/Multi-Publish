// @ts-check
/**
 * ServiceBus — 统一管理所有外部服务调用
 *
 * 职责：
 *   - 聚合 PythonBridge / SplitterBridge / PromptBridge / Story2Video 引擎
 *   - 为上层提供统一的 API 调用入口（分句、优化、合成、技能调用）
 *   - 提供统一的生命周期管理（启动/停止/健康检查）
 *
 * 设计意图：
 *   上层代码（IPC handler、PipelineEngine）只需依赖 ServiceBus，
 *   无需关心各 Bridge 的具体实现和端口。
 */
'use strict'

class ServiceBus {
  /**
   * @param {object} deps
   * @param {object} deps.pythonBridge - Python 后端桥接（模块导出，非类实例）
   * @param {object} deps.splitterBridge - SplitterBridge 实例
   * @param {object} deps.promptBridge - PromptBridge 实例
   * @param {object|null} deps.story2videoEngine - Story2Video 引擎（暂为 null）
   * @param {object} deps.log - 日志模块
   */
  constructor({ pythonBridge, splitterBridge, promptBridge, story2videoEngine, log }) {
    this.pythonBridge = pythonBridge
    this.splitterBridge = splitterBridge
    this.promptBridge = promptBridge
    this.story2videoEngine = story2videoEngine || null
    this.log = log || require('./logger')
  }

  /**
   * 文本分句 — 委托 SplitterBridge
   * @param {string} text
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async splitText (text, options) {
    return this.splitterBridge.split(text, options)
  }

  /**
   * 提示词优化 — 委托 PromptBridge
   * @param {string} prompt
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async optimizePrompt (prompt, options) {
    return this.promptBridge.optimize({ prompt, ...options })
  }

  /**
   * 批量提示词优化 — 委托 PromptBridge
   * @param {string[]} prompts
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async optimizePromptsBatch (prompts, options) {
    const requests = prompts.map(p => ({ prompt: p, ...options }))
    return this.promptBridge.optimizeBatch(requests)
  }

  /**
   * 视频合成 — 委托 Story2Video 引擎
   * 注意：story2videoEngine 当前为 null，返回占位响应
   * @param {object} assets
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async composeVideo (assets, options) {
    if (!this.story2videoEngine) {
      this.log.warn('ServiceBus', 'Story2Video engine not implemented yet, returning placeholder')
      return {
        code: -1,
        message: 'Story2Video engine not implemented yet',
        assets,
        options
      }
    }
    return this.story2videoEngine.compose(assets, options)
  }

  /**
   * 调用 Python 技能 — 委托 PythonBridge
   * @param {string} skillName - 技能名称
   * @param {object} context - 调用上下文
   * @returns {Promise<object>}
   */
  async callPythonSkill (skillName, context) {
    return this.pythonBridge.requestBackend('POST', '/api/skills/' + skillName, context)
  }

  /**
   * 获取流水线定义 — 委托 PythonBridge
   * @param {string} name - 流水线名称
   * @returns {Promise<object>}
   */
  async fetchPipeline (name) {
    return this.pythonBridge.requestBackend('GET', '/api/pipelines/' + name)
  }

  /**
   * 并行启动所有 Bridge
   * PythonBridge 是模块导出（非类实例），通过函数调用启动
   */
  async startAll () {
    this.log.info('ServiceBus', 'Starting all services...')
    const tasks = []

    if (this.pythonBridge && typeof this.pythonBridge.startPythonBackend === 'function') {
      tasks.push(this.pythonBridge.startPythonBackend().catch(e => {
        this.log.error('ServiceBus', 'PythonBridge start failed: ' + (e instanceof Error ? e.message : String(e)))
      }))
    }

    if (this.splitterBridge) {
      tasks.push(this.splitterBridge.start().catch(e => {
        this.log.error('ServiceBus', 'SplitterBridge start failed: ' + (e instanceof Error ? e.message : String(e)))
      }))
    }

    if (this.promptBridge) {
      tasks.push(this.promptBridge.start().catch(e => {
        this.log.error('ServiceBus', 'PromptBridge start failed: ' + (e instanceof Error ? e.message : String(e)))
      }))
    }

    await Promise.all(tasks)
    this.log.info('ServiceBus', 'All services started')
  }

  /**
   * 并行停止所有 Bridge
   */
  async stopAll () {
    this.log.info('ServiceBus', 'Stopping all services...')
    const tasks = []

    if (this.pythonBridge && typeof this.pythonBridge.stopPythonBackend === 'function') {
      tasks.push(this.pythonBridge.stopPythonBackend().catch(e => {
        this.log.warn('ServiceBus', 'PythonBridge stop failed: ' + (e instanceof Error ? e.message : String(e)))
      }))
    }

    if (this.splitterBridge) {
      tasks.push(this.splitterBridge.stop().catch(e => {
        this.log.warn('ServiceBus', 'SplitterBridge stop failed: ' + (e instanceof Error ? e.message : String(e)))
      }))
    }

    if (this.promptBridge) {
      tasks.push(this.promptBridge.stop().catch(e => {
        this.log.warn('ServiceBus', 'PromptBridge stop failed: ' + (e instanceof Error ? e.message : String(e)))
      }))
    }

    await Promise.all(tasks)
    this.log.info('ServiceBus', 'All services stopped')
  }

  /**
   * 检查所有服务健康状态
   * @returns {Promise<object>} { serviceName: boolean }
   */
  async healthCheckAll () {
    const results = {}

    if (this.pythonBridge && typeof this.pythonBridge.isRunning === 'function') {
      results.pythonBridge = this.pythonBridge.isRunning()
    }

    if (this.splitterBridge) {
      try { results.splitterBridge = await this.splitterBridge.healthCheck() } catch { results.splitterBridge = false }
    }

    if (this.promptBridge) {
      try { results.promptBridge = await this.promptBridge.healthCheck() } catch { results.promptBridge = false }
    }

    // story2videoEngine 暂未实现，标记为 null
    results.story2videoEngine = this.story2videoEngine ? 'unknown' : null

    return results
  }
}

module.exports = ServiceBus
