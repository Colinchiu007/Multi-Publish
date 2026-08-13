// @ts-check
/**
 * prompt-memory.js — 提示词记忆库 V0（library.json 索引 + templates/<id>@<version>.json 版本化存储）
 *
 * 规格：openspec/changes/prompt-engine-evolution-p1b-memory/specs/prompt-engine-evolution/spec.md
 * 契约铁律：纯同步、零外部依赖；原子写（临时文件+rename，EPERM/EACCES/EBUSY 有界重试）；
 * 损坏库 fail-close 重建；fingerprint 缺失 fail-close 不参与检索；dictVersion 不匹配以 sourceText 惰性重算。
 * 版本化优先级（m9）：checksum 完全碰撞→拒绝；同 learnedFrom + 指纹相似→升版；否则新 id。
 */

'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { ERROR } = require('../../core/error-codes')
const { ENGINES, MODES } = require('./schema')
const { buildFingerprint, DICT_VERSION, SCHEMA_VERSION, score: fingerprintScore } = require('./fingerprint')
const { createGovernance, TEMPLATE_TYPES } = require('./governance')

const MAX_SOURCE_TEXT = 2000
const LIBRARY_SCHEMA_VERSION = 1

const silentLog = { info: () => {}, warn: () => {}, error: () => {} }

/** 原子写：临时文件 + rename；Windows 上 EPERM/EACCES/EBUSY 有界退避重试，其余错误原样抛出 */
function writeAtomicSync (file, data) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, '.' + path.basename(file) + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'))
  fs.writeFileSync(tmp, data, 'utf8')
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, file)
      return
    } catch (e) {
      if ((e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY') && attempt < 3) {
        const until = Date.now() + 50 * (attempt + 1)
        while (Date.now() < until) { /* bounded backoff */ }
        continue
      }
      try { fs.rmSync(tmp, { force: true }) } catch (_) { void _ }
      throw e
    }
  }
}

function canonicalJson (value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  const keys = Object.keys(value).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}'
}

function checksumOf (content) {
  return crypto.createHash('sha256').update(canonicalJson(content)).digest('hex')
}

function newTemplateId () {
  return 'tpl_' + crypto.randomBytes(8).toString('hex')
}

function isValidFingerprint (fp) {
  return !!fp && typeof fp === 'object' &&
    fp.schemaVersion === SCHEMA_VERSION &&
    typeof fp.dictVersion === 'string' &&
    Array.isArray(fp.domains) && Array.isArray(fp.compositionIntents) && Array.isArray(fp.topics) &&
    typeof fp.tone === 'string'
}

/** 指纹相似：score 非 NONE（同 learnedFrom 升版判据） */
function fingerprintSimilar (a, b) {
  return fingerprintScore(a, b).tier !== 'NONE'
}

/**
 * @param {object} opts
 * @param {string} opts.libraryRoot - userData/prompt-library
 * @param {object} opts.governance - createGovernance 实例（runGates/canTransition/checkRollback）
 * @param {(templateId: string) => (object|null)} [opts.statsProvider]
 * @param {object} [opts.config] - { maxSourceText?: number }
 * @param {object} [opts.log]
 */
function createPromptMemory (opts) {
  const libraryRoot = opts.libraryRoot
  const governance = opts.governance || createGovernance({ log: opts.log || silentLog })
  const statsProvider = opts && typeof opts.statsProvider === 'function' ? opts.statsProvider : null
  const maxSourceText = (opts.config && opts.config.maxSourceText) || MAX_SOURCE_TEXT
  const log = (opts && opts.log) || silentLog

  let index = emptyIndex()
  /** @type {Map<string, Map<number, object>>} */
  const records = new Map()
  /** fingerprint 缺失/dictVersion 无法重算的模板 id（fail-close 不参与检索） */
  const staleIds = new Set()

  function emptyIndex () {
    return { schemaVersion: LIBRARY_SCHEMA_VERSION, dictVersion: DICT_VERSION, items: {} }
  }

  function libraryFile () { return path.join(libraryRoot, 'library.json') }
  function templateFile (id, version) { return path.join(libraryRoot, 'templates', id + '@' + version + '.json') }

  function itemOf (id) { return index.items[id] || null }
  function recordOf (id, version) {
    const versions = records.get(id)
    return versions ? (versions.get(version) || null) : null
  }
  function latestOf (id) {
    const item = itemOf(id)
    if (!item) return null
    return recordOf(id, item.latestVersion)
  }

  function setRecord (id, version, rec) {
    let versions = records.get(id)
    if (!versions) { versions = new Map(); records.set(id, versions) }
    versions.set(version, rec)
  }

  function writeIndex () {
    writeAtomicSync(libraryFile(), JSON.stringify(index, null, 2))
  }

  function writeTemplate (rec) {
    writeAtomicSync(templateFile(rec.id, rec.version), JSON.stringify(rec, null, 2))
  }

  function touchIndexItem (rec) {
    const item = itemOf(rec.id)
    item.state = rec.state
    item.updatedAt = rec.updatedAt
  }

  function nowIso () { return new Date().toISOString() }

  /** 合并注入 statsProvider 的实时聚合（无 provider 时回退模板存储 stats） */
  function mergedStats (rec) {
    const stored = (rec && rec.stats) || {}
    if (!statsProvider) return Object.assign({ uses: 0, acceptRate: 0, avgScore: null, avgCost: 0, lastUsedAt: null }, stored)
    const live = statsProvider(rec.id)
    if (!live || typeof live !== 'object') return Object.assign({ uses: 0, acceptRate: 0, avgScore: null, avgCost: 0, lastUsedAt: null }, stored)
    return {
      uses: typeof live.uses === 'number' ? live.uses : (stored.uses || 0),
      acceptRate: typeof live.acceptRate === 'number' ? live.acceptRate : (stored.acceptRate || 0),
      avgScore: live.avgScore != null ? live.avgScore : (stored.avgScore != null ? stored.avgScore : null),
      avgCost: typeof live.avgCost === 'number' ? live.avgCost : (stored.avgCost || 0),
      lastUsedAt: live.lastUsedAt != null ? live.lastUsedAt : (stored.lastUsedAt != null ? stored.lastUsedAt : null),
    }
  }

  /** 库内 active 模板的 checksum 集合（dedup 门禁数据源） */
  function activeChecksums () {
    const out = []
    for (const id of records.keys()) {
      const rec = latestOf(id)
      if (rec && rec.state === 'active' && rec.guard && typeof rec.guard.checksum === 'string') out.push(rec.guard.checksum)
    }
    return out
  }

  /** 指纹刷新：dictVersion 不匹配 → sourceText 惰性重算；缺失/不可重算 → 标 stale（fail-close） */
  function refreshFingerprints (opts2) {
    const persist = !!(opts2 && opts2.persist)
    let recomputed = 0
    let stale = 0
    for (const id of records.keys()) {
      const rec = latestOf(id)
      if (!rec) continue
      if (!isValidFingerprint(rec.fingerprint)) {
        staleIds.add(id)
        stale++
        log.warn('PromptMemory', '模板 fingerprint 缺失/不可解析，fail-close 不参与检索: ' + id)
        continue
      }
      if (rec.fingerprint.dictVersion !== DICT_VERSION) {
        if (typeof rec.sourceText === 'string' && rec.sourceText.length > 0) {
          rec.fingerprint = buildFingerprint(rec.sourceText)
          recomputed++
          if (persist) writeTemplate(rec)
        } else {
          staleIds.add(id)
          stale++
          log.warn('PromptMemory', '模板 dictVersion 不匹配且无 sourceText，标 stale 不参与检索: ' + id)
          continue
        }
      }
      staleIds.delete(id)
    }
    return { recomputed, stale }
  }

  // ── 加载（损坏 fail-close）──────────────────

  function load () {
    records.clear()
    staleIds.clear()
    let corruptFiles = 0

    const libFile = libraryFile()
    if (fs.existsSync(libFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(libFile, 'utf8'))
        if (!parsed || typeof parsed !== 'object' || !parsed.items || typeof parsed.items !== 'object') throw new Error('library.json 结构非法')
        index = parsed
        if (typeof index.schemaVersion !== 'number') index.schemaVersion = LIBRARY_SCHEMA_VERSION
        if (typeof index.dictVersion !== 'string') index.dictVersion = DICT_VERSION
      } catch (e) {
        // 损坏库 fail-close 重建空库（保留 .corrupt 备份）
        log.error('PromptMemory', 'library.json 损坏，重建空库: ' + e.message)
        try { fs.copyFileSync(libFile, libFile + '.corrupt-' + Date.now()) } catch (_) { void _ }
        index = emptyIndex()
        writeIndex()
      }
    } else {
      index = emptyIndex()
      writeIndex()
    }

    // 加载全部模板文件；单文件损坏只跳过该模板，不阻断其余
    for (const id of Object.keys(index.items)) {
      const item = index.items[id]
      const versions = Array.isArray(item.versions) ? item.versions : []
      for (const v of versions) {
        const file = templateFile(id, v)
        if (!fs.existsSync(file)) {
          log.warn('PromptMemory', '模板文件缺失，跳过: ' + file)
          corruptFiles++
          continue
        }
        try {
          const rec = JSON.parse(fs.readFileSync(file, 'utf8'))
          setRecord(id, v, rec)
        } catch (_) {
          void _
          log.warn('PromptMemory', '模板文件损坏，跳过: ' + file)
          corruptFiles++
        }
      }
      const latest = latestOf(id)
      if (latest) item.state = latest.state
    }
    refreshFingerprints({ persist: false })
    return { ok: true, items: records.size, corruptFiles }
  }

  // ── 查询 ─────────────────────────────

  /**
   * @param {{state?:string, engine?:string, type?:string}} [filter]
   * @returns {Array<object>} 模板摘要
   */
  function list (filter) {
    const f = filter || {}
    const out = []
    for (const id of records.keys()) {
      const rec = latestOf(id)
      if (!rec) continue
      if (f.state && rec.state !== f.state) continue
      if (f.engine && rec.engine !== f.engine) continue
      if (f.type && rec.type !== f.type) continue
      out.push({
        id: rec.id,
        version: rec.version,
        engine: rec.engine,
        mode: rec.mode,
        type: rec.type,
        source: rec.source,
        state: rec.state,
        updatedAt: rec.updatedAt,
        stats: mergedStats(rec),
      })
    }
    return out
  }

  /**
   * 检索数据源契约：仅 active + fingerprint 有效。
   * @param {{engine?:string}} [filter]
   * @returns {Array<{id:string, fingerprint:object, stats:object}>}
   */
  function listActive (filter) {
    const f = filter || {}
    const out = []
    for (const id of records.keys()) {
      const rec = latestOf(id)
      if (!rec || rec.state !== 'active') continue
      if (staleIds.has(id) || !isValidFingerprint(rec.fingerprint)) continue
      if (f.engine && rec.engine !== f.engine) continue
      out.push({ id: rec.id, fingerprint: rec.fingerprint, stats: mergedStats(rec) })
    }
    return out
  }

  /** @param {string} id @param {number} [version] */
  function get (id, version) {
    const rec = version != null ? recordOf(id, version) : latestOf(id)
    if (!rec) return null
    return JSON.parse(JSON.stringify(rec))
  }

  // ── 入库 ─────────────────────────────

  /**
   * learnt 模板入库主入口：归一化 → fingerprint → 门禁 → 版本化 → 写 draft。
   * @returns {{ok:boolean, id?:string, version?:number, state?:string, code?:number, message?:string}}
   */
  function saveLearnt (input) {
    const { engine, mode, type, content, concept, eventId } = input || {}
    if (!ENGINES.includes(engine) || !MODES.includes(mode) || !TEMPLATE_TYPES.includes(type)) {
      return { ok: false, code: ERROR.TEMPLATE_INVALID, message: 'engine/mode/type 枚举非法' }
    }
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
      return { ok: false, code: ERROR.TEMPLATE_INVALID, message: 'content 必须为纯 JSON 对象' }
    }
    if (typeof concept !== 'string' || concept.length === 0) {
      return { ok: false, code: ERROR.TEMPLATE_INVALID, message: 'concept 必填非空字符串' }
    }
    if (typeof eventId !== 'string' || !eventId.startsWith('evt_') || eventId.length <= 4) {
      return { ok: false, code: ERROR.TEMPLATE_INVALID, message: 'eventId 必填且以 evt_ 前缀' }
    }

    const sourceText = concept.slice(0, maxSourceText)
    const fingerprint = buildFingerprint(concept)
    const checksum = checksumOf(content)

    const gates = governance.runGates({
      engine, mode, type, content, sourceText, checksum,
      existingChecksums: activeChecksums(),
    })
    if (!gates.ok) {
      return { ok: false, code: ERROR.TEMPLATE_GATE_FAILED, message: '门禁未通过: ' + gates.failedRules.join(',') }
    }

    const now = nowIso()
    // 版本化优先级（m9）：同 learnedFrom + 指纹相似 → 升版；否则新 id
    // W5：多个候选时取 score 最高者，避免插入序压过相似度；W3：升版继承父版本 cooldownUntil
    let id = null
    let version = 1
    let bestScore = -1
    let parentCooldown = null
    for (const candidateId of records.keys()) {
      const latest = latestOf(candidateId)
      if (latest && latest.provenance && latest.provenance.learnedFrom === eventId) {
        const sim = fingerprintScore(fingerprint, latest.fingerprint)
        if (sim.tier !== 'NONE' && sim.score > bestScore) {
          id = candidateId
          version = latest.version + 1
          bestScore = sim.score
          parentCooldown = latest.cooldownUntil || null
        }
      }
    }
    const isNew = id === null
    if (isNew) id = newTemplateId()

    const rec = {
      id, version, engine, mode, type,
      content,
      sourceText,
      fingerprint,
      source: 'learnt',
      provenance: { learnedFrom: eventId, acceptedEvents: [] },
      stats: { uses: 0, acceptRate: 0, avgScore: null, avgCost: 0, lastUsedAt: null },
      state: 'draft',
      guard: { checksum, validatedAt: now, gateRules: gates.gateRules, evaluatorVersion: gates.evaluatorVersion },
      createdAt: now,
      updatedAt: now,
      confirmedBy: null,
      ...(parentCooldown ? { cooldownUntil: parentCooldown } : {}),
    }
    writeTemplate(rec)
    setRecord(id, version, rec)

    if (isNew) {
      index.items[id] = { id, engine, mode, type, versions: [version], latestVersion: version, state: 'draft', createdAt: now, updatedAt: now }
    } else {
      const item = itemOf(id)
      item.versions.push(version)
      item.latestVersion = version
      item.state = 'draft' // 新版本需重新人工确认
      item.updatedAt = now
    }
    writeIndex()
    return { ok: true, id, version, state: 'draft' }
  }

  // ── 状态流转（人工确认激活；数据确认阈值归 P2）───

  /** @param {string} id @param {{confirmedBy:string}} [opts] — V0 仅人工确认激活，confirmedBy 必填 userHash */
  function activate (id, opts) {
    const rec = latestOf(id)
    if (!rec) return { ok: false, code: ERROR.TEMPLATE_NOT_FOUND, message: '模板不存在' }
    const confirmedBy = opts && opts.confirmedBy
    if (typeof confirmedBy !== 'string' || !/^[0-9a-f]{64}$/i.test(confirmedBy)) {
      return { ok: false, code: ERROR.TEMPLATE_INVALID, message: 'confirmedBy 必填且必须为 64 位十六进制 userHash' }
    }
    if (!governance.canTransition(rec.state, 'active')) {
      return { ok: false, code: ERROR.TEMPLATE_BAD_STATE, message: '仅 draft 可激活: ' + rec.state }
    }
    rec.state = 'active'
    rec.confirmedBy = confirmedBy
    rec.updatedAt = nowIso()
    writeTemplate(rec)
    touchIndexItem(rec)
    writeIndex()
    return { ok: true, id, state: 'active' }
  }

  /** @param {string} id @param {{reason?:string, cooldownUntil?:string}} [opts] */
  function deprecate (id, opts) {
    const rec = latestOf(id)
    if (!rec) return { ok: false, code: ERROR.TEMPLATE_NOT_FOUND, message: '模板不存在' }
    if (!governance.canTransition(rec.state, 'deprecated')) {
      return { ok: false, code: ERROR.TEMPLATE_BAD_STATE, message: '仅 active 可弃用: ' + rec.state }
    }
    rec.state = 'deprecated'
    rec.updatedAt = nowIso()
    if (opts && opts.reason) rec.deprecationReason = opts.reason
    if (opts && opts.cooldownUntil) rec.cooldownUntil = opts.cooldownUntil
    writeTemplate(rec)
    touchIndexItem(rec)
    writeIndex()
    return { ok: true, id, state: 'deprecated' }
  }

  /** @param {string} id */
  function disable (id) {
    const rec = latestOf(id)
    if (!rec) return { ok: false, code: ERROR.TEMPLATE_NOT_FOUND, message: '模板不存在' }
    if (!governance.canTransition(rec.state, 'disabled')) {
      return { ok: false, code: ERROR.TEMPLATE_BAD_STATE, message: '仅 deprecated 可停用: ' + rec.state }
    }
    rec.state = 'disabled'
    rec.updatedAt = nowIso()
    writeTemplate(rec)
    touchIndexItem(rec)
    writeIndex()
    return { ok: true, id, state: 'disabled' }
  }

  // ── 回滚监控（同步轮询；冷却防抖）───

  /**
   * 对全部 active 模板执行回滚判定；命中则 deprecate 并落 cooldownUntil。
   * @param {string|Date} [now]
   * @returns {Array<{id:string, reason:string, cooldownUntil:string}>}
   */
  function checkRollbacks (now) {
    const candidates = []
    for (const id of records.keys()) {
      const rec = latestOf(id)
      if (rec && rec.state === 'active') {
        candidates.push({ id, cooldownUntil: rec.cooldownUntil || null })
      }
    }
    const decisions = governance.checkRollback(candidates, now)
    for (const d of decisions) {
      deprecate(d.id, { reason: d.reason, cooldownUntil: d.cooldownUntil })
    }
    return decisions.map((d) => ({ id: d.id, reason: d.reason, cooldownUntil: d.cooldownUntil }))
  }

  return { load, list, listActive, get, saveLearnt, activate, deprecate, disable, refreshFingerprints, checkRollbacks }
}

module.exports = { createPromptMemory, writeAtomicSync, checksumOf, canonicalJson, MAX_SOURCE_TEXT }
