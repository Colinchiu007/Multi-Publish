// @ts-check
/**
 * run-state-store.js — 编排流水线失败快照持久化（断点恢复数据源）
 *
 * 流水线失败时把 { runId, pipeline, currentStage, stages, context, params, error } 写入
 * userData/run-state/<runId>.json，之后可调用 pipeline:resumeOrchestration 从失败阶段继续。
 * 快照只包含结构化上下文，不包含密钥。
 */
'use strict'

const fs = require('fs')
const path = require('path')

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

class RunStateStore {
  constructor(options = {}) {
    this._dir = options.dir || defaultDir()
    this._log = options.log || { warn() {}, info() {} }
    try { fs.mkdirSync(this._dir, { recursive: true }) } catch (e) { this._log.warn('RunStateStore', 'mkdir failed: ' + e.message) }
  }

  _file(runId) {
    return path.join(this._dir, safeId(runId) + '.json')
  }

  /** 保存失败快照（仅编排模式失败时调用；上下文为纯 JSON 数据） */
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
      endedAt: run.endedAt || new Date().toISOString(),
    }
    const tmp = this._file(run.id) + '.tmp'
    const finalPath = this._file(run.id)
    try {
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
    try {
      const raw = fs.readFileSync(this._file(runId), 'utf8')
      const snapshot = JSON.parse(raw)
      if (!snapshot || snapshot.kind !== 'orchestration-run-state') return null
      return snapshot
    } catch {
      return null
    }
  }

  remove(runId) {
    try { fs.rmSync(this._file(runId), { force: true }) } catch { /* 删除失败可忽略 */ }
  }
}

module.exports = { RunStateStore }
