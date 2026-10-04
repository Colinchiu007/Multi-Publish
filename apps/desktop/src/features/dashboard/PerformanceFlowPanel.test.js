/**
 * PerformanceFlowPanel.test.js — P2-6c 作品互动回流看板（T23/T24）
 *
 * 三条主线：
 * ① **真实数据路径**：IPC 返回非空数据时必须转发到界面（只测空数组会把断链藏起来）；
 * ② **空态可区分**：「没作品」「有作品没回采」「没登录」三种空态文案互斥，
 *    不得都把「拿不到证据」渲染成 0（0 会被读成「没人看」）；
 * ③ **不造数字**：无基线时不出现百分比（本页历史上把 +8.5% 写死在模板里）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import i18n from '@/i18n'

vi.mock('@/stores/platforms', () => ({
  usePlatformStore: () => ({
    load: vi.fn(),
    getLabel: (k) => ({ zhihu: '知乎', bilibili: 'B站' }[k] || k),
    getIcon: () => '📱',
  }),
}))

const overviewMock = vi.fn()
vi.mock('@/api/knowledge-library', () => ({
  performanceOverview: (params) => overviewMock(params),
}))

import PerformanceFlowPanel from './PerformanceFlowPanel.vue'

function overviewFixture (overrides = {}) {
  return {
    hasData: true,
    windowDays: 30,
    totals: { views: 123, likes: 45, comments: 7, favorites: 3, shares: 1, interactions: 56 },
    trend: Array.from({ length: 30 }, (_, i) => ({
      date: '2026-10-' + String(i + 1).padStart(2, '0'),
      views: 0, likes: 0, comments: 0, favorites: 0, shares: 0, interactions: i === 3 ? 9 : 0,
    })),
    byPlatform: [
      { platform: 'zhihu', contents: 2, views: 100, likes: 30, comments: 5, favorites: 2, shares: 1, interactions: 38 },
      { platform: '', contents: 1, views: 23, likes: 15, comments: 2, favorites: 1, shares: 0, interactions: 18 },
    ],
    health: {
      trackedTotal: 3, covered: 3, coverage: 100,
      byStatus: { pending: 0, ok: 2, failed: 1, unsupported: 1, untrackable: 0, manual: 0, other: 0 },
      lastCapturedAt: '2026-10-03T09:12:00.000Z', neverRecrawled: false,
    },
    weekChange: { current: 6, previous: 4, percent: 50 },
    truncated: { tracked: false, snapshot: false },
    limits: { tracked: 2000, snapshot: 20000 },
    diagnostics: { orphanSnapshots: 0, orphanSnapshotsDb: 0, retreats: 0, invalidMetrics: 0, droppedUndated: 0, invalidTrackedRows: 0 },
    ...overrides,
  }
}

async function mountPanel (props = {}) {
  const w = mount(PerformanceFlowPanel, { props, global: { plugins: [createPinia(), i18n] } })
  await nextTick()
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
  return w
}

describe('PerformanceFlowPanel 真实数据路径', () => {
  beforeEach(() => {
    overviewMock.mockReset()
    setActivePinia(createPinia())
  })

  it('IPC 返回数据后，五张指标卡逐个渲染该数字（不是空壳）', async () => {
    overviewMock.mockResolvedValue({ code: 0, data: overviewFixture() })
    const w = await mountPanel()
    expect(w.get('[data-testid="perf-metric-views"]').text()).toBe('123')
    expect(w.get('[data-testid="perf-metric-likes"]').text()).toBe('45')
    expect(w.get('[data-testid="perf-metric-comments"]').text()).toBe('7')
    expect(w.get('[data-testid="perf-metric-favorites"]').text()).toBe('3')
    expect(w.get('[data-testid="perf-metric-shares"]').text()).toBe('1')
  })

  it('请求带上窗口天数，趋势柱数量等于窗口长度', async () => {
    overviewMock.mockResolvedValue({ code: 0, data: overviewFixture() })
    const w = await mountPanel({ windowDays: 30 })
    expect(overviewMock).toHaveBeenCalledWith({ windowDays: 30 })
    expect(w.findAll('.perf-flow-bar')).toHaveLength(30)
  })

  it('平台名走页面同一份标签真源，未知平台如实标注而不是留白', async () => {
    overviewMock.mockResolvedValue({ code: 0, data: overviewFixture() })
    const w = await mountPanel()
    expect(w.get('[data-testid="perf-platform-zhihu"]').text()).toContain('38')
    expect(w.text()).toContain(i18n.global.t('dashboard.metrics.unknownPlatform'))
    expect(w.text()).toContain('知乎')
  })

  it('reloadToken 递增会重新取数（页面刷新按钮带动面板）', async () => {
    overviewMock.mockResolvedValue({ code: 0, data: overviewFixture() })
    const w = await mountPanel({ reloadToken: 0 })
    expect(overviewMock).toHaveBeenCalledTimes(1)
    await w.setProps({ reloadToken: 1 })
    await new Promise(r => setTimeout(r, 0))
    expect(overviewMock).toHaveBeenCalledTimes(2)
  })
})

describe('PerformanceFlowPanel 变化量与诊断', () => {
  beforeEach(() => { overviewMock.mockReset(); setActivePinia(createPinia()) })

  it('有基线时按真实百分比渲染上涨/下跌', async () => {
    overviewMock.mockResolvedValue({ code: 0, data: overviewFixture({ weekChange: { current: 2, previous: 10, percent: -80 } }) })
    const w = await mountPanel()
    expect(w.get('[data-testid="perf-flow-week"]').text())
      .toBe(i18n.global.t('dashboard.metrics.weekDown', { percent: 80 }))
  })

  it('无基线（weekChange=null）时显示「数据积累中」，不得凭空给百分比', async () => {
    overviewMock.mockResolvedValue({ code: 0, data: overviewFixture({ weekChange: null }) })
    const w = await mountPanel()
    expect(w.get('[data-testid="perf-flow-week"]').text())
      .toBe(i18n.global.t('dashboard.metrics.weekInsufficient'))
    expect(w.find('[data-testid="perf-flow-week"]').classes()).toContain('neutral')
  })

  it('诊断行只在计数 > 0 时出现，且把库级孤儿一起算进去', async () => {
    overviewMock.mockResolvedValue({ code: 0, data: overviewFixture() })
    const clean = await mountPanel()
    expect(clean.find('[data-testid="perf-flow-diag"]').exists()).toBe(false)
    clean.unmount()

    overviewMock.mockResolvedValue({
      code: 0,
      data: overviewFixture({ diagnostics: { orphanSnapshots: 1, orphanSnapshotsDb: 6, retreats: 2, invalidMetrics: 3, droppedUndated: 0, invalidTrackedRows: 0 } }),
    })
    const dirty = await mountPanel()
    expect(dirty.get('[data-testid="perf-flow-diag"]').text())
      .toBe(i18n.global.t('dashboard.metrics.diagLine', { orphan: 7, retreat: 2, invalid: 3 }))
  })

  it('被扫描上限截断时必须说明「基于最近 N 条」，不得把截断当全量', async () => {
    overviewMock.mockResolvedValue({
      code: 0,
      data: overviewFixture({ truncated: { tracked: true, snapshot: false } }),
    })
    const w = await mountPanel()
    expect(w.get('[data-testid="perf-flow-truncated"]').text())
      .toBe(i18n.global.t('dashboard.metrics.truncatedNote', { count: 20000 }))
  })
})

describe('PerformanceFlowPanel 空态与失败态', () => {
  beforeEach(() => { overviewMock.mockReset(); setActivePinia(createPinia()) })

  it('零作品 → 「还没有可回采的作品」，且不渲染指标卡', async () => {
    const empty = overviewFixture({
      hasData: false,
      totals: { views: 0, likes: 0, comments: 0, favorites: 0, shares: 0, interactions: 0 },
      byPlatform: [],
      health: { trackedTotal: 0, covered: 0, coverage: 0, byStatus: { pending: 0, ok: 0, failed: 0, unsupported: 0, untrackable: 0, manual: 0, other: 0 }, lastCapturedAt: null, neverRecrawled: false },
      weekChange: null,
    })
    overviewMock.mockResolvedValue({ code: 0, data: empty })
    const w = await mountPanel()
    expect(w.get('[data-testid="perf-flow-empty"]').text()).toContain(i18n.global.t('dashboard.metrics.emptyTitle'))
    expect(w.find('[data-testid="perf-flow-metrics"]').exists()).toBe(false)
  })

  it('有作品但没采到数据 → 说「已登记 N 篇，尚未回采」，不是「没有作品」', async () => {
    const base = overviewFixture()
    overviewMock.mockResolvedValue({
      code: 0,
      data: {
        ...base,
        hasData: false,
        totals: { views: 0, likes: 0, comments: 0, favorites: 0, shares: 0, interactions: 0 },
        byPlatform: [],
        health: { ...base.health, trackedTotal: 5, covered: 0, coverage: 0, lastCapturedAt: null, neverRecrawled: true },
        weekChange: null,
      },
    })
    const w = await mountPanel()
    expect(w.get('[data-testid="perf-flow-empty"]').text())
      .toContain(i18n.global.t('dashboard.metrics.emptyNoSnapshot', { total: 5 }))
  })

  it('未登录（AUTH_REQUIRED）→ 引导登录，绝不渲染一排 0', async () => {
    overviewMock.mockResolvedValue({ code: -3, errorCode: 'AUTH_REQUIRED', message: '请先登录' })
    const w = await mountPanel()
    expect(w.get('[data-testid="perf-flow-auth"]').text())
      .toBe(i18n.global.t('dashboard.metrics.loginRequired'))
    expect(w.find('[data-testid="perf-flow-metrics"]').exists()).toBe(false)
    expect(w.find('[data-testid="perf-flow-empty"]').exists()).toBe(false)
  })

  it('取数失败但已有数据 → 保留上一次数字，不得刷成 0', async () => {
    overviewMock.mockResolvedValue({ code: 0, data: overviewFixture() })
    const w = await mountPanel()
    expect(w.get('[data-testid="perf-metric-views"]').text()).toBe('123')

    overviewMock.mockResolvedValue({ code: -1, message: 'boom' })
    await w.vm.reload()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
    expect(w.get('[data-testid="perf-metric-views"]').text()).toBe('123')
  })
})
