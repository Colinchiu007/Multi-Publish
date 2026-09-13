// @ts-check
/**
 * governance.js — 提示词引擎自进化治理层
 *
 * 规格：openspec/changes/prompt-engine-evolution-p1b-memory
 * - 门禁 6 规则：structure / compliance / length / noSecrets / dedup / evaluatorVersion
 * - 状态机：draft → active → deprecated → disabled（V0 仅人工确认激活）
 * - 滑窗回滚：acceptRate 连续 N 期 < 阈值 或 avgScore 下滑 > 阈值 → deprecated + 冷却防抖
 * - 成本配额：按 engine dailyBudget；视频默认零自动评分
 *
 * 契约铁律：纯函数、可注入配置、无 LLM；测试 os.tmpdir() 隔离。
 */
'use strict'

const crypto = require('crypto')
const { STATE_TRANSITIONS } = require('./prompt-memory')

const DEFAULT_CONFIG = {
  complianceWords: [],
  budget: { image: { daily: 2000 }, video: { daily: 0 } },
  rollback: {
    acceptRateThreshold: 0.3,
    acceptRateWindow: 3, // 连续 N 期
    avgScoreDropThreshold: 0.2, // 相对峰值下滑比例
    cooldownMs: 24 * 60 * 60 * 1000,
  },
  length: {
    storyboardZhMin: 50,
    storyboardZhMax: 2000,
    promptEnMinWords: 50,
    promptEnMaxWords: 200,
  },
  evaluatorVersion: 'rule-v0',
}

/** COMPOSITION_PATTERNS 的 key 集合（8 种构图模式，parity 锁死） */
const COMPOSITION_TYPES = [
  '流程展示', '系统局部', '前后对比', '角色状态',
  '概念隐喻', '方法分层', '地图路径', '迷你漫画',
]

/** 疑似指令注入 token（预编译查找，不拼用户输入进正则） */
const INJECTION_TOKENS = [
  'system:', '"system"', "'system'", 'ignore previous', 'ignore all', 'you are now',
  'forget your instructions', 'override', 'jailbreak', 'do anything now',
]

function isPlainObject (v) {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function sha256 (text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex')
}

function canonicalJson (obj) {
  return JSON.stringify(sortKeys(obj))
}

function sortKeys (obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys)
  if (obj && typeof obj === 'object') {
    const out = {}
    for (const k of Object.keys(obj).sort()) out[k] = sortKeys(obj[k])
    return out
  }
  return obj
}

/**
 * @param {object} opts
 * @param {object} [opts.config]
 * @param {object} opts.memory - prompt-memory 实例
 * @param {(templateId:string)=>object|null} [opts.statsProvider]
 * @param {object} [opts.log]
 * @param {()=>Date} [opts.now]
 */
function createGovernance (opts) {
  const config = { ...DEFAULT_CONFIG, ...(opts.config || {}) }
  const memory = opts.memory
  const _log = opts.log || { info: () => {}, warn: () => {}, error: () => {} }
  const statsProvider = opts.statsProvider || (() => null)
  const nowFn = opts.now || (() => new Date())

  /** 计算 content checksum（canonical JSON） */
  function checksumOf (content) {
    return sha256(canonicalJson(content || {}))
  }

  /** structure 规则：按 engine/mode 分档字段完整 + fragment 四类参数白名单 + compositionType 值域 */
  function ruleStructure (tpl) {
    const content = tpl.content
    if (!isPlainObject(content)) return { ok: false, detail: 'content 必须为对象' }
    if (tpl.type === 'fragment') {
      const allowed = ['compositionType', 'action', 'object', 'creativeLevel']
      const keys = Object.keys(content)
      if (keys.length === 0) return { ok: false, detail: 'fragment content 不能为空' }
      if (!keys.every((k) => allowed.includes(k))) {
        return { ok: false, detail: 'fragment 仅允许四类可控参数: ' + allowed.join('/') }
      }
      // compositionType 值域校验
      if (typeof content.compositionType !== 'string' || !COMPOSITION_TYPES.includes(content.compositionType)) {
        return { ok: false, detail: 'compositionType 非法: ' + content.compositionType }
      }
    } else if (tpl.type === 'full') {
      // full 模板需有 structure 字段
      if (typeof content.structure !== 'string' || content.structure.length === 0) {
        return { ok: false, detail: 'full 模板缺少 structure' }
      }
    }
    return { ok: true }
  }

  /** compliance 规则：合规词表命中拒绝 */
  function ruleCompliance (tpl) {
    const words = config.complianceWords || []
    if (words.length === 0) return { ok: true }
    const text = JSON.stringify(tpl.content || {})
    for (const w of words) {
      if (text.includes(w)) return { ok: false, detail: '命中合规词: ' + w }
    }
    return { ok: true }
  }

  /** length 规则：按 engine 分档 */
  function ruleLength (tpl) {
    // fragment 四类参数不校验长度（数值/短词）
    if (tpl.type === 'fragment') return { ok: true }
    if (tpl.type === 'full' && tpl.mode === 'storyboard') {
      const structure = (tpl.content && tpl.content.structure) || ''
      const len = Array.from(structure).length
      if (len < config.length.storyboardZhMin || len > config.length.storyboardZhMax) {
        return { ok: false, detail: 'storyboard 中文长度需在 ' + config.length.storyboardZhMin + '..' + config.length.storyboardZhMax }
      }
    } else {
      // 英文 prompt 词数
      const text = JSON.stringify(tpl.content || {})
      const words = text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w))
      if (words.length < config.length.promptEnMinWords || words.length > config.length.promptEnMaxWords) {
        return { ok: false, detail: '英文 prompt 词数需在 ' + config.length.promptEnMinWords + '..' + config.length.promptEnMaxWords }
      }
    }
    return { ok: true }
  }

  /** noSecrets 规则：疑似指令注入模式（预编译 token 查找） */
  function ruleNoSecrets (tpl) {
    // 用 content 的原始字符串表示（含嵌套值），避免 JSON.stringify 转义引号导致漏检
    const raw = JSON.stringify(tpl.content || {}).toLowerCase()
    // 同时拼接 content 各字段原始值（含未转义引号），覆盖分隔符逃逸模式
    const values = Object.values(tpl.content || {}).map((v) => String(v).toLowerCase()).join(' ')
    const text = raw + '\n' + values
    for (const token of INJECTION_TOKENS) {
      if (text.includes(token)) return { ok: false, detail: '疑似指令注入 token: ' + token }
    }
    return { ok: true }
  }

  /** dedup 规则：checksum 精确去重（V0） */
  function ruleDedup (tpl) {
    const checksum = checksumOf(tpl.content)
    // 遍历库内全部已入库模板（含 draft），检查 checksum 碰撞
    // （draft 也参与去重，避免重复入库；disabled 除外——终态可重新入库）
    const all = memory.list({})
    for (const item of all) {
      if (item.state === 'disabled') continue
      const existing = memory.get(item.id)
      if (existing && existing.guard && existing.guard.checksum === checksum && existing.id !== tpl.id) {
        return { ok: false, detail: 'checksum 完全碰撞: ' + item.id }
      }
    }
    return { ok: true, checksum }
  }

  /**
   * 门禁 6 规则。
   * @returns {{pass:boolean, results:object, checksum?:string, evaluatorVersion?:string}}
   */
  function runGates (tpl) {
    const results = {}
    const structure = ruleStructure(tpl)
    results.structure = structure.ok ? 'ok' : 'fail'
    const compliance = ruleCompliance(tpl)
    results.compliance = compliance.ok ? 'ok' : 'fail'
    const length = ruleLength(tpl)
    results.length = length.ok ? 'ok' : 'fail'
    const noSecrets = ruleNoSecrets(tpl)
    results.noSecrets = noSecrets.ok ? 'ok' : 'fail'
    const dedup = ruleDedup(tpl)
    results.dedup = dedup.ok ? 'ok' : 'fail'
    const pass = structure.ok && compliance.ok && length.ok && noSecrets.ok && dedup.ok
    return {
      pass,
      results,
      checksum: dedup.checksum,
      evaluatorVersion: config.evaluatorVersion,
    }
  }

  /** 状态机校验后委托 memory 流转 */
  function transition (id, to, { reason } = {}) {
    const tpl = memory.get(id)
    if (!tpl) return { ok: false, code: 'TEMPLATE_NOT_FOUND' }
    const allowed = STATE_TRANSITIONS[tpl.state] || []
    if (!allowed.includes(to)) return { ok: false, code: 'TEMPLATE_BAD_STATE' }
    if (to === 'active') {
      const r = memory.activate(id, { confirmedBy: reason })
      return r ? { ok: true, id, state: r.state } : { ok: false, code: 'TEMPLATE_BAD_STATE' }
    }
    if (to === 'deprecated') {
      const r = memory.deprecate(id, { reason })
      return r ? { ok: true, id, state: r.state } : { ok: false, code: 'TEMPLATE_BAD_STATE' }
    }
    if (to === 'disabled') {
      const r = memory.disable(id)
      return r ? { ok: true, id, state: r.state } : { ok: false, code: 'TEMPLATE_BAD_STATE' }
    }
    return { ok: false, code: 'TEMPLATE_BAD_STATE' }
  }

  /** 判断 acceptRate 是否连续 N 期低于阈值 */
  function acceptRateFailing (stats) {
    const series = stats && stats.acceptRateSeries
    if (!Array.isArray(series) || series.length < config.rollback.acceptRateWindow) return false
    const window = series.slice(-config.rollback.acceptRateWindow)
    return window.every((r) => r < config.rollback.acceptRateThreshold)
  }

  /** 判断 avgScore 是否相对峰值下滑超过阈值 */
  function avgScoreFailing (stats) {
    const series = stats && stats.avgScoreSeries
    if (!Array.isArray(series) || series.length < 2) return false
    const peak = Math.max(...series)
    const latest = series[series.length - 1]
    if (peak === 0) return false
    return (peak - latest) / peak > config.rollback.avgScoreDropThreshold
  }

  /**
   * 滑窗回滚扫描。
   * @param {Date} now
   * @returns {Array<{id:string, to:string, reason:string}>}
   */
  function checkRollback (now) {
    const changes = []
    const nowDate = now || nowFn()
    const nowMs = nowDate.getTime()
    const active = memory.listActive({})
    for (const t of active) {
      const tpl = memory.get(t.id)
      if (!tpl) continue
      // 冷却期检查
      if (tpl.cooldownUntil && new Date(tpl.cooldownUntil).getTime() > nowMs) continue
      const stats = statsProvider(t.id)
      if (!stats) continue
      const reason = acceptRateFailing(stats)
        ? 'sliding-window-rollback:accept-rate'
        : (avgScoreFailing(stats) ? 'sliding-window-rollback:avg-score-drop' : null)
      if (reason) {
        const r = memory.deprecate(t.id, { reason })
        if (r) changes.push({ id: t.id, to: 'deprecated', reason })
      }
    }
    return changes
  }

  /** 成本配额检查 */
  function isAutoEvaluationAllowed (engine, today) {
    const budget = (config.budget && config.budget[engine]) || { daily: 0 }
    if (budget.daily === 0) return false
    // V0 无 score-log 时 spend=0，配额只作闸门；today 作为当日查询键传入 statsProvider
    const stats = statsProvider('__budget__:' + engine + ':' + today)
    const todaySpend = stats && stats.todaySpend ? Number(stats.todaySpend) : 0
    return todaySpend < budget.daily
  }

  return { runGates, transition, checkRollback, isAutoEvaluationAllowed, checksumOf }
}

module.exports = {
  createGovernance,
  DEFAULT_CONFIG,
  COMPOSITION_TYPES,
  INJECTION_TOKENS,
}