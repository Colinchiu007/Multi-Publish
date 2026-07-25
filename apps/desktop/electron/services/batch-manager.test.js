// @ts-check
const EventEmitter = require('events')

__enableElectronMock()

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}
__registerMock('./logger', mockLog)

const BatchManager = require('./batch-manager')

function createStore(articles) {
  const batch = {
    id: 'batch-1',
    articles,
    total: articles.length,
    completed: 0,
    failed: 0,
    status: 'pending',
  }

  return {
    batch,
    addBatchJob: vi.fn(() => true),
    getBatchJob: vi.fn(function (id) {
      return id === batch.id ? batch : null
    }),
    listBatchJobs: vi.fn(() => [batch]),
    updateBatchJob: vi.fn(function (id, updates) {
      if (id !== batch.id) return false
      Object.assign(batch, updates)
      return true
    }),
    deleteBatchJob: vi.fn(() => true),
  }
}

function createQueue(addImplementation) {
  const queue = new EventEmitter()
  queue.add = vi.fn(addImplementation)
  return queue
}

function emittedEvents(send) {
  return send.mock.calls
    .filter(function (call) { return call[0] === 'batch:progress' })
    .map(function (call) { return call[1] })
}

describe('BatchManager.executeBatch 入队与终态合同', () => {
  let send

  beforeEach(() => {
    vi.clearAllMocks()
    __resetElectronMock()
    BatchManager.setTaskQueue(null)
    const win = new __electronMock.BrowserWindow()
    send = vi.fn()
    win.webContents.send = send
  })

  afterEach(() => {
    BatchManager.setTaskQueue(null)
  })

  it('任务队列未初始化时为每个任务发送带 batchId/taskId 的失败终态并完成批次', async () => {
    const store = createStore([
      { title: '文章', content: '正文', platforms: ['wechat_mp', 'zhihu'] },
    ])
    const manager = new BatchManager(store)

    const result = await manager.executeBatch('batch-1')

    expect(result).toMatchObject({ batchId: 'batch-1', total: 2, accepted: 0, failed: 2 })
    const events = emittedEvents(send)
    const failures = events.filter(function (event) { return event.kind === 'task-complete' })
    expect(failures).toHaveLength(2)
    expect(failures.every(function (event) {
      return event.batchId === 'batch-1' && Boolean(event.taskId) && event.ok === false
    })).toBe(true)
    expect(events.at(-1)).toMatchObject({
      kind: 'batch-complete',
      batchId: 'batch-1',
      total: 2,
      accepted: 0,
      completed: 2,
      failed: 2,
    })
    expect(store.batch).toMatchObject({ total: 2, completed: 2, failed: 2, status: 'done' })
  })

  it('平台标识无效时不调用队列并发送可追踪的失败终态', async () => {
    const store = createStore([
      { title: '文章', content: '正文', platforms: [{ accountId: 'account-1' }] },
    ])
    const queue = createQueue(function () { return 'should-not-run' })
    BatchManager.setTaskQueue(queue)
    const manager = new BatchManager(store)

    const result = await manager.executeBatch('batch-1')

    expect(queue.add).not.toHaveBeenCalled()
    expect(result).toMatchObject({ total: 1, accepted: 0, failed: 1 })
    expect(emittedEvents(send)[0]).toMatchObject({
      kind: 'task-complete',
      batchId: 'batch-1',
      ok: false,
      message: '无效发布平台',
    })
    expect(emittedEvents(send)[0].taskId).toBeTruthy()
  })

  it.each([
    {
      name: '同步抛错',
      add: function () { throw new Error('队列已关闭') },
    },
    {
      name: '异步拒绝',
      add: function () { return Promise.reject(new Error('队列写入失败')) },
    },
  ])('taskQueue.add $name 时返回失败计数并发送失败终态', async ({ add }) => {
    const store = createStore([
      { title: '文章', content: '正文', platforms: ['wechat_mp'] },
    ])
    const queue = createQueue(add)
    BatchManager.setTaskQueue(queue)
    const manager = new BatchManager(store)

    const result = await manager.executeBatch('batch-1')

    expect(result).toMatchObject({ total: 1, accepted: 0, failed: 1 })
    const failure = emittedEvents(send).find(function (event) { return event.kind === 'task-complete' })
    expect(failure).toMatchObject({ batchId: 'batch-1', platform: 'wechat_mp', ok: false })
    expect(failure.taskId).toBeTruthy()
    expect(store.batch).toMatchObject({ completed: 1, failed: 1, status: 'done' })
  })

  it('部分任务接受、部分入队失败时返回精确计数，并在接受任务结束后发送 batch-complete', async () => {
    const store = createStore([
      { title: '文章', content: '正文', platforms: ['wechat_mp', 'zhihu'] },
    ])
    const queue = createQueue(function (task) {
      if (task.platform === 'zhihu') throw new Error('平台队列不可用')
      return 'task-accepted'
    })
    BatchManager.setTaskQueue(queue)
    const manager = new BatchManager(store)

    const result = await manager.executeBatch('batch-1')

    expect(result).toMatchObject({ total: 2, accepted: 1, failed: 1 })
    expect(emittedEvents(send).some(function (event) { return event.kind === 'batch-complete' })).toBe(false)

    queue.emit('task:success', {
      id: 'task-accepted',
      status: 'success',
      result: { url: 'https://example.test/published' },
    })

    expect(store.batch).toMatchObject({ total: 2, completed: 2, failed: 1, status: 'done' })
    expect(emittedEvents(send).at(-1)).toMatchObject({
      kind: 'batch-complete',
      total: 2,
      accepted: 1,
      completed: 2,
      succeeded: 1,
      failed: 1,
    })
    expect(queue.listenerCount('task:success')).toBe(0)
    expect(queue.listenerCount('task:failed')).toBe(0)
  })

  it('队列在 add 返回前同步发出终态时仍能收口，避免终态事件丢失', async () => {
    const store = createStore([
      { title: '文章', content: '正文', platforms: ['wechat_mp'] },
    ])
    const queue = createQueue(function () {
      queue.emit('task:success', {
        id: 'task-early',
        status: 'success',
        result: {},
      })
      return 'task-early'
    })
    BatchManager.setTaskQueue(queue)
    const manager = new BatchManager(store)

    const result = await manager.executeBatch('batch-1')

    expect(result).toMatchObject({ total: 1, accepted: 1, failed: 0 })
    expect(store.batch).toMatchObject({ completed: 1, failed: 0, status: 'done' })
    expect(emittedEvents(send).at(-1)).toMatchObject({
      kind: 'batch-complete',
      batchId: 'batch-1',
      completed: 1,
      succeeded: 1,
      failed: 0,
    })
  })

  it('batch:execute IPC 响应返回 accepted/failed 明确计数合同', async () => {
    const store = createStore([
      { title: '文章', content: '正文', platforms: ['wechat_mp'] },
    ])
    const manager = new BatchManager(store)
    manager.registerIpcHandlers()

    const response = await __electronMock.ipcMain._handlers['batch:execute']({}, 'batch-1')

    expect(response).toEqual({
      code: 0,
      data: {
        batchId: 'batch-1',
        total: 1,
        accepted: 0,
        failed: 1,
      },
    })
  })

  it('batch:list 和 batch:get 拒绝不受信任来源，并允许受信任来源读取', async () => {
    const store = createStore([])
    const listed = [{ id: 'batch-visible', articles: [] }]
    store.listBatchJobs = vi.fn(() => listed)
    store.getBatchJob = vi.fn((id) => id === 'batch-visible' ? listed[0] : null)
    const manager = new BatchManager(store)
    manager.setOwnerSubjectProvider(() => 'user-a')
    manager.registerIpcHandlers()

    const listHandler = __electronMock.ipcMain._handlers['batch:list']
    const getHandler = __electronMock.ipcMain._handlers['batch:get']
    const evilEvent = { senderFrame: { url: 'https://evil.example/' } }
    const trustedEvent = { senderFrame: { url: 'app://localhost/index.html' } }

    await expect(listHandler(evilEvent)).resolves.toMatchObject({ code: -3, message: '未授权的调用来源' })
    await expect(getHandler(evilEvent, 'batch-visible')).resolves.toMatchObject({ code: -3, message: '未授权的调用来源' })
    expect(store.listBatchJobs).not.toHaveBeenCalled()
    expect(store.getBatchJob).not.toHaveBeenCalled()

    await expect(listHandler(trustedEvent)).resolves.toEqual({ code: 0, data: listed })
    await expect(getHandler(trustedEvent, 'batch-visible')).resolves.toEqual({ code: 0, data: listed[0] })
    expect(store.listBatchJobs).toHaveBeenCalledWith('user-a')
    expect(store.getBatchJob).toHaveBeenCalledWith('batch-visible', 'user-a')
  })

  it('身份缺少 sub 时批量读取 fail-closed，且不调用 Store', async () => {
    const store = createStore([])
    const manager = new BatchManager(store)
    manager.setOwnerSubjectProvider(() => null)
    manager.registerIpcHandlers()
    const trustedEvent = { senderFrame: { url: 'app://localhost/index.html' } }

    await expect(__electronMock.ipcMain._handlers['batch:list'](trustedEvent))
      .resolves.toEqual({ code: -3, message: '无法识别当前用户', data: [] })
    await expect(__electronMock.ipcMain._handlers['batch:get'](trustedEvent, 'batch-1'))
      .resolves.toEqual({ code: -3, message: '无法识别当前用户', data: null })
    expect(store.listBatchJobs).not.toHaveBeenCalled()
    expect(store.getBatchJob).not.toHaveBeenCalled()
  })

  it('批量执行在身份切换后仍使用发起时 owner 更新状态，并且不把进度推给新用户', async () => {
    let owner = 'user-a'
    let resolveAdd
    const store = createStore([
      { title: '文章', content: '正文', platforms: ['wechat_mp'] },
    ])
    const queue = createQueue(() => new Promise(resolve => { resolveAdd = resolve }))
    BatchManager.setTaskQueue(queue)
    const manager = new BatchManager(store)
    manager.setOwnerSubjectProvider(() => owner)

    const execution = manager.executeBatch('batch-1')
    expect(queue.add).toHaveBeenCalledOnce()
    owner = 'user-b'
    resolveAdd('task-owner-a')
    await execution
    queue.emit('task:success', { id: 'task-owner-a', status: 'success', result: {} })

    expect(store.getBatchJob).toHaveBeenCalledWith('batch-1', 'user-a')
    expect(store.updateBatchJob.mock.calls.every(call => call[2] === 'user-a')).toBe(true)
    expect(emittedEvents(send)).toEqual([])
  })

  it('批量 IPC 不向渲染层泄露底层存储错误', async () => {
    const store = createStore([])
    store.listBatchJobs.mockImplementation(() => {
      throw new Error('SQLite error: C:\\Users\\secret\\multi-publish.db')
    })
    const manager = new BatchManager(store)
    manager.registerIpcHandlers()
    const trustedEvent = { senderFrame: { url: 'app://localhost/index.html' } }

    const result = await __electronMock.ipcMain._handlers['batch:list'](trustedEvent)

    expect(result).toEqual({ code: -1, message: '批量任务读取失败', data: [] })
    expect(JSON.stringify(result)).not.toContain('multi-publish.db')
  })
})
