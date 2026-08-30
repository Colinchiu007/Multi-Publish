// @ts-check
/**
 * ops-center-sync.js — 运营后台 → 桌面端运行时同步（主进程）
 *
 * 1. 模型目录：/api/v1/model-presets/catalog（限流/模型/能力）→ ModelProviderManager.applyCatalog
 * 2. 运行时策略：/api/v1/runtime/bootstrap（公告 / 版本发布策略 / 内容安全敏感词 / 功能开关 / 平台发布元数据 / 官方内容模板 / 关键词监测目录）→ applyRuntime
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
const MAX_FEATURE_FLAGS = 100

/** 功能开关结构校验：仅接受 {key: 基本类型值}，超限/非法结构 fail-closed 返回空对象 */
function normalizeFeatureFlags(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  const entries = Object.entries(raw)
  if (entries.length > MAX_FEATURE_FLAGS) return {}
  for (const [k, v] of entries) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue
    if (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') {
      out[k] = v
    }
  }
  return out
}

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
    this._platformConfig = null
    this._templateManager = null
    this._keywordMonitor = null
  }

  /** 读取同步配置（apiKey 脱敏，不返回明文） */
  getConfig() {
    let raw
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
    let raw
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
    let raw
    try { raw = String(this._store?.getSetting ? this._store.getSetting(SETTING_KEY) || '' : '') } catch { raw = '' }
    let cfg = {}
    if (raw) { try { cfg = JSON.parse(raw) } catch { cfg = {} } }
    return cfg.apiKeyEnc || ''
  }

  // ─── 运行时策略（公告 / 版本发布 / 内容安全）────────────────

  _loadRuntimeState() {
    let raw
    try { raw = String(this._store?.getSetting ? this._store.getSetting(RUNTIME_SETTING_KEY) || '' : '') } catch { raw = '' }
    let state = {}
    if (raw) { try { state = JSON.parse(raw) } catch { state = {} } }
    return {
      announcements: Array.isArray(state.announcements) ? state.announcements : [],
      updatePolicy: state.updatePolicy || null,
      contentPolicy: state.contentPolicy || null,
      featureFlags: normalizeFeatureFlags(state.featureFlags),
      syncedAt: state.syncedAt || '',
    }
  }

  _saveRuntimeState() {
    try { this._store.setSetting(RUNTIME_SETTING_KEY, JSON.stringify(this._runtime)) } catch { /* 非关键 */ }
  }

  /** 运行时策略状态（公告/版本/内容安全）——IPC 暴露给渲染进程 */
  getRuntimeState() {
    const cp = this._runtime.contentPolicy
    // 敏感词库（word_list/replacement）仅保留在主进程，渲染端无需且最小权限
    return {
      announcements: this._runtime.announcements || [],
      updatePolicy: this._runtime.updatePolicy || null,
      contentPolicy: cp ? { name: cp.name, enabled: cp.enabled !== false, updatedAt: cp.updated_at || cp.updatedAt || '' } : null,
      featureFlags: this._runtime.featureFlags || {},
      syncedAt: this._runtime.syncedAt || '',
    }
  }

  /** 内容安全替换串（主进程消费；渲染端不返回） */
  getReplacement() {
    const cp = this._runtime.contentPolicy
    return (cp && cp.replacement) ? String(cp.replacement) : '***'
  }

  /** 目录同步 Key 明文（仅供内部上报/校验服务使用，不暴露给渲染进程） */
  getCatalogApiKey() {
    return this._readEncryptedKey()
  }

  /** 读取功能开关 typed value（主进程/引擎消费）；不存在返回 undefined */
  getFeatureFlag(key) {
    const flags = this._runtime.featureFlags || {}
    const k = String(key || '')
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return undefined
    return Object.prototype.hasOwnProperty.call(flags, k) ? flags[k] : undefined
  }

  /** 版本发布策略（auto-updater 消费） */
  getUpdatePolicy() {
    return this._runtime.updatePolicy || null
  }

  /** 设置更新策略消费者（bootstrap 注入 auto-updater 回调） */
  setUpdatePolicyConsumer(fn) {
    this._updatePolicyConsumer = typeof fn === 'function' ? fn : null
  }

  /** 注入平台配置加载器（phase1 接线）；无 applyRemote 的对象视为未注入 */
  setPlatformConfig(pc) {
    this._platformConfig = pc && typeof pc.applyRemote === 'function' ? pc : null
  }

  /** 注入内容模板管理器（phase1 接线）；无 applyRemote 的对象视为未注入 */
  setTemplateManager(tm) {
    this._templateManager = tm && typeof tm.applyRemote === 'function' ? tm : null
  }

  /** 注入关键词监测器（phase1 接线）；无 applyRemoteWatchlist 的对象视为未注入 */
  setKeywordMonitor(km) {
    this._keywordMonitor = km && typeof km.applyRemoteWatchlist === 'function' ? km : null
  }

  /** 应用运行时策略：公告缓存 + 敏感词重建 + 更新策略推送 */
  applyRuntime(payload) {
    if (!payload || typeof payload !== 'object') return
    const next = {
      announcements: Array.isArray(payload.announcements) ? payload.announcements : [],
      updatePolicy: payload.update_policy && typeof payload.update_policy === 'object' ? payload.update_policy : null,
      contentPolicy: payload.content_policy && typeof payload.content_policy === 'object' ? payload.content_policy : null,
      featureFlags: normalizeFeatureFlags(payload.feature_flags),
      syncedAt: payload.synced_at || new Date().toISOString(),
    }
    this._runtime = next
    this._sensitiveFilter = null // 触发惰性重建
    this._saveRuntimeState()
    if (this._updatePolicyConsumer) {
      try { this._updatePolicyConsumer(next.updatePolicy) } catch (e) { this._log.warn('OpsCenterSync', 'update policy consumer error: ' + e.message) }
    }
    // 平台发布元数据覆盖：注入 platformConfig 时应用；未注入跳过，不影响其他策略
    if (Array.isArray(payload.platform_defs) && this._platformConfig) {
      try {
        const n = this._platformConfig.applyRemote(payload.platform_defs)
        this._log.info('OpsCenterSync', `platform defs applied: ${n} platforms`)
      } catch (e) {
        this._log.warn('OpsCenterSync', 'platform defs apply error: ' + e.message)
      }
    }
    // 官方内容模板库覆盖：注入 templateManager 时应用；未注入跳过
    if (Array.isArray(payload.content_templates) && this._templateManager) {
      try {
        const n = this._templateManager.applyRemote(payload.content_templates)
        this._log.info('OpsCenterSync', `content templates applied: ${n} templates`)
      } catch (e) {
        this._log.warn('OpsCenterSync', 'content templates apply error: ' + String((e && e.message) || e))
      }
    }
    // 关键词监测目录覆盖：注入 keywordMonitor 时应用；未注入跳过
    if (Array.isArray(payload.keyword_watchlist) && this._keywordMonitor) {
      try {
        const n = this._keywordMonitor.applyRemoteWatchlist(payload.keyword_watchlist)
        this._log.info('OpsCenterSync', `keyword watchlist applied: ${n} entries`)
      } catch (e) {
        this._log.warn('OpsCenterSync', 'keyword watchlist apply error: ' + String((e && e.message) || e))
      }
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
    // baseUrl 参数保留签名兼容；实际 URL 由 _fetchJson 从 getConfig().url 读取
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
      throw new Error(isTimeout ? '同步请求超时（10 秒）' : '无法连接 Ops Center: ' + (e.message || e.name), { cause: e })
    } finally {
      if (timer) clearTimeout(timer)
    }
    if (resp.status === 401 || resp.status === 403) throw new Error('Ops Center API Key 无效（401/403）')
    if (resp.status === 404) throw new Error('Ops Center 未启用运营同步（404，需配置 OPS_CATALOG_API_KEY）')
    if (!resp.ok) throw new Error('Ops Center 返回 HTTP ' + resp.status)
    const buffer = Buffer.from(await resp.arrayBuffer())
    if (buffer.length > MAX_CATALOG_BYTES) throw new Error('运营同步响应超过 1MB，已拒绝')
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
