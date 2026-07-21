/**
 * Test: task-queue.js — 任务队列
 * 测试: 顺序执行、重试、超时、暂停/恢复、进度事件
 */

const TaskQueue = require('../src/task-queue')

// 用 50ms 微任务替代 setTimeout 以便测试
const originalSetTimeout = global.setTimeout
beforeEach(() => {
  global.setTimeout = (fn, ms) => originalSetTimeout(fn, ms || 0)
})
afterEach(() => {
  global.setTimeout = originalSetTimeout
})

describe('TaskQueue', () => {
  test('添加任务后返回 taskId', () => {
    const queue = new TaskQueue()
    const taskId = queue.add({ platform: 'wechat_mp', article: { title: 'Test' } })
    expect(taskId).toMatch(/^task_\d+_\d+$/)
  })

  test('addBatch 添加多个平台任务', () => {
    const queue = new TaskQueue()
    const ids = queue.addBatch(['wechat_mp', 'zhihu', 'weibo'], { title: 'Test' })
    expect(ids).toHaveLength(3)
  })

  test('executor 成功执行任务', async () => {
    const queue = new TaskQueue({ defaultRetry: 0 })
    const results = []

    queue.setExecutor(async (task) => {
      results.push(task.platform)
      return { success: true }
    })

    queue.add({ platform: 'test', article: { title: 'T' } })

    // 等待任务执行
    await new Promise(r => setTimeout(r, 100))

    expect(results).toContain('test')
  })

  test('失败任务自动重试（默认 2 次）', async () => {
    const queue = new TaskQueue({ defaultRetry: 2 })
    let attempts = 0

    queue.setExecutor(async () => {
      attempts++
      throw new Error('always fail')
    })

    queue.add({ platform: 'test', article: { title: 'T' } })

    await new Promise(r => setTimeout(r, 200))

    expect(attempts).toBe(3) // 1次初始 + 2次重试
  })

  test('失败任务可人工重试且同一失败记录保持幂等', async () => {
    const queue = new TaskQueue({ defaultRetry: 0 })
    let shouldFail = true
    queue.setExecutor(async () => {
      if (shouldFail) throw new Error('首次失败')
      return { success: true }
    })

    const failedId = queue.add({ platform: 'wechat_mp', article: { title: 'T', accountId: 'wx-1' } })
    await new Promise(r => setTimeout(r, 100))
    expect(queue.getHistory().find(task => task.id === failedId)?.status).toBe('failed')

    shouldFail = false
    const retryId = queue.retry(failedId)
    expect(retryId).toMatch(/^task_\d+_\d+$/)
    expect(queue.retry(failedId)).toBe(retryId)

    await new Promise(r => setTimeout(r, 100))
    const retried = queue.getHistory().find(task => task.id === retryId)
    expect(retried).toMatchObject({
      platform: 'wechat_mp',
      article: { title: 'T', accountId: 'wx-1' },
      status: 'success',
      retryOf: failedId,
    })
  })

  test('不存在或未失败的任务不能人工重试', async () => {
    const queue = new TaskQueue({ defaultRetry: 0 })
    queue.setExecutor(async () => ({ success: true }))
    const successId = queue.add({ platform: 'wechat_mp', article: { title: 'T' } })
    await new Promise(r => setTimeout(r, 100))

    expect(queue.retry('missing')).toBeNull()
    expect(queue.retry(successId)).toBeNull()
  })

  test('运行中任务取消后即使执行器成功也保持 cancelled，且向执行器传递中止信号', async () => {
    const queue = new TaskQueue({ defaultRetry: 0 })
    let resolveTask
    let receivedSignal
    let successCount = 0
    queue.on('task:success', () => { successCount++ })
    queue.setExecutor((task, context) => {
      receivedSignal = context.signal
      return new Promise(resolve => { resolveTask = resolve })
    })

    const taskId = queue.add({ platform: 'wechat_mp', article: { title: 'T', accountId: 'acc-1' } })
    await new Promise(r => setTimeout(r, 20))

    expect(queue.cancel(taskId)).toBe(true)
    expect(receivedSignal.aborted).toBe(true)
    resolveTask({ success: true })
    await new Promise(r => setTimeout(r, 30))

    expect(queue.getHistory().find(task => task.id === taskId)?.status).toBe('cancelled')
    expect(successCount).toBe(0)
  })

  test('运行中任务取消后执行器失败也不会自动重试', async () => {
    const queue = new TaskQueue({ defaultRetry: 2 })
    let rejectTask
    let retryCount = 0
    queue.on('task:retry', () => { retryCount++ })
    queue.setExecutor(() => new Promise((resolve, reject) => { rejectTask = reject }))

    const taskId = queue.add({ platform: 'wechat_mp', article: { title: 'T' } })
    await new Promise(r => setTimeout(r, 20))

    expect(queue.cancel(taskId)).toBe(true)
    rejectTask(new Error('发布器稍后失败'))
    await new Promise(r => setTimeout(r, 30))

    expect(queue.getHistory().find(task => task.id === taskId)?.status).toBe('cancelled')
    expect(retryCount).toBe(0)
  })

  test('执行器忽略中止信号时取消仍立即释放并发槽', async () => {
    const queue = new TaskQueue({ maxConcurrent: 1, defaultRetry: 0, defaultTimeout: 60000 })
    const started = []
    queue.setExecutor(task => {
      started.push(task.article.title)
      if (task.article.title === '阻塞任务') return new Promise(() => {})
      return Promise.resolve({ success: true })
    })

    const cancelledId = queue.add({ platform: 'wechat_mp', article: { title: '阻塞任务' } })
    const nextId = queue.add({ platform: 'zhihu', article: { title: '后续任务' } })
    await new Promise(r => setTimeout(r, 20))

    expect(queue.cancel(cancelledId)).toBe(true)
    await new Promise(r => setTimeout(r, 30))

    expect(started).toEqual(['阻塞任务', '后续任务'])
    expect(queue.getHistory().find(task => task.id === cancelledId)?.status).toBe('cancelled')
    expect(queue.getHistory().find(task => task.id === nextId)?.status).toBe('success')
    expect(queue.getStatus()).toMatchObject({ pending: 0, running: 0 })
  })

  test('shutdown 会取消运行中和等待中的任务，且不再启动后续任务', async () => {
    const queue = new TaskQueue({ maxConcurrent: 1, defaultRetry: 2, defaultTimeout: 60000 })
    const started = []
    let resolveRunning
    let runningSignal
    queue.setExecutor((task, context) => {
      started.push(task.article.title)
      runningSignal = context.signal
      return new Promise(resolve => { resolveRunning = resolve })
    })

    const runningId = queue.add({ platform: 'wechat_mp', article: { title: '运行中' } })
    const pendingId = queue.add({ platform: 'zhihu', article: { title: '等待中' } })
    await new Promise(r => setTimeout(r, 20))

    queue.shutdown()
    expect(runningSignal.aborted).toBe(true)
    resolveRunning({ success: true })
    await new Promise(r => setTimeout(r, 30))

    expect(started).toEqual(['运行中'])
    expect(queue.getHistory().find(task => task.id === runningId)?.status).toBe('cancelled')
    expect(queue.getHistory().find(task => task.id === pendingId)?.status).toBe('cancelled')
    expect(queue.getStatus()).toMatchObject({ pending: 0, running: 0, paused: true })
  })

  test('恢复队列时会立即填满 maxConcurrent 并发槽位', async () => {
    const queue = new TaskQueue({ maxConcurrent: 2, defaultRetry: 0 })
    const started = []
    const resolvers = []
    queue.pause()
    queue.setExecutor(task => new Promise(resolve => {
      started.push(task.id)
      resolvers.push(resolve)
    }))
    queue.add({ platform: 'wechat_mp', article: { title: '1' } })
    queue.add({ platform: 'zhihu', article: { title: '2' } })
    queue.add({ platform: 'weibo', article: { title: '3' } })

    queue.resume()
    await new Promise(r => setTimeout(r, 20))

    expect(started).toHaveLength(2)
    resolvers.forEach(resolve => resolve({ success: true }))
  })

  test('超时后标记失败', async () => {
    const queue = new TaskQueue({ defaultTimeout: 50, defaultRetry: 0 })

    queue.setExecutor(async () => {
      await new Promise(r => setTimeout(r, 1000))
      return 'never reached'
    })

    queue.add({ platform: 'test', article: { title: 'T' } })

    // 等待足够长让超时触发并完成
    await new Promise(r => setTimeout(r, 300))

    const history = queue.getHistory()
    expect(history.length).toBeGreaterThan(0)
    expect(history[0].status).toBe('failed')
    expect(history[0].error).toContain('timed out')
  })

  test('暂停后任务不执行', async () => {
    const queue = new TaskQueue()
    let executed = false

    queue.setExecutor(async () => { executed = true })

    // 先暂停，再添加任务
    queue.pause()
    queue.add({ platform: 'test', article: { title: 'T' } })

    await new Promise(r => setTimeout(r, 100))

    expect(executed).toBe(false)
  })

  test('恢复后继续执行', async () => {
    const queue = new TaskQueue()
    let executed = false

    queue.setExecutor(async () => { executed = true })
    queue.add({ platform: 'test', article: { title: 'T' } })
    queue.pause()
    queue.resume()

    await new Promise(r => setTimeout(r, 100))

    expect(executed).toBe(true)
  })

  test('获取队列状态', () => {
    const queue = new TaskQueue()
    const status = queue.getStatus()
    expect(status.pending).toBe(0)
    expect(status.running).toBe(0)
    expect(status.paused).toBe(false)
  })

  test('进度事件', async () => {
    const queue = new TaskQueue()
    const events = []

    queue.on('task:added', () => events.push('added'))
    queue.on('task:start', () => events.push('start'))

    queue.setExecutor(async () => ({ success: true }))
    queue.add({ platform: 'test', article: { title: 'T' } })

    await new Promise(r => setTimeout(r, 100))

    expect(events).toContain('added')
    expect(events).toContain('start')
  })
})
