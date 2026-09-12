// @ts-check
/**
 * RewriteEngineService — 改写引擎桥接层
 *
 * 桥接 @multi-publish/rewrite-engine 包 + aiGenerator 统一 provider 网关。
 * 改写策略运行时下发由 RewriteStrategyManager 提供，推理走 aiGenerator.generateWithDefault('llm')。
 * v3: 知识库使用 SQLite 持久化存储，质量评估可选 embedding 客户端。
 * v4: 三层 KnowledgeContextBuilder 集成（用户偏好 + 爆款库 + 个人知识库）。
 */

const { RewriteEngine, KnowledgeBase, RewriteQualityEvaluator, KnowledgeContextBuilder } = require("@multi-publish/rewrite-engine")
const { SensitiveFilter } = require("@multi-publish/rewrite-engine")
const { SQLiteStorage } = require("@multi-publish/rewrite-engine")
const log = require("./logger")

class RewriteEngineService {
  constructor(opts) {
    opts = opts || {}
    this._strategyManager = opts.strategyManager || null
    this._aiGenerator = opts.aiGenerator || null
    this._store = opts.store || null
    this._knowledgeLibrary = null
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

  /**
   * 设置知识库业务服务（三层融合的爆款库+个人知识库数据源）
   * @param {object} kl - KnowledgeLibraryService 实例
   */
  setKnowledgeLibrary(kl) {
    this._knowledgeLibrary = kl
  }

  _ensureEngine(force) {
    // 首次构建后复用引擎实例，避免每次 rewrite() 重建知识库/评估器
    if (this._engine && !force) return this._engine

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

    // 构建三层 KnowledgeContextBuilder（用户偏好 + 爆款库 + 个人知识库）
    let knowledgeLibrary = null
    if (this._knowledgeLibrary) {
      knowledgeLibrary = new KnowledgeContextBuilder({
        knowledgeBase: kb,
        // P0 检索修复：LLM 关键词兜底（规则提取 < 2 词时触发，复用统一 provider 网关）
        llmKeywords: async (text, topN) => {
          if (!this._aiGenerator) return []
          try {
            const result = await this._aiGenerator.generateWithDefault("llm", {
              messages: [
                { role: "system", content: "你是关键词提取助手。从用户文本中提取主题关键词。只输出严格 JSON，格式：{\"keywords\": [\"关键词1\", \"关键词2\"]}，不要任何其他文字。" },
                { role: "user", content: "从以下文本提取不超过 " + topN + " 个主题关键词（中文优先，保留专有名词）：\n\n" + String(text || "").slice(0, 2000) },
              ],
            })
            const raw = result && typeof result.content === "string" ? result.content : ""
            let cleaned = raw.trim()
            const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
            if (fence) cleaned = fence[1].trim()
            const parsed = JSON.parse(cleaned)
            if (!parsed || !Array.isArray(parsed.keywords)) return []
            return parsed.keywords.filter(k => typeof k === "string" && k.trim()).map(k => k.trim()).slice(0, Math.max(1, topN))
          } catch (e) {
            log.warn("RewriteEngine", "LLM keyword fallback failed: " + (e && e.message))
            return [] // fail-open：LLM 兜底失败静默降级为规则关键词
          }
        },
        viralLibrary: {
          search: (query, limit) => {
            const res = this._knowledgeLibrary.searchViral(query, limit)
            return res && res.code === 0 ? res.data : []
          }
        },
        personalKnowledgeBase: {
          search: (query, limit) => {
            const res = this._knowledgeLibrary.searchPersonal(query, limit)
            return res && res.code === 0 ? res.data : []
          }
        }
      })
    }

    const engine = new RewriteEngine({
      llmClient,
      sensitiveFilter: new SensitiveFilter(),
      knowledgeBase: kb,
      qualityEvaluator,
      knowledgeLibrary,
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
