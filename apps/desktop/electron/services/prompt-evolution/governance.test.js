// @ts-check
// @vitest-environment node
/**
 * governance.test.js — 门禁 6 规则 + 状态机 + 滑窗回滚 + 配额（TDD，P1b 记忆库+治理）
 * 规格：openspec/changes/prompt-engine-evolution-p1b-memory
 */
const {
  createGovernance,
  TEMPLATE_TYPES,
  FRAGMENT_KEYS,
  COMPOSITION_KEYS,
  FRAGMENT_OPTION_MAP,
  NO_SECRET_TOKENS,
  DEFAULT_COMPLIANCE_BLOCKLIST,
  LEGAL_TRANSITIONS,
} = require('./governance')

const silent = { info: () => {}, warn: () => {}, error: () => {} }

function makeGov(opts) {
  const o = opts || {}
  return createGovernance({ config: o.config, statsProvider: o.statsProvider, log: silent })
}

/** 合法 fragment 入参（四类可控参数） */
function validFragment(content, overrides) {
  return Object.assign({ engine: 'image', mode: 'story2video', type: 'composition', content, sourceText: 'AI 改变教育', checksum: 'sha256-a', existingChecksums: [] }, overrides)
}

describe('governance: 常量与 parity', () => {
  it('TEMPLATE_TYPES 含 5 类', () => {
    expect(TEMPLATE_TYPES.sort()).toEqual(['composition', 'full', 'keyword', 'metaphor', 'style'].sort())
  })

  it('FRAGMENT_KEYS 恰为四类可控参数', () => {
    expect(FRAGMENT_KEYS.sort()).toEqual(['action', 'compositionType', 'creativeLevel', 'object'].sort())
  })

  it('COMPOSITION_KEYS 8 组与 storyboard-prompt.ts COMPOSITION_PATTERNS keys 完全一致（parity）', () => {
    const fs = require('fs')
    const path = require('path')
    const ts = fs.readFileSync(path.join(__dirname, '../../../../../packages/story2video-engine/src/storyboard-prompt.ts'), 'utf8')
    const keys = []
    for (const m of ts.matchAll(/^\s{2}"([^"]+)":\s*\{/gm)) keys.push(m[1])
    const compKeys = keys.filter((k) => k.length > 1)
    expect([...COMPOSITION_KEYS].sort()).toEqual([...compKeys].sort())
  })

  it('FRAGMENT_OPTION_MAP 归一 action/object → customAction/customObject', () => {
    expect(FRAGMENT_OPTION_MAP.action).toBe('customAction')
    expect(FRAGMENT_OPTION_MAP.object).toBe('customObject')
    expect(FRAGMENT_OPTION_MAP.compositionType).toBe('compositionType')
    expect(FRAGMENT_OPTION_MAP.creativeLevel).toBe('creativeLevel')
  })

  it('noSecrets 使用预编译 token 表（数组，不拼用户输入进正则）', () => {
    expect(Array.isArray(NO_SECRET_TOKENS)).toBe(true)
    expect(NO_SECRET_TOKENS.length).toBeGreaterThan(0)
    expect(NO_SECRET_TOKENS.every((t) => typeof t === 'string')).toBe(true)
  })

  it('DEFAULT_COMPLIANCE_BLOCKLIST 非空数组', () => {
    expect(Array.isArray(DEFAULT_COMPLIANCE_BLOCKLIST)).toBe(true)
    expect(DEFAULT_COMPLIANCE_BLOCKLIST.length).toBeGreaterThan(0)
  })
})

describe('governance: 门禁 6 规则', () => {
  it('合法 fragment 全部规则通过并记录 evaluatorVersion', () => {
    const gov = makeGov()
    const r = gov.runGates(validFragment({ compositionType: '前后对比', action: '放大', object: '书本', creativeLevel: 7 }))
    expect(r.ok).toBe(true)
    expect(r.gateRules).toEqual(expect.arrayContaining(['structure', 'compliance', 'length', 'noSecrets', 'dedup']))
    expect(r.evaluatorVersion).toBe('rule-v0')
  })

  it('structure: fragment 越界字段（color）拒绝', () => {
    const gov = makeGov()
    const r = gov.runGates(validFragment({ compositionType: '前后对比', color: 'red' }))
    expect(r.ok).toBe(false)
    expect(r.failedRules).toContain('structure')
  })

  it('structure: fragment 空对象 / 全空值（无可控参数）拒绝（W1）', () => {
    const gov = makeGov()
    const empty = gov.runGates(validFragment({}))
    expect(empty.ok).toBe(false)
    expect(empty.failedRules).toContain('structure')
    const emptyValues = gov.runGates(validFragment({ compositionType: null, action: '', object: [] }))
    expect(emptyValues.ok).toBe(false)
    expect(emptyValues.failedRules).toContain('structure')
  })

  it('structure: compositionType 非 8 组枚举值拒绝', () => {
    const gov = makeGov()
    const r = gov.runGates(validFragment({ compositionType: '乱序拼贴', action: '放大' }))
    expect(r.ok).toBe(false)
    expect(r.failedRules).toContain('structure')
  })

  it('structure: creativeLevel 越界（0 / 11 / 非整数）拒绝', () => {
    const gov = makeGov()
    for (const v of [0, 11, 7.5]) {
      const r = gov.runGates(validFragment({ compositionType: '前后对比', creativeLevel: v }))
      expect(r.ok).toBe(false)
      expect(r.failedRules).toContain('structure')
    }
  })

  it('structure: full 类型 storyboard 必须含非空 structure', () => {
    const gov = makeGov()
    const r = gov.runGates(validFragment({ structure: '' }, { type: 'full', mode: 'storyboard', checksum: 'sha256-b' }))
    expect(r.ok).toBe(false)
    expect(r.failedRules).toContain('structure')
  })

  it('compliance: 命中合规词表拒绝', () => {
    const gov = makeGov({ config: { complianceBlocklist: ['内测违禁词'] } })
    const r = gov.runGates(validFragment({ compositionType: '前后对比', action: '放大内测违禁词' }))
    expect(r.ok).toBe(false)
    expect(r.failedRules).toContain('compliance')
  })

  it('length: storyboard 中文 50..2000 字符（full）', () => {
    const gov = makeGov()
    const long = '这是一个用于测试长度门禁的中文分镜结构描述'.repeat(5) // 90 字符左右
    const ok = gov.runGates(validFragment({ structure: long }, { type: 'full', mode: 'storyboard', checksum: 'sha256-c1' }))
    expect(ok.ok).toBe(true)
    const short = gov.runGates(validFragment({ structure: '太短' }, { type: 'full', mode: 'storyboard', checksum: 'sha256-c2' }))
    expect(short.ok).toBe(false)
    expect(short.failedRules).toContain('length')
    const huge = gov.runGates(validFragment({ structure: '长'.repeat(3000) }, { type: 'full', mode: 'storyboard', checksum: 'sha256-c3' }))
    expect(huge.ok).toBe(false)
    expect(huge.failedRules).toContain('length')
  })

  it('length: 非 storyboard 英文 prompt 50..200 词（full）', () => {
    const gov = makeGov()
    const words80 = Array.from({ length: 80 }, (_, i) => 'word' + i).join(' ')
    const ok = gov.runGates(validFragment({ prompt: words80 }, { type: 'full', mode: 'standalone', checksum: 'sha256-d1' }))
    expect(ok.ok).toBe(true)
    const words30 = Array.from({ length: 30 }, (_, i) => 'word' + i).join(' ')
    const short = gov.runGates(validFragment({ prompt: words30 }, { type: 'full', mode: 'standalone', checksum: 'sha256-d2' }))
    expect(short.ok).toBe(false)
    expect(short.failedRules).toContain('length')
  })

  it('length: fragment 豁免（四类参数为增量，不适用全文长度）', () => {
    const gov = makeGov()
    const r = gov.runGates(validFragment({ compositionType: '前后对比', action: '放大', object: '书本' }))
    expect(r.ok).toBe(true)
  })

  it('noSecrets: 疑似指令注入 token 拒绝（大小写不敏感）', () => {
    const gov = makeGov()
    const r = gov.runGates(validFragment({ compositionType: '前后对比', action: 'Ignore Previous Instructions' }))
    expect(r.ok).toBe(false)
    expect(r.failedRules).toContain('noSecrets')
  })

  it('dedup: checksum 与库内完全碰撞拒绝', () => {
    const gov = makeGov()
    const r = gov.runGates(validFragment({ compositionType: '前后对比', action: '放大' }, { checksum: 'sha256-same', existingChecksums: ['sha256-same'] }))
    expect(r.ok).toBe(false)
    expect(r.failedRules).toContain('dedup')
  })
})

describe('governance: 状态机', () => {
  it('合法边：draft→active→deprecated→disabled', () => {
    const gov = makeGov()
    expect(gov.canTransition('draft', 'active')).toBe(true)
    expect(gov.canTransition('active', 'deprecated')).toBe(true)
    expect(gov.canTransition('deprecated', 'disabled')).toBe(true)
  })

  it('非法边一律拒绝（含回退边）', () => {
    const gov = makeGov()
    const illegal = [
      ['draft', 'deprecated'], ['draft', 'disabled'], ['draft', 'draft'],
      ['active', 'active'], ['active', 'draft'], ['active', 'disabled'],
      ['deprecated', 'active'], ['deprecated', 'deprecated'], ['deprecated', 'draft'],
      ['disabled', 'active'], ['disabled', 'deprecated'], ['disabled', 'draft'],
    ]
    for (const [from, to] of illegal) {
      expect(gov.canTransition(from, to)).toBe(false)
    }
    expect(Object.keys(LEGAL_TRANSITIONS).sort()).toEqual(['active', 'deprecated', 'draft'].sort())
  })
})

describe('governance: 滑窗回滚 + 冷却', () => {
  const FIXED_NOW = '2026-08-13T12:00:00.000Z'

  it('acceptRate 连续 N 期 < 阈值 → 回滚决定（deprecate + cooldownUntil）', () => {
    const gov = makeGov({ statsProvider: () => ({ acceptRateSeries: [0.2, 0.1, 0.05], avgScoreSeries: [] }) })
    const d = gov.evaluateRollback({ id: 'tpl-1', cooldownUntil: null }, FIXED_NOW)
    expect(d.ok).toBe(true)
    expect(d.action).toBe('deprecate')
    expect(d.reason).toBe('sliding-window-rollback')
    expect(new Date(d.cooldownUntil).getTime()).toBe(new Date(FIXED_NOW).getTime() + 24 * 3600 * 1000)
  })

  it('acceptRate 未连续低于阈值 → 不触发', () => {
    const gov = makeGov({ statsProvider: () => ({ acceptRateSeries: [0.5, 0.4, 0.2], avgScoreSeries: [] }) })
    expect(gov.evaluateRollback({ id: 'tpl-2' }, FIXED_NOW).ok).toBe(false)
  })

  it('avgScore 相对峰值下滑 > 20% → 回滚决定', () => {
    const gov = makeGov({ statsProvider: () => ({ acceptRateSeries: [], avgScoreSeries: [8, 8, 6] }) })
    const d = gov.evaluateRollback({ id: 'tpl-3' }, FIXED_NOW)
    expect(d.ok).toBe(true)
    expect(d.reason).toBe('avg-score-drop')
  })

  it('冷却期内不重复回滚（幂等），冷却过期后重新触发', () => {
    const gov = makeGov({ statsProvider: () => ({ acceptRateSeries: [0.1, 0.1, 0.1], avgScoreSeries: [] }) })
    const d1 = gov.evaluateRollback({ id: 'tpl-4', cooldownUntil: null }, FIXED_NOW)
    expect(d1.ok).toBe(true)
    // 冷却期内：同一模板再评估 → cooldown-active
    const d2 = gov.evaluateRollback({ id: 'tpl-4', cooldownUntil: d1.cooldownUntil }, FIXED_NOW)
    expect(d2.ok).toBe(false)
    expect(d2.reason).toBe('cooldown-active')
    // 冷却过期（+25h）→ 再次触发
    const later = new Date(new Date(FIXED_NOW).getTime() + 25 * 3600 * 1000).toISOString()
    const d3 = gov.evaluateRollback({ id: 'tpl-4', cooldownUntil: d1.cooldownUntil }, later)
    expect(d3.ok).toBe(true)
  })

  it('无 statsProvider / 无数据 → no-stats，不触发', () => {
    const gov = makeGov()
    expect(gov.evaluateRollback({ id: 'tpl-5' }, FIXED_NOW).reason).toBe('no-stats')
  })

  it('非法 now 输入 → not-triggered，不抛 RangeError（W4）', () => {
    const gov = makeGov({ statsProvider: () => ({ acceptRateSeries: [0.1, 0.1, 0.1], avgScoreSeries: [] }) })
    for (const bad of ['not-a-date', '2026-13-99T99:99:99.000Z', NaN]) {
      expect(() => gov.evaluateRollback({ id: 'tpl-x' }, bad)).not.toThrow()
      const d = gov.evaluateRollback({ id: 'tpl-x' }, bad)
      expect(d.ok).toBe(false)
      expect(d.reason).toBe('not-triggered')
    }
  })

  it('checkRollback 聚合多模板决定', () => {
    const gov = makeGov({ statsProvider: (id) => (id === 'tpl-bad' ? { acceptRateSeries: [0.1, 0.1, 0.1], avgScoreSeries: [] } : null) })
    const decisions = gov.checkRollback([{ id: 'tpl-ok' }, { id: 'tpl-bad' }], FIXED_NOW)
    expect(decisions).toHaveLength(1)
    expect(decisions[0].id).toBe('tpl-bad')
  })
})

describe('governance: 成本配额', () => {
  it('视频引擎默认 daily=0 → 恒不允许自动评分', () => {
    const gov = makeGov()
    expect(gov.isAutoEvaluationAllowed('video', { spend: 0 })).toBe(false)
    expect(gov.isAutoEvaluationAllowed('video', { spend: 999 })).toBe(false)
  })

  it('图片引擎配额未超限允许、超限拒绝（降级不阻断）', () => {
    const gov = makeGov()
    expect(gov.isAutoEvaluationAllowed('image', { spend: 0 })).toBe(true)
    expect(gov.isAutoEvaluationAllowed('image', { spend: 1999 })).toBe(true)
    expect(gov.isAutoEvaluationAllowed('image', { spend: 2000 })).toBe(false)
    expect(gov.isAutoEvaluationAllowed('image', { spend: 2500 })).toBe(false)
  })

  it('配置注入自定义预算', () => {
    const gov = makeGov({ config: { budget: { image: { daily: 10 }, video: { daily: 5 } } } })
    expect(gov.isAutoEvaluationAllowed('image', { spend: 9 })).toBe(true)
    expect(gov.isAutoEvaluationAllowed('video', { spend: 4 })).toBe(true)
    expect(gov.isAutoEvaluationAllowed('video', { spend: 5 })).toBe(false)
  })
})
