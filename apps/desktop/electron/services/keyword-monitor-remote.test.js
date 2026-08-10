// @ts-check
/**
 * keyword-monitor-remote.test.js — 运营后台关键词监测目录下发（applyRemoteWatchlist）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

__registerMock('./logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

const KeywordMonitor = require('./keyword-monitor')

function makeMonitor () {
  const ci = { search: vi.fn(async () => ({ total: 1, results: [] })) }
  const store = { _ready: true, getSetting: vi.fn(() => null), setSetting: vi.fn(), getUserSetting: vi.fn(() => []), setUserSetting: vi.fn() }
  return new KeywordMonitor(ci, store)
}

describe('KeywordMonitor applyRemoteWatchlist', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('远程条目：新增并应用 interval/threshold，标记 source=remote', () => {
    const m = makeMonitor()
    const n = m.applyRemoteWatchlist([
      { keyword: 'AI视频', category: 'topic', threshold: 3, interval_minutes: 60 },
    ])
    expect(n).toBe(1)
    const w = m._watchers.get('AI视频')
    expect(w).toBeTruthy()
    expect(w.source).toBe('remote')
    expect(w.threshold).toBe(3)
    expect(w.interval).toBe(60 * 60 * 1000)
  })

  it('缺席即停止远程监测；用户/恢复条目保留', () => {
    const m = makeMonitor()
    m.applyRemoteWatchlist([{ keyword: 'A', threshold: 2, interval_minutes: 360 }])
    m._watchers.set('用户词', { keyword: '用户词', source: 'user', timer: { unref: () => {} } })
    const n = m.applyRemoteWatchlist([{ keyword: 'B', threshold: 2, interval_minutes: 360 }])
    expect(m._watchers.has('A')).toBe(false) // 远程词缺席被停止
    expect(m._watchers.has('B')).toBe(true)
    expect(m._watchers.has('用户词')).toBe(true) // 用户词保留
    expect(n).toBe(2) // 新增 B + 停止 A
  })

  it('用户/恢复词被远程命中后保留来源，缺席不被误停', () => {
    const m = makeMonitor()
    m._watchers.set('用户词', { keyword: '用户词', source: 'user', timer: { unref: () => {} } })
    m.applyRemoteWatchlist([{ keyword: '用户词', threshold: 3, interval_minutes: 60 }])
    expect(m._watchers.get('用户词').source).toBe('user') // 不被劫持为 remote
    m.applyRemoteWatchlist([{ keyword: '其他词' }])
    expect(m._watchers.has('用户词')).toBe(true) // 缺席不误停用户词
  })

  it('已有远程词更新 interval/threshold；非法条目跳过；非数组返回 0', () => {
    const m = makeMonitor()
    m.applyRemoteWatchlist([{ keyword: 'X', threshold: 2, interval_minutes: 360 }])
    const n = m.applyRemoteWatchlist([{ keyword: 'X', threshold: 4, interval_minutes: 30 }])
    expect(n).toBe(1)
    const w = m._watchers.get('X')
    expect(w.threshold).toBe(4)
    expect(w.interval).toBe(30 * 60 * 1000)
    expect(m.applyRemoteWatchlist(null)).toBe(0)
    // 空/非法载荷视为运营下发空目录 → 缺席即停止远程监测（X 被停止 = 1 变更）
    expect(m.applyRemoteWatchlist([{ keyword: '' }])).toBe(1)
    expect(m._watchers.has('X')).toBe(false)
  })
})
