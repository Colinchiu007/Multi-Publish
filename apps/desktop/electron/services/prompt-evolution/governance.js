// @ts-check
/**
 * governance.js — 提示词记忆库治理层（门禁 6 规则 + 状态机 + 滑窗回滚 + 成本配额）
 *
 * 规格：openspec/changes/prompt-engine-evolution-p1b-memory/specs/prompt-engine-evolution/spec.md
 * 契约铁律：纯同步、零外部依赖（仅同目录 schema/fingerprint）、不把用户输入拼进正则（noSecrets
 * 只做预编译 token 查找）、statsProvider 可注入（生产数据源依赖 P1 recordGeneration + P1a score-log）。
 */

'use strict'

const { ENGINES, MODES } = require('./schema')

const TEMPLATE_TYPES = ['composition', 'style', 'keyword', 'metaphor', 'full']

/** learnt fragment 仅允许的四类可控参数（越界字段入库即拒绝） */
const FRAGMENT_KEYS = ['compositionType', 'action', 'object', 'creativeLevel']

/** fragment 参数 → 生成器选项参数名归一映射（m3：与 generateCandidates customAction/customObject 对齐） */
const FRAGMENT_OPTION_MAP = {
  compositionType: 'compositionType',
  action: 'customAction',
  object: 'customObject',
  creativeLevel: 'creativeLevel',
}

/** compositionType 值域（8 组，parity 锁死 storyboard-prompt.ts COMPOSITION_PATTERNS keys） */
const COMPOSITION_KEYS = [
  '流程展示', '系统局部', '前后对比', '角色状态',
  '概念隐喻', '方法分层', '地图路径', '迷你漫画',
]

/** 合规词表（V0 内置最小集，可经 config.complianceBlocklist 注入覆盖） */
const DEFAULT_COMPLIANCE_BLOCKLIST = ['赌博', '诈骗', '毒品', '枪支', '色情', '暴恐']

/** 疑似指令注入 token 表（预编译，只做 includes 查找；绝不把用户输入拼进正则） */
const NO_SECRET_TOKENS = [
  'ignore previous instructions',
  'ignore all previous instructions',
  'disregard previous instructions',
  'forget all instructions',
  'system prompt',
  'role: system',
  'you are now',
  '<!--',
  '{{system',
]

/** 状态机合法边（非法边一律拒绝） */
const LEGAL_TRANSITIONS = {
  draft: ['active'],
  active: ['deprecated'],
  deprecated: ['disabled'],
}

const DEFAULT_GOVERNANCE_CONFIG = {
  budget: { image: { daily: 2000 }, video: { daily: 0 } },
  rollback: {
    windowSize: 3,
    acceptRateThreshold: 0.3,
    avgScoreDropThreshold: 0.2,
    cooldownMs: 24 * 60 * 60 * 1000, // 24h
  },
  complianceBlocklist: DEFAULT_COMPLIANCE_BLOCKLIST,
  evaluatorVersion: 'rule-v0',
}

const GATE_RULES = ['structure', 'compliance', 'length', 'noSecrets', 'dedup']

/**
 * @param {object} opts
 * @param {object} [opts.config] - 覆盖 DEFAULT_GOVERNANCE_CONFIG
 * @param {(templateId: string) => (object|null)} [opts.statsProvider] - 返回 {acceptRateSeries, avgScoreSeries, ...}
 * @param {object} [opts.log]
 */
function createGovernance (opts) {
  const log = (opts && opts.log) || { info: () => {}, warn: () => {}, error: () => {} }
  const statsProvider = opts && typeof opts.statsProvider === 'function' ? opts.statsProvider : null
  const config = mergeConfig((opts && opts.config) || {})

  function mergeConfig (overrides) {
    const base = JSON.parse(JSON.stringify(DEFAULT_GOVERNANCE_CONFIG))
    if (overrides.budget) base.budget = Object.assign(base.budget, overrides.budget)
    if (overrides.rollback) base.rollback = Object.assign(base.rollback, overrides.rollback)
    if (Array.isArray(overrides.complianceBlocklist)) base.complianceBlocklist = overrides.complianceBlocklist
    if (typeof overrides.evaluatorVersion === 'string') base.evaluatorVersion = overrides.evaluatorVersion
    return base
  }

  // ── 工具 ─────────────────────────────

  /** 递归收集对象内全部字符串值（供 compliance/noSecrets 扫描；不把用户输入拼进正则） */
  function collectStrings (value, out) {
    if (typeof value === 'string') { out.push(value); return }
    if (Array.isArray(value)) { for (const v of value) collectStrings(v, out); return }
    if (value && typeof value === 'object') { for (const k of Object.keys(value)) collectStrings(value[k], out) }
  }

  function textOf (content) {
    if (content && typeof content === 'object') {
      if (typeof content.structure === 'string' && content.structure.length > 0) return content.structure
      if (typeof content.prompt === 'string' && content.prompt.length > 0) return content.prompt
      return ''
    }
    return ''
  }

  // ── 门禁 6 规则 ─────────────────────────────

  /** structure：engine/mode/type 枚举 + fragment 四类白名单 + compositionType 值域 + creativeLevel 1..10 + full 分档必填 */
  function gateStructure (input) {
    const { engine, mode, type, content } = input
    if (!ENGINES.includes(engine) || !MODES.includes(mode) || !TEMPLATE_TYPES.includes(type)) return false
    if (!content || typeof content !== 'object' || Array.isArray(content)) return false
    if (type !== 'full') {
      const keys = Object.keys(content)
      if (keys.some((k) => !FRAGMENT_KEYS.includes(k))) return false
      // W1：fragment 必须至少有一个非空可控参数，空模板无内容可引用不得入库
      const hasUsable = keys.some((k) => {
        const v = content[k]
        return v != null && v !== '' && (!Array.isArray(v) || v.length > 0)
      })
      if (!hasUsable) return false
      if (content.compositionType != null && !COMPOSITION_KEYS.includes(content.compositionType)) return false
      if (content.creativeLevel != null) {
        const lv = Number(content.creativeLevel)
        if (!Number.isInteger(lv) || lv < 1 || lv > 10) return false
      }
      return true
    }
    // full：按 engine/mode 分档字段完整（V0：storyboard 必须含非空 structure）
    if (mode === 'storyboard') return typeof content.structure === 'string' && content.structure.length > 0
    return Object.keys(content).length > 0
  }

  /** compliance：合规词表命中即拒绝（可注入词表） */
  function gateCompliance (input) {
    const strings = []
    collectStrings(input.content, strings)
    if (typeof input.sourceText === 'string') strings.push(input.sourceText)
    const lower = strings.join('\n').toLowerCase()
    for (const word of config.complianceBlocklist) {
      if (lower.includes(String(word).toLowerCase())) return false
    }
    return true
  }

  /** length：按 engine/mode 分档（storyboard 中文 50..2000 字符；其余英文 50..200 词）；fragment 增量豁免 */
  function gateLength (input) {
    if (input.type === 'full') {
      const text = textOf(input.content)
      if (input.mode === 'storyboard') {
        const len = text.length
        return len >= 50 && len <= 2000
      }
      const words = text.trim().split(/\s+/).filter(Boolean).length
      return words >= 50 && words <= 200
    }
    return true
  }

  /** noSecrets：预编译 token 查找（大小写不敏感），不拼用户输入进正则 */
  function gateNoSecrets (input) {
    const strings = []
    collectStrings(input.content, strings)
    if (typeof input.sourceText === 'string') strings.push(input.sourceText)
    const lower = strings.join('\n').toLowerCase()
    for (const token of NO_SECRET_TOKENS) {
      if (lower.includes(token)) return false
    }
    return true
  }

  /** dedup：checksum 与库内 active 模板完全碰撞即拒绝（近重复聚类归 P2） */
  function gateDedup (input) {
    const existing = Array.isArray(input.existingChecksums) ? input.existingChecksums : []
    return typeof input.checksum === 'string' && !existing.includes(input.checksum)
  }

  /**
   * 执行门禁 6 规则。任一失败模板不得进入 draft。
   * @returns {{ok:boolean, gateRules?:string[], evaluatorVersion?:string, failedRules?:string[], errors?:string[]}}
   */
  function runGates (input) {
    const failedRules = []
    const rules = {
      structure: gateStructure(input),
      compliance: gateCompliance(input),
      length: gateLength(input),
      noSecrets: gateNoSecrets(input),
      dedup: gateDedup(input),
    }
    for (const rule of GATE_RULES) {
      if (!rules[rule]) failedRules.push(rule)
    }
    if (failedRules.length > 0) {
      log.warn('Governance', '门禁未通过: ' + failedRules.join(','))
      return { ok: false, failedRules, errors: failedRules.map((r) => 'gate-' + r + '-failed') }
    }
    return { ok: true, gateRules: GATE_RULES, evaluatorVersion: config.evaluatorVersion }
  }

  // ── 状态机 ─────────────────────────────

  function canTransition (from, to) {
    const allowed = LEGAL_TRANSITIONS[from]
    return Array.isArray(allowed) && allowed.includes(to)
  }

  // ── 滑窗回滚（指标化可测；生产数据源依赖 P1/P1a，V0 注入验证）───

  /**
   * 对单个模板做回滚判定（纯函数，幂等由 cooldownUntil 保证）。
   * @param {{id:string, cooldownUntil?:string|null}} template
   * @param {string|Date} now
   */
  function evaluateRollback (template, now) {
    // 注意：NaN 为 falsy，必须用 != null 判断（null/undefined → 当前时间；NaN/非法字符串 → not-triggered）
    const nowMs = now != null ? new Date(now).getTime() : Date.now()
    if (!Number.isFinite(nowMs)) return { ok: false, reason: 'not-triggered' }
    if (template.cooldownUntil) {
      const until = new Date(template.cooldownUntil).getTime()
      if (Number.isFinite(until) && until > nowMs) return { ok: false, reason: 'cooldown-active' }
    }
    const stats = statsProvider ? statsProvider(template.id) : null
    if (!stats || typeof stats !== 'object') return { ok: false, reason: 'no-stats' }
    const rb = config.rollback
    const cooldownUntil = new Date(nowMs + rb.cooldownMs).toISOString()

    const acceptSeries = Array.isArray(stats.acceptRateSeries) ? stats.acceptRateSeries : []
    if (acceptSeries.length >= rb.windowSize) {
      const tail = acceptSeries.slice(-rb.windowSize)
      if (tail.every((r) => r < rb.acceptRateThreshold)) {
        return { ok: true, action: 'deprecate', reason: 'sliding-window-rollback', cooldownUntil }
      }
    }
    const avgSeries = Array.isArray(stats.avgScoreSeries) ? stats.avgScoreSeries : []
    if (avgSeries.length >= 2) {
      const peak = Math.max(...avgSeries)
      const latest = avgSeries[avgSeries.length - 1]
      if (peak > 0 && (peak - latest) / peak > rb.avgScoreDropThreshold) {
        return { ok: true, action: 'deprecate', reason: 'avg-score-drop', cooldownUntil }
      }
    }
    return { ok: false, reason: 'not-triggered' }
  }

  /** 批量回滚判定（幂等：已冷却/无数据的模板被跳过） */
  function checkRollback (templates, now) {
    const list = Array.isArray(templates) ? templates : []
    const out = []
    for (const t of list) {
      const d = evaluateRollback(t, now)
      if (d.ok) out.push(Object.assign({ id: t.id }, d))
    }
    return out
  }

  // ── 成本配额 ─────────────────────────────

  /**
   * 配额超限/视频默认零 → 自动评分/入库评估跳过（生成主流程不阻断）。
   * V0 无 score-log 时 spend=0，配额只作闸门。
   */
  function isAutoEvaluationAllowed (engine, opts) {
    const daily = config.budget[engine] && config.budget[engine].daily
    if (!daily || daily <= 0) return false
    const spend = (opts && typeof opts.spend === 'number') ? opts.spend : 0
    return spend < daily
  }

  return { runGates, canTransition, evaluateRollback, checkRollback, isAutoEvaluationAllowed, config }
}

module.exports = {
  createGovernance,
  TEMPLATE_TYPES,
  FRAGMENT_KEYS,
  FRAGMENT_OPTION_MAP,
  COMPOSITION_KEYS,
  DEFAULT_COMPLIANCE_BLOCKLIST,
  NO_SECRET_TOKENS,
  LEGAL_TRANSITIONS,
  DEFAULT_GOVERNANCE_CONFIG,
  GATE_RULES,
}
