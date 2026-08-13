// @ts-check
/**
 * signal-collector.js — 提示词引擎自进化信号采集器
 *
 * 职责：
 * - recordGeneration：校验并追加 GenerationEvent 到 generation-log/YYYY-MM.jsonl
 * - recordFeedback：校验并追加 FeedbackEvent 到 feedback-log/YYYY-MM.jsonl，孤儿检测
 * - getStats：按 engine 聚合 acceptRate / regenerateRate / avgDurationMs
 * - 采集开关三态：enabled / muted(停写) / local-only(停上报，P0 本地即全部，占位)
 *
 * 契约铁律：写失败 catch+warn 不阻断生成主流程；测试必须 os.tmpdir() 隔离。
 */

'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { validateGeneration, validateFeedback, FEEDBACK_TYPES, SCHEMA_VERSION } = require('./schema')

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000 // 30 天

function monthKey (date) {
  const d = date instanceof Date ? date : new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return y + '-' + m
}

/** @param {string} userId @param {string} salt */
function hashUserId (userId, salt) {
  return crypto.createHmac('sha256', salt).update(String(userId)).digest('hex')
}

/**
 * @param {object} opts
 * @param {string} opts.logDir   - userData/generation-logs（父目录）
 * @param {object} [opts.config] - { collection?: 'enabled'|'muted', userHashSalt?: string }
 * @param {object} [opts.log]
 */
function createSignalCollector (opts) {
  const logDir = opts.logDir
  const log = opts.log || { info: () => {}, warn: () => {}, error: () => {} }
  const collection = (opts.config && opts.config.collection) || 'enabled'
  const salt = (opts.config && opts.config.userHashSalt) || 'mp-evolution-default-salt'

  function generationLogPath (date) {
    return path.join(logDir, 'generation-log', monthKey(date) + '.jsonl')
  }

  function feedbackLogPath (date) {
    return path.join(logDir, 'feedback-log', monthKey(date) + '.jsonl')
  }

  function ensureDir (file) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
  }

  function appendLine (file, line) {
    ensureDir(file)
    fs.appendFileSync(file, line + '\n', 'utf8')
  }

  /** 读取 JSONL，容忍尾部残缺行；返回解析成功的对象数组 */
  function readLines (file) {
    if (!fs.existsSync(file)) return []
    const text = fs.readFileSync(file, 'utf8')
    const out = []
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      try {
        out.push(JSON.parse(line))
      } catch {
        // 尾部残缺行（崩溃/写中断）容忍，不阻断
      }
    }
    return out
  }

  /**
   * 三态开关语义（M4 修复）：
   * - enabled：本地写 + 上报（P0 无上报路径，等同 enabled）
   * - local-only：本地照写，停上报（P0 无上报，等同 enabled，占位明确化）
   * - muted：停写（不追加新日志，保留已写）
   */
  function isEnabled () {
    return collection !== 'muted'
  }

  /**
   * 返回保留期内的 generation-log 路径（当月 + 上月）。
   * 跨月 join：上月生成、本月反馈的事件不应被误判为孤儿（M2 修复）。
   */
  function generationLogPaths (date) {
    const now = date instanceof Date ? date : new Date(date)
    const current = generationLogPath(now)
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return [current, generationLogPath(prev)]
  }

  /** 读取保留期内全部 generation 事件（当月 + 上月，保持写入顺序）。 */
  function readGenerationEvents (date) {
    const out = []
    for (const file of generationLogPaths(date)) {
      out.push(...readLines(file))
    }
    return out
  }

  /**
   * 记录一次生成主事件。
   * @param {object} input - 未脱敏前的原始事件（不含 id/ts/schemaVersion/context.userHash）
   * @returns {{ ok: boolean, id?: string, error?: string }}
   */
  function recordGeneration (input) {
    if (!isEnabled()) return { ok: false, error: 'collection-muted' }
    const now = new Date()
    const event = {
      id: 'evt_' + crypto.randomUUID().replace(/-/g, ''),
      schemaVersion: SCHEMA_VERSION,
      ts: now.toISOString(),
      engine: input.engine,
      mode: input.mode,
      context: {
        tenantId: input.context && input.context.tenantId,
        // 脱敏铁律：明文 userId 不得落盘，仅保留加盐 HMAC（M1 修复）
        userHash: input.context && input.context.userId ? hashUserId(input.context.userId, salt) : undefined,
        sessionId: input.context && input.context.sessionId,
        appVersion: input.context && input.context.appVersion,
      },
      input: input.input,
      prompt: input.prompt,
      provider: input.provider,
      result: input.result,
    }
    const check = validateGeneration(event)
    if (!check.ok) {
      log.warn('SignalCollector', 'GenerationEvent 校验失败: ' + check.errors.join('; '))
      return { ok: false, error: 'invalid-event' }
    }
    try {
      appendLine(generationLogPath(now), JSON.stringify(event))
      return { ok: true, id: event.id }
    } catch (e) {
      // 契约铁律：写失败不阻断生成主流程
      log.warn('SignalCollector', 'GenerationEvent 写入失败: ' + e.message)
      return { ok: false, error: 'write-failed' }
    }
  }

  /**
   * 记录一次用户反馈（回填流）。
   * 支持两种关联方式：
   * - 直接传 eventId（推荐，校验必填）
   * - 传 sessionId：从当月 generation-log 解析最新同 session 生成事件作为 eventId；
   *   解析失败则按孤儿反馈写入（保留事件，标记 orphan）。
   * @param {object} input - { eventId?, sessionId?, type, detail, ts? }
   * @returns {{ ok: boolean, orphan?: boolean, eventId?: string, error?: string }}
   */
  function recordFeedback (input) {
    if (!isEnabled()) return { ok: false, error: 'collection-muted' }
    const now = new Date()
    let eventId = input.eventId
    const sessionId = input.sessionId
    let orphan = false
    if (typeof eventId !== 'string' || eventId.length === 0) {
      // sessionId 解析：保留期（当月+上月）generation-log 中匹配 context.sessionId 的最新事件
      if (typeof sessionId === 'string' && sessionId.length > 0) {
        try {
          const genEvents = readGenerationEvents(now)
          const matched = genEvents.filter((e) => e.context && e.context.sessionId === sessionId)
          if (matched.length > 0) {
            eventId = matched[matched.length - 1].id
          }
        } catch {
          // 解析失败走孤儿路径
        }
      }
      if (typeof eventId !== 'string' || eventId.length === 0) {
        orphan = true
        eventId = 'unknown-session'
      }
    }
    const feedback = {
      eventId: eventId,
      ts: input.ts || now.toISOString(),
      type: input.type,
      detail: input.detail,
    }
    const check = validateFeedback(feedback)
    if (!check.ok) {
      log.warn('SignalCollector', 'FeedbackEvent 校验失败: ' + check.errors.join('; '))
      return { ok: false, error: 'invalid-feedback' }
    }
    try {
      const ids = new Set(readGenerationEvents(now).map((e) => e.id))
      orphan = orphan || !ids.has(feedback.eventId)
      if (orphan) log.warn('SignalCollector', '孤儿反馈 eventId=' + feedback.eventId)
      appendLine(feedbackLogPath(now), JSON.stringify(feedback))
      return { ok: true, orphan: orphan, eventId: feedback.eventId }
    } catch (e) {
      log.warn('SignalCollector', 'FeedbackEvent 写入失败: ' + e.message)
      return { ok: false, error: 'write-failed' }
    }
  }

  /**
   * 按 engine 聚合基础统计。
   * @param {{ engine?: string }} [filter]
   */
  function getStats (filter) {
    const now = new Date()
    const genEvents = readGenerationEvents(now).filter((e) => !filter || !filter.engine || e.engine === filter.engine)
    const fbEvents = readLines(feedbackLogPath(now))
    const byEvent = new Map()
    for (const fb of fbEvents) {
      if (!byEvent.has(fb.eventId)) byEvent.set(fb.eventId, [])
      byEvent.get(fb.eventId).push(fb)
    }
    const out = []
    const engines = filter && filter.engine ? [filter.engine] : [...new Set(genEvents.map((e) => e.engine))]
    for (const engine of engines) {
      const events = genEvents.filter((e) => e.engine === engine)
      const shown = events.length
      const accepted = events.filter((e) => (byEvent.get(e.id) || []).some((f) => f.type === 'accepted')).length
      const regenerated = events.filter((e) => (byEvent.get(e.id) || []).some((f) => f.type === 'regenerated')).length
      const durations = events.map((e) => e.result && e.result.durationMs).filter((v) => Number.isFinite(v))
      out.push({
        engine: engine,
        shown: shown,
        accepted: accepted,
        regenerated: regenerated,
        acceptRate: shown > 0 ? accepted / shown : 0,
        regenerateRate: shown > 0 ? regenerated / shown : 0,
        avgDurationMs: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
      })
    }
    return out
  }

  /**
   * 清理超过 30 天的旧日志。
   * 真实布局为 <logDir>/generation-log|feedback-log/<YYYY-MM>.jsonl 文件；
   * 兼容历史遗留的 <YYYY-MM>/ 目录形态（一并删除）。
   */
  function cleanup () {
    try {
      const roots = [path.join(logDir, 'generation-log'), path.join(logDir, 'feedback-log')]
      const nowMs = Date.now()
      for (const root of roots) {
        if (!fs.existsSync(root)) continue
        for (const name of fs.readdirSync(root)) {
          const isFile = /^(\d{4})-(\d{2})\.jsonl$/.exec(name)
          const isDir = /^(\d{4})-(\d{2})$/.exec(name)
          if (!isFile && !isDir) continue
          const m = isFile || isDir
          const y = Number(m[1])
          const mo = Number(m[2])
          // 该月最后一天的 23:59:59 距今超过保留期则删除
          const lastDay = new Date(y, mo, 0, 23, 59, 59).getTime()
          if (nowMs - lastDay > RETENTION_MS) {
            const target = path.join(root, name)
            fs.rmSync(target, { recursive: true, force: true })
            log.info('SignalCollector', '清理过期日志: ' + target)
          }
        }
      }
    } catch (e) {
      log.warn('SignalCollector', '日志清理失败: ' + e.message)
    }
  }

  return { recordGeneration, recordFeedback, getStats, cleanup, isEnabled }
}

module.exports = { createSignalCollector, monthKey, hashUserId, FEEDBACK_TYPES }
