// @ts-check
/**
 * ollama.js — Ollama Adapter（本地 LLM 推理）
 *
 * Ollama 是本地推理服务，兼容 OpenAI API 格式。
 * 默认端点 http://localhost:11434/v1，无需 API Key。
 *
 * 继承 OpenAICompatibleAdapter 复用 chatCompletion/streamChat/embeddings/listModels。
 *
 * 使用方式：
 *   const adapter = new OllamaAdapter({
 *     id: 'ollama',
 *     baseUrl: 'http://localhost:11434/v1',
 *     // apiKey 可空（本地服务不需要认证）
 *   })
 *
 * 设计决策：
 * - 薄包装：仅类定义，全部方法继承自 OpenAICompatibleAdapter
 * - validateConfig 沿用基类（baseUrl 必填，apiKey 可选，本地服务无需 Key）
 * - getProviderInfo 返回 id 标识（继承自 BaseAdapter）
 */

const { OpenAICompatibleAdapter } = require('./openai-compatible')

class OllamaAdapter extends OpenAICompatibleAdapter {
  // 无需新增方法，全部继承自 OpenAICompatibleAdapter
  // - chatCompletion()  POST /chat/completions
  // - streamChat()      POST /chat/completions (stream=true)
  // - embeddings()      POST /embeddings
  // - listModels()      GET /models
  // - testConnection()  通过 listModels 验证
  // - validateConfig()  baseUrl 必填，apiKey 可选（本地服务无需 Key）
}

module.exports = { OllamaAdapter }
