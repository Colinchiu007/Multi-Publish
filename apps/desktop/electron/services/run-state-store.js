// @ts-check
/**
 * run-state-store.js — 编排流水线失败快照持久化（断点恢复数据源）
 *
 * 流水线失败时把 { runId, pipeline, currentStage, stages, context, params, error } 写入
 * userData/run-state/<runId>.json（已登录用户按 owner 隔离：
 * userData/run-state/owners/{sha256(subject)}/<runId>.json），之后可调用
 * pipeline:resumeOrchestration 从失败阶段继续。快照只包含结构化上下文，不包含密钥。
 *
 * W1 技术债务闭环：同机多账号场景下，快照按当前登录账号的 subject 哈希目录隔离，
 * 仅泄露 runId 无法读取其他账号的恢复上下文；未登录/身份不可用时回退 legacy 平铺
 * 存储（与 credential-store 的 owners 迁移模式一致），旧平铺快照在首次读取时自动迁移。
 */
'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function defaultDir() {
  try {
    const { app } = require('electron')
    return path.join(app.getPath('userData'), 'run-state')
  } catch {
    return path.join(process.cwd(), '.run-state')
  }
}

function safeId(runId) {
  return String(runId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
}

function ownerHash(ownerSubject) {
  if (typeof ownerSubject !== 'string' || !ownerSubject.trim()) return null
  return crypto.createHash('sha256').update(ownerSubject, 'utf8').digest('hex')
}

class RunStateStore {
  constructor(options = {}) {
    this._dir = options.dir || defaultDir()
    this._log = options.log || { warn() {}, info() {} }
    this._ownerProvider = typeof options.getOwner === 'function' ? options.getOwner : null
    try { fs.mkdirSync(this._dir, { recursive: true }) } catch (e) { this._log.warn('RunStateStore', 'mkdir failed: ' + e.message) }
  }

  /**
   * 注入当前登录用户解析器（与 store/offline-manager 等一致）。
   * 解析器返回当前 subject；缺少时返回 null，快照回退 legacy 平铺存储。
   */
  setOwnerProvider(provider) {
    if (provider !== null && provider !== undefined && typeof provider !== 'function') {
      throw new TypeError('owner provider must be a function or null')
    }
    this._ownerProvider = provider || null
  }

  _currentOwner() {
    if (!this._ownerProvider) return null
    try {
      const subject = this._ownerProvider()
      return typeof subject === 'string' && subject.trim() ? subject : null
    } catch (e) {
      this._log.warn('RunStateStore', 'resolve owner failed: ' + (e && e.message ? e.message : String(e)))
      return null
    }
  }

  _ownerDir() {
    const hash = ownerHash(this._currentOwner())
    return hash ? path.join(this._dir, 'owners', hash) : this._dir
  }

  _file(runId) {
    return path.join(this._ownerDir(), safeId(runId) + '.json')
  }

  /** legacy 平铺路径（owner 隔离前的存量快照） */
  _legacyFile(runId) {
    return path.join(this._dir, safeId(runId) + '.json')
  }

  /** 保存编排模式终态快照（失败/取消时调用，状态原样落盘；上下文为纯 JSON 数据） */
  saveFailed(run) {
    if (!run || typeof run.id !== 'string' || !run.id) return false
    const snapshot = {
      kind: 'orchestration-run-state',
      version: 1,
      runId: run.id,
      pipeline: run.pipeline,
      status: run.status || 'failed',
      currentStage: Number.isInteger(run.currentStage) ? run.currentStage : 0,
      stages: Array.isArray(run.stages) ? run.stages.map((s) => ({ ...s })) : [],
      context: run.context && typeof run.context === 'object' ? run.context : {},
      params: run.params && typeof run.params === 'object' ? run.params : {},
      error: run.error || null,
      orchestrationMode: run.orchestrationMode || 'orchestrator',
      createdAt: run.createdAt || null,
      endedAt: run.endedAt || new Date().toISOString(),
    }
    const owner = this._currentOwner()
    if (owner) snapshot.owner = owner
    const finalPath = this._file(run.id)
    const tmp = finalPath + '.tmp'
    try {
      fs.mkdirSync(path.dirname(finalPath), { recursive: true })
      fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8')
      // Windows 上 copyFileSync 覆盖已存在文件，避免 rename 对已存在目标的 EEXIST
      fs.copyFileSync(tmp, finalPath)
      try { fs.rmSync(tmp, { force: true }) } catch { /* 清理失败不掩盖保存结果 */ }
      return true
    } catch (e) {
      this._log.warn('RunStateStore', 'save failed: ' + (e && e.message ? e.message : String(e)))
      return false
    }
  }

  load(runId) {
    const current = this._readSnapshot(this._file(runId))
    if (current) return current
    // 兼容 W1 之前的 legacy 平铺快照：读取成功后迁移到 owner 目录
    const legacy = this._readSnapshot(this._legacyFile(runId))
    if (!legacy) return null
    try {
      if (this._ownerDir() !== this._dir) {
        fs.mkdirSync(this._ownerDir(), { recursive: true })
        fs.copyFileSync(this._legacyFile(runId), this._file(runId))
        try { fs.rmSync(this._legacyFile(runId), { force: true }) } catch { /* 迁移后清理失败可忽略 */ }
      }
    } catch (e) {
      this._log.warn('RunStateStore', 'legacy snapshot migrate failed: ' + (e && e.message ? e.message : String(e)))
    }
    return legacy
  }

  _readSnapshot(filePath) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const snapshot = JSON.parse(raw)
      if (!snapshot || snapshot.kind !== 'orchestration-run-state') return null
      return snapshot
    } catch {
      return null
    }
  }

  /**
   * 列出已持久化的失败快照（owner 目录 + legacy 平铺目录，按 runId 去重），
   * 供历史记录展示：应用重启后失败任务仍可见。只返回可解析的
   * orchestration-run-state 快照，损坏/未知文件静默跳过。
   */
  listFailed() {
    const seen = new Set()
    const result = []
    const dirs = new Set([this._dir, this._ownerDir()].filter(Boolean))
    for (const dir of dirs) {
      let entries
      try { entries = fs.readdirSync(dir) } catch { continue }
      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue
        const snapshot = this._readSnapshot(path.join(dir, entry))
        if (!snapshot || typeof snapshot.runId !== 'string' || !snapshot.runId) continue
        if (seen.has(snapshot.runId)) continue
        seen.add(snapshot.runId)
        result.push(snapshot)
      }
    }
    return result
  }

  remove(runId) {
    // owner 隔离前后两处都清理，避免残留
    try { fs.rmSync(this._file(runId), { force: true }) } catch { /* 删除失败可忽略 */ }
    try { fs.rmSync(this._legacyFile(runId), { force: true }) } catch { /* 删除失败可忽略 */ }
  }
}

module.exports = { RunStateStore }
