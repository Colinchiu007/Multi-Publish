/**
 * Test: TaskQueue 频控等待（_delayed）任务的可观测性与持久化
 *
 * 2026-10-06 真实 E2E 暴露的队列饿死（PR #2984 之后的 ha-b 图文批次）：
 *   21 个发布任务只有 5 个真正执行，其余「入队了却既无历史也不派发」，
 *   而 queue:status 报 pending=0 running=0 —— 看起来队列是空的，实际有任务卡住。
 *
 * 根因：频控未到窗口时，任务被移出 _queue 放进 _delayed（靠 setTimeout 到点重入队）。
 * 而：
 *   1) getStatus() 的 pending 只统计 _queue，_delayed 里的任务不计入
 *      ⇒ 运维/UI 看到 pending=0 & running=0，误判队列已排空；
 *   2) serialize() 同样只导出 _queue 与 _running，_delayed 任务既不在队列、
 *      也不在历史，进程重启后直接丢失（崩溃恢复也无从恢复）。
 * 两处共同构成「任务静默消失」，多平台批量发布因此大面积静默失败。
 */
const TaskQueue = require('../src/task-queue')

/** 恒拒绝的频控守卫：任务必然落入 _delayed */
const alwaysBlockGuard = { check: () => ({ allowed: false, remainingMs: 60000, bucket: 'platform' }), recordPublish: () => {} }

/** 先拒一次（进 _delayed）、之后放行 */
function blockOnceGuard () {
  let calls = 0
  return {
    check: () => {
      calls += 1
      return calls === 1 ? { allowed: false, remainingMs: 20, bucket: 'platform' } : { allowed: true }
    },
    recordPublish: () => {},
  }
}

describe('TaskQueue — 频控等待任务（_delayed）可观测', () => {
  test('getStatus().pending 必须计入频控等待中的任务', () => {
    const queue = new TaskQueue({ publishIntervalGuard: alwaysBlockGuard })

    queue.add({ platform: 'toutiao', article: { title: 'A' } })

    expect(queue.getStatus().running).toBe(0)
    // 关键不变量：等待中的任务必须能被观测到，否则表现为「静默消失」
    expect(queue.getStatus().pending).toBe(1)
    expect(queue.getStatus().delayed).toBe(1)

    queue.shutdown()
  })

  test('serialize() 必须包含频控等待任务，保证崩溃恢复不丢', () => {
    const queue = new TaskQueue({ publishIntervalGuard: alwaysBlockGuard })

    const id = queue.add({ platform: 'kuaishou', article: { title: 'B' } })
    const state = JSON.parse(queue.serialize())

    // 频控等待中的任务必须在持久化快照里可见，否则进程重启即永久丢失
    const ids = [...state.queue, ...state.running, ...(state.delayed || [])].map(t => t.id)
    expect(ids).toContain(id)

    queue.shutdown()
  })

  test('频控窗口到期后任务回到 _queue 并可被派发', async () => {
    const queue = new TaskQueue({ maxConcurrent: 2, publishIntervalGuard: blockOnceGuard() })
    const executed = []
    queue.setExecutor(async (task) => { executed.push(task.id); return { success: true } })

    const id = queue.add({ platform: 'bilibili', article: { title: 'C' } })
    expect(executed).toEqual([])

    // 等频控定时器（20ms）触发并重入队
    await new Promise(r => setTimeout(r, 150))
    expect(executed).toContain(id)

    queue.shutdown()
  })

  test('clearPending 必须同时清掉频控等待中的任务', () => {
    const queue = new TaskQueue({ publishIntervalGuard: alwaysBlockGuard })

    queue.add({ platform: 'douyin', article: { title: 'D' } })
    expect(queue.getStatus().pending).toBe(1)

    const removed = queue.clearPending()
    expect(removed).toBe(1)
    expect(queue.getStatus().pending).toBe(0)
    expect(queue.getStatus().delayed).toBe(0)

    queue.shutdown()
  })
})