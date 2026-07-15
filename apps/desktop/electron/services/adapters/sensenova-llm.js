// @ts-check
/**
 * sensenova-llm.js — SenseNova LLM Adapter（LLM 推理）
 *
 * 商汤 SenseNova 大模型兼容 OpenAI API 格式。
 * 默认端点 https://token.sensenova.cn/v1，需 API Key。
 * 支持模型：deepseek-v4-flash。
 *
 * 继承 OpenAICompatibleAdapter 复用 chatCompletion/streamChat/listModels。
 *
 * 使用方式：
 *   const adapter = new SenseNovaLlmAdapter({
 *     id: 'sensenova-llm',
 *     apiKey: 'sk-xxxx',
 *     baseUrl: 'https://token.sensenova.cn/v1',
 *   })
 *
 * 设计决策：
 * - 薄包装：仅类定义，全部方法继承自 OpenAICompatibleAdapter
 * - validateConfig 沿用基类（baseUrl 必填，apiKey 可选）
 * - getProviderInfo 返回 id 标识（继承自 BaseAdapter）
 */

const { OpenAICompatibleAdapter } = require('./_base/openai-compatible')

class SenseNovaLlmAdapter extends OpenAICompatibleAdapter {
  // 无需新增方法，全部继承自 OpenAICompatibleAdapter
  // - chatCompletion()  POST /chat/completions
  // - streamChat()      POST /chat/completions (stream=true)
  // - listModels()      GET /models
  // - testConnection()  通过 listModels 验证
  // - validateConfig()  baseUrl 必填，apiKey 可选
}

module.exports = { SenseNovaLlmAdapter }
