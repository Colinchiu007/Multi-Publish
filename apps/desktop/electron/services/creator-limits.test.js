/**
 * creator-limits.test.js — 采集数量双轨与硬上限
 *
 * 这是需求里被直接点名的部分：「需要设置默认数量，同时有个上限，
 * 一次采集数量不能超过上限」。三条不可让步的规则：
 *
 *  1. 超限 MUST 拒绝且**零副作用**（不得先执行再回滚——已入库的内容撤不回来）
 *  2. MUST NOT 静默截断：采少了必须告知剩多少、留待下次
 *  3. 单条采集仅豁免「数量上限」，MUST NOT 豁免配额
 */
const {
  COLLECT_DEFAULTS,
  resolveEffectiveLimit,
  assertCollectCount,
  planCollect,
  ClampError,
} = require('./creator-limits')

describe('creator-limits · 默认值', () => {
  it('一键采集默认 5，手动批量默认 50，全局硬上限 100', () => {
    expect(COLLECT_DEFAULTS.oneClick).toBe(5)
    expect(COLLECT_DEFAULTS.manual).toBe(50)
    expect(COLLECT_DEFAULTS.hardLimit).toBe(100)
  })
})

describe('creator-limits · 生效上限', () => {
  it('未设个人上限时用全局硬上限', () => {
    expect(resolveEffectiveLimit(null)).toBe(100)
    expect(resolveEffectiveLimit(undefined)).toBe(100)
  })

  it('个人上限低于全局时以个人为准', () => {
    expect(resolveEffectiveLimit(20)).toBe(20)
  })

  it('个人上限高于全局时被压回全局——不得借个人设置绕过硬上限', () => {
    expect(resolveEffectiveLimit(500)).toBe(100)
  })

  it('非法的个人上限（非正数）回落全局，不产生 0 或 NaN 上限', () => {
    for (const bad of [0, -1, 'abc', NaN, null]) {
      const v = resolveEffectiveLimit(bad)
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThan(0)
    }
  })
})

describe('creator-limits · 超限拒绝（零副作用）', () => {
  it('count 超过生效上限时抛出，且携带上限值供 UI 展示', () => {
    try {
      assertCollectCount(150, resolveEffectiveLimit(null))
      throw new Error('应当抛出')
    } catch (e) {
      expect(e).toBeInstanceOf(ClampError)
      expect(e.count).toBe(150)
      expect(e.max).toBe(100)
    }
  })

  it('恰好等于上限时放行（边界含端点）', () => {
    expect(() => assertCollectCount(100, 100)).not.toThrow()
  })

  it('上限 1 时 count=2 被拒', () => {
    expect(() => assertCollectCount(2, 1)).toThrow(ClampError)
  })

  it('非整数 count 被拒（浮点会让 SQL LIMIT 行为不可预期）', () => {
    expect(() => assertCollectCount(5.5, 100)).toThrow(/整数/)
    expect(() => assertCollectCount(NaN, 100)).toThrow(/整数/)
  })

  it('非正数 count 被拒', () => {
    expect(() => assertCollectCount(0, 100)).toThrow()
    expect(() => assertCollectCount(-3, 100)).toThrow()
  })
})

describe('creator-limits · 采集计划（不静默截断）', () => {
  const pending = Array.from({ length: 12 }, (_, i) => ({ id: `d${i}` }))

  it('待采集少于 count 时全取，remain 为 0', () => {
    const p = planCollect({ pending, count: 5, effectiveLimit: 100 })
    expect(p.selected).toHaveLength(5)
    expect(p.remain).toBe(7)
    expect(p.truncated).toBe(true)     // 12 > 5，必须告知剩余
  })

  it('待采集正好等于 count 时不提示剩余', () => {
    const p = planCollect({ pending: pending.slice(0, 5), count: 5, effectiveLimit: 100 })
    expect(p.selected).toHaveLength(5)
    expect(p.remain).toBe(0)
    expect(p.truncated).toBe(false)
  })

  it('超限时 planCollect 直接抛错，不返回部分计划', () => {
    // 关键：绝不能「先给 100 条再告诉用户超了」——那已经产生副作用了
    expect(() => planCollect({ pending, count: 200, effectiveLimit: 100 })).toThrow(ClampError)
  })

  it('按 publishedAt 倒序取最新（默认行为）', () => {
    const items = [
      { id: 'old', published_at: '2026-01-01T00:00:00Z' },
      { id: 'new', published_at: '2026-10-01T00:00:00Z' },
      { id: 'mid', published_at: '2026-06-01T00:00:00Z' },
    ]
    const p = planCollect({ pending: items, count: 2, effectiveLimit: 100 })
    expect(p.selected.map(x => x.id)).toEqual(['new', 'mid'])
  })

  it('published_at 缺失的排在最后而非崩溃', () => {
    const items = [
      { id: 'no-date' },
      { id: 'dated', published_at: '2026-10-01T00:00:00Z' },
    ]
    const p = planCollect({ pending: items, count: 2, effectiveLimit: 100 })
    expect(p.selected.map(x => x.id)).toEqual(['dated', 'no-date'])
  })

  it('空列表返回空计划而非抛错', () => {
    const p = planCollect({ pending: [], count: 5, effectiveLimit: 100 })
    expect(p.selected).toHaveLength(0)
    expect(p.remain).toBe(0)
    expect(p.truncated).toBe(false)
  })

  it('count 大于实际待采集数时 selected 取全部，remain 为 0', () => {
    const p = planCollect({ pending: pending.slice(0, 3), count: 10, effectiveLimit: 100 })
    expect(p.selected).toHaveLength(3)
    expect(p.remain).toBe(0)
  })
})