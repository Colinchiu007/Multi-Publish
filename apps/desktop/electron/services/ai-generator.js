// @ts-check
/**
 * AIGenerator — 桥接 Python AI 工具链 + Adapter 直调
 *
 * P1 统一数据源：所有配置读取完全委托给 model-provider-manager
 * P3.5 双路径调用：
 *   - 路径 A（优先）: 若已注册 Adapter，通过 manager.callAdapter 调用
 *   - 路径 B（fallback）: 无 Adapter 时通过 python-bridge 调用后端
 *   - 路径 C（故障转移）: useFailover=true 时通过 router.executeWithFailover
 */

const { ProviderError } = require('./adapters/provider-error')

// type → Adapter method 映射
const TYPE_TO_METHOD = {
  llm: 'chatCompletion',
  tts: 'synthesize',
  image: 'generateImage',
  video: 'generateVideo',
  audio: 'synthesize',
  speech_recognition: 'transcribe',
}

class AIGenerator {
  constructor() {
    this._modelProviderManager = null;
    this._router = null;
  }

  /** 设置 model-provider-manager 引用（延迟注入，避免循环依赖） */
  setModelProviderManager(mpm) {
    this._modelProviderManager = mpm;
  }

  /** P3.5: 设置 ProviderRouter 引用（可选，启用故障转移） */
  setRouter(router) {
    this._router = router;
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

  /**
   * 生成——P3.5 双路径调用
   * @param {string} type - llm/tts/image/video/audio
   * @param {string|null} providerId - 指定 provider，null 时由 router 选择
   * @param {object} params - 调用参数
   * @param {function} [onProgress] - 进度回调
   */
  async generate(type, providerId, params, onProgress) {
    if (!this._modelProviderManager || !this._modelProviderManager._ready) {
      throw new Error('Model provider manager not available');
    }

    // P3.5: 故障转移路径（useFailover=true 且 providerId 为 null）
    if (params && params.useFailover && this._router && !providerId) {
      return this._generateWithFailover(type, params, onProgress);
    }

    // P3.5: Adapter 直调路径（有 Adapter 工厂注册）
    if (providerId && this._hasAdapter(providerId)) {
      return this._generateViaAdapter(type, providerId, params, onProgress);
    }

    // Fallback: python-bridge 路径
    return this._generateViaPythonBridge(type, providerId, params, onProgress);
  }

  /** P3.5: 检查 provider 是否注册了 Adapter */
  _hasAdapter(providerId) {
    const mgr = this._modelProviderManager;
    return !!(mgr && mgr._adapterFactories && mgr._adapterFactories.has(providerId));
  }

  /** P3.5: 通过 callAdapter 调用 */
  async _generateViaAdapter(type, providerId, params, onProgress) {
    const config = this._modelProviderManager.getProviderWithKey(providerId);
    if (!config) throw new Error('Unknown provider: ' + providerId);

    const method = TYPE_TO_METHOD[type] || 'chatCompletion';
    if (onProgress) onProgress({ percent: 0, stage: 'calling adapter: ' + providerId });

    const result = await this._modelProviderManager.callAdapter(providerId, method, params);

    if (result.code !== 0) {
      // ProviderError 透传
      if (result.error && result.error instanceof ProviderError) {
        throw result.error;
      }
      throw new Error(result.message || 'Adapter call failed');
    }

    if (onProgress) onProgress({ percent: 100, stage: 'completed' });
    return result.data;
  }

  /** P3.5: 通过 router.executeWithFailover 调用 */
  async _generateWithFailover(type, params, onProgress) {
    if (!this._router) {
      throw new Error('Router not available for failover');
    }

    const method = TYPE_TO_METHOD[type] || 'chatCompletion';
    if (onProgress) onProgress({ percent: 0, stage: 'failover start' });

    const result = await this._router.executeWithFailover(type, async (provider) => {
      const r = await this._modelProviderManager.callAdapter(provider.id, method, params);
      if (r.code !== 0) {
        if (r.error && r.error instanceof ProviderError) throw r.error;
        throw new Error(r.message || 'Adapter call failed');
      }
      return r.data;
    }, { maxRetries: 3, strategy: 'failover' });

    if (onProgress) onProgress({ percent: 100, stage: 'completed' });
    return result;
  }

  /** Fallback: 通过 python-bridge 调用后端 */
  async _generateViaPythonBridge(type, providerId, params, onProgress) {
    if (providerId) {
      const config = this._modelProviderManager.getProviderWithKey(providerId);
      if (!config) throw new Error('Unknown provider: ' + providerId);
    }

    const PythonBridge = this._getPythonBridge();
    if (PythonBridge && PythonBridge.isRunning()) {
      try {
        if (onProgress) onProgress({ percent: 0, stage: 'calling python-bridge' });
        return await PythonBridge.requestBackend('POST', '/api/ai/generate', {
          type, provider: providerId, params,
        }, 300000);
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

module.exports = { AIGenerator, TYPE_TO_METHOD };
