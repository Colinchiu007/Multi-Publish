// @ts-check
/**
 * schema.js — 提示词引擎自进化反馈管道数据契约
 *
 * 单一来源枚举与 fail-closed 校验：
 * - GenerationEvent（主记录，append-only generation-log.jsonl）
 * - FeedbackEvent（回填流，append-only feedback-log.jsonl，按 eventId join）
 *
 * 设计参考：01-docs/prompt-engine-evolution-design.md（v2）
 * 契约铁律：纯 JSON、eventId 必传、写失败不阻断生成主流程。
 */

'use strict'

const ENGINES = ['image', 'video']
const MODES = ['story2video', 'standalone', 'storyboard']
const STATUSES = ['success', 'failure', 'partial']
const OPTIMIZED_BY = ['prompt-engine', 'local-fallback', 'self-refine', 'learnt-template', 'none']
const FEEDBACK_TYPES = ['accepted', 'regenerated', 'edited', 'downloaded', 'deleted', 'published']
const LIBRARY_SOURCES = ['builtin', 'learnt', 'full', 'fragment']

const SCHEMA_VERSION = 1

/** @type {Record<string, string[]>} */
const ENUM = {
  engine: ENGINES,
  mode: MODES,
  status: STATUSES,
  optimizedBy: OPTIMIZED_BY,
  feedbackType: FEEDBACK_TYPES,
  librarySource: LIBRARY_SOURCES,
}

/**
 * 返回一个可读的校验错误信息列表（不抛异常，由调用方决定策略）。
 * @param {unknown} value
 * @param {{ oneOf: string[] }} rule
 */
function checkEnum (value, rule) {
  if (typeof value !== 'string' || !rule.oneOf.includes(value)) {
    return '期望枚举之一 ' + rule.oneOf.join('/') + '，实际：' + JSON.stringify(value)
  }
  return null
}

/**
 * 校验 GenerationEvent（主记录）。
 * fail closed：结构不合法返回错误数组，不做任何猜测性修正。
 * @param {unknown} raw
 * @returns {{ ok: true, event: object } | { ok: false, errors: string[] }}
 */
function validateGeneration (raw) {
  const errors = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['GenerationEvent 必须是非空对象'] }
  }
  const event = /** @type {Record<string, any>} */ (raw)

  if (typeof event.id !== 'string' || event.id.length === 0) errors.push('id 必填非空字符串')
  if (typeof event.schemaVersion !== 'number' || event.schemaVersion !== SCHEMA_VERSION) {
    errors.push('schemaVersion 必须为 ' + SCHEMA_VERSION)
  }
  if (typeof event.ts !== 'string' || Number.isNaN(Date.parse(event.ts))) errors.push('ts 必填合法 ISO 时间')
  errors.push(checkEnum(event.engine, { oneOf: ENGINES }))
  errors.push(checkEnum(event.mode, { oneOf: MODES }))

  if (!event.context || typeof event.context !== 'object') {
    errors.push('context 必填对象')
  } else {
    if (typeof event.context.sessionId !== 'string' || event.context.sessionId.length === 0) {
      errors.push('context.sessionId 必填')
    }
    if (event.context.userHash != null && typeof event.context.userHash !== 'string') {
      errors.push('context.userHash 必须是字符串')
    }
  }

  if (!event.input || typeof event.input !== 'object') {
    errors.push('input 必填对象')
  } else {
    if (typeof event.input.concept !== 'string' || event.input.concept.length === 0) {
      errors.push('input.concept 必填非空字符串')
    }
    if (event.input.creativeLevel != null) {
      const level = Number(event.input.creativeLevel)
      if (!Number.isFinite(level) || level < 1 || level > 10) errors.push('input.creativeLevel 必须在 1..10')
    }
  }

  if (!event.prompt || typeof event.prompt !== 'object') {
    errors.push('prompt 必填对象')
  } else {
    if (typeof event.prompt.optimized !== 'string' || event.prompt.optimized.length === 0) {
      errors.push('prompt.optimized 必填非空字符串')
    }
    if (event.prompt.optimizedBy != null) {
      errors.push(checkEnum(event.prompt.optimizedBy, { oneOf: OPTIMIZED_BY }))
    }
    if (event.prompt.templateVersion != null && typeof event.prompt.templateVersion !== 'string') {
      errors.push('prompt.templateVersion 必须是字符串')
    }
    if (event.prompt.librarySource != null) {
      errors.push(checkEnum(event.prompt.librarySource, { oneOf: LIBRARY_SOURCES }))
    }
  }

  if (!event.provider || typeof event.provider !== 'object') {
    errors.push('provider 必填对象')
  } else if (typeof event.provider.name !== 'string' || event.provider.name.length === 0) {
    errors.push('provider.name 必填')
  }

  if (!event.result || typeof event.result !== 'object') {
    errors.push('result 必填对象')
  } else {
    errors.push(checkEnum(event.result.status, { oneOf: STATUSES }))
    if (event.result.durationMs != null && (!Number.isFinite(event.result.durationMs) || event.result.durationMs < 0)) {
      errors.push('result.durationMs 必须是非负数字')
    }
    if (!Array.isArray(event.result.outputRefs)) errors.push('result.outputRefs 必填数组')
  }

  const clean = errors.filter(Boolean)
  if (clean.length > 0) return { ok: false, errors: clean }
  return { ok: true, event: event }
}

/**
 * 校验 FeedbackEvent（回填流）。
 * @param {unknown} raw
 * @returns {{ ok: true, feedback: object } | { ok: false, errors: string[] }}
 */
function validateFeedback (raw) {
  const errors = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['FeedbackEvent 必须是非空对象'] }
  }
  const feedback = /** @type {Record<string, any>} */ (raw)

  if (typeof feedback.eventId !== 'string' || feedback.eventId.length === 0) {
    errors.push('eventId 必填非空字符串')
  }
  if (typeof feedback.ts !== 'string' || Number.isNaN(Date.parse(feedback.ts))) errors.push('ts 必填合法 ISO 时间')
  errors.push(checkEnum(feedback.type, { oneOf: FEEDBACK_TYPES }))

  if (feedback.detail != null && typeof feedback.detail !== 'object') {
    errors.push('detail 必须是对象')
  }

  const clean = errors.filter(Boolean)
  if (clean.length > 0) return { ok: false, errors: clean }
  return { ok: true, feedback: feedback }
}

module.exports = {
  SCHEMA_VERSION,
  ENGINES,
  MODES,
  STATUSES,
  OPTIMIZED_BY,
  FEEDBACK_TYPES,
  LIBRARY_SOURCES,
  ENUM,
  validateGeneration,
  validateFeedback,
}
