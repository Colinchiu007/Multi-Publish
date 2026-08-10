// @ts-check
/**
 * ops-center-sync.js — 运营后台 → 桌面端运行时同步（主进程）
 *
 * 1. 模型目录：/api/v1/model-presets/catalog（限流/模型/能力）→ ModelProviderManager.applyCatalog
 * 2. 运行时策略：/api/v1/runtime/bootstrap（公告 / 版本发布策略 / 内容安全敏感词）→ applyRuntime
 *
 * 安全：
 *   - API Key 经 safeStorage 加密后存 settings（不落明文）
 *   - URL 必须 http(s)（非本机回环强制 https）；禁重定向；10s 超时；响应 ≤1MB
 *   - 目录/运行时结构校验失败 fail-closed（不写本地）
 */
'use strict'

const crypto = require('./crypto')

const SETTING_KEY = 'opsCenterSync'
const RUNTIME_SETTING_KEY = 'opsCenterRuntime'
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
    // 运行时策略状态（公告/版本发布/内容安全），启动时从 settings 恢复
    this._runtime = this._loadRuntimeState()
    this._sensitiveFilter = null
    this._updatePolicyConsumer = null
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

  /** 立即同步：拉取目录 → applyCatalog → 运行时策略 → 更新 lastSyncedAt（in-flight 互斥） */
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

    // 运行时策略（公告/版本发布/内容安全）best-effort 拉取：失败仅 warn，不影响目录同步结果
    let runtimeApplied = false
    let runtimeSyncedAt = ''
    try {
      const runtime = await this._fetchRuntime(cfg.url, this._readEncryptedKey())
      this.applyRuntime(runtime)
      runtimeApplied = true
      runtimeSyncedAt = runtime.synced_at || ''
    } catch (e) {
      this._log.warn('OpsCenterSync', 'runtime sync skipped: ' + e.message)
    }

    this._log.info('OpsCenterSync', `catalog synced: ${result.updated} providers (at ${nowIso})`)
    return { code: 0, updated: result.updated, syncedAt: nowIso, runtimeApplied, runtimeSyncedAt }
  }

  _getStoredKeyEnc() {
    let raw = ''
    try { raw = String(this._store?.getSetting ? this._store.getSetting(SETTING_KEY) || '' : '') } catch { raw = '' }
    let cfg = {}
    if (raw) { try { cfg = JSON.parse(raw) } catch { cfg = {} } }
    return cfg.apiKeyEnc || ''
  }

  // ─── 运行时策略（公告 / 版本发布 / 内容安全）────────────────

  _loadRuntimeState() {
    let raw = ''
    try { raw = String(this._store?.getSetting ? this._store.getSetting(RUNTIME_SETTING_KEY) || '' : '') } catch { raw = '' }
    let state = {}
    if (raw) { try { state = JSON.parse(raw) } catch { state = {} } }
    return {
      announcements: Array.isArray(state.announcements) ? state.announcements : [],
      updatePolicy: state.updatePolicy || null,
      contentPolicy: state.contentPolicy || null,
      syncedAt: state.syncedAt || '',
    }
  }

  _saveRuntimeState() {
    try { this._store.setSetting(RUNTIME_SETTING_KEY, JSON.stringify(this._runtime)) } catch { /* 非关键 */ }
  }

  /** 运行时策略状态（公告/版本/内容安全）——IPC 暴露给渲染进程 */
  getRuntimeState() {
    return {
      announcements: this._runtime.announcements || [],
      updatePolicy: this._runtime.updatePolicy || null,
      contentPolicy: this._runtime.contentPolicy || null,
      syncedAt: this._runtime.syncedAt || '',
    }
  }

  /** 版本发布策略（auto-updater 消费） */
  getUpdatePolicy() {
    return this._runtime.updatePolicy || null
  }

  /** 设置更新策略消费者（bootstrap 注入 auto-updater 回调） */
  setUpdatePolicyConsumer(fn) {
    this._updatePolicyConsumer = typeof fn === 'function' ? fn : null
  }

  /** 应用运行时策略：公告缓存 + 敏感词重建 + 更新策略推送 */
  applyRuntime(payload) {
    if (!payload || typeof payload !== 'object') return
    const next = {
      announcements: Array.isArray(payload.announcements) ? payload.announcements : [],
      updatePolicy: payload.update_policy && typeof payload.update_policy === 'object' ? payload.update_policy : null,
      contentPolicy: payload.content_policy && typeof payload.content_policy === 'object' ? payload.content_policy : null,
      syncedAt: payload.synced_at || new Date().toISOString(),
    }
    this._runtime = next
    this._sensitiveFilter = null // 触发惰性重建
    this._saveRuntimeState()
    if (this._updatePolicyConsumer) {
      try { this._updatePolicyConsumer(next.updatePolicy) } catch (e) { this._log.warn('OpsCenterSync', 'update policy consumer error: ' + e.message) }
    }
    this._log.info('OpsCenterSync', `runtime applied: ${next.announcements.length} announcements, policy=${next.updatePolicy ? 'set' : 'none'}`)
  }

  /** 敏感词过滤器：内置词库 + 远程内容安全策略词库（惰性构建） */
  getSensitiveFilter() {
    if (this._sensitiveFilter) return this._sensitiveFilter
    const words = []
    let SensitiveFilterClass = null
    try {
      SensitiveFilterClass = require('@multi-publish/shared-utils/src/sensitive-filter')
      if (SensitiveFilterClass.getBuiltinWords) words.push(...SensitiveFilterClass.getBuiltinWords())
    } catch { /* 内置词库不可用时降级为空词库 */ }
    const policy = this._runtime.contentPolicy
    if (policy && policy.enabled !== false && Array.isArray(policy.word_list)) {
      for (const w of policy.word_list) {
        if (typeof w === 'string' && w.trim()) words.push(w.trim())
      }
    }
    this._sensitiveFilter = SensitiveFilterClass ? new SensitiveFilterClass(Array.from(new Set(words))) : null
    return this._sensitiveFilter
  }

  // ─── 拉取 ───────────────────────────────────────────────

  async _fetchCatalog(baseUrl, apiKey) {
    const data = await this._fetchJson('/api/v1/model-presets/catalog', apiKey)
    if (!data || !Array.isArray(data.items)) throw new Error('目录响应结构错误（缺少 items 数组）')
    return data.items
  }

  async _fetchRuntime(baseUrl, apiKey) {
    const data = await this._fetchJson('/api/v1/runtime/bootstrap', apiKey)
    if (!data || !Array.isArray(data.announcements)) throw new Error('运行时策略响应结构错误（缺少 announcements 数组）')
    return data
  }

  async _fetchJson(path, apiKey) {
    const base = String(this.getConfig().url || '').replace(/\/+$/, '')
    const url = base + path
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
    return data
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
