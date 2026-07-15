// @ts-check
/**
 * AIGenerator — 桥接 Python AI 工具链
 * 通过 python-bridge 调用视频/图像/音频/TTS 等 AI 生成工具
 *
 * P1 统一数据源：所有配置读取完全委托给 model-provider-manager
 * 不再保留 PROVIDERS 注册表和 _configs 内存 Map 作为回退
 */

class AIGenerator {
  constructor() {
    this._modelProviderManager = null;
  }

  /** 设置 model-provider-manager 引用（延迟注入，避免循环依赖） */
  setModelProviderManager(mpm) {
    this._modelProviderManager = mpm;
  }

  /** 获取 Provider 列表（按类型）—— 完全委托 manager */
  listProviders(type) {
    if (!this._modelProviderManager || !this._modelProviderManager._ready) {
      return [];
    }
    return this._modelProviderManager.listProviders(type);
  }

  /** 获取 Provider 配置（不含 apiKey) */
  getProviderConfig(providerId) {
    if (!this._modelProviderManager || !this._modelProviderManager._ready) {
      return null;
    }
    return this._modelProviderManager.getProvider(providerId);
  }

  /** 获取可用模型列表 */
  listModels(providerId) {
    if (!this._modelProviderManager || !this._modelProviderManager._ready) {
      return [];
    }
    const config = this._modelProviderManager.getProvider(providerId);
    return config ? [...(config.models || [])] : [];
  }

  /** 生成——通过 python-bridge 调用 Python 后端 */
  async generate(type, providerId, params, onProgress) {
    if (!this._modelProviderManager || !this._modelProviderManager._ready) {
      throw new Error('Model provider manager not available');
    }
    const config = this._modelProviderManager.getProviderWithKey(providerId);
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
    if (!this._modelProviderManager || !this._modelProviderManager._ready) {
      return { success: false, error: 'Model provider manager not available' };
    }
    return this._modelProviderManager.testConnection(providerId);
  }

  /** 更新 Provider 配置 */
  updateProviderConfig(providerId, updates) {
    if (!this._modelProviderManager || !this._modelProviderManager._ready) {
      return false;
    }
    this._modelProviderManager.updateProvider(providerId, updates);
    return true;
  }

  _getPythonBridge() {
    try { return require('./python-bridge'); } catch { return null; }
  }
}

module.exports = { AIGenerator };
