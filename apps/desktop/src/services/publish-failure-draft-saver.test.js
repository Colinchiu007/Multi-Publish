// @vitest-environment node
/**
 * publish-failure-draft-saver — 渲染层失败提示（publish-fail-draft-guard）
 *
 * 契约（PRD §5.3）：
 * - phase=failed 且该 taskId 首次出现 → notify 一次
 * - 同 taskId 再次 failed（重试后再失败）→ 静默
 * - 其他 phase 一律忽略
 * - start 幂等（返回同一取消函数）；stop 后可重启；stop 未 start 安全
 */
import { createFailureDraftSaver } from './publish-failure-draft-saver'

function failedPayload (taskId, platform = 'douyin') {
  return { taskId, platform, phase: 'failed', percent: 100, stage: '✗ 发布失败', timestamp: Date.now() }
}

describe('publish-failure-draft-saver', () => {
  it('failed + 新 taskId → 提示一次，载荷透传', () => {
    const notify = vi.fn()
    let handler
    const onProgress = vi.fn((cb) => { handler = cb; return () => {} })
    const saver = createFailureDraftSaver({ onProgress, notify })
    saver.start()
    const payload = failedPayload('task-1')
    handler(payload)

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(payload)
  })

  it('同一 taskId 第二次 failed → 不重复提示', () => {
    const notify = vi.fn()
    let handler
    const onProgress = vi.fn((cb) => { handler = cb; return () => {} })
    const saver = createFailureDraftSaver({ onProgress, notify })
    saver.start()
    handler(failedPayload('task-1'))
    handler(failedPayload('task-1'))
    handler(failedPayload('task-1'))
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('非 failed phase（start/progress/success/retry/cancelled）→ 忽略', () => {
    const notify = vi.fn()
    let handler
    const onProgress = vi.fn((cb) => { handler = cb; return () => {} })
    const saver = createFailureDraftSaver({ onProgress, notify })
    saver.start()
    for (const phase of ['start', 'progress', 'success', 'retry', 'cancelled']) {
      handler({ taskId: 'task-1', platform: 'douyin', phase })
    }
    expect(notify).not.toHaveBeenCalled()
  })

  it('缺 taskId 的载荷 → 忽略，不提示不误记', () => {
    const notify = vi.fn()
    let handler
    const onProgress = vi.fn((cb) => { handler = cb; return () => {} })
    const saver = createFailureDraftSaver({ onProgress, notify })
    saver.start()
    handler({ platform: 'douyin', phase: 'failed' })
    expect(notify).not.toHaveBeenCalled()
    // 空载荷不占已见集合
    handler(failedPayload('task-2'))
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('不同 taskId 各提示一次；超过上限后最早 taskId 忘记（重新提示）', () => {
    const notify = vi.fn()
    let handler
    const onProgress = vi.fn((cb) => { handler = cb; return () => {} })
    const saver = createFailureDraftSaver({ onProgress, notify, maxSeen: 3 })
    saver.start()
    for (const id of ['t1', 't2', 't3']) handler(failedPayload(id))
    expect(notify).toHaveBeenCalledTimes(3)
    handler(failedPayload('t4'))
    expect(notify).toHaveBeenCalledTimes(4)
    // t1 已被挤出 → 再次失败重新提示
    handler(failedPayload('t1'))
    expect(notify).toHaveBeenCalledTimes(5)
  })

  it('start 幂等：两次 start 返回同一取消函数且只订阅一次', () => {
    const unsubscribe = vi.fn()
    const onProgress = vi.fn(() => unsubscribe)
    const saver = createFailureDraftSaver({ onProgress, notify: vi.fn() })
    const stop1 = saver.start()
    const stop2 = saver.start()
    expect(stop1).toBe(stop2)
    expect(onProgress).toHaveBeenCalledTimes(1)
  })

  it('stop 解绑后重启可重新订阅；未 start 直接 stop 安全', () => {
    const unsubscribe = vi.fn()
    const onProgress = vi.fn(() => unsubscribe)
    const notify = vi.fn()
    let handler
    onProgress.mockImplementation((cb) => { handler = cb; return unsubscribe })
    const saver = createFailureDraftSaver({ onProgress, notify })
    expect(() => saver.stop()).not.toThrow()

    saver.start()
    handler(failedPayload('task-1'))
    expect(notify).toHaveBeenCalledTimes(1)

    saver.stop()
    expect(unsubscribe).toHaveBeenCalledTimes(1)

    // 重启后同一 taskId 仍静默（记忆保留），新 taskId 提示
    saver.start()
    expect(onProgress).toHaveBeenCalledTimes(2)
    handler(failedPayload('task-1'))
    expect(notify).toHaveBeenCalledTimes(1)
    handler(failedPayload('task-2'))
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it('notify 抛错不影响订阅回调本身', () => {
    const notify = vi.fn(() => { throw new Error('toast boom') })
    let handler
    const onProgress = vi.fn((cb) => { handler = cb; return () => {} })
    const saver = createFailureDraftSaver({ onProgress, notify })
    saver.start()
    expect(() => handler(failedPayload('task-1'))).not.toThrow()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('缺依赖抛 TypeError（fail fast）', () => {
    expect(() => createFailureDraftSaver({ notify: vi.fn() })).toThrow(TypeError)
    expect(() => createFailureDraftSaver({ onProgress: vi.fn() })).toThrow(TypeError)
  })
})
