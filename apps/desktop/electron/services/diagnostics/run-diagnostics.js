// @ts-check
/**
 * 视频创作失败诊断 —— run 级结构化诊断摘要 + 环境快照
 *
 * buildRunDiagnostics：纯函数，把 run 终态映射为可序列化的诊断摘要
 *   （阶段明细 + 失败分类 + 根因候选 + 环境快照），字段白名单，不携带
 *   errorParams 原文/凭据。永不抛错。
 *
 * captureEnvSnapshot：best-effort 环境快照（内存/CPU/uptime/磁盘余量/
 *   ffmpeg/ffprobe/sidecar），单项失败以 null 占位，整体永不抛错。
 */
'use strict'

const os = require('os')
const fs = require('fs')
const { classifyFailure } = require('./taxonomy')
const { lookupRootCauses } = require('./root-cause-map')

/** 与 pipeline-engine._finalizeRun 的错误截断长度保持一致 */
const MAX_ERROR_LENGTH = 500

function truncateText (value, max) {
  const text = typeof value === 'string' ? value : _toMessage(value)
  if (!text) return null
  return text.length > max ? text.slice(0, max) : text
}

function _toMessage (value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message || ''
  if (typeof value === 'object') {
    const v = value.message || value.error || value.reason
    return typeof v === 'string' ? v : ''
  }
  return ''
}

function _iso (value) {
  return typeof value === 'string' && value ? value : null
}

function _durationMs (startedAt, endedAt) {
  if (!startedAt || !endedAt) return null
  const start = Date.parse(startedAt)
  const end = Date.parse(endedAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return Math.max(0, end - start)
}

/** best-effort 磁盘余量（statfs 不可用时返回 null） */
function _diskFreeBytes (targetDir) {
  try {
    const st = fs.statfsSync(targetDir)
    if (st && typeof st.bavail === 'number' && typeof st.bsize === 'number') {
      return st.bavail * st.bsize
    }
    return null
  } catch (_) {
    return null
  }
}

/**
 * 环境快照（best-effort，永不抛错）
 * @param {{ outputDir?: string, findFfmpeg?: () => unknown, findFfprobe?: () => unknown, sidecarProbe?: () => object|null }} [deps]
 * @returns {object}
 */
function captureEnvSnapshot (deps) {
  deps = deps || {}
  const out = {
    memory: null,
    cpu: null,
    uptimeMs: null,
    diskFreeBytes: null,
    ffmpegAvailable: null,
    ffprobeAvailable: null,
    sidecars: null,
  }
  try {
    out.memory = { freeBytes: os.freemem(), totalBytes: os.totalmem() }
  } catch (_) { /* 保持 null */ }
  try {
    const cpus = os.cpus()
    out.cpu = { count: Array.isArray(cpus) ? cpus.length : 0, model: cpus && cpus[0] ? cpus[0].model : null }
  } catch (_) { /* 保持 null */ }
  try {
    out.uptimeMs = Math.round(os.uptime() * 1000)
  } catch (_) { /* 保持 null */ }
  try {
    const target = typeof deps.outputDir === 'string' && deps.outputDir ? deps.outputDir : os.tmpdir()
    const free = _diskFreeBytes(target)
    if (free !== null) {
      out.diskFreeBytes = free
    }
  } catch (_) { /* 保持 null */ }
  try {
    if (typeof deps.findFfmpeg === 'function') out.ffmpegAvailable = Boolean(deps.findFfmpeg())
  } catch (_) { /* 保持 null */ }
  try {
    if (typeof deps.findFfprobe === 'function') out.ffprobeAvailable = Boolean(deps.findFfprobe())
  } catch (_) { /* 保持 null */ }
  try {
    if (typeof deps.sidecarProbe === 'function') {
      const probe = deps.sidecarProbe()
      out.sidecars = probe && typeof probe === 'object' ? probe : null
    }
  } catch (_) { /* 保持 null */ }
  return out
}

/**
 * 构建 run 诊断摘要（纯函数，永不抛错；输出为纯 JSON 可序列化对象）
 * @param {object} run - PipelineEngine 的 run 对象（只读）
 * @param {object|null} [envSnapshot]
 * @returns {object}
 */
function buildRunDiagnostics (run, envSnapshot) {
  try {
    const safeRun = run && typeof run === 'object' ? run : {}
    const stages = Array.isArray(safeRun.stages) ? safeRun.stages : []
    const stageList = stages.map(s => ({
      name: s && s.name ? s.name : null,
      status: s && s.status ? s.status : 'unknown',
      error: truncateText(s && s.error, MAX_ERROR_LENGTH),
    }))
    const currentIndex = Number.isFinite(Number(safeRun.currentStage)) ? Number(safeRun.currentStage) : null
    const failedNamesRaw = stageList.filter(s => s.status === 'failed').map(s => s.name).filter(Boolean)
    // 真实编排路径不写 stage.status='failed'（仅 paused/running/cancelled/completed），失败时按 currentStage 回填
    const failedNames = failedNamesRaw.length > 0
      ? failedNamesRaw
      : (safeRun.status === 'failed' && currentIndex !== null && stageList[currentIndex] && stageList[currentIndex].name
          ? [stageList[currentIndex].name]
          : [])
    const failedStageName = failedNames[0] || (currentIndex !== null && stageList[currentIndex] ? stageList[currentIndex].name : null) || null

    const errorCodeValue = typeof safeRun.errorCode === 'string' ? safeRun.errorCode : (safeRun.error && typeof safeRun.error === 'object' && typeof safeRun.error.code === 'string' ? safeRun.error.code : undefined)
    const codeValue = safeRun.code !== undefined ? safeRun.code : (safeRun.error && typeof safeRun.error === 'object' && safeRun.error.code !== undefined ? safeRun.error.code : undefined)
    const errorMessage = _toMessage(safeRun.error)

    const classification = classifyFailure({
      stage: failedStageName || safeRun.pipeline || undefined,
      errorCode: errorCodeValue,
      code: codeValue,
      message: errorMessage,
      error: _toMessage(safeRun.error),
      degraded: Boolean(safeRun.context && (safeRun.context.degraded === true || safeRun.context.degradedImages > 0 || safeRun.context.degradedTts > 0)),
      hasCheckpoint: Boolean(safeRun.checkpoint),
      runStatus: typeof safeRun.status === 'string' ? safeRun.status : 'unknown',
      fatal: safeRun.status === 'failed',
    })

    const candidates = safeRun.status === 'failed'
      ? lookupRootCauses(classification, { errorCode: errorCodeValue, code: codeValue, message: errorMessage })
      : []

    return {
      runId: typeof safeRun.id === 'string' ? safeRun.id : null,
      pipeline: typeof safeRun.pipeline === 'string' ? safeRun.pipeline : null,
      status: typeof safeRun.status === 'string' ? safeRun.status : 'unknown',
      generatedAt: new Date().toISOString(),
      durationMs: _durationMs(safeRun.startedAt, safeRun.endedAt),
      stageSummary: {
        total: stageList.length,
        failed: failedNames,
        current: currentIndex,
      },
      stages: stageList,
      failure: { ...classification, candidates },
      env: envSnapshot && typeof envSnapshot === 'object' ? envSnapshot : null,
    }
  } catch (_) {
    // fail-closed：任何异常都返回最小稳定结构，绝不向调用方抛错
    return {
      runId: run && run.id ? run.id : null,
      pipeline: run && run.pipeline ? run.pipeline : null,
      status: run && run.status ? run.status : 'unknown',
      generatedAt: new Date().toISOString(),
      durationMs: null,
      stageSummary: { total: 0, failed: [], current: null },
      stages: [],
      failure: {
        stage: 'unknown', failureType: 'unknown', severity: 'unknown', recoverability: 'unknown',
        candidates: [],
      },
      env: envSnapshot && typeof envSnapshot === 'object' ? envSnapshot : null,
    }
  }
}

module.exports = { buildRunDiagnostics, captureEnvSnapshot, MAX_ERROR_LENGTH }
