// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * rollout-view.test.js — 生效看板测试（先于实现编写，规格锚点：
 * openspec/changes/rollout-board/specs/rollout-board/spec.md）
 *
 * 三层覆盖：
 *   A. api 层契约（fetchRollout 传参）
 *   B. 纯函数判据（rollout-board-utils.js，规格场景的直接映射）
 *   C. 接线齐备（路由 / 菜单 / 页面引导三处，缺一即红）
 *
 * 响应样例结构照抄 rollout_summary() 真源（resilience_service.py）。
 */

// ──────────────────────────────── A. api 层 ────────────────────────────────

const getSpy = vi.hoisted(() => vi.fn(async () => ({ data: {} })))

vi.mock('../src/api/http', () => ({
  apiErrorMessage: (e, fallback = '请求失败') => e?.response?.data?.detail || fallback,
  createApiClient: () => ({ get: getSpy }),
}))

import { fetchRollout } from '../src/api/rollout'
import {
  formatPercent,
  formatAckTime,
  sortedBlockRates,
  versionOptions,
  isEmptySummary,
  degradationBadge,
} from '../src/views/rollout-board-utils'
import { MENU_ITEMS, DEFAULT_MENU_ORDER } from '../src/config/menuItems'
import { pageGuides } from '../src/pageGuides'
import { routes } from '../src/router'

const SAMPLE = {
  version: 42,
  total: 100,
  acked: 87,
  stale: 13,
  degraded: 5,
  ack_rate: 0.87,
  block_rates: { appMenu: 0.97, feature_flags: 0.5, content_templates: 0.71 },
  clients: [
    { client_id: 'c1', client_version: '2.1.0', config_version: 42, config_hash: 'a1b2c3d4e5f60718', degraded: true, degradation_tier: 'L2', ack_type: 'apply', last_ack_at: '2026-10-08T07:30:00Z' },
    { client_id: 'c2', client_version: '2.0.9', config_version: 41, config_hash: 'ffffffffffffffff', degraded: false, degradation_tier: null, ack_type: 'heartbeat', last_ack_at: null },
  ],
}

describe('fetchRollout（api 契约）', () => {
  beforeEach(() => { getSpy.mockClear() })

  it('默认不带 version 参数（后端自动取最新版本）', async () => {
    await fetchRollout()
    expect(getSpy).toHaveBeenCalledTimes(1)
    const [url, config] = getSpy.mock.calls[0]
    expect(url).toBe('/runtime/rollout')
    expect(config?.params?.version).toBeUndefined()
  })

  it('指定版本时以 ?version=N 透传', async () => {
    await fetchRollout({ version: 41 })
    expect(getSpy.mock.calls[0][1].params).toEqual({ version: 41 })
  })

  it('返回响应体 data', async () => {
    getSpy.mockResolvedValueOnce({ data: SAMPLE })
    expect(await fetchRollout()).toEqual(SAMPLE)
  })
})

// ─────────────────────────── B. 纯函数判据（规格场景） ───────────────────────────

describe('formatPercent（0~1 小数 → 1 位小数百分比）', () => {
  it('ack_rate 0.87 → 87.0%', () => {
    expect(formatPercent(0.87)).toBe('87.0%')
  })
  it('边界值钳制：1.2 → 100.0%，-0.3 → 0.0%', () => {
    expect(formatPercent(1.2)).toBe('100.0%')
    expect(formatPercent(-0.3)).toBe('0.0%')
  })
  it('非法输入（NaN/undefined/null）→ 0.0%，不出现 NaN 文案', () => {
    expect(formatPercent(NaN)).toBe('0.0%')
    expect(formatPercent(undefined)).toBe('0.0%')
    expect(formatPercent(null)).toBe('0.0%')
  })
})

describe('formatAckTime（ISO → 本地可读；空值 —）', () => {
  it('ISO 时间本地化且不含 T/Z 原文', () => {
    const out = formatAckTime('2026-10-08T07:30:00Z')
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(out).not.toContain('T')
  })
  it('null/undefined/非法串 → —', () => {
    expect(formatAckTime(null)).toBe('—')
    expect(formatAckTime(undefined)).toBe('—')
    expect(formatAckTime('not-a-date')).toBe('—')
  })
})

describe('sortedBlockRates（分块确认率降序）', () => {
  it('按比率降序并格式化百分比', () => {
    const out = sortedBlockRates(SAMPLE.block_rates)
    expect(out.map((b) => b.name)).toEqual(['appMenu', 'content_templates', 'feature_flags'])
    expect(out[0].percent).toBe('97.0%')
  })
  it('空/非法输入 → 空数组', () => {
    expect(sortedBlockRates({})).toEqual([])
    expect(sortedBlockRates(null)).toEqual([])
    expect(sortedBlockRates(undefined)).toEqual([])
  })
})

describe('versionOptions（候选集不伪造）', () => {
  it('当前版本 + 明细版本去重降序', () => {
    expect(versionOptions(42, SAMPLE.clients)).toEqual([42, 41])
  })
  it('仅当前版本、无明细 → 单元素', () => {
    expect(versionOptions(7, [])).toEqual([7])
  })
  it('当前版本缺失（0/null）且无明细 → 空数组（不显示切换器）', () => {
    expect(versionOptions(0, [])).toEqual([])
    expect(versionOptions(null, null)).toEqual([])
  })
  it('非法明细条目被忽略（config_version 非正数）', () => {
    expect(versionOptions(42, [{ config_version: 0 }, { config_version: -3 }, null])).toEqual([42])
  })
})

describe('isEmptySummary（空态判据 total===0）', () => {
  it('total 0 / 缺失 / 非法 → 空态', () => {
    expect(isEmptySummary({ total: 0 })).toBe(true)
    expect(isEmptySummary({})).toBe(true)
    expect(isEmptySummary(null)).toBe(true)
  })
  it('total > 0 → 非空（即使是小数字也不当空态）', () => {
    expect(isEmptySummary({ total: 1 })).toBe(false)
    expect(isEmptySummary(SAMPLE)).toBe(false)
  })
})

describe('degradationBadge（降级徽标）', () => {
  it('degraded=true 且有 tier → tier 原文', () => {
    expect(degradationBadge(SAMPLE.clients[0])).toBe('L2')
  })
  it('degraded=true 但 tier 缺失 → L?（不静默吞）', () => {
    expect(degradationBadge({ degraded: true, degradation_tier: null })).toBe('L?')
  })
  it('未降级 → 空串', () => {
    expect(degradationBadge(SAMPLE.clients[1])).toBe('')
    expect(degradationBadge(null)).toBe('')
  })
})

// ──────────────────────────────── C. 接线齐备 ────────────────────────────────

describe('接线：路由 / 菜单 / 页面引导', () => {
  it('路由表存在 /rollout 且要求登录', () => {
    const r = routes.find((x) => x.path === '/rollout')
    expect(r).toBeTruthy()
    expect(r.meta?.requiresAuth).toBe(true)
  })

  it('菜单含 /rollout、adminOnly、且 DEFAULT_MENU_ORDER 同步', () => {
    const item = MENU_ITEMS.find((x) => x.path === '/rollout')
    expect(item).toBeTruthy()
    expect(item.adminOnly).toBe(true)
    expect(DEFAULT_MENU_ORDER).toContain('/rollout')
  })

  it('pageGuides 含 Rollout 键（三段文案非空）', () => {
    const g = pageGuides.Rollout
    expect(Array.isArray(g)).toBe(true)
    expect(g.length).toBeGreaterThanOrEqual(2)
    expect(g.every((s) => typeof s === 'string' && s.trim().length > 0)).toBe(true)
  })
})
