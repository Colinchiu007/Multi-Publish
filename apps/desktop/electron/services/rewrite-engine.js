// @ts-check
/**
 * RewriteEngineService — 改写引擎桥接层
 *
 * 桥接 @multi-publish/rewrite-engine 包 + aiGenerator 统一 provider 网关。
 * 改写策略运行时下发由 RewriteStrategyManager 提供，推理走 aiGenerator.generateWithDefault('llm')。
 * v3: 知识库使用 SQLite 持久化存储，质量评估可选 embedding 客户端。
 */

const { RewriteEngine, KnowledgeBase, RewriteQualityEvaluator } = require("@multi-publish/rewrite-engine")
const { SensitiveFilter } = require("@multi-publish/rewrite-engine")
const { SQLiteStorage } = require("@multi-publish/rewrite-engine")
const log = require("./logger")

class RewriteEngineService {
  constructor(opts) {
    opts = opts || {}
    this._strategyManager = opts.strategyManager || null
    this._aiGenerator = opts.aiGenerator || null
    this._store = opts.store || null
    this._engine = null
  }

  setStrategyManager(sm) {
    this._strategyManager = sm
  }

  setAiGenerator(gen) {
    this._aiGenerator = gen
  }

  setStore(store) {
    this._store = store
  }

  _ensureEngine() {
    if (!this._strategyManager) {
      throw new Error("改写策略管理器未注入")
    }
    const llmClient = {
      chat: async (systemPrompt, userPrompt) => {
        if (!this._aiGenerator) {
          throw new Error("AI 推理网关未注入")
        }
        const result = await this._aiGenerator.generateWithDefault("llm", {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        })
        return result && typeof result.content === "string" ? result.content : ""
      },
    }
    // 构建知识库（优先 SQLite，降级内存）
    let kb
    if (this._store && this._store.db) {
      const storage = new SQLiteStorage(this._store.db)
      kb = new KnowledgeBase({ storage })
    } else {
      kb = new KnowledgeBase()
    }
    kb.init()

    // 构建质量评估器（可选 embedding 客户端）
    let embeddingClient = null
    if (this._aiGenerator && typeof this._aiGenerator.getEmbedding === 'function') {
      embeddingClient = { getEmbedding: (text) => this._aiGenerator.getEmbedding(text) }
    }
    const qualityEvaluator = new RewriteQualityEvaluator({ embeddingClient })

    const engine = new RewriteEngine({
      llmClient,
      sensitiveFilter: new SensitiveFilter(),
      knowledgeBase: kb,
      qualityEvaluator,
    })
    // 将策略管理器中的策略注入引擎的策略管理器
    if (engine._strategyManager && typeof engine._strategyManager.mergeRemote === "function") {
      engine._strategyManager.clearRemote()
      engine._strategyManager.mergeRemote(this._strategyManager.listRemote())
    }
    this._engine = engine
    return engine
  }

  /**
   * 执行改写
   * @param {object} params - { mode, content, userSettings, strategyId }
   */
  async rewrite(params) {
    const engine = this._ensureEngine()
    return engine.rewrite(params || {})
  }

  /** 列出所有可用策略（内置 + 远程，仅启用） */
  listStrategies() {
    if (!this._strategyManager) return []
    return this._strategyManager.listEnabled()
  }

  /** 获取推荐策略 */
  getRecommendedStrategies(userSettings) {
    const engine = this._ensureEngine()
    return engine.getRecommendedStrategies(userSettings || {})
  }
}

module.exports = RewriteEngineService
