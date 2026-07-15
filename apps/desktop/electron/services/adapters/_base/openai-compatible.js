// @ts-check
/**
 * openai-compatible.js — OpenAI 兼容协议通用 Adapter
 *
 * 适用于所有兼容 OpenAI API 格式的供应商：
 *   - OpenRouter (openrouter.ai)
 *   - Ollama (localhost:11434)
 *   - 豆包/Doubao (火山引擎)
 *   - DeepSeek
 *   - Gemini (Google，通过 OpenAI 兼容端点)
 *   - xAI Grok
 *
 * 继承 OpenAIAdapter，仅覆盖 validateConfig 放宽 baseUrl 要求
 */

const { OpenAIAdapter } = require('../openai')

class OpenAICompatibleAdapter extends OpenAIAdapter {
  /**
   * @param {object} credentials
   * @param {string} credentials.apiKey - API Key（部分本地服务可空）
   * @param {string} [credentials.baseUrl] - 自定义端点
   * @param {object} [options]
   */
  constructor(credentials, options = {}) {
    super(credentials, options)
  }

  /**
   * validateConfig — 放宽校验
   * 本地服务（如 Ollama）可能不需要 API Key
   */
  validateConfig() {
    const errors = []
    // baseUrl 必须存在（否则不知道调谁）
    if (!this.credentials.baseUrl) {
      errors.push('baseUrl is required')
    }
    // apiKey 可选（本地服务如 Ollama 不需要）
    return errors.length === 0 ? { valid: true } : { valid: false, errors }
  }
}

module.exports = { OpenAICompatibleAdapter }
