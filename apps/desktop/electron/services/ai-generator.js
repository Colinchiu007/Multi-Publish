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

const { ProviderError, classifyProviderFailure } = require('./adapters/_base/provider-error')
const adapterRegistry = require('./adapters/_base/registry-singleton')
const { resolveProviderDefaultModel } = require('./model-provider-manager')

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
    this._governor = null;
  }

  /** 设置 model-provider-manager 引用（延迟注入，避免循环依赖） */
  setModelProviderManager(mpm) {
    this._modelProviderManager = mpm;
  }

  /** 设置 API 并发/限流/排队/重试网关（可选注入，避免循环依赖） */
  setGovernor(governor) {
    this._governor = governor || null;
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
  async generate(type, providerId, params, onProgress, runtimeOptions = {}) {
    if (!this._modelProviderManager || !this._modelProviderManager._ready) {
      throw new Error('Model provider manager not available');
    }

    const dispatch = () => {
      // P3.5: 故障转移路径（useFailover=true 且 providerId 为 null）
      if (params && params.useFailover && this._router && !providerId) {
        return this._generateWithFailover(type, params, onProgress, runtimeOptions);
      }
      // P3.5: Adapter 直调路径（有 Adapter 工厂注册）
      if (providerId && this._hasAdapter(providerId)) {
        return this._generateViaAdapter(type, providerId, params, onProgress, runtimeOptions);
      }
      // Fallback: python-bridge 路径
      return this._generateViaPythonBridge(type, providerId, params, onProgress, runtimeOptions);
    };

    // API 并发/限流/排队/重试网关：覆盖 llm/tts/image/video/audio 全部 provider 调用。
    if (this._governor && providerId) {
      const model = (params && typeof params === 'object' &&
        (params.model || params.voice_model || params.image_model || params.video_model))
        ? String(params.model || params.voice_model || params.image_model || params.video_model)
        : '';
      return this._governor.run({ type, providerId, model }, dispatch);
    }
    return dispatch();
  }

  /**
   * 使用当前类别的已配置默认 provider 生成。
   *
   * 仅允许 Adapter 直调，避免默认模型在未注册 Adapter 时退回到 Python bridge。
   */
  async generateWithDefault(type, params, onProgress, runtimeOptions) {
    const manager = this._modelProviderManager;
    if (!manager || !manager._ready) {
      throw new Error('Model provider manager not available');
    }

    const provider = typeof manager.getDefault === 'function'
      ? manager.getDefault(type)
      : null;
    if (!provider || typeof provider.id !== 'string' || !provider.id.trim() ||
      provider.enabled !== true || provider.is_configured !== true) {
      throw new Error('No configured default provider available for type: ' + type);
    }

    // 双默认语义（2026-08-27）：用户默认 > 运营默认 > capability_models[type] > models[0]；
    // resolveProviderDefaultModel 对多模态无声明返回 ''（fail-closed，不猜测）。
    const model = resolveProviderDefaultModel(provider, type);
    if (!model) {
      throw new Error('No configured model available for default provider: ' + provider.id);
    }

    const providerId = provider.id.trim();
    if (!this._hasAdapter(providerId)) {
      throw new Error('No adapter registered for default provider: ' + providerId);
    }

    const generationParams = params && typeof params === 'object'
      ? { ...params, model }
      : { model };
    const result = await this.generate(type, providerId, generationParams, onProgress, runtimeOptions);
    if (type === 'llm' && (!result || typeof result.content !== 'string' || !result.content.trim())) {
      throw new Error('Default provider returned empty content');
    }
    return result;
  }
  /** P3.5: 检查 provider 是否注册了 Adapter */
  _hasAdapter(providerId) {
    const mgr = this._modelProviderManager;
    return !!(mgr && adapterRegistry.hasFactory(providerId));
  }

  /** P3.5: 通过 callAdapter 调用 */
  async _generateViaAdapter(type, providerId, params, onProgress, runtimeOptions = {}) {
    const config = this._modelProviderManager.getProviderWithKey(providerId);
    if (!config) throw new Error('Unknown provider: ' + providerId);

    const method = TYPE_TO_METHOD[type] || 'chatCompletion';
    this._safeProgress(onProgress, { percent: 0, stage: 'calling adapter: ' + providerId });

    const providerRunContext = runtimeOptions && runtimeOptions.providerRunContext
    if (providerRunContext && typeof providerRunContext.assertAvailable === 'function') providerRunContext.assertAvailable(providerId)
    const result = Object.keys(runtimeOptions || {}).length > 0
      ? await this._modelProviderManager.callAdapter(providerId, method, params, runtimeOptions)
      : await this._modelProviderManager.callAdapter(providerId, method, params);

    if (result.code !== 0) {
      // ProviderError 透传
      if (result.error && result.error instanceof ProviderError) {
        throw result.error;
      }
      throw new Error(result.message || 'Adapter call failed');
    }

    this._safeProgress(onProgress, { percent: 100, stage: 'completed' });
    return result.data;
  }

  /** P3.5: 通过 router.executeWithFailover 调用 */
  async _generateWithFailover(type, params, onProgress, runtimeOptions = {}) {
    if (!this._router) {
      throw new Error('Router not available for failover');
    }

    const method = TYPE_TO_METHOD[type] || 'chatCompletion';
    this._safeProgress(onProgress, { percent: 0, stage: 'failover start' });

    const result = await this._router.executeWithFailover(type, async (provider) => {
      const r = Object.keys(runtimeOptions || {}).length > 0
        ? await this._modelProviderManager.callAdapter(provider.id, method, params, runtimeOptions)
        : await this._modelProviderManager.callAdapter(provider.id, method, params);
      if (r.code !== 0) {
        if (r.error && r.error instanceof ProviderError) throw r.error;
        throw new Error(r.message || 'Adapter call failed');
      }
      return r.data;
    }, { maxRetries: 3, strategy: 'failover', action: method });

    this._safeProgress(onProgress, { percent: 100, stage: 'completed' });
    return result;
  }

  /** Fallback: 通过 python-bridge 调用后端 */
  async _generateViaPythonBridge(type, providerId, params, onProgress, runtimeOptions = {}) {
    if (providerId) {
      const config = this._modelProviderManager.getProviderWithKey(providerId);
      if (!config) throw new Error('Unknown provider: ' + providerId);
    }
    const providerRunContext = runtimeOptions && runtimeOptions.providerRunContext
    if (providerRunContext && providerId && typeof providerRunContext.assertAvailable === 'function') providerRunContext.assertAvailable(providerId)

    const PythonBridge = this._getPythonBridge();
    if (PythonBridge && PythonBridge.isRunning()) {
      try {
        this._safeProgress(onProgress, { percent: 0, stage: 'calling python-bridge' });
        return await PythonBridge.requestBackend('POST', '/api/ai/generate', {
          type, provider: providerId, params,
        }, 300000);
      } catch (e) {
        this._safeProgress(onProgress, { percent: 0, stage: 'error: ' + e.message });
        const providerRunContext = runtimeOptions && runtimeOptions.providerRunContext
        if (providerRunContext && typeof providerRunContext.openIfQuota === 'function' && classifyProviderFailure(e) === 'quota') providerRunContext.open(providerId, e)
        throw e;
      }
    }

    throw new Error('Python backend not available');
  }

  /**
   * 安全触发 onProgress 回调 — 异常不影响主流程
   * 修复 MAJOR bug：原实现 `if (onProgress) onProgress(...)` 未 try-catch，
   * 用户回调抛错会传播到主流程，导致 generate 调用失败
   * @param {function} [onProgress] - 进度回调
   * @param {object} payload - 回调参数
   */
  _safeProgress(onProgress, payload) {
    if (typeof onProgress !== 'function') return;
    try {
      onProgress(payload);
    } catch (_) {
      // 忽略 onProgress 回调异常，避免影响主流程
      // 设计原则：回调异常不应影响主流程
    }
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
