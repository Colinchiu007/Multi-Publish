// @ts-check
/**
 * ModelProviderManager — 全局模型服务商管理
 *
 * 统一管理 5 类模型（llm/tts/speech_recognition/image/video）的服务商配置
 * 数据持久化在 SQLite model_providers 表
 * 替代原 ai-generator.js 的内存 Map 和 provider-manager.js 的 orchestrator 桥接
 */

const log = require('./logger')
const { PRESET_PROVIDERS, CATEGORY_LABELS } = require('./model-provider-seeds')

class ModelProviderManager {
  constructor (store) {
    this._store = store
    this._ready = false
  }

  /** 初始化：确保表存在 + 写入种子数据 */
  init () {
    if (this._ready) return
    if (!this._store || !this._store._ready) {
      log.warn('ModelProviderManager', 'Store not ready, deferring init')
      return
    }

    try {
      this._seedPresets()
      this._ready = true
      log.info('ModelProviderManager', 'Initialized with ' + PRESET_PROVIDERS.length + ' preset providers')
    } catch (e) {
      log.error('ModelProviderManager', 'Init failed: ' + e.message)
    }
  }

  /** 写入预设种子数据（INSERT OR IGNORE，已有则跳过） */
  _seedPresets () {
    const db = this._store.db
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO model_providers
        (id, name, category, base_url, api_key, models, enabled, is_default, is_preset, config, created_at, updated_at)
      VALUES (?, ?, ?, ?, '', ?, 0, 0, 1, '{}', datetime('now'), datetime('now'))
    `)

    for (const p of PRESET_PROVIDERS) {
      stmt.run(
        p.id,
        p.name,
        p.category,
        p.base_url || '',
        JSON.stringify(p.models || [])
      )
    }
  }

  /**
   * 列出服务商
   * @param {string} [category] - 类别过滤，不传则返回全部
   * @returns {Array} 服务商列表（不含 api_key）
   */
  listProviders (category) {
    if (!this._ready) return []
    const db = this._store.db

    let rows
    if (category) {
      rows = db.prepare(
        'SELECT * FROM model_providers WHERE category = ? ORDER BY is_default DESC, is_preset DESC, name ASC'
      ).all(category)
    } else {
      rows = db.prepare(
        'SELECT * FROM model_providers ORDER BY category, is_default DESC, is_preset DESC, name ASC'
      ).all()
    }

    return rows.map(r => this._safeRow(r))
  }

  /**
   * 获取单个服务商（不含 api_key）
   * @param {string} id
   * @returns {object|null}
   */
  getProvider (id) {
    if (!this._ready) return null
    const row = this._store.db.prepare('SELECT * FROM model_providers WHERE id = ?').get(id)
    return row ? this._safeRow(row) : null
  }

  /**
   * 获取单个服务商（含 api_key，仅供内部使用）
   * @param {string} id
   * @returns {object|null}
   */
  getProviderWithKey (id) {
    if (!this._ready) return null
    const row = this._store.db.prepare('SELECT * FROM model_providers WHERE id = ?').get(id)
    if (!row) return null
    return {
      ...this._safeRow(row),
      api_key: row.api_key || '',
    }
  }

  /**
   * 创建服务商
   * @param {object} data - { id, name, category, base_url, api_key, models, config }
   * @returns {{ code: number, message?: string, data?: object }}
   */
  createProvider (data) {
    if (!this._ready) return { code: -1, message: 'Store 未初始化' }
    if (!data || !data.id || !data.name || !data.category) {
      return { code: -1, message: '缺少必填字段（id/name/category）' }
    }

    // 检查 ID 是否已存在
    const existing = this._store.db.prepare('SELECT id FROM model_providers WHERE id = ?').get(data.id)
    if (existing) {
      return { code: -1, message: '标识名 "' + data.id + '" 已存在，请使用其他名称' }
    }

    // 检查类别是否有效
    const validCategories = Object.values(require('./model-provider-seeds').CATEGORIES)
    if (!validCategories.includes(data.category)) {
      return { code: -1, message: '无效的模型类别，可选：' + validCategories.join(', ') }
    }

    const db = this._store.db
    try {
      db.prepare(`
        INSERT INTO model_providers (id, name, category, base_url, api_key, models, enabled, is_default, is_preset, config, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, datetime('now'), datetime('now'))
      `).run(
        data.id,
        data.name,
        data.category,
        data.base_url || '',
        data.api_key || '',
        JSON.stringify(data.models || []),
        data.api_key ? 1 : 0,
        JSON.stringify(data.config || {})
      )
      log.info('ModelProviderManager', 'Provider created: ' + data.id)
      return { code: 0, data: this.getProvider(data.id) }
    } catch (e) {
      log.error('ModelProviderManager', 'Create failed: ' + e.message)
      return { code: -1, message: '创建失败: ' + e.message }
    }
  }

  /**
   * 更新服务商
   * @param {string} id
   * @param {object} updates - 可更新字段
   * @returns {{ code: number, message?: string, data?: object }}
   */
  updateProvider (id, updates) {
    if (!this._ready) return { code: -1, message: 'Store 未初始化' }

    const existing = this.getProvider(id)
    if (!existing) {
      return { code: -1, message: '服务商 "' + id + '" 不存在' }
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
      } else {
        sets.push(`${k} = ?`)
        vals.push(v)
      }
    }

    if (sets.length === 0) {
      return { code: -1, message: '没有可更新的字段' }
    }

    // 如果更新了 api_key，同步更新 enabled 状态
    if ('api_key' in updates) {
      sets.push('enabled = ?')
      vals.push(updates.api_key ? 1 : 0)
    }

    sets.push("updated_at = datetime('now')")
    vals.push(id)

    try {
      this._store.db.prepare(`UPDATE model_providers SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
      log.info('ModelProviderManager', 'Provider updated: ' + id)
      return { code: 0, data: this.getProvider(id) }
    } catch (e) {
      log.error('ModelProviderManager', 'Update failed: ' + e.message)
      return { code: -1, message: '更新失败: ' + e.message }
    }
  }

  /**
   * 删除服务商（预设不允许删除）
   * @param {string} id
   * @returns {{ code: number, message?: string }}
   */
  deleteProvider (id) {
    if (!this._ready) return { code: -1, message: 'Store 未初始化' }

    const provider = this.getProvider(id)
    if (!provider) {
      return { code: -1, message: '服务商 "' + id + '" 不存在' }
    }

    if (provider.is_preset) {
      return { code: -1, message: '预设服务商不支持删除，如需移除请禁用该服务商' }
    }

    try {
      const db = this._store.db
      // 如果删除的是默认 provider，清除该类别的默认设置
      if (provider.is_default) {
        db.prepare('UPDATE model_providers SET is_default = 0 WHERE category = ?').run(provider.category)
      }
      db.prepare('DELETE FROM model_providers WHERE id = ?').run(id)
      log.info('ModelProviderManager', 'Provider deleted: ' + id)
      return { code: 0, message: '已删除' }
    } catch (e) {
      log.error('ModelProviderManager', 'Delete failed: ' + e.message)
      return { code: -1, message: '删除失败: ' + e.message }
    }
  }

  /**
   * 设置某类别的默认服务商
   * @param {string} category
   * @param {string} providerId
   * @returns {{ code: number, message?: string }}
   */
  setDefault (category, providerId) {
    if (!this._ready) return { code: -1, message: 'Store 未初始化' }

    const provider = this.getProvider(providerId)
    if (!provider) {
      return { code: -1, message: '服务商 "' + providerId + '" 不存在' }
    }

    if (provider.category !== category) {
      return { code: -1, message: '服务商不属于类别 "' + (CATEGORY_LABELS[category] || category) + '"' }
    }

    if (!provider.api_key) {
      return { code: -1, message: '请先配置 API Key 后再设为默认' }
    }

    try {
      const db = this._store.db
      const tx = this._store.db.transaction
        ? this._store.db.transaction(() => {
          db.prepare('UPDATE model_providers SET is_default = 0 WHERE category = ?').run(category)
          db.prepare('UPDATE model_providers SET is_default = 1 WHERE id = ?').run(providerId)
        })
        : null

      if (tx) {
        tx()
      } else {
        db.prepare('UPDATE model_providers SET is_default = 0 WHERE category = ?').run(category)
        db.prepare('UPDATE model_providers SET is_default = 1 WHERE id = ?').run(providerId)
      }

      log.info('ModelProviderManager', `Default ${category} set to: ${providerId}`)
      return { code: 0, message: '已设为默认' }
    } catch (e) {
      log.error('ModelProviderManager', 'SetDefault failed: ' + e.message)
      return { code: -1, message: '设置默认失败: ' + e.message }
    }
  }

  /**
   * 获取某类别的默认服务商
   * @param {string} category
   * @returns {object|null}
   */
  getDefault (category) {
    if (!this._ready) return null
    const row = this._store.db.prepare(
      'SELECT * FROM model_providers WHERE category = ? AND is_default = 1'
    ).get(category)

    if (row) return this._safeRow(row)

    // 没有默认时，返回第一个已配置 API Key 的服务商
    const fallback = this._store.db.prepare(
      "SELECT * FROM model_providers WHERE category = ? AND api_key != '' ORDER BY name ASC LIMIT 1"
    ).get(category)

    return fallback ? this._safeRow(fallback) : null
  }

  /**
   * 测试连接（模拟）
   * @param {string} id
   * @returns {Promise<{ code: number, message?: string }>}
   */
  async testConnection (id) {
    if (!this._ready) return { code: -1, message: 'Store 未初始化' }

    const provider = this.getProviderWithKey(id)
    if (!provider) {
      return { code: -1, message: '服务商 "' + id + '" 不存在' }
    }

    if (!provider.api_key) {
      return { code: -1, message: '未配置 API Key，请先配置' }
    }

    // TODO: 实际连接测试（根据 category 调用不同 API）
    // 目前返回配置检查通过
    return { code: 0, message: provider.name + ' 配置有效（' + provider.base_url + '）' }
  }

  /**
   * 获取某类别可新增的预设列表（排除已添加的）
   * @param {string} category
   * @returns {Array}
   */
  getAvailablePresets (category) {
    if (!this._ready) return []

    const existingIds = new Set(
      this._store.db.prepare('SELECT id FROM model_providers')
        .all().map(r => r.id)
    )

    return PRESET_PROVIDERS
      .filter(p => p.category === category && !existingIds.has(p.id))
      .map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        base_url: p.base_url,
        models: p.models,
      }))
  }

  /**
   * 检查某类别是否有已配置的 provider（有 API Key）
   * @param {string} category
   * @returns {boolean}
   */
  isConfigured (category) {
    if (!this._ready) return false
    const row = this._store.db.prepare(
      "SELECT COUNT(*) as cnt FROM model_providers WHERE category = ? AND api_key != '' AND enabled = 1"
    ).get(category)
    return row && row.cnt > 0
  }

  /** 安全转换行数据（去除 api_key，解析 JSON 字段） */
  _safeRow (row) {
    if (!row) return null
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
