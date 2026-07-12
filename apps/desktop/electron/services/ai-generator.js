// @ts-check
/**
 * AIGenerator — 桥接 Python AI 工具链
 * 通过 python-bridge 调用视频/图像/音频/TTS 等 AI 生成工具
 *
 * 配置读取已委托给 model-provider-manager，本模块保留 PROVIDERS 注册表作为回退
 */

const path = require('path');

// --- Provider 注册表（回退用，优先从 model-provider-manager 读取）---
const PROVIDERS = {
  video: [
    { id: 'hunyuan', name: '腾讯混元', description: 'Hunyuan 视频生成', models: ['hunyuan-video'], apiRequired: true },
    { id: 'cogvideo', name: 'CogVideo', description: '智谱 CogVideoX', models: ['cogvideo'], apiRequired: true },
    { id: 'grok', name: 'Grok Video', description: 'xAI Grok 视频', models: ['grok-video'], apiRequired: true },
    { id: 'heygen', name: 'HeyGen', description: 'HeyGen 数字人视频', models: ['heygen-video'], apiRequired: true },
    { id: 'kling', name: 'Kling', description: 'Kling 视频生成', models: ['kling-video'], apiRequired: true },
    { id: 'runway', name: 'Runway', description: 'Runway Gen-3/4', models: ['runway-gen3', 'runway-gen4'], apiRequired: true },
    { id: 'veo', name: 'Veo', description: 'Google Veo 3.1', models: ['veo'], apiRequired: true },
    { id: 'wan', name: 'Wan', description: '阿里万相视频', models: ['wan-video'], apiRequired: true },
    { id: 'minimax', name: 'MiniMax', description: 'MiniMax/Hailuo 视频', models: ['minimax-video'], apiRequired: true },
    { id: 'ltx', name: 'LTX Video', description: 'Lightricks LTX 本地生成', models: ['ltx-video'], apiRequired: false },
    { id: 'seedance', name: 'Seedance', description: 'Seedance 视频', models: ['seedance'], apiRequired: true },
    { id: 'higgsfield', name: 'Higgsfield', description: 'Higgsfield 视频', models: ['higgsfield-video'], apiRequired: true },
  ],
  image: [
    { id: 'flux', name: 'Flux', description: 'Black Forest Labs Flux Pro', models: ['flux-pro'], apiRequired: true },
    { id: 'openai', name: 'DALL-E', description: 'OpenAI gpt-image-1 / DALL-E 3', models: ['gpt-image-1', 'dall-e-3'], apiRequired: true },
    { id: 'recraft', name: 'Recraft', description: 'Recraft V3', models: ['recraft-v3'], apiRequired: true },
    { id: 'imagen', name: 'Imagen', description: 'Google Imagen 3', models: ['imagen-3'], apiRequired: true },
    { id: 'grok-image', name: 'Grok Image', description: 'xAI Grok 图像', models: ['grok-image'], apiRequired: true },
    { id: 'pixabay', name: 'Pixabay', description: 'Pixabay 免费图库', models: ['pixabay'], apiRequired: false },
    { id: 'pexels', name: 'Pexels', description: 'Pexels 免费图库', models: ['pexels'], apiRequired: false },
    { id: 'local-diffusion', name: '本地扩散', description: 'StableDiffusion 本地生成', models: ['sd-1.5', 'sdxl'], apiRequired: false },
    { id: 'comfyui', name: 'ComfyUI', description: 'ComfyUI 自定义工作流', models: ['comfyui'], apiRequired: false },
  ],
  audio: [
    { id: 'suno', name: 'Suno', description: 'Suno AI 音乐生成', models: ['suno-v4'], apiRequired: true },
    { id: 'musicgen', name: 'MusicGen', description: 'Meta MusicGen', models: ['musicgen'], apiRequired: false },
    { id: 'pixabay-music', name: 'Pixabay Music', description: 'Pixabay 免费音乐库', models: ['pixabay-music'], apiRequired: false },
    { id: 'freesound', name: 'Freesound', description: 'Freesound 音效库', models: ['freesound'], apiRequired: false },
    { id: 'music-library', name: '音乐库', description: '本地音乐库扫描', models: ['local-library'], apiRequired: false },
  ],
  tts: [
    { id: 'elevenlabs', name: 'ElevenLabs', description: 'ElevenLabs TTS', models: ['eleven_multilingual_v2'], apiRequired: true },
    { id: 'openai-tts', name: 'OpenAI TTS', description: 'OpenAI gpt-4o-mini-tts', models: ['tts-1', 'tts-1-hd'], apiRequired: true },
    { id: 'doubao', name: '豆包 TTS', description: '字节豆包语音合成', models: ['doubao-tts'], apiRequired: true },
    { id: 'google-tts', name: 'Google TTS', description: 'Google Cloud TTS', models: ['google-tts'], apiRequired: true },
    { id: 'piper', name: 'Piper', description: 'Piper 本地 TTS', models: ['piper'], apiRequired: false },
  ],
};

class AIGenerator {
  constructor() {
    this._configs = new Map();
    this._modelProviderManager = null;
    this._initDefaults();
  }

  /** 设置 model-provider-manager 引用（延迟注入，避免循环依赖） */
  setModelProviderManager(mpm) {
    this._modelProviderManager = mpm;
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

  /** 获取 Provider 列表（按类型）—— 优先从 model-provider-manager 读取 */
  listProviders(type) {
    // 尝试从 model-provider-manager 读取
    if (this._modelProviderManager && this._modelProviderManager._ready) {
      const categoryMap = { video: 'video', image: 'image', audio: 'audio', tts: 'tts' };
      const category = categoryMap[type];
      if (category) {
        const providers = this._modelProviderManager.listProviders(category);
        if (providers.length > 0) return providers;
      }
    }
    // 回退到本地注册表
    if (type) return PROVIDERS[type] || [];
    return PROVIDERS;
  }

  /** 获取 Provider 配置（不含 apiKey) */
  getProviderConfig(providerId) {
    // 尝试从 model-provider-manager 读取
    if (this._modelProviderManager && this._modelProviderManager._ready) {
      const config = this._modelProviderManager.getProvider(providerId);
      if (config) return config;
    }
    // 回退到内存配置
    const config = this._configs.get(providerId);
    if (!config) return null;
    const { apiKey, ...safe } = config;  // eslint-disable-line no-unused-vars
    return safe;
  }

  /** 获取可用模型列表 */
  listModels(providerId) {
    // 尝试从 model-provider-manager 读取
    if (this._modelProviderManager && this._modelProviderManager._ready) {
      const config = this._modelProviderManager.getProvider(providerId);
      if (config) return config.models || [];
    }
    // 回退到内存配置
    const config = this._configs.get(providerId);
    return config ? [...config.models] : [];
  }

  /** 生成——通过 python-bridge 调用 Python 后端 */
  async generate(type, providerId, params, onProgress) {
    // 从 model-provider-manager 或内存获取配置
    let config = null;
    if (this._modelProviderManager && this._modelProviderManager._ready) {
      config = this._modelProviderManager.getProviderWithKey(providerId);
    }
    if (!config) {
      config = this._configs.get(providerId);
    }
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
    // 优先使用 model-provider-manager
    if (this._modelProviderManager && this._modelProviderManager._ready) {
      return this._modelProviderManager.testConnection(providerId);
    }
    // 回退
    const config = this._configs.get(providerId);
    if (!config) return { success: false, error: 'Unknown provider' };
    if (!config.apiKey) return { success: false, error: 'API Key not configured' };
    return { success: true, message: config.name + ' configured' };
  }

  /** 更新 Provider 配置 */
  updateProviderConfig(providerId, updates) {
    // 同步更新到 model-provider-manager
    if (this._modelProviderManager && this._modelProviderManager._ready) {
      this._modelProviderManager.updateProvider(providerId, updates);
    }
    // 同步更新内存配置
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
