// @ts-check
/**
 * openrouter.js — OpenRouter Adapter（LLM 推理）
 *
 * OpenRouter 是聚合多家 LLM 的代理平台，完全兼容 OpenAI API 格式。
 * 继承 OpenAICompatibleAdapter 复用 chatCompletion/streamChat/embeddings/listModels。
 *
 * 使用方式：
 *   const adapter = new OpenRouterAdapter({
 *     id: 'openrouter',
 *     apiKey: 'sk-or-xxxx',
 *     baseUrl: 'https://openrouter.ai/api/v1',
 *   })
 *
 * 设计决策：
 * - 薄包装：仅类定义，全部方法继承自 OpenAICompatibleAdapter
 * - validateConfig 沿用基类（baseUrl 必填，apiKey 可选）
 * - getProviderInfo 返回 id 标识（继承自 BaseAdapter，由 credentials.id 决定）
 */

const { OpenAICompatibleAdapter } = require('./openai-compatible')

class OpenRouterAdapter extends OpenAICompatibleAdapter {
  // 无需新增方法，全部继承自 OpenAICompatibleAdapter
  // - chatCompletion()  POST /chat/completions
  // - streamChat()      POST /chat/completions (stream=true)
  // - embeddings()      POST /embeddings
  // - listModels()      GET /models
  // - testConnection()  通过 listModels 验证
  // - validateConfig()  baseUrl 必填，apiKey 可选
}

module.exports = { OpenRouterAdapter }
