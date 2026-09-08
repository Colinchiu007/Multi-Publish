// @ts-check
/**
 * RewriteStrategyManager - 改写策略运行时管理器
 *
 * 管理运营中心下发的改写策略（rewrite_strategies），并持久化到本地 JSON。
 * 内置策略由 @multi-publish/rewrite-engine 的 BUILTIN_STRATEGIES 提供，
 * 远程下发的策略通过 applyRemote 合并；缺席即移除（仿 template-manager）。
 *
 * Storage: JSON file (userData/rewrite-strategies.json)
 */

const fs = require("fs")
const path = require("path")
const { app } = require("electron")
const log = require("./logger")
const { BUILTIN_STRATEGIES } = require("@multi-publish/rewrite-engine")

const MAX_REMOTE_STRATEGIES = 200

const REMOTE_KEYS = [
  "name", "description", "version", "category", "industry", "purpose",
  "tone", "platforms", "systemPrompt", "userPromptTemplate", "postProcess",
  "metadata", "sort_order", "enabled",
]

/** 远程策略类型自防御：类型不符/超限返回 null（跳过），否则返回安全字段子集 */
function sanitizeRemoteStrategy (s) {
  if (!s || typeof s !== "object") return null
  const out = {}
  const strField = (k, maxLen, required) => {
    const v = s[k]
    if (v === undefined || v === null) return required ? null : undefined
    if (typeof v !== "string") return null
    const str = v.trim()
    if (str.length > maxLen) return null
    return str
  }
  const name = strField("name", 200, true)
  if (name === null) return null
  out.name = name
  const id = String(s.id || "").trim()
  if (!id || id.length > 100 || !/^[a-z0-9_-]{1,100}$/.test(id)) return null
  out.id = id

  const description = strField("description", 2000, false)
  if (description === null) return null
  if (description !== undefined) out.description = description
  const version = strField("version", 20, false)
  if (version === null) return null
  if (version !== undefined) out.version = version
  const category = strField("category", 40, false)
  if (category === null) return null
  if (category !== undefined && !["viral", "marketing", "platform", "style"].includes(category)) return null
  if (category !== undefined) out.category = category

  const systemPrompt = strField("systemPrompt", 5000, false)
  if (systemPrompt === null) return null
  if (systemPrompt !== undefined) out.systemPrompt = systemPrompt
  const userPromptTemplate = strField("userPromptTemplate", 10000, false)
  if (userPromptTemplate === null) return null
  if (userPromptTemplate !== undefined) out.userPromptTemplate = userPromptTemplate

  const strArray = (k, maxLen) => {
    const v = s[k]
    if (v === undefined || v === null) return undefined
    if (!Array.isArray(v) || v.length > 50) return null
    const arr = []
    for (const item of v) {
      if (typeof item !== "string" || !item.trim()) return null
      const str = item.trim()
      if (str.length > maxLen) return null
      arr.push(str)
    }
    return arr
  }
  const industry = strArray("industry", 200)
  const purpose = strArray("purpose", 200)
  const tone = strArray("tone", 200)
  const platforms = strArray("platforms", 200)
  if (industry === null || purpose === null || tone === null || platforms === null) return null
  if (industry !== undefined) out.industry = industry
  if (purpose !== undefined) out.purpose = purpose
  if (tone !== undefined) out.tone = tone
  if (platforms !== undefined) out.platforms = platforms

  const objField = (k) => {
    const v = s[k]
    if (v === undefined || v === null) return undefined
    if (typeof v === "object" && !Array.isArray(v)) return v
    return null
  }
  const postProcess = objField("postProcess")
  const metadata = objField("metadata")
  if (postProcess === null || metadata === null) return null
  if (postProcess !== undefined) out.postProcess = postProcess
  if (metadata !== undefined) out.metadata = metadata

  if (s.sort_order !== undefined && s.sort_order !== null) {
    if (!Number.isInteger(s.sort_order) || s.sort_order < 0) return null
    out.sort_order = s.sort_order
  }
  if (s.enabled === true || s.enabled === false) out.enabled = s.enabled
  return out
}

class RewriteStrategyManager {
  constructor(dataPath) {
    this._dataPath = dataPath || path.join(app.getPath("userData"), "rewrite-strategies.json")
    this._remote = []
    this._loaded = false
  }

  load() {
    try {
      if (fs.existsSync(this._dataPath)) {
        this._remote = JSON.parse(fs.readFileSync(this._dataPath, "utf-8"))
        if (!Array.isArray(this._remote)) this._remote = []
      }
    } catch (e) {
      log.warn("RewriteStrategyManager", "Failed to load: " + e.message)
    }
    this._loaded = true
  }

  save() {
    try {
      const dir = path.dirname(this._dataPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const tmpPath = this._dataPath + ".tmp"
      fs.writeFileSync(tmpPath, JSON.stringify(this._remote, null, 2), "utf-8")
      fs.renameSync(tmpPath, this._dataPath)
    } catch (e) {
      log.warn("RewriteStrategyManager", "Failed to save: " + e.message)
    }
  }

  /**
   * 应用运营中心下发的改写策略（运行时下发）
   * @param {Array<object>|null|undefined} strategies - 远程策略列表
   * @returns {number} 实际更新/新增/移除数
   */
  applyRemote(strategies) {
    if (!Array.isArray(strategies)) return 0
    if (strategies.length > MAX_REMOTE_STRATEGIES) return 0
    if (!this._loaded) this.load()
    const remoteIds = new Set()
    const seen = new Set()
    let updated = 0
    for (const s of strategies) {
      if (!s || typeof s !== "object") continue
      const id = String(s.id || "").trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      const safe = sanitizeRemoteStrategy(s)
      if (!safe) continue
      remoteIds.add(id)
      const existing = this._remote.find((x) => x.id === id)
      if (existing) {
        let changed = false
        for (const k of REMOTE_KEYS) {
          const v = safe[k]
          if (v === undefined) continue
          const same = Array.isArray(existing[k]) && Array.isArray(v)
            ? JSON.stringify(existing[k]) === JSON.stringify(v)
            : JSON.stringify(existing[k]) === JSON.stringify(v)
          if (!same) {
            existing[k] = v
            changed = true
          }
        }
        if (changed) {
          existing.updatedAt = new Date().toISOString()
          updated++
        }
      } else {
        const copy = {}
        for (const k of REMOTE_KEYS) {
          if (safe[k] !== undefined) copy[k] = safe[k]
        }
        copy.id = id
        copy.builtin = false
        copy.source = "remote"
        copy.createdAt = new Date().toISOString()
        copy.updatedAt = new Date().toISOString()
        this._remote.push(copy)
        updated++
      }
    }
    // 缺席即移除
    if (strategies.length > 0 && remoteIds.size > 0) {
      const before = this._remote.length
      this._remote = this._remote.filter((x) => !(x.source === "remote" && !remoteIds.has(x.id)))
      if (this._remote.length !== before) updated++
    }
    if (updated > 0) this.save()
    return updated
  }

  /** 内置策略（来自 rewrite-engine 包） */
  listBuiltins() {
    return BUILTIN_STRATEGIES.map((s) => ({ ...s, builtin: true, source: "builtin" }))
  }

  /** 合并内置 + 远程，返回启用的策略 */
  listEnabled() {
    if (!this._loaded) this.load()
    const merged = new Map()
    for (const s of this.listBuiltins()) merged.set(s.id, s)
    for (const s of this._remote) merged.set(s.id, s)
    return Array.from(merged.values())
      .filter((s) => s.enabled !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  }

  /** 按 id 获取策略（含内置） */
  get(id) {
    if (!this._loaded) this.load()
    for (const s of this.listEnabled()) {
      if (s.id === id) return s
    }
    return null
  }

  /** 仅返回远程下发的策略（用于注入引擎 StrategyManager 合并） */
  listRemote() {
    if (!this._loaded) this.load()
    return this._remote.map((s) => ({ ...s }))
  }
}

RewriteStrategyManager.MAX_REMOTE_STRATEGIES = MAX_REMOTE_STRATEGIES

module.exports = RewriteStrategyManager
