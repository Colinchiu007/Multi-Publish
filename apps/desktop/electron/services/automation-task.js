// @ts-check
/**
 * automation-task.js — 自动化任务的校验与触发点计算（纯函数，无副作用）
 *
 * 为什么纯函数独立成文件：调度器的正确性全在「下一次什么时候触发」这一步，
 * 而这一步最容易写错（跨天、跨周、夏令时、应用启动补触发）。把它做成不依赖
 * 定时器、不依赖 Date.now() 注入的纯函数，才能用固定时钟覆盖到边界。
 *
 * 关键取舍（写进 PRD §六）：
 * - **不引入 cron 库**：需求只有「每天 / 每周 / 固定间隔 / 启动触发」四种，
 *   引第三方 cron 解析器要为这点能力付一个依赖 + 打包体积 + 表达式校验面。
 * - **不做补触发（catch-up）**：应用没开时的到期时间**不补偿**。
 *   理由：自动化任务是「采集→改写→发布」这类有外部副作用的动作，
 *   开机补跑 20 条过期任务会把平台限流打满，且用户完全不知情。
 *   启动触发是**显式**的一种触发器（type='onAppStart'），与「补跑定时任务」是两回事。
 */

/** 触发器类型 */
const TRIGGER_TYPES = Object.freeze(['onAppStart', 'daily', 'weekly', 'interval'])
/** 失败策略：skip = 跳过失败步继续；abort = 立即中断 */
const FAILURE_POLICIES = Object.freeze(['skip', 'abort'])

const MAX_TASKS = 20
const MAX_TRIGGERS_PER_TASK = 5
const NAME_MAX = 40
const MAX_RETRIES = 3
const INTERVAL_MIN_MINUTES = 5
const INTERVAL_MAX_MINUTES = 1440 // 24h

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * 校验并归一化单个触发器。
 * @param {unknown} raw
 * @returns {{ ok: true, trigger: object } | { ok: false, reason: string }}
 */
function normalizeTrigger (raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'trigger:notObject' }
  const type = String(raw.type || '')
  if (!TRIGGER_TYPES.includes(type)) return { ok: false, reason: 'trigger:type' }

  if (type === 'onAppStart') return { ok: true, trigger: { type: 'onAppStart' } }

  if (type === 'daily' || type === 'weekly') {
    const time = String(raw.time || '')
    if (!TIME_RE.test(time)) return { ok: false, reason: 'trigger:time' }
    if (type === 'daily') return { ok: true, trigger: { type: 'daily', time } }
    const weekdays = Array.isArray(raw.weekdays) ? raw.weekdays : null
    if (!weekdays || weekdays.length === 0) return { ok: false, reason: 'trigger:weekdays' }
    const days = [...new Set(weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))]
    if (days.length === 0) return { ok: false, reason: 'trigger:weekdays' }
    days.sort((a, b) => a - b)
    return { ok: true, trigger: { type: 'weekly', weekdays: days, time } }
  }

  // interval
  const minutes = Number(raw.minutes)
  if (!Number.isInteger(minutes)) return { ok: false, reason: 'trigger:minutes' }
  if (minutes < INTERVAL_MIN_MINUTES || minutes > INTERVAL_MAX_MINUTES) return { ok: false, reason: 'trigger:minutes' }
  return { ok: true, trigger: { type: 'interval', minutes } }
}

function newTaskId () {
  return 'at_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

/**
 * 校验任务（新建/编辑共用）。不抛错：把不成立的原因逐条返回，由调用方出声。
 * @param {unknown} raw
 * @param {{ existing?: Array<{id:string,name:string}> }} [ctx]
 * @returns {{ ok: boolean, reason?: string, task?: object }}
 */
function validateAutomationTask (raw, ctx = {}) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'notObject' }

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return { ok: false, reason: 'name:empty' }
  if (name.length > NAME_MAX) return { ok: false, reason: 'name:tooLong' }

  const existing = Array.isArray(ctx.existing) ? ctx.existing : []
  const selfId = typeof raw.id === 'string' ? raw.id : null
  if (existing.some((t) => t.name === name && t.id !== selfId)) return { ok: false, reason: 'name:duplicate' }

  const rawTriggers = Array.isArray(raw.triggers) ? raw.triggers : []
  if (rawTriggers.length === 0) return { ok: false, reason: 'triggers:empty' }
  if (rawTriggers.length > MAX_TRIGGERS_PER_TASK) return { ok: false, reason: 'triggers:tooMany' }

  const triggers = []
  const seenTypes = new Set()
  for (const t of rawTriggers) {
    const r = normalizeTrigger(t)
    if (!r.ok) return { ok: false, reason: r.reason }
    if (seenTypes.has(r.trigger.type)) return { ok: false, reason: 'triggers:duplicateType' }
    seenTypes.add(r.trigger.type)
    triggers.push(r.trigger)
  }

  let maxRetries = Number(raw.maxRetries)
  if (!Number.isInteger(maxRetries) || maxRetries < 0) maxRetries = 0
  if (maxRetries > MAX_RETRIES) maxRetries = MAX_RETRIES

  const failurePolicy = FAILURE_POLICIES.includes(String(raw.failurePolicy)) ? String(raw.failurePolicy) : 'skip'

  return {
    ok: true,
    task: {
      id: selfId || newTaskId(),
      name,
      enabled: raw.enabled === false ? false : true,
      triggers,
      action: { type: 'fullAutoPipeline', config: (raw.action && raw.action.config) || {} },
      failurePolicy,
      maxRetries,
      concurrency: 'background',
      lastRunAt: typeof raw.lastRunAt === 'string' ? raw.lastRunAt : '',
      lastStatus: typeof raw.lastStatus === 'string' ? raw.lastStatus : '',
      lastError: typeof raw.lastError === 'string' ? raw.lastError : '',
    },
  }
}

/**
 * 归一化任务列表（持久化读取侧）：逐条校验，不合格的丢弃并归类出声。
 * @param {unknown} raw
 * @param {{ now?: number }} [opts]
 * @returns {{ tasks: Array, dropped: Array<{id:string|null,reason:string}>, limitReached: boolean }}
 */
function normalizeAutomationTasks (raw, opts = {}) {
  const dropped = []
  if (!Array.isArray(raw)) return { tasks: [], dropped, limitReached: false, invalidShape: true }

  const seenIds = new Set()
  const seenNames = new Set()
  const tasks = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') { dropped.push({ id: null, reason: 'notObject' }); continue }
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name || name.length > NAME_MAX) { dropped.push({ id: item.id || null, reason: 'name' }); continue }
    if (seenNames.has(name)) { dropped.push({ id: item.id || null, reason: 'duplicateName' }); continue }

    let id = typeof item.id === 'string' && item.id ? item.id : newTaskId()
    if (seenIds.has(id)) { dropped.push({ id, reason: 'duplicateId' }); continue }

    const rawTriggers = Array.isArray(item.triggers) ? item.triggers : []
    const triggers = []
    const seenTypes = new Set()
    let triggerBroken = false
    for (const t of rawTriggers) {
      const r = normalizeTrigger(t)
      if (!r.ok || seenTypes.has(r.trigger.type)) { triggerBroken = true; break }
      seenTypes.add(r.trigger.type)
      triggers.push(r.trigger)
    }
    // 触发器全废 = 这个任务永远不会被触发，留着就是僵尸 → 丢弃并出声
    if (triggerBroken || triggers.length === 0) { dropped.push({ id, reason: 'triggers' }); continue }

    seenIds.add(id)
    seenNames.add(name)
    tasks.push({
      id,
      name,
      enabled: item.enabled === false ? false : true,
      triggers,
      action: { type: 'fullAutoPipeline', config: (item.action && item.action.config) || {} },
      failurePolicy: FAILURE_POLICIES.includes(String(item.failurePolicy)) ? String(item.failurePolicy) : 'skip',
      maxRetries: Math.min(Math.max(Number(item.maxRetries) || 0, 0), MAX_RETRIES),
      concurrency: 'background',
      lastRunAt: typeof item.lastRunAt === 'string' ? item.lastRunAt : '',
      lastStatus: typeof item.lastStatus === 'string' ? item.lastStatus : '',
      lastError: typeof item.lastError === 'string' ? item.lastError : '',
    })
  }

  const limitReached = tasks.length > MAX_TASKS
  if (limitReached) {
    for (const extra of tasks.slice(MAX_TASKS)) dropped.push({ id: extra.id, reason: 'limit' })
  }
  return {
    tasks: limitReached ? tasks.slice(0, MAX_TASKS) : tasks,
    dropped,
    limitReached,
    invalidShape: false,
  }
}

function _atTime (date, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(date.getTime())
  d.setHours(h, m, 0, 0)
  return d
}

/**
 * 计算某触发器下一次触发时间。
 * @param {object} trigger
 * @param {Date} from 起始时刻（不传 Date.now()，便于测试注入固定时钟）
 * @returns {number|null} 毫秒时间戳；interval 到期返回 from，无下次返回 null
 */
function nextTriggerAt (trigger, from) {
  if (!trigger || typeof trigger.type !== 'string') return null
  const base = from instanceof Date ? from : new Date(from)

  if (trigger.type === 'onAppStart') return null // 只在启动时触发，不进定时队列
  if (trigger.type === 'interval') {
    const last = Number(trigger._lastFiredAt) || 0
    if (!last) return base.getTime()
    return last + trigger.minutes * 60 * 1000
  }

  if (trigger.type === 'daily') {
    const today = _atTime(base, trigger.time)
    if (today.getTime() > base.getTime()) return today.getTime()
    const tomorrow = new Date(base.getTime() + 24 * 60 * 60 * 1000)
    return _atTime(tomorrow, trigger.time).getTime()
  }

  if (trigger.type === 'weekly') {
    const days = Array.isArray(trigger.weekdays) ? trigger.weekdays : []
    if (days.length === 0) return null
    // JS getDay(): 0=周日..6=周六；本模型 1=周一..7=周日
    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(base.getTime() + offset * 24 * 60 * 60 * 1000)
      const modelDay = candidate.getDay() === 0 ? 7 : candidate.getDay()
      if (!days.includes(modelDay)) continue
      const at = _atTime(candidate, trigger.time)
      if (at.getTime() > base.getTime()) return at.getTime()
    }
    return null
  }

  return null
}

/** 触发方式的人类可读摘要（界面 chips 用） */
function describeTrigger (trigger) {
  if (!trigger || typeof trigger.type !== 'string') return ''
  if (trigger.type === 'onAppStart') return '启动触发'
  if (trigger.type === 'daily') return `每天 ${trigger.time}`
  if (trigger.type === 'weekly') {
    const names = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '日' }
    const days = (trigger.weekdays || []).map((d) => names[d] || String(d)).join('、')
    return `每周${days} ${trigger.time}`
  }
  if (trigger.type === 'interval') return `每 ${trigger.minutes} 分钟`
  return ''
}

module.exports = {
  TRIGGER_TYPES,
  FAILURE_POLICIES,
  MAX_TASKS,
  MAX_TRIGGERS_PER_TASK,
  NAME_MAX,
  MAX_RETRIES,
  INTERVAL_MIN_MINUTES,
  INTERVAL_MAX_MINUTES,
  TIME_RE,
  newTaskId,
  normalizeTrigger,
  validateAutomationTask,
  normalizeAutomationTasks,
  nextTriggerAt,
  describeTrigger,
}
