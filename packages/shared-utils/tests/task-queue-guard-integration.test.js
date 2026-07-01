/**
 * Integration test: task-queue + publish-interval-guard
 * 测试: 任务队列集成发布频率控制
 */
const TaskQueue = require('../src/task-queue')
const PublishIntervalGuard = require('../src/publish-interval-guard')

const MIN_INTERVAL = 5 * 60 * 1000

describe('TaskQueue + PublishIntervalGuard 集成', () => {
  test('无 guard 时行为不变（向后兼容）', async () => {
    const queue = new TaskQueue({ defaultRetry: 0 })
    queue.setExecutor(async () => ({ success: true }))
    const taskId = queue.add({ platform: 'wechat_mp', article: { title: 'T' } })
    expect(taskId).toMatch(/^task_\d+_\d+$/)
    await new Promise(r => setTimeout(r, 100))
    const history = queue.getHistory()
    expect(history.length).toBe(1)
    expect(history[0].status).toBe('success')
  })

  test('传入 guard 后成功记录发布时间', async () => {
    const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
    const queue = new TaskQueue({ defaultRetry: 0, publishIntervalGuard: guard })

    const events = []
    queue.on('task:success', (t) => events.push('success:' + t.platform))

    queue.setExecutor(async () => ({ success: true }))
    queue.add({ platform: 'wechat_mp', article: { title: 'T', accountId: 'acc_001' } })

    await new Promise(r => setTimeout(r, 100))

    // 发布后，guard 应记录发布时间
    expect(guard.canPublish('wechat_mp', 'acc_001')).toBe(false)
    expect(events).toContain('success:wechat_mp')
  })

  test('同一账号连续发布被拦截并触发 publish:blocked 事件', async () => {
    const guard = new PublishIntervalGuard({ minInterval: 50000 }) // 50 秒间隔
    const queue = new TaskQueue({ defaultRetry: 0, publishIntervalGuard: guard })

    const blockedEvents = []
    queue.on('publish:blocked', (data) => {
      blockedEvents.push(data)
    })

    queue.setExecutor(async () => ({ success: true }))

    // 第一次发布 — 模拟 1 分钟前已发布
    guard.recordPublish('wechat_mp', 'acc_001', Date.now() - 30000)

    // 尝试第二次发布（同一账号）
    queue.add({ platform: 'wechat_mp', article: { title: 'T2', accountId: 'acc_001' } })

    await new Promise(r => setTimeout(r, 200))

    // 应触发 publish:blocked 事件
    expect(blockedEvents.length).toBeGreaterThanOrEqual(1)
    expect(blockedEvents[0].task.platform).toBe('wechat_mp')
    expect(blockedEvents[0].remainingWait).toBeGreaterThan(0)
  })

  test('不同账号在同一平台不被拦截', async () => {
    const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
    const queue = new TaskQueue({ defaultRetry: 0, publishIntervalGuard: guard })

    const successEvents = []
    queue.on('task:success', (t) => successEvents.push(t.platform + ':' + (t.article?.accountId || '?')))

    queue.setExecutor(async () => ({ success: true }))

    // 模拟 acc_001 刚发布
    guard.recordPublish('wechat_mp', 'acc_001', Date.now())

    // acc_002 发布 — 应正常执行
    queue.add({ platform: 'wechat_mp', article: { title: 'T', accountId: 'acc_002' } })

    await new Promise(r => setTimeout(r, 100))

    expect(successEvents).toContain('wechat_mp:acc_002')
  })

  test('无 accountId 的任务不被拦截（向后兼容）', async () => {
    const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
    const queue = new TaskQueue({ defaultRetry: 0, publishIntervalGuard: guard })

    const successEvents = []
    queue.on('task:success', (t) => successEvents.push(t.platform))

    queue.setExecutor(async () => ({ success: true }))

    // 模拟同平台发布但无 accountId
    guard.recordPublish('wechat_mp', 'acc_001', Date.now())

    // 无 accountId 的任务
    queue.add({ platform: 'wechat_mp', article: { title: 'T' } })

    await new Promise(r => setTimeout(r, 100))

    expect(successEvents).toContain('wechat_mp')
  })

  test('带 guard 的任务失败不阻止后续任务', async () => {
    const guard = new PublishIntervalGuard({ minInterval: MIN_INTERVAL })
    const queue = new TaskQueue({ defaultRetry: 0, publishIntervalGuard: guard })

    const results = []
    queue.on('task:failed', (t) => results.push('failed:' + t.platform))
    queue.on('task:success', (t) => results.push('success:' + t.platform))

    queue.setExecutor(async (task) => {
      if (task.platform === 'fail_me') throw new Error('intentional fail')
      return { success: true }
    })

    queue.add({ platform: 'fail_me', article: { title: 'T', accountId: 'acc_001' } })
    queue.add({ platform: 'wechat_mp', article: { title: 'T2', accountId: 'acc_001' } })

    await new Promise(r => setTimeout(r, 300))

    expect(results).toContain('failed:fail_me')
    expect(results).toContain('success:wechat_mp')
  })
})
