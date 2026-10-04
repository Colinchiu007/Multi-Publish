// @ts-check
/**
 * P2-6c 作品互动回流聚合 — 纯函数回归（判据 V1–V13，见 PRD-PUBLISH-METRICS-DASHBOARD §三）
 *
 * 这一层是看板数字的唯一口径，故所有判据在此逐条钉死：
 * 「累计快照跨份求和」会让总量虚高数倍，而它在渲染层看起来完全正常，只能在这一层拦。
 */
import { describe, it, expect } from 'vitest'

const { buildPerformanceOverview } = require('./performance-overview')

/** 固定时钟：2026-10-04T08:00:00Z，避免任何用例受墙上时钟影响 */
const NOW_MS = Date.parse('2026-10-04T08:00:00.000Z')
const day = (offset) => new Date(NOW_MS - offset * 86400000).toISOString().slice(0, 10)

function tracked (id, platform = 'zhihu', status = 'ok', extra = {}) {
  return { id, platform, recrawl_status: status, created_at: '2026-10-01T00:00:00.000Z', ...extra }
}

function snap (trackedContentId, metrics = {}, capturedAt = '2026-10-03T00:00:00.000Z') {
  return {
    tracked_content_id: trackedContentId,
    views: 0, likes: 0, comments: 0, favorites: 0, shares: 0,
    captured_at: capturedAt,
    ...metrics,
  }
}

function build (opts = {}) {
  return buildPerformanceOverview({ nowMs: NOW_MS, ...opts })
}

describe('performance-overview — 总量口径', () => {
  it('T1 每作品只取最新一份快照，两份快照不得重复计入（V1）', () => {
    const r = build({
      trackedRows: [tracked('c1'), tracked('c2')],
      snapshotRows: [
        snap('c1', { views: 10, likes: 1 }, day(3) + 'T00:00:00.000Z'),
        snap('c1', { views: 40, likes: 5 }, day(1) + 'T00:00:00.000Z'),
        snap('c2', { views: 7, comments: 2 }, day(2) + 'T00:00:00.000Z'),
      ],
    })
    // 跨快照求和会得到 views=57；正确口径是 40+7
    expect(r.totals).toEqual({ views: 47, likes: 5, comments: 2, favorites: 0, shares: 0, interactions: 7 })
    expect(r.health.covered).toBe(2)
  })

  it('T2 captured_at 相同时以入参靠后者为准，与 store 的 DESC, rowid DESC 同口径（V2）', () => {
    const same = '2026-10-03T00:00:00.000Z'
    const r = build({
      trackedRows: [tracked('c1')],
      snapshotRows: [snap('c1', { likes: 1 }, same), snap('c1', { likes: 9 }, same)],
    })
    expect(r.totals.likes).toBe(9)
  })

  it('T13 入参非法返回全零完整结构且不抛错（V13）', () => {
    const r = build({ trackedRows: null, snapshotRows: undefined })
    expect(r.hasData).toBe(false)
    expect(r.totals).toEqual({ views: 0, likes: 0, comments: 0, favorites: 0, shares: 0, interactions: 0 })
    expect(r.trend).toHaveLength(30)
    expect(r.byPlatform).toEqual([])
    expect(r.weekChange).toBeNull()
    expect(r.diagnostics.orphanSnapshots).toBe(0)
  })
})

describe('performance-overview — 脏数据与孤儿', () => {
  it('T3 无日期快照进总量、不进趋势、记 droppedUndated（V3）', () => {
    const r = build({
      trackedRows: [tracked('c1')],
      snapshotRows: [snap('c1', { likes: 3 }, ''), snap('c1', { likes: 8 }, 'not-a-date')],
    })
    // 两条都没有可用日期 ⇒ 都进不了趋势分桶，但最新一条仍代表总量
    expect(r.totals.likes).toBe(8)
    expect(r.diagnostics.droppedUndated).toBe(2)
    expect(r.trend.reduce((s, d) => s + d.interactions, 0)).toBe(0)
  })

  it('T4 孤儿快照不参与任何聚合且出声计数（V4）', () => {
    const r = build({
      trackedRows: [tracked('c1')],
      snapshotRows: [snap('c1', { likes: 4 }), snap('ghost', { likes: 99, views: 999 })],
    })
    expect(r.totals.likes).toBe(4)
    expect(r.totals.views).toBe(0)
    expect(r.diagnostics.orphanSnapshots).toBe(1)
    expect(r.health.covered).toBe(1)
  })

  it('T5 负数/NaN/非数字指标归零并计数，不整条丢弃也不抛错（V5）', () => {
    const r = build({
      trackedRows: [tracked('c1')],
      snapshotRows: [snap('c1', { views: -5, likes: NaN, comments: '7', favorites: undefined, shares: null })],
    })
    expect(r.totals).toEqual({ views: 0, likes: 0, comments: 7, favorites: 0, shares: 0, interactions: 7 })
    expect(r.diagnostics.invalidMetrics).toBe(4)
  })

  it('T6 平台名大小写与首尾空格归一（V6）', () => {
    const r = build({
      trackedRows: [tracked('c1', ' Zhihu '), tracked('c2', 'zhihu'), tracked('c3', '  '), tracked('c4', 'bilibili')],
      snapshotRows: [
        snap('c1', { likes: 1 }), snap('c2', { likes: 2 }), snap('c3', { likes: 4 }), snap('c4', { likes: 8 }),
      ],
    })
    const zhihu = r.byPlatform.find(p => p.platform === 'zhihu')
    expect(zhihu.contents).toBe(2)
    expect(zhihu.likes).toBe(3)
    expect(r.byPlatform.find(p => p.platform === '').contents).toBe(1)
    expect(r.totals.likes).toBe(15)
  })

  it('T14 健康度按 recrawl_status 分档计数，未知值归 other 不静默丢', () => {
    const r = build({
      trackedRows: [
        tracked('c1', 'zhihu', 'ok'), tracked('c2', 'zhihu', 'unsupported'),
        tracked('c3', 'zhihu', 'failed'), tracked('c4', 'zhihu', 'pending'),
        tracked('c5', 'zhihu', 'weird-status'),
      ],
      snapshotRows: [snap('c1', { likes: 1 })],
    })
    expect(r.health.trackedTotal).toBe(5)
    expect(r.health.byStatus).toEqual({ pending: 1, ok: 1, failed: 1, unsupported: 1, untrackable: 0, manual: 0, other: 1 })
    expect(r.health.covered).toBe(1)
    expect(r.health.lastCapturedAt).toBe('2026-10-03T00:00:00.000Z')
    expect(r.health.neverRecrawled).toBe(false)
  })

  it('T14b 有作品但零快照 ⇒ neverRecrawled 为真且 hasData 为假', () => {
    const r = build({ trackedRows: [tracked('c1')], snapshotRows: [] })
    expect(r.hasData).toBe(false)
    expect(r.health.neverRecrawled).toBe(true)
    expect(r.health.lastCapturedAt).toBeNull()
  })
})

describe('performance-overview — 趋势与周变化', () => {
  it('T7 累计值回落记 0 增量并出声（V7）', () => {
    const r = build({
      trackedRows: [tracked('c1')],
      snapshotRows: [
        snap('c1', { likes: 10 }, day(5) + 'T00:00:00.000Z'),
        snap('c1', { likes: 4 }, day(2) + 'T00:00:00.000Z'),
      ],
    })
    expect(r.diagnostics.retreats).toBe(1)
    // 首日 10 计入 day(5)，回落日贡献 0
    expect(r.trend.find(d => d.date === day(5)).interactions).toBe(10)
    expect(r.trend.find(d => d.date === day(2)).interactions).toBe(0)
  })

  it('T8 首份快照整份计入其采集日（V8）', () => {
    const r = build({
      trackedRows: [tracked('c1')],
      snapshotRows: [snap('c1', { views: 100, likes: 6 }, day(4) + 'T00:00:00.000Z')],
    })
    const point = r.trend.find(d => d.date === day(4))
    expect(point.views).toBe(100)
    expect(point.interactions).toBe(6)
  })

  it('T9 窗口内无数据的日期必须补 0，长度精确等于 windowDays（V9）', () => {
    const r = build({
      windowDays: 7,
      trackedRows: [tracked('c1')],
      snapshotRows: [snap('c1', { likes: 3 }, day(9) + 'T00:00:00.000Z')],
    })
    expect(r.trend.map(d => d.date)).toEqual([day(6), day(5), day(4), day(3), day(2), day(1), day(0)])
    expect(r.trend.map(d => d.interactions)).toEqual([0, 0, 0, 0, 0, 0, 0])
    // 窗口外的增量不丢：总量仍按最新快照口径给
    expect(r.totals.likes).toBe(3)
  })

  it('T10 windowDays 非法回落 30，越界钳到 7..90（V10）', () => {
    for (const [input, expected] of [[0, 30], [-5, 30], [NaN, 30], ['14', 14], [1, 7], [500, 90]]) {
      const r = build({ windowDays: input, trackedRows: [], snapshotRows: [] })
      expect(r.windowDays).toBe(expected)
      expect(r.trend).toHaveLength(expected)
    }
  })

  it('T11 分桶完全由 nowMs 决定，不读墙上时钟（V11）', () => {
    const opts = {
      trackedRows: [tracked('c1')],
      snapshotRows: [snap('c1', { likes: 5 }, '2026-10-01T00:00:00.000Z')],
    }
    const atOct2 = build({ ...opts, nowMs: Date.parse('2026-10-02T00:00:00.000Z'), windowDays: 7 })
    expect(atOct2.trend.map(d => d.date)).toEqual([
      '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
    ])
    expect(atOct2.trend.find(d => d.date === '2026-10-01').interactions).toBe(5)

    const atDec = build({ ...opts, nowMs: Date.parse('2026-12-20T00:00:00.000Z'), windowDays: 7 })
    expect(atDec.trend.every(d => d.interactions === 0)).toBe(true)
  })

  it('T12 周变化：基线为 0 返回 null，绝不写成 +100% 或 Infinity（V12）', () => {
    const noBaseline = build({
      windowDays: 14,
      trackedRows: [tracked('c1')],
      snapshotRows: [snap('c1', { likes: 9 }, day(2) + 'T00:00:00.000Z')],
    })
    expect(noBaseline.weekChange).toBeNull()

    const withBaseline = build({
      windowDays: 30,
      trackedRows: [tracked('c1')],
      snapshotRows: [
        snap('c1', { likes: 4 }, day(9) + 'T00:00:00.000Z'),   // 前 7 天窗口内：+4
        snap('c1', { likes: 10 }, day(2) + 'T00:00:00.000Z'),  // 近 7 天窗口内：+6
      ],
    })
    expect(withBaseline.weekChange).toEqual({ current: 6, previous: 4, percent: 50 })
  })

  it('T12b 近 7 天下滑给出负百分比（不是绝对值）', () => {
    const r = build({
      windowDays: 30,
      trackedRows: [tracked('c1')],
      snapshotRows: [
        snap('c1', { likes: 10 }, day(9) + 'T00:00:00.000Z'),
        snap('c1', { likes: 12 }, day(2) + 'T00:00:00.000Z'),
      ],
    })
    expect(r.weekChange).toEqual({ current: 2, previous: 10, percent: -80 })
  })
})

describe('performance-overview — 截断与平台排序', () => {
  it('超限必须如实出声，不得伪装成完整统计', () => {
    const r = build({
      trackedRows: [tracked('c1')],
      snapshotRows: [snap('c1', { likes: 1 })],
      trackedTruncated: true,
      snapshotTruncated: false,
      limits: { tracked: 2000, snapshot: 20000 },
    })
    expect(r.truncated).toEqual({ tracked: true, snapshot: false })
    expect(r.limits).toEqual({ tracked: 2000, snapshot: 20000 })
  })

  it('byPlatform 按互动合计降序，并列按平台名字典序保证渲染稳定', () => {
    const r = build({
      trackedRows: [tracked('a', 'zhihu'), tracked('b', 'bilibili'), tracked('c', 'xiaohongshu')],
      snapshotRows: [snap('a', { likes: 3 }), snap('b', { likes: 3 }), snap('c', { likes: 9 })],
    })
    expect(r.byPlatform.map(p => p.platform)).toEqual(['xiaohongshu', 'bilibili', 'zhihu'])
  })
})
