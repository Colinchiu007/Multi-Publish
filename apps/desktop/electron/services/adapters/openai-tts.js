// @ts-check
/**
 * openai-tts.js — OpenAI TTS Adapter（语音合成）
 *
 * 继承 OpenAIAdapter，覆盖 ITtsAdapter mixin：
 *   - synthesize()    POST /audio/speech 返回 audio buffer
 *   - listVoices()    返回 OpenAI TTS 静态声音列表（无 HTTP 请求）
 *
 * OpenAI TTS API 关键特性：
 * - 认证头 Authorization: Bearer {key}（继承自 OpenAIAdapter）
 * - synthesize: POST /audio/speech，请求体 JSON { model, input, voice, response_format }
 * - 响应为二进制音频流（非 JSON），需用 resp.arrayBuffer() 读取
 * - 声音列表为静态预定义（OpenAI 无 /voices 端点）
 * - voice 默认 'alloy'，response_format 默认 'mp3'
 * - 支持 model: tts-1 / tts-1-hd
 *
 * 设计决策：
 * - 继承 OpenAIAdapter 复用 _request/_headers/_url/validateConfig/testConnection
 * - synthesize/listVoices 在 KNOWN_METHODS 中，supports() 自动检测为 true
 * - listVoices 静态列表避免不必要的 HTTP 请求
 * - synthesize 返回 { audio, format, model } 统一格式
 */

const { OpenAIAdapter } = require('./openai')
const { ProviderError, ERROR_CODES } = require('./_base/provider-error')

// OpenAI TTS 静态预定义声音列表
const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral', 'sage']

class OpenAITtsAdapter extends OpenAIAdapter {
  /**
   * POST /audio/speech — 语音合成
   *
   * @param {object} params
   * @param {string} params.input - 要合成的文本（必填）
   * @param {string} [params.model='tts-1'] - TTS 模型（tts-1 / tts-1-hd）
   * @param {string} [params.voice='alloy'] - 声音 ID
   * @param {string} [params.response_format='mp3'] - 输出格式（mp3/opus/aac/flac/wav/pcm）
   * @returns {Promise<{audio: ArrayBuffer, format: string, model: string}>}
   */
  async synthesize(params) {
    if (!params || !params.input) {
      throw new ProviderError(ERROR_CODES.INVALID_CONFIG, 'params.input is required')
    }

    const model = params.model || 'tts-1'
    const voice = params.voice || 'alloy'
    const response_format = params.response_format || 'mp3'

    const body = { model, input: params.input, voice, response_format }

    const resp = await this._request('/audio/speech', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const audio = await resp.arrayBuffer()

    return { audio, format: response_format, model }
  }

  /**
   * 返回 OpenAI TTS 静态预定义声音列表
   * OpenAI 无 /voices 端点，使用静态列表避免不必要的 HTTP 请求
   * 返回副本，防止调用方修改污染内部列表
   * @returns {Promise<string[]>}
   */
  async listVoices() {
    return [...TTS_VOICES]
  }
}

module.exports = { OpenAITtsAdapter, TTS_VOICES }
