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
