// @ts-check
/**
 * RewriteAiTasteMapManager - 去 AI 味词库运行时管理器（ai-taste-ops-center 刀 2）
 *
 * 管理运营中心下发的词库覆盖层（runtime/bootstrap 的 rewrite_ai_taste_map 字段），
 * 持久化到本地 JSON。语义（Q2/Q7 定案）：**叠加 + 键覆盖**——引擎内置 117 条词表是
 * 安全底线，本表同键覆盖替换方向；enabled=false 的条目进禁用表（引擎跳过该词替换，
 * 含禁用内置词）。getMap()/getDisabled() 为引擎注入形态。
 *
 * Storage: JSON file (userData/rewrite-ai-taste-map.json)
 */

const fs = require("fs")
const path = require("path")
const { app } = require("electron")
const log = require("./logger")

/** 与 ops-center 后端校验同判据（check-gate：双侧同表，改一侧必须同步另一侧） */
const MAX_WORD_LENGTH = 30
const MAX_REPLACEMENT_LENGTH = 50
const SEVERITY_ENUM = ["S1", "S2", "S3"]

// 控制字符检测（\x00-\x1f\x7f）：本文件校验逻辑的**目的**就是拒绝控制字符，
// 规则本身含控制字符类是有意为之——eslint-disable 行内豁免（no-control-regex）。
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x1f\x7f]/
// 纯标点/符号区段（与 ops-center _PUNCT_ONLY_RE 同域）：拒绝纯标点词目（语义风险）
const PUNCT_ONLY_RE = /^[\s\u2000-\u206f\u2e00-\u2e7f\u3000-\u303f\uff00-\uffef!-/:-@[-`{-~]+$/
const REGEX_META_SINGLE = new Set(".$*+?()[]{}|\\/".split(""))

/**
 * 码点计数（评审 I3）：与 Python len() 对齐——JS .length 按 UTF-16 码元，
 * 含代理对（emoji）的词目两端口径会分叉（后端通过、桌面端静默拒收）。
 * @param {string} s
 * @returns {number}
 */
function codePointLength (s) {
  return [...s].length
}

/**
 * 远程条目类型自防御：类型不符/判据不过返回 null（跳过该条，不影响其他条目）。
 * @param {unknown} item
 * @returns {{word:string, replacement:string, severity:string, enabled:boolean}|null}
 */
function sanitizeRemoteEntry (item) {
  if (!item || typeof item !== "object") return null
  const raw = /** @type {any} */ (item)
  if (typeof raw.word !== "string") return null
  if (CONTROL_RE.test(raw.word)) return null
  const word = raw.word.trim()
  if (!word || codePointLength(word) > MAX_WORD_LENGTH) return null
  if (PUNCT_ONLY_RE.test(word) || (codePointLength(word) === 1 && REGEX_META_SINGLE.has(word))) return null
  if (typeof raw.replacement !== "string") return null
  if (CONTROL_RE.test(raw.replacement)) return null
  const replacement = raw.replacement.trim()
  if (!replacement || codePointLength(replacement) > MAX_REPLACEMENT_LENGTH) return null
  // severity 明确下发但非法 → 拒绝（与 ops-center 400 语义一致；缺省才回 S2）
  if (raw.severity !== undefined && !SEVERITY_ENUM.includes(raw.severity)) return null
  const severity = typeof raw.severity === "string" && SEVERITY_ENUM.includes(raw.severity) ? raw.severity : "S2"
  const enabled = raw.enabled !== false
  return { word, replacement, severity, enabled }
}

class RewriteAiTasteMapManager {
  constructor(dataPath) {
    this._dataPath = dataPath || path.join(app.getPath("userData"), "rewrite-ai-taste-map.json")
    /** @type {Array<{word:string, replacement:string, severity:string, enabled:boolean}>} */
    this._entries = []
    this._loaded = false
  }

  load() {
    try {
      if (fs.existsSync(this._dataPath)) {
        const parsed = JSON.parse(fs.readFileSync(this._dataPath, "utf-8"))
        if (Array.isArray(parsed)) {
          this._entries = /** @type {any[]} */ (parsed)
            .map((e) => sanitizeRemoteEntry(e))
            .filter(Boolean)
        }
      }
    } catch (e) {
      log.warn("RewriteAiTasteMapManager", "Failed to load: " + e.message)
    }
    this._loaded = true
  }

  save() {
    try {
      const dir = path.dirname(this._dataPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const tmpPath = this._dataPath + ".tmp"
      fs.writeFileSync(tmpPath, JSON.stringify(this._entries, null, 2), "utf-8")
      fs.renameSync(tmpPath, this._dataPath)
    } catch (e) {
      log.warn("RewriteAiTasteMapManager", "Failed to save: " + e.message)
    }
  }

  /**
   * 应用运营中心下发的词库覆盖层（全量替换语义：下发即当前覆盖层全貌）。
   * word 去重（评审 W1）：逐条 sanitize 后按 word 去重（后者保留，与 getMap 遍历覆盖顺序一致），
   * 防重复 word 导致 changed 判定失真与 getMap/getSeverityMap 输出顺序依赖。
   * @param {Array|null} payload - bootstrap 的 rewrite_ai_taste_map 字段
   * @returns {boolean} 是否更新（内容变化时 true）
   */
  applyRemote(payload) {
    if (!this._loaded) this.load()
    if (!Array.isArray(payload)) return false
    const byWord = new Map()
    for (const e of payload) {
      const safe = sanitizeRemoteEntry(e)
      if (!safe) continue
      if (byWord.has(safe.word)) {
        log.warn("RewriteAiTasteMapManager", "duplicate word in payload, keeping last: " + safe.word)
      }
      byWord.set(safe.word, safe)
    }
    const safe = [...byWord.values()]
    const changed = !this._entriesEqual(this._entries, safe)
    if (changed) {
      this._entries = safe
      this.save()
    }
    return changed
  }

  /**
   * 条目集相等判定（word 为键：word/替换/严重度/启用全同才算不变；顺序无关）。
   * @param {Array<{word:string, replacement:string, severity:string, enabled:boolean}>} a
   * @param {Array<{word:string, replacement:string, severity:string, enabled:boolean}>} b
   * @returns {boolean}
   */
  _entriesEqual(a, b) {
    if (a.length !== b.length) return false
    const keyOf = (e) => JSON.stringify([e.word, e.replacement, e.severity, e.enabled])
    const setA = new Set(a.map(keyOf).sort())
    const setB = new Set(b.map(keyOf).sort())
    if (setA.size !== setB.size) return false
    for (const v of setA) {
      if (!setB.has(v)) return false
    }
    return true
  }

  /**
   * 获取替换覆盖层（注入引擎用，plain object）：仅 enabled=1 条目。
   * @returns {Object<string, string>}
   */
  getMap() {
    if (!this._loaded) this.load()
    /** @type {Object<string, string>} */
    const out = {}
    for (const e of this._entries) {
      if (e.enabled) out[e.word] = e.replacement
    }
    return out
  }

  /**
   * 获取禁用表（注入引擎用）：enabled=0 的 word 列表（引擎跳过这些词的替换，含内置词）。
   * @returns {string[]}
   */
  getDisabled() {
    if (!this._loaded) this.load()
    return this._entries.filter((e) => !e.enabled).map((e) => e.word)
  }

  /**
   * 获取严重度覆盖表（注入引擎评分用）：word → severity。
   * @returns {Object<string, string>}
   */
  getSeverityMap() {
    if (!this._loaded) this.load()
    /** @type {Object<string, string>} */
    const out = {}
    for (const e of this._entries) {
      out[e.word] = e.severity
    }
    return out
  }

  /** 获取当前全量条目（诊断/测试用） */
  getCurrent() {
    if (!this._loaded) this.load()
    return this._entries.map((e) => ({ ...e }))
  }
}

RewriteAiTasteMapManager.sanitizeRemoteEntry = sanitizeRemoteEntry
RewriteAiTasteMapManager.MAX_WORD_LENGTH = MAX_WORD_LENGTH
RewriteAiTasteMapManager.MAX_REPLACEMENT_LENGTH = MAX_REPLACEMENT_LENGTH

module.exports = RewriteAiTasteMapManager
