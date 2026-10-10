/**
 * podcast-channel-locks 行为合同
 *
 * 这些用例锁的是"看起来能工作但语义不成立"的四种形态：
 * - 退化成全局单键（跨频道并行被吃掉）
 * - 超时的等待者照样执行临界区（迟到的写覆盖新的真相）
 * - 前一个临界区抛错后锁永不释放（该频道从此再也不可写，且不报错）
 * - 防重入标记泄漏（用户被永久挡在发布之外）
 */
import { describe, it, expect } from 'vitest'
import {
  createKeyedLocks,
  createPublishGate,
  LOCK_WAIT_ERROR,
  normalizeWaitTimeout,
  DEFAULT_WAIT_TIMEOUT_MS,
} from './podcast-channel-locks'

const busy = (ms) => new Promise((r) => { setTimeout(r, ms) })

describe('podcast-channel-locks · 键粒度', () => {
  it('缺键当场抛，不得静默降级成不串行', async () => {
    const locks = createKeyedLocks({})
    await expect(locks.withKey('', 'x', () => 1)).rejects.toThrow(/PODCAST_LOCK_KEY_REQUIRED/)
    await expect(locks.withKey('  ', 'x', () => 1)).rejects.toThrow(/PODCAST_LOCK_KEY_REQUIRED/)
  })

  it('不同 channelId 互不阻塞（退化成全局单键就是这里红）', async () => {
    const locks = createKeyedLocks({ waitTimeoutMs: 2000 })
    const order = []
    const slow = locks.withKey('ch_a', 'publish', async () => { await busy(60); order.push('a-done') })
    const fast = locks.withKey('ch_b', 'publish', async () => { order.push('b-done'); return 1 })
    expect(await fast).toBe(1)
    expect(order).toEqual(['b-done'])
    await slow
    expect(order).toEqual(['b-done', 'a-done'])
  })
})

describe('podcast-channel-locks · 等待与放弃', () => {
  it('超时的等待者不得执行其临界区', async () => {
    const locks = createKeyedLocks({ waitTimeoutMs: 30 })
    let released
    const gate = new Promise((r) => { released = r })
    const held = locks.withKey('ch_a', 'first', () => gate.then(() => 'first-ran'))
    let secondRan = false
    await expect(locks.withKey('ch_a', 'second', () => { secondRan = true; return 'x' }))
      .rejects.toMatchObject({ code: LOCK_WAIT_ERROR })
    expect(secondRan).toBe(false)
    released()
    expect(await held).toBe('first-ran')
  })

  it('放弃等待不得把后序等待者一起卡死（序位仍要推进）', async () => {
    const locks = createKeyedLocks({ waitTimeoutMs: 25 })
    let released
    const gate = new Promise((r) => { released = r })
    const held = locks.withKey('ch_a', 'holder', () => gate)
    await expect(locks.withKey('ch_a', 'abandon', () => 'never')).rejects.toThrow(/等待超时/)
    released()
    await held
    // 上面那次放弃不能留下未关闭的闸门：第三次必须正常执行
    await expect(locks.withKey('ch_a', 'third', async () => 'ran-third')).resolves.toBe('ran-third')
  })

  it('前一个临界区抛错必须放行后来者', async () => {
    const locks = createKeyedLocks({ waitTimeoutMs: 1000 })
    const first = locks.withKey('ch_a', 'boom', () => { throw new Error('boom') })
    await expect(first).rejects.toThrow('boom')
    await expect(locks.withKey('ch_a', 'after', async () => 'ok')).resolves.toBe('ok')
  })

  it('非法等待预算回落默认并仍可工作（静默改变并发语义是不允许的）', async () => {
    expect(normalizeWaitTimeout('abc')).toBe(DEFAULT_WAIT_TIMEOUT_MS)
    expect(normalizeWaitTimeout(-5)).toBe(DEFAULT_WAIT_TIMEOUT_MS)
    expect(normalizeWaitTimeout(80)).toBe(80)
  })
})

describe('podcast-channel-locks · 发布防重入标记', () => {
  it('同频道第二次 tryBegin 立即失败，不排队也不等待', () => {
    const gate = createPublishGate()
    expect(gate.tryBegin('ch_a')).toBe(true)
    expect(gate.tryBegin('ch_a')).toBe(false)
    expect(gate.isBusy('ch_a')).toBe(true)
    expect(gate.tryBegin('ch_b')).toBe(true)
    expect(gate.snapshot().map((x) => x.channelId).sort()).toEqual(['ch_a', 'ch_b'])
  })

  it('end 必须幂等且只删自己的键', () => {
    const gate = createPublishGate()
    gate.tryBegin('ch_a')
    gate.tryBegin('ch_b')
    expect(gate.end('ch_a')).toBe(true)
    expect(gate.end('ch_a')).toBe(false)
    expect(gate.isBusy('ch_a')).toBe(false)
    expect(gate.isBusy('ch_b')).toBe(true)
  })

  it('缺 channelId 不得静默当成全局标记', () => {
    const gate = createPublishGate()
    expect(() => gate.tryBegin('')).toThrow(/PODCAST_GATE_KEY_REQUIRED/)
    expect(() => gate.tryBegin(null)).toThrow(/PODCAST_GATE_KEY_REQUIRED/)
  })
})
