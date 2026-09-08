/**
 * @multi-publish/rewrite-engine
 * 
 * 改写引擎 — 多策略文案改写机制和模型
 * 
 * 主要导出：
 * - RewriteEngine: 引擎核心，编排改写流程
 * - StrategyManager: 策略管理器
 * - StrategyMatcher: 策略匹配算法
 * - AITasteRemover: 去 AI 味后处理器
 * - KnowledgeBase: 用户个人知识库
 * - SensitiveFilter: 敏感词过滤器
 * - BUILTIN_STRATEGIES: 内置策略模板
 */

const { RewriteEngine } = require('./rewrite-engine-core')
const { StrategyManager, BUILTIN_STRATEGIES } = require('./strategy-manager')
const { StrategyMatcher } = require('./strategy-matcher')
const { AITasteRemover, AI_PHRASE_MAP, FORBIDDEN_OPENING_PATTERNS } = require('./ai-taste-remover')
const { KnowledgeBase, MemoryStorage, DEFAULT_KB } = require('./knowledge-base')
const { SensitiveFilter } = require('./sensitive-filter')

/**
 * 快速创建改写引擎实例
 * @param {object} options
 * @returns {RewriteEngine}
 */
function createEngine(options = {}) {
  const kb = options.knowledgeBase || new KnowledgeBase({ storage: options.storage })
  kb.init()

  const sm = options.strategyManager || new StrategyManager()
  sm.loadBuiltins()

  if (options.remoteStrategies) {
    sm.mergeRemote(options.remoteStrategies)
  }

  return new RewriteEngine({
    llmClient: options.llmClient,
    sensitiveFilter: options.sensitiveFilter || new SensitiveFilter(),
    knowledgeBase: kb,
    strategyManager: sm
  })
}

module.exports = {
  RewriteEngine,
  StrategyManager,
  StrategyMatcher,
  AITasteRemover,
  KnowledgeBase,
  MemoryStorage,
  SensitiveFilter,
  BUILTIN_STRATEGIES,
  AI_PHRASE_MAP,
  FORBIDDEN_OPENING_PATTERNS,
  DEFAULT_KB,
  createEngine
}
