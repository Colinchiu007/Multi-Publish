// @ts-check
/**
 * useBatchPollGuard 单元测试（报告 M-3 的可复用组件）
 *
 * 这是纯状态机，不依赖 Vue 组件，可以精确测边界：
 *   - 连续失败恰好到阈值才收口（第 9 次不收、第 10 次收）
 *   - 成功一次即清零（间歇抖动不误伤）
 *   - 时长上限用 `>` 而非 `>=`（恰好 10 分钟仍算有效）
 */
import { describe, it, expect, vi } from 'vitest'
import {
  useBatchPollGuard,
  BATCH_POLL_MAX_CONSECUTIVE_FAILURES,
  BATCH_POLL_MAX_DURATION_MS,
} from './useBatchPollGuard'

describe('useBatchPollGuard', () => {
  it('连续失败未达阈值时不得触发收口', () => {
    const onFail = vi.fn()
    const g = useBatchPollGuard({ onFail })
    g.reset()

    for (let i = 1; i < BATCH_POLL_MAX_CONSECUTIVE_FAILURES; i++) {
      const r = g.recordFailure()
      expect(r.failed).toBe(false)
      expect(r.count).toBe(i)
    }
    // 一次都没触发收口
    expect(onFail).not.toHaveBeenCalled()
  })

  it('第 N 次失败恰好触发收口（阈值边界）', () => {
    const onFail = vi.fn()
    const g = useBatchPollGuard({ onFail })
    g.reset()

    let last
    for (let i = 0; i < BATCH_POLL_MAX_CONSECUTIVE_FAILURES; i++) last = g.recordFailure()

    expect(last.failed).toBe(true)
    expect(last.count).toBe(BATCH_POLL_MAX_CONSECUTIVE_FAILURES)
  })

  it('成功一次即清零：间歇抖动不累计', () => {
    const onFail = vi.fn()
    const g = useBatchPollGuard({ onFail })
    g.reset()

    for (let round = 0; round < 20; round++) {
      g.recordFailure()
      g.onSuccess()
    }
    // 20 轮「失败→成功」抖动，一次都不该收口
    expect(onFail).not.toHaveBeenCalled()

    // 但紧接着连续失败会从 1 重新数
    expect(g.recordFailure()).toEqual({ failed: false, count: 1 })
  })

  it('时长上限：恰好等于上限不算超时，超过才算', () => {
    let t = 0
    const g = useBatchPollGuard({ onFail: vi.fn(), now: () => t })
    g.reset()

    t = BATCH_POLL_MAX_DURATION_MS
    expect(g.checkDuration()).toBe(false)   // 恰好 10 分钟：仍有效

    t = BATCH_POLL_MAX_DURATION_MS + 1
    expect(g.checkDuration()).toBe(true)    // 超过：应退出
  })

  it('未 reset 前不计时（避免误报超时）', () => {
    let t = 999999999
    const g = useBatchPollGuard({ onFail: vi.fn(), now: () => t })
    // 未 reset ⇒ startedAt === 0 ⇒ 不计时
    expect(g.checkDuration()).toBe(false)
    expect(g.elapsed()).toBe(0)
  })

  it('reset 会清零计数与计时', () => {
    let t = 0
    const g = useBatchPollGuard({ onFail: vi.fn(), now: () => t })
    g.reset()
    g.recordFailure()
    g.recordFailure()
    t = 5000

    g.reset()
    expect(g.elapsed()).toBe(0)
    expect(g.recordFailure()).toEqual({ failed: false, count: 1 })
  })
})
