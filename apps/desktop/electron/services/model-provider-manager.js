// @ts-check
/**
 * ModelProviderManager - Global model provider management
 *
 * Manages 6 categories (llm/tts/speech_recognition/image/video/audio)
 * P2: API Key encrypted with Electron safeStorage (api_key_enc BLOB)
 */

const log = require('./logger')
const { PRESET_PROVIDERS, CATEGORY_LABELS, CATEGORIES } = require('./model-provider-seeds')
const crypto = require('./crypto')

class ModelProviderManager {
  constructor (store) {
    this._store = store
    this._ready = false
    // P3.2: Adapter 工厂注册表 + 实例缓存
    this._adapterFactories = new Map()
    this._adapterCache = new Map()
  }

  /**
   * P3.2: 注册 Adapter 工厂
   * @param {string} providerId - 供应商 ID（如 'openai'）
   * @param {function} factory - (credentials) => BaseAdapter 实例
   */
  registerAdapter (providerId, factory) {
    if (!providerId || typeof factory !== 'function') {
      log.error('ModelProviderManager', 'registerAdapter: invalid providerId or factory')
      return
    }
    this._adapterFactories.set(providerId, factory)
    // 注册后清除该 provider 的缓存（下次 callAdapter 重建）
    this._adapterCache.delete(providerId)
    log.info('ModelProviderManager', 'Adapter factory registered: ' + providerId)
  }

  /**
   * P3.2: 统一调用入口
   * @param {string} providerId - 供应商 ID
   * @param {string} method - 方法名（如 'chatCompletion'）
   * @param {object} params - 方法参数
   * @returns {Promise<{code: number, data?: any, message?: string, error?: Error}>}
   */
  async callAdapter (providerId, method, params = {}) {
    if (!this._ready) return { code: -1, message: 'Store not initialized' }

    // 检查 Adapter 工厂是否注册
    const factory = this._adapterFactories.get(providerId)
    if (!factory) {
      return { code: -1, message: `No adapter registered for provider "${providerId}"` }
    }

    // 获取 provider（含解密后的 api_key）
    const provider = this.getProviderWithKey(providerId)
    if (!provider) {
      return { code: -1, message: `Provider "${providerId}" not found` }
    }
    if (!provider.api_key) {
      return { code: -1, message: 'API Key not configured for provider "' + providerId + '"' }
    }

    // 获取或创建 Adapter 实例（factory 可能同步抛异常）
    let adapter
    try {
      adapter = this._getOrCreateAdapter(providerId, provider)
    } catch (e) {
      const { ProviderError } = require('./adapters/_base/provider-error')
      if (e instanceof ProviderError) {
        return { code: -1, error: e, message: e.message }
      }
      return { code: -1, message: 'Factory initialization failed: ' + e.message }
    }

    // 能力检查（在调用前完成，避免不必要的日志记录）
    if (typeof adapter.supports === 'function' && !adapter.supports(method)) {
      return { code: -1, message: `Method "${method}" not supported by adapter "${providerId}"` }
    }

    // 调用 + 统一日志记录（所有路径覆盖，不依赖 router logHandler）
    const startTime = Date.now()
    try {
      const result = await adapter[method](params)
      const latency_ms = Date.now() - startTime
      this._writeLog(provider, method, 'success', latency_ms, null)
      return { code: 0, data: result }
    } catch (e) {
      const latency_ms = Date.now() - startTime
      const errorMsg = e.message || String(e)
      this._writeLog(provider, method, 'error', latency_ms, errorMsg)
      // ProviderError 透传
      const { ProviderError } = require('./adapters/_base/provider-error')
      if (e instanceof ProviderError) {
        return { code: -1, error: e, message: e.message }
      }
      // 普通 Error 包装
      log.error('ModelProviderManager', `callAdapter ${providerId}.${method} failed: ${e.message}`)
      return { code: -1, message: e.message }
    }
  }

  /**
   * 写入调用日志（安全包装，失败不影响主流程）
   * @param {object} provider - provider config（含 id/category）
   * @param {string} action - 调用方法名
   * @param {string} status - 'success' | 'error'
   * @param {number} latencyMs - 延迟毫秒
   * @param {string|null} errorMessage - 错误消息
   * @private
   */
  _writeLog (provider, action, status, latencyMs, errorMessage) {
    if (!this._store || typeof this._store.addProviderLog !== 'function') return
    try {
      this._store.addProviderLog({
        provider_id: provider.id,
        category: provider.category || 'unknown',
        action,
        status,
        latency_ms: latencyMs,
        error_message: errorMessage,
      })
    } catch (_) {
      // 日志写入失败不影响主流程
    }
  }

  /**
   * P3.2: 获取或创建 Adapter 实例（带缓存）
   */
  _getOrCreateAdapter (providerId, provider) {
    // 检查缓存
    if (this._adapterCache.has(providerId)) {
      return this._adapterCache.get(providerId)
    }

    // 创建新实例
    const factory = this._adapterFactories.get(providerId)
    const credentials = {
      id: provider.id,
      apiKey: provider.api_key,
      baseUrl: provider.base_url,
      models: provider.models,
      config: provider.config,
    }
    const adapter = factory(credentials)
    this._adapterCache.set(providerId, adapter)
    return adapter
  }

  /**
   * P3.2: 清除指定 provider 的 Adapter 缓存
   * 在 updateProvider/deleteProvider 后调用
   */
  _invalidateAdapterCache (providerId) {
    this._adapterCache.delete(providerId)
  }

  /**
   * 注册内置 Adapter 工厂
   * 在 init() 中调用，注册全部 52 个预设供应商对应的 Adapter
   * 工厂只是 (credentials) => Adapter 函数，不立即创建实例
   *
   * 覆盖 6 大类别：llm / tts / speech_recognition / image / video / audio
   */
  _registerBuiltinAdapters () {
    // 供应商 ID → Adapter 类的映射（共 52 个，与 PRESET_PROVIDERS 一一对应）
    const adapters = {
      // ─── LLM 推理模型 (11) ─────────────────────────
      openai: require('./adapters/openai').OpenAIAdapter,
      anthropic: require('./adapters/anthropic').AnthropicAdapter,
      gemini: require('./adapters/gemini').GeminiAdapter,
      openrouter: require('./adapters/openrouter').OpenRouterAdapter,
      ollama: require('./adapters/ollama').OllamaAdapter,
      'doubao-llm': require('./adapters/doubao-llm').DoubaoLlmAdapter,
      deepseek: require('./adapters/deepseek').DeepSeekAdapter,
      'mimo-llm': require('./adapters/mimo-llm').MimoLlmAdapter,
      'opencode-go': require('./adapters/opencode-go').OpenCodeGoAdapter,
      'agnes-llm': require('./adapters/agnes-llm').AgnesLlmAdapter,
      'sensenova-llm': require('./adapters/sensenova-llm').SenseNovaLlmAdapter,
      // ─── TTS 语音合成 (7) ──────────────────────────
      elevenlabs: require('./adapters/elevenlabs').ElevenLabsAdapter,
      'openai-tts': require('./adapters/openai-tts').OpenAITtsAdapter,
      'doubao-tts': require('./adapters/doubao-tts').DoubaoTtsAdapter,
      'google-tts': require('./adapters/google-tts').GoogleTtsAdapter,
      piper: require('./adapters/piper').PiperAdapter,
      'mimo-tts': require('./adapters/mimo-tts').MimoTtsAdapter,
      'minimax-tts': require('./adapters/minimax-tts').MinimaxTtsAdapter,
      // ─── 语音识别 STT (5) ──────────────────────────
      whisper: require('./adapters/openai-whisper').OpenAIWhisperAdapter,
      'google-stt': require('./adapters/google-stt').GoogleSttAdapter,
      'doubao-stt': require('./adapters/doubao-stt').DoubaoSttAdapter,
      'baidu-stt': require('./adapters/baidu-stt').BaiduSttAdapter,
      'local-whisper': require('./adapters/local-whisper').LocalWhisperAdapter,
      // ─── 图像生成 (11) ─────────────────────────────
      flux: require('./adapters/flux').FluxAdapter,
      'dall-e': require('./adapters/openai-image').OpenAIImageAdapter,
      recraft: require('./adapters/recraft').RecraftAdapter,
      imagen: require('./adapters/imagen').ImagenAdapter,
      'grok-image': require('./adapters/grok-image').GrokImageAdapter,
      pixabay: require('./adapters/pixabay').PixabayAdapter,
      pexels: require('./adapters/pexels').PexelsAdapter,
      'local-diffusion': require('./adapters/local-diffusion').LocalDiffusionAdapter,
      comfyui: require('./adapters/comfyui').ComfyUiAdapter,
      'minimax-image': require('./adapters/minimax-image').MinimaxImageAdapter,
      'agnes-image': require('./adapters/agnes-image').AgnesImageAdapter,
      // ─── 视频生成 (13) ─────────────────────────────
      hunyuan: require('./adapters/hunyuan').HunyuanAdapter,
      cogvideo: require('./adapters/cogvideo').CogVideoAdapter,
      'grok-video': require('./adapters/grok-video').GrokVideoAdapter,
      heygen: require('./adapters/heygen').HeyGenAdapter,
      kling: require('./adapters/kling').KlingAdapter,
      runway: require('./adapters/runway').RunwayAdapter,
      veo: require('./adapters/veo').VeoAdapter,
      wan: require('./adapters/wan').WanAdapter,
      minimax: require('./adapters/minimax').MiniMaxAdapter,
      ltx: require('./adapters/ltx').LtxAdapter,
      seedance: require('./adapters/seedance').SeedanceAdapter,
      higgsfield: require('./adapters/higgsfield').HiggsfieldAdapter,
      'agnes-video': require('./adapters/agnes-video').AgnesVideoAdapter,
      // ─── 音频生成 (5) ──────────────────────────────
      suno: require('./adapters/suno').SunoAdapter,
      musicgen: require('./adapters/musicgen').MusicGenAdapter,
      'pixabay-music': require('./adapters/pixabay-music').PixabayMusicAdapter,
      freesound: require('./adapters/freesound').FreesoundAdapter,
      'music-library': require('./adapters/_base/music-library').MusicLibraryAdapter,
    }

    for (const [providerId, AdapterClass] of Object.entries(adapters)) {
      this.registerAdapter(providerId, (creds) => new AdapterClass(creds))
    }

    log.info('ModelProviderManager', `Registered ${Object.keys(adapters).length} builtin adapters`)
  }

  init () {
    if (this._ready) return
    if (!this._store || !this._store._ready) {
      log.warn('ModelProviderManager', 'Store not ready, deferring init')
      return
    }
    try {
      this._seedPresets()
      this._migrateApiKeyEncryption()
      this._registerBuiltinAdapters()
      this._ready = true
      log.info('ModelProviderManager', 'Initialized with ' + PRESET_PROVIDERS.length + ' preset providers')
    } catch (e) {
      log.error('ModelProviderManager', 'Init failed: ' + e.message)
    }
  }

  _seedPresets () {
    const db = this._store.db
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO model_providers
        (id, name, category, base_url, api_key, api_key_enc, models, enabled, is_default, is_preset, config, created_at, updated_at)
      VALUES (?, ?, ?, ?, '', NULL, ?, 0, 0, 1, '{}', datetime('now'), datetime('now'))
    `)
    for (const p of PRESET_PROVIDERS) {
      stmt.run(p.id, p.name, p.category, p.base_url || '', JSON.stringify(p.models || []))
    }
  }

  _migrateApiKeyEncryption () {
    if (!crypto.isAvailable()) {
      log.warn('ModelProviderManager', 'safeStorage not available, skipping API key encryption migration')
      return
    }
    const db = this._store.db
    const rows = db.prepare("SELECT id, api_key FROM model_providers WHERE api_key != '' AND api_key_enc IS NULL").all()
    if (rows.length === 0) return
    for (const row of rows) {
      try {
        const encrypted = crypto.encrypt(row.api_key)
        db.prepare('UPDATE model_providers SET api_key_enc = ?, api_key = ? WHERE id = ?').run(encrypted, '', row.id)
      } catch (e) {
        log.error('ModelProviderManager', 'Migration failed for ' + row.id + ': ' + e.message)
      }
    }
    log.info('ModelProviderManager', 'Migrated ' + rows.length + ' API keys to encrypted storage')
  }

  listProviders (category) {
    if (!this._ready) return []
    const db = this._store.db
    let rows
    if (category) {
      rows = db.prepare('SELECT * FROM model_providers WHERE category = ? ORDER BY is_default DESC, is_preset DESC, name ASC').all(category)
    } else {
      rows = db.prepare('SELECT * FROM model_providers ORDER BY category, is_default DESC, is_preset DESC, name ASC').all()
    }
    return rows.map(r => this._safeRow(r))
  }

  getProvider (id) {
    if (!this._ready) return null
    const row = this._store.db.prepare('SELECT * FROM model_providers WHERE id = ?').get(id)
    return row ? this._safeRow(row) : null
  }

  getProviderWithKey (id) {
    if (!this._ready) return null
    const row = this._store.db.prepare('SELECT * FROM model_providers WHERE id = ?').get(id)
    if (!row) return null
    let apiKey = ''
    if (row.api_key_enc) {
      try {
        apiKey = crypto.decrypt(row.api_key_enc)
      } catch (e) {
        log.error('ModelProviderManager', 'Decrypt failed for ' + id + ': ' + e.message)
      }
    } else if (row.api_key) {
      apiKey = row.api_key
    }
    return { ...this._safeRow(row), api_key: apiKey }
  }

  createProvider (data) {
    if (!this._ready) return { code: -1, message: 'Store not initialized' }
    if (!data || !data.id || !data.name || !data.category) {
      return { code: -1, message: 'Missing required fields (id/name/category)' }
    }
    const existing = this._store.db.prepare('SELECT id FROM model_providers WHERE id = ?').get(data.id)
    if (existing) {
      return { code: -1, message: 'ID "' + data.id + '" already exists' }
    }
    const validCategories = Object.values(CATEGORIES)
    if (!validCategories.includes(data.category)) {
      return { code: -1, message: 'Invalid category, options: ' + validCategories.join(', ') }
    }
    let apiKeyEnc = null
    if (data.api_key) {
      if (!crypto.isAvailable()) {
        return { code: -1, message: 'safeStorage not available, cannot encrypt API Key' }
      }
      try {
        apiKeyEnc = crypto.encrypt(data.api_key)
      } catch (e) {
        return { code: -1, message: 'API Key encryption failed: ' + e.message }
      }
    }
    const db = this._store.db
    try {
      db.prepare(`
        INSERT INTO model_providers (id, name, category, base_url, api_key, api_key_enc, models, enabled, is_default, is_preset, config, created_at, updated_at)
        VALUES (?, ?, ?, ?, '', ?, ?, ?, 0, 0, ?, datetime('now'), datetime('now'))
      `).run(
        data.id, data.name, data.category,
        data.base_url || '', apiKeyEnc,
        JSON.stringify(data.models || []),
        data.api_key ? 1 : 0,
        JSON.stringify(data.config || {})
      )
      log.info('ModelProviderManager', 'Provider created: ' + data.id)
      return { code: 0, data: this.getProvider(data.id) }
    } catch (e) {
      log.error('ModelProviderManager', 'Create failed: ' + e.message)
      return { code: -1, message: 'Create failed: ' + e.message }
    }
  }

  updateProvider (id, updates) {
    if (!this._ready) return { code: -1, message: 'Store not initialized' }
    const existing = this.getProvider(id)
    if (!existing) {
      return { code: -1, message: 'Provider "' + id + '" not found' }
    }
    const allowedFields = ['name', 'base_url', 'api_key', 'models', 'enabled', 'config']
    const sets = []
    const vals = []
    for (const [k, v] of Object.entries(updates)) {
      if (!allowedFields.includes(k)) continue
      if (k === 'models') {
        sets.push('models = ?')
        vals.push(JSON.stringify(v))
      } else if (k === 'config') {
        sets.push('config = ?')
        vals.push(JSON.stringify(v))
      } else if (k === 'api_key') {
        if (v) {
          if (!crypto.isAvailable()) {
            return { code: -1, message: 'safeStorage not available, cannot encrypt API Key' }
          }
          try {
            sets.push('api_key_enc = ?')
            vals.push(crypto.encrypt(v))
            sets.push('api_key = ?')
            vals.push('')
          } catch (e) {
            return { code: -1, message: 'API Key encryption failed: ' + e.message }
          }
        } else {
          sets.push('api_key_enc = ?')
          vals.push(null)
          sets.push('api_key = ?')
          vals.push('')
        }
      } else {
        sets.push(k + ' = ?')
        vals.push(v)
      }
    }
    if (sets.length === 0) {
      return { code: -1, message: 'No updatable fields' }
    }
    if ('api_key' in updates) {
      sets.push('enabled = ?')
      vals.push(updates.api_key ? 1 : 0)
    }
    sets.push("updated_at = datetime('now')")
    vals.push(id)
    try {
      this._store.db.prepare('UPDATE model_providers SET ' + sets.join(', ') + ' WHERE id = ?').run(...vals)
      // P3.2: 配置变更后清除 Adapter 缓存
      this._invalidateAdapterCache(id)
      log.info('ModelProviderManager', 'Provider updated: ' + id)
      return { code: 0, data: this.getProvider(id) }
    } catch (e) {
      log.error('ModelProviderManager', 'Update failed: ' + e.message)
      return { code: -1, message: 'Update failed: ' + e.message }
    }
  }

  deleteProvider (id) {
    if (!this._ready) return { code: -1, message: 'Store not initialized' }
    const provider = this.getProvider(id)
    if (!provider) {
      return { code: -1, message: 'Provider "' + id + '" not found' }
    }
    if (provider.is_preset) {
      return { code: -1, message: 'Preset providers cannot be deleted, disable instead' }
    }
    try {
      const db = this._store.db
      if (provider.is_default) {
        db.prepare('UPDATE model_providers SET is_default = 0 WHERE category = ?').run(provider.category)
      }
      db.prepare('DELETE FROM model_providers WHERE id = ?').run(id)
      // P3.2: 删除后清除 Adapter 缓存
      this._invalidateAdapterCache(id)
      log.info('ModelProviderManager', 'Provider deleted: ' + id)
      return { code: 0, message: 'Deleted' }
    } catch (e) {
      log.error('ModelProviderManager', 'Delete failed: ' + e.message)
      return { code: -1, message: 'Delete failed: ' + e.message }
    }
  }

  setDefault (category, providerId) {
    if (!this._ready) return { code: -1, message: 'Store not initialized' }
    const provider = this.getProvider(providerId)
    if (!provider) {
      return { code: -1, message: 'Provider "' + providerId + '" not found' }
    }
    if (provider.category !== category) {
      return { code: -1, message: 'Provider does not belong to category "' + (CATEGORY_LABELS[category] || category) + '"' }
    }
    const providerWithKey = this.getProviderWithKey(providerId)
    if (!providerWithKey || !providerWithKey.api_key) {
      return { code: -1, message: 'Please configure API Key before setting as default' }
    }
    try {
      const db = this._store.db
      const tx = this._store.db.transaction ? this._store.db.transaction(() => {
        db.prepare('UPDATE model_providers SET is_default = 0 WHERE category = ?').run(category)
        db.prepare('UPDATE model_providers SET is_default = 1 WHERE id = ?').run(providerId)
      }) : null
      if (tx) { tx() } else {
        db.prepare('UPDATE model_providers SET is_default = 0 WHERE category = ?').run(category)
        db.prepare('UPDATE model_providers SET is_default = 1 WHERE id = ?').run(providerId)
      }
      log.info('ModelProviderManager', 'Default ' + category + ' set to: ' + providerId)
      return { code: 0, message: 'Set as default' }
    } catch (e) {
      log.error('ModelProviderManager', 'SetDefault failed: ' + e.message)
      return { code: -1, message: 'Set default failed: ' + e.message }
    }
  }

  getDefault (category) {
    if (!this._ready) return null
    const row = this._store.db.prepare('SELECT * FROM model_providers WHERE category = ? AND is_default = 1').get(category)
    if (row) return this._safeRow(row)
    const fallback = this._store.db.prepare("SELECT * FROM model_providers WHERE category = ? AND api_key_enc IS NOT NULL ORDER BY name ASC LIMIT 1").get(category)
    return fallback ? this._safeRow(fallback) : null
  }

  async testConnection (id) {
    if (!this._ready) return { code: -1, message: 'Store not initialized' }
    const provider = this.getProviderWithKey(id)
    if (!provider) {
      return { code: -1, message: 'Provider "' + id + '" not found' }
    }
    if (!provider.api_key) {
      return { code: -1, message: 'API Key not configured' }
    }
    // P3.2: 若已注册 Adapter，通过 Adapter 实际调用 testConnection
    const factory = this._adapterFactories.get(id)
    if (factory) {
      const result = await this.callAdapter(id, 'testConnection', {})
      return result
    }
    // Fallback: 仅配置校验（无 Adapter 注册时）
    return { code: 0, message: provider.name + ' config valid (' + provider.base_url + ')' }
  }

  getAvailablePresets (category) {
    if (!this._ready) return []
    const existingIds = new Set(this._store.db.prepare('SELECT id FROM model_providers').all().map(r => r.id))
    return PRESET_PROVIDERS.filter(p => p.category === category && !existingIds.has(p.id)).map(p => ({
      id: p.id, name: p.name, category: p.category, base_url: p.base_url, models: p.models,
    }))
  }

  isConfigured (category) {
    if (!this._ready) return false
    const row = this._store.db.prepare('SELECT COUNT(*) as cnt FROM model_providers WHERE category = ? AND api_key_enc IS NOT NULL AND enabled = 1').get(category)
    return row && row.cnt > 0
  }

  _safeRow (row) {
    if (!row) return null
    let apiKeyMasked = '****'
    if (row.api_key_enc) {
      try {
        const decrypted = crypto.decrypt(row.api_key_enc)
        apiKeyMasked = crypto.mask(decrypted)
      } catch {
        apiKeyMasked = '****'
      }
    } else if (row.api_key) {
      apiKeyMasked = crypto.mask(row.api_key)
    }
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      base_url: row.base_url || '',
      models: safeJsonParse(row.models, []),
      enabled: !!row.enabled,
      is_default: !!row.is_default,
      is_preset: !!row.is_preset,
      config: safeJsonParse(row.config, {}),
      api_key_masked: apiKeyMasked,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }
}

function safeJsonParse (str, fallback) {
  if (!str || typeof str !== 'string') return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

module.exports = { ModelProviderManager }
