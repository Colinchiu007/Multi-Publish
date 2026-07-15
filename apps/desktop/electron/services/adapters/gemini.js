// @ts-check
/**
 * gemini.js — Google Gemini Adapter（LLM 推理）
 *
 * Google Gemini 通过 OpenAI 兼容端点提供 LLM 服务。
 * 默认端点 https://generativelanguage.googleapis.com/v1beta/openai，需 API Key。
 *
 * 继承 OpenAICompatibleAdapter 复用 chatCompletion/streamChat/embeddings/listModels。
 *
 * 使用方式：
 *   const adapter = new GeminiAdapter({
 *     id: 'gemini',
 *     apiKey: 'AIzaSyxxxx',
 *     baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
 *   })
 *
 * 设计决策：
 * - 薄包装：仅类定义，全部方法继承自 OpenAICompatibleAdapter
 * - validateConfig 沿用基类（baseUrl 必填，apiKey 可选）
 * - getProviderInfo 返回 id 标识（继承自 BaseAdapter）
 */

const { OpenAICompatibleAdapter } = require('./openai-compatible')

class GeminiAdapter extends OpenAICompatibleAdapter {
  // 无需新增方法，全部继承自 OpenAICompatibleAdapter
  // - chatCompletion()  POST /chat/completions
  // - streamChat()      POST /chat/completions (stream=true)
  // - embeddings()      POST /embeddings
  // - listModels()      GET /models
  // - testConnection()  通过 listModels 验证
  // - validateConfig()  baseUrl 必填，apiKey 可选
}

module.exports = { GeminiAdapter }
