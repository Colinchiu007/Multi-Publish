// @ts-check
/**
 * opencode-go.js — OpenCode-Go LLM Adapter（LLM 推理）
 *
 * OpenCode-Go 聚合多个开源/商业模型，兼容 OpenAI API 格式。
 * 默认端点 https://opencode.ai/zen/go/v1，需 API Key。
 * 支持模型：glm-5.2、kimi-k2.7-code、deepseek-v4-pro、deepseek-v4-flash、
 *          mimo-v2.5、mimo-v2.5-pro、glm-5.1、kimi-k2.6。
 *
 * 继承 OpenAICompatibleAdapter 复用 chatCompletion/streamChat/listModels。
 *
 * 使用方式：
 *   const adapter = new OpenCodeGoAdapter({
 *     id: 'opencode-go',
 *     apiKey: 'sk-xxxx',
 *     baseUrl: 'https://opencode.ai/zen/go/v1',
 *   })
 *
 * 设计决策：
 * - 薄包装：仅类定义，全部方法继承自 OpenAICompatibleAdapter
 * - validateConfig 沿用基类（baseUrl 必填，apiKey 可选）
 * - getProviderInfo 返回 id 标识（继承自 BaseAdapter）
 */

const { OpenAICompatibleAdapter } = require('./_base/openai-compatible')

class OpenCodeGoAdapter extends OpenAICompatibleAdapter {
  // 无需新增方法，全部继承自 OpenAICompatibleAdapter
  // - chatCompletion()  POST /chat/completions
  // - streamChat()      POST /chat/completions (stream=true)
  // - listModels()      GET /models
  // - testConnection()  通过 listModels 验证
  // - validateConfig()  baseUrl 必填，apiKey 可选
}

module.exports = { OpenCodeGoAdapter }
