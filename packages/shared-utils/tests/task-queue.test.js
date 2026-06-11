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

  test('超时后标记失败', async () => {
    const queue = new TaskQueue({ defaultTimeout: 50, defaultRetry: 0 })

    queue.setExecutor(async () => {
      await new Promise(r => setTimeout(r, 1000))
      return 'never reached'
    })

    queue.add({ platform: 'test', article: { title: 'T' } })

    await new Promise(r => setTimeout(r, 150))

    const history = queue.getHistory()
    expect(history[0].status).toBe('failed')
    expect(history[0].error).toContain('timed out')
  })

  test('暂停后任务不执行', async () => {
    const queue = new TaskQueue()
    let executed = false

    queue.setExecutor(async () => { executed = true })
    queue.add({ platform: 'test', article: { title: 'T' } })
    queue.pause()

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
