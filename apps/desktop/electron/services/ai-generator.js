// @ts-check
/**
 * AIGenerator — 桥接 Python AI 工具链
 * 通过 python-bridge 调用视频/图像/音频/TTS 等 AI 生成工具
 */

const path = require('path');

// --- Provider 注册表 ---
const PROVIDERS = {
  video: [
    { id: 'hunyuan', name: '腾讯混元', description: 'Hunyuan 视频生成', models: ['hunyuan-video'], apiRequired: true },
    { id: 'cogvideo', name: 'CogVideo', description: '智谱 CogVideoX', models: ['cogvideo'], apiRequired: true },
    { id: 'grok', name: 'Grok Video', description: 'xAI Grok 视频', models: ['grok-video'], apiRequired: true },
    { id: 'heygen', name: 'HeyGen', description: 'HeyGen 数字人视频', models: ['heygen-video'], apiRequired: true },
    { id: 'kling', name: 'Kling', description: 'Kling 视频生成', models: ['kling-video'], apiRequired: true },
    { id: 'runway', name: 'Runway', description: 'Runway Gen-3', models: ['runway-gen3'], apiRequired: true },
    { id: 'veo', name: 'Veo', description: 'Google Veo', models: ['veo'], apiRequired: true },
    { id: 'wan', name: 'Wan', description: '阿里万相视频', models: ['wan-video'], apiRequired: true },
  ],
  image: [
    { id: 'flux', name: 'Flux', description: 'Black Forest Labs Flux', models: ['flux-pro'], apiRequired: true },
    { id: 'openai', name: 'DALL-E', description: 'OpenAI DALL-E 3', models: ['dall-e-3'], apiRequired: true },
    { id: 'recraft', name: 'Recraft', description: 'Recraft V3', models: ['recraft-v3'], apiRequired: true },
    { id: 'imagen', name: 'Imagen', description: 'Google Imagen', models: ['imagen-3'], apiRequired: true },
  ],
  audio: [
    { id: 'suno', name: 'Suno', description: 'Suno AI 音乐生成', models: ['suno-v4'], apiRequired: true },
    { id: 'musicgen', name: 'MusicGen', description: 'Meta MusicGen', models: ['musicgen'], apiRequired: false },
  ],
  tts: [
    { id: 'elevenlabs', name: 'ElevenLabs', description: 'ElevenLabs TTS', models: ['eleven_multilingual_v2'], apiRequired: true },
    { id: 'openai-tts', name: 'OpenAI TTS', description: 'OpenAI TTS-1', models: ['tts-1', 'tts-1-hd'], apiRequired: true },
    { id: 'doubao', name: '豆包 TTS', description: '字节豆包语音合成', models: ['doubao-tts'], apiRequired: true },
    { id: 'google-tts', name: 'Google TTS', description: 'Google Cloud TTS', models: ['google-tts'], apiRequired: true },
  ],
};

class AIGenerator {
  constructor() {
    this._configs = new Map();
    this._initDefaults();
  }

  _initDefaults() {
    // Initialize default configs for all providers
    for (const [type, providers] of Object.entries(PROVIDERS)) {
      for (const p of providers) {
        this._configs.set(p.id, {
          id: p.id,
          name: p.name,
          type,
          apiKey: '',
          baseUrl: '',
          models: p.models,
          enabled: false,
        });
      }
    }
  }

  /** 获取 Provider 列表（按类型） */
  listProviders(type) {
    if (type) return PROVIDERS[type] || [];
    return PROVIDERS;
  }

  /** 获取 Provider 配置（不含 apiKey) */
  getProviderConfig(providerId) {
    const config = this._configs.get(providerId);
    if (!config) return null;
    const { apiKey, ...safe } = config;  // eslint-disable-line no-unused-vars
    return safe;
  }

  /** 获取可用模型列表 */
  listModels(providerId) {
    const config = this._configs.get(providerId);
    return config ? [...config.models] : [];
  }

  /** 生成——通过 python-bridge 调用 Python 后端 */
  async generate(type, providerId, params, onProgress) {
    const config = this._configs.get(providerId);
    if (!config) throw new Error('Unknown provider: ' + providerId);

    // 通过 python-bridge 调用后端 API
    const PythonBridge = this._getPythonBridge();
    if (PythonBridge && PythonBridge.isRunning()) {
      try {
        return await PythonBridge.requestBackend('POST', '/api/ai/generate', {
          type, provider: providerId, params,
        }, 300000); // 5 min timeout for video generation
      } catch (e) {
        if (onProgress) onProgress({ percent: 0, stage: 'error: ' + e.message });
        throw e;
      }
    }

    throw new Error('Python backend not available');
  }

  /** 测试 Provider 连接 */
  async testConnection(providerId) {
    const config = this._configs.get(providerId);
    if (!config) return { success: false, error: 'Unknown provider' };
    if (!config.apiKey) return { success: false, error: 'API Key not configured' };
    return { success: true, message: config.name + ' configured' };
  }

  /** 更新 Provider 配置 */
  updateProviderConfig(providerId, updates) {
    const config = this._configs.get(providerId);
    if (!config) return false;
    Object.assign(config, updates);
    config.enabled = !!config.apiKey;
    return true;
  }

  _getPythonBridge() {
    try { return require('./python-bridge'); } catch { return null; }
  }
}

module.exports = { AIGenerator };
