// @ts-check
/**
 * doubao-llm.js — 豆包 LLM Adapter（火山引擎方舟）
 *
 * 豆包大模型由火山引擎方舟提供，兼容 OpenAI API 格式。
 * 默认端点 https://ark.cn-beijing.volces.com/api/v3，需 API Key。
 *
 * 继承 OpenAICompatibleAdapter 复用 chatCompletion/streamChat/embeddings/listModels。
 *
 * 使用方式：
 *   const adapter = new DoubaoLlmAdapter({
 *     id: 'doubao-llm',
 *     apiKey: 'ark-xxxx',
 *     baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
 *   })
 *
 * 设计决策：
 * - 薄包装：仅类定义，全部方法继承自 OpenAICompatibleAdapter
 * - validateConfig 沿用基类（baseUrl 必填，apiKey 可选）
 * - getProviderInfo 返回 id 标识（继承自 BaseAdapter）
 */

const { OpenAICompatibleAdapter } = require('./_base/openai-compatible')

class DoubaoLlmAdapter extends OpenAICompatibleAdapter {
  // 无需新增方法，全部继承自 OpenAICompatibleAdapter
  // - chatCompletion()  POST /chat/completions
  // - streamChat()      POST /chat/completions (stream=true)
  // - embeddings()      POST /embeddings
  // - listModels()      GET /models
  // - testConnection()  通过 listModels 验证
  // - validateConfig()  baseUrl 必填，apiKey 可选
}

module.exports = { DoubaoLlmAdapter }
