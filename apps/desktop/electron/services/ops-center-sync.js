// @ts-check
/**
 * ops-center-sync.js — 运营后台 → 桌面端模型配置运行时同步（主进程）
 *
 * 拉取 ops-center 只读目录（/api/v1/model-presets/catalog，X-Catalog-Key 鉴权），
 * 通过 ModelProviderManager.applyCatalog 把运营配置（限流/模型/能力）写入本地
 * model_providers config，随后重应用 governor 预算。前端限流/模型字段改为只读。
 *
 * 安全：
 *   - API Key 经 safeStorage 加密后存 settings（不落明文）
 *   - URL 必须 http(s)（非本机回环强制 https）；禁重定向；10s 超时；响应 ≤1MB
 *   - 目录结构校验失败 fail-closed（不写本地）
 */
'use strict'

const crypto = require('./crypto')

const SETTING_KEY = 'opsCenterSync'
const MAX_CATALOG_BYTES = 1024 * 1024
const SYNC_TIMEOUT_MS = 10 * 1000

function normalizeUrl(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  let parsed
  try { parsed = new URL(text) } catch { return '' }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
  if (parsed.username || parsed.password) return ''
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const isLoopback = host === 'localhost' || host === '::1' || /^127\./.test(host)
  if (!isLoopback && parsed.protocol !== 'https:') return ''
  return parsed.toString().replace(/\/+$/, '')
}

class OpsCenterSync {
  constructor({ store, modelProviderManager, log }) {
    this._store = store
    this._manager = modelProviderManager
    this._log = log || { info() {}, warn() {}, error() {} }
  }

  /** 读取同步配置（apiKey 脱敏，不返回明文） */
  getConfig() {
    let raw = ''
    try { raw = this._store?.getSetting ? String(this._store.getSetting(SETTING_KEY) || '') : '' } catch { raw = '' }
    let cfg = {}
    if (raw) { try { cfg = JSON.parse(raw) } catch { cfg = {} } }
    return {
      url: cfg.url || '',
      apiKeyConfigured: !!(cfg.apiKeyEnc),
      autoSync: cfg.autoSync !== false,
      lastSyncedAt: cfg.lastSyncedAt || '',
    }
  }

  /** 保存同步配置；apiKey 为空 = 保留现有 Key */
  saveConfig({ url, apiKey, autoSync }) {
    const current = this.getConfig()
    const cleanUrl = normalizeUrl(url)
    if (url && !cleanUrl) {
      return { code: -1, message: 'Ops Center 地址必须是 http(s) URL（非本机地址强制 https）' }
    }
    // apiKey 为空时透传已有密文（绝不解密后回写，避免明文落盘/解密失败抹 Key）
    let apiKeyEnc = this._getStoredKeyEnc()
    if (apiKey) {
      if (!crypto.isAvailable()) return { code: -1, message: '系统加密不可用，无法安全保存 API Key' }
      apiKeyEnc = crypto.encrypt(String(apiKey)).toString('base64')
    }
    const cfg = {
      url: cleanUrl,
      apiKeyEnc,
      autoSync: autoSync !== false,
      lastSyncedAt: current.lastSyncedAt || '',
    }
    try {
      this._store.setSetting(SETTING_KEY, JSON.stringify(cfg))
      return { code: 0, config: this.getConfig() }
    } catch (e) {
      return { code: -1, message: '保存同步配置失败: ' + e.message }
    }
  }

  _readEncryptedKey() {
    let raw = ''
    try { raw = String(this._store?.getSetting ? this._store.getSetting(SETTING_KEY) || '' : '') } catch { raw = '' }
    let cfg = {}
    if (raw) { try { cfg = JSON.parse(raw) } catch { cfg = {} } }
    if (!cfg.apiKeyEnc) return ''
    try { return crypto.decrypt(cfg.apiKeyEnc) } catch { return '' }
  }

  /** 立即同步：拉取目录 → applyCatalog → 更新 lastSyncedAt（in-flight 互斥，防手动/自动并发） */
  async syncNow() {
    if (this._syncing) return { code: -1, message: '同步正在进行中，请稍候' }
    this._syncing = true
    try {
      return await this._syncNowInner()
    } finally {
      this._syncing = false
    }
  }

  async _syncNowInner() {
    const cfg = this.getConfig()
    if (!cfg.url) return { code: -1, message: '未配置 Ops Center 地址' }
    if (!cfg.apiKeyConfigured) return { code: -1, message: '未配置 Ops Center API Key' }
    if (!this._manager || typeof this._manager.applyCatalog !== 'function') {
      return { code: -1, message: '模型服务未就绪' }
    }

    let items
    try {
      items = await this._fetchCatalog(cfg.url, this._readEncryptedKey())
    } catch (e) {
      return { code: -1, message: e.message }
    }

    const result = this._manager.applyCatalog(items)
    if (result.code !== 0) return result

    // 更新 lastSyncedAt
    const nowIso = new Date().toISOString()
    const updated = { url: cfg.url, apiKeyEnc: this._getStoredKeyEnc(), autoSync: cfg.autoSync, lastSyncedAt: nowIso }
    try { this._store.setSetting(SETTING_KEY, JSON.stringify(updated)) } catch { /* 非关键 */ }

    this._log.info('OpsCenterSync', `catalog synced: ${result.updated} providers (at ${nowIso})`)
    return { code: 0, updated: result.updated, syncedAt: nowIso }
  }

  _getStoredKeyEnc() {
    let raw = ''
    try { raw = String(this._store?.getSetting ? this._store.getSetting(SETTING_KEY) || '' : '') } catch { raw = '' }
    let cfg = {}
    if (raw) { try { cfg = JSON.parse(raw) } catch { cfg = {} } }
    return cfg.apiKeyEnc || ''
  }

  async _fetchCatalog(baseUrl, apiKey) {
    const url = baseUrl + '/api/v1/model-presets/catalog'
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS) : null
    let resp
    try {
      resp = await fetch(url, {
        headers: { 'X-Catalog-Key': apiKey, Accept: 'application/json' },
        redirect: 'error',
        signal: controller?.signal,
      })
    } catch (e) {
      const isTimeout = e && (e.name === 'AbortError' || e.code === 'ABORT_ERR')
      throw new Error(isTimeout ? '同步请求超时（10 秒）' : '无法连接 Ops Center: ' + (e.message || e.name))
    } finally {
      if (timer) clearTimeout(timer)
    }
    if (resp.status === 401 || resp.status === 403) throw new Error('Ops Center API Key 无效（401/403）')
    if (resp.status === 404) throw new Error('Ops Center 未启用目录同步（404，需配置 OPS_CATALOG_API_KEY）')
    if (!resp.ok) throw new Error('Ops Center 返回 HTTP ' + resp.status)
    const buffer = Buffer.from(await resp.arrayBuffer())
    if (buffer.length > MAX_CATALOG_BYTES) throw new Error('目录响应超过 1MB，已拒绝')
    let data
    try { data = JSON.parse(buffer.toString('utf-8')) } catch { throw new Error('目录响应不是合法 JSON') }
    if (!data || !Array.isArray(data.items)) throw new Error('目录响应结构错误（缺少 items 数组）')
    return data.items
  }

  /** 启动时 best-effort 自动同步（不阻塞启动；失败仅日志） */
  async autoSyncOnStart() {
    try {
      const cfg = this.getConfig()
      if (!cfg.autoSync || !cfg.url || !cfg.apiKeyConfigured) return
      setTimeout(() => {
        this.syncNow().then((r) => {
          if (r.code !== 0) this._log.warn('OpsCenterSync', 'auto sync skipped: ' + r.message)
        }).catch((e) => this._log.warn('OpsCenterSync', 'auto sync error: ' + e.message))
      }, 3000)
    } catch (e) {
      this._log.warn('OpsCenterSync', 'auto sync init error: ' + e.message)
    }
  }
}

module.exports = { OpsCenterSync, normalizeUrl }