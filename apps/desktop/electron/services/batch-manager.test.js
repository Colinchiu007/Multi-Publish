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
const EC = require('../core/error-codes').ERROR

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
    getBatchJob: vi.fn(function (id) {
      return id === batch.id ? batch : null
    }),
    updateBatchJob: vi.fn(function (id, updates) {
      if (id !== batch.id) return false
      Object.assign(batch, updates)
      return true
    }),
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
      { title: '文章', content: '正文', platforms: ['toutiao', 'zhihu'] },
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
      { title: '文章', content: '正文', platforms: ['toutiao'] },
    ])
    const queue = createQueue(add)
    BatchManager.setTaskQueue(queue)
    const manager = new BatchManager(store)

    const result = await manager.executeBatch('batch-1')

    expect(result).toMatchObject({ total: 1, accepted: 0, failed: 1 })
    const failure = emittedEvents(send).find(function (event) { return event.kind === 'task-complete' })
    expect(failure).toMatchObject({ batchId: 'batch-1', platform: 'toutiao', ok: false })
    expect(failure.taskId).toBeTruthy()
    expect(store.batch).toMatchObject({ completed: 1, failed: 1, status: 'done' })
  })

  it('部分任务接受、部分入队失败时返回精确计数，并在接受任务结束后发送 batch-complete', async () => {
    const store = createStore([
      { title: '文章', content: '正文', platforms: ['toutiao', 'zhihu'] },
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
      { title: '文章', content: '正文', platforms: ['toutiao'] },
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
      { title: '文章', content: '正文', platforms: ['toutiao'] },
    ])
    const manager = new BatchManager(store)
    // P1-14：注入契约收紧后必须显式传入受控 ipcMain（不再回退全局）
    manager.registerIpcHandlers(__electronMock.ipcMain)

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

  it('身份模式冻结创建者 owner，用户切换后仍只更新原批次并可信入队', async () => {
    let currentOwner = 'user-a'
    const store = createStore([
      { title: '文章', content: '正文', platforms: ['toutiao'] },
    ])
    const queue = new EventEmitter()
    queue.addForOwner = vi.fn(() => 'task-a')
    BatchManager.setTaskQueue(queue)
    const manager = new BatchManager(store)
    manager.setOwnerSubjectProvider(() => currentOwner)

    await manager.executeBatch('batch-1')
    expect(store.getBatchJob).toHaveBeenCalledWith('batch-1', 'user-a')
    expect(queue.addForOwner).toHaveBeenCalledWith(
      expect.objectContaining({ owner_subject: 'user-a', batchId: 'batch-1', accountId: null }),
      'user-a',
    )

    currentOwner = 'user-b'
    queue.emit('task:success', { id: 'task-a', status: 'success', result: {} })
    expect(store.updateBatchJob).toHaveBeenLastCalledWith(
      'batch-1',
      expect.objectContaining({ completed: 1, status: 'done' }),
      'user-a',
    )
  })

  it('batch:list 在身份服务缺少 owner 时 fail-closed', async () => {
    const store = { listBatchJobs: vi.fn() }
    const manager = new BatchManager(store)
    manager.setOwnerSubjectProvider(() => null)
    // P1-14：注入契约收紧后必须显式传入受控 ipcMain（不再回退全局）
    manager.registerIpcHandlers(__electronMock.ipcMain)

    const response = await __electronMock.ipcMain._handlers['batch:list']({})

    expect(response).toMatchObject({ code: EC.AUTH_ERROR })
    expect(store.listBatchJobs).not.toHaveBeenCalled()
  })
})

    describe('BatchManager 平台侧定时 — 排期语义', () => {
      let store
      let queue

      const future = (minutes) => new Date(Date.now() + minutes * 60000).toISOString()

      function setup (articles, addImplementation) {
        store = createStore(articles)
        // restoreScheduledBatches 走 listBatchJobs；createStore 只提供单批次 getter
        store.listBatchJobs = vi.fn(() => [store.batch])
        queue = createQueue(addImplementation || (() => Promise.resolve('t1')))
        BatchManager.setTaskQueue(queue)
        return new BatchManager(store)
      }

      beforeEach(() => {
        vi.useFakeTimers()
      })

      afterEach(() => {
        BatchManager.setTaskQueue(null)
        vi.useRealTimers()
      })

      it('不支持平台侧定时的平台在排期前被阻断（不静默到点立即发布）', () => {
        const manager = setup([{ platforms: ['zhihu'], publishTime: future(30) }])

        expect(() => manager.scheduleBatch('batch-1')).toThrow(/zhihu/)
        expect(queue.add).not.toHaveBeenCalled()
      })

      it('未知平台 fail-closed（绝不默认支持）', () => {
        const manager = setup([{ platforms: ['totally-unknown'], publishTime: future(30) }])

        expect(() => manager.scheduleBatch('batch-1')).toThrow(/不支持平台侧定时/)
        expect(queue.add).not.toHaveBeenCalled()
      })

      it('一个批次里混入不支持的平台 → 整体阻断，不部分提交', () => {
        const manager = setup([{ platforms: ['toutiao', 'weibo'], publishTime: future(30) }])

        expect(() => manager.scheduleBatch('batch-1')).toThrow(/weibo/)
        expect(queue.add).not.toHaveBeenCalled()
      })

      it('平台最小提前量不足时阻断（5 分钟下限）', () => {
        const manager = setup([{ platforms: ['toutiao'], publishTime: future(1) }])

        expect(() => manager.scheduleBatch('batch-1')).toThrow(/5/)
        expect(queue.add).not.toHaveBeenCalled()
      })

      it('排期立即提交给平台并携带 publishTime，且不再武装任何本地定时器', async () => {
        const publishTime = future(60)
        const manager = setup([{ platforms: ['toutiao'], publishTime }])

        manager.scheduleBatch('batch-1')
        await Promise.resolve()

        expect(vi.getTimerCount()).toBe(0)
        expect(queue.add).toHaveBeenCalledWith(expect.objectContaining({
          publishMode: 'scheduled',
          publishTime
        }))
      })

      it('排期后批次状态置 scheduled', () => {
        const manager = setup([{ platforms: ['toutiao'], publishTime: future(60) }])

        expect(manager.scheduleBatch('batch-1')).toBe(true)
        expect(store.updateBatchJob).toHaveBeenCalledWith(
          'batch-1', expect.objectContaining({ status: 'scheduled' }), undefined
        )
      })

      it('批次不存在时 scheduleBatch 返回 false', () => {
        store = createStore([{ platforms: ['toutiao'], publishTime: future(60) }])
        const manager = new BatchManager(store)

        expect(manager.scheduleBatch('missing-batch')).toBe(false)
      })

      it('无效 publishTime 跳过该条目且不提交', () => {
        const manager = setup([{ platforms: ['toutiao'], publishTime: 'not-a-date' }])

        manager.scheduleBatch('batch-1')
        expect(queue.add).not.toHaveBeenCalled()
      })

      it('没有 scheduled 批次时 restoreScheduledBatches 返回 0 且不提交任何任务', () => {
        const manager = setup([{ platforms: ['toutiao'], publishTime: future(60) }])
        store.batch.status = 'done'

        expect(manager.restoreScheduledBatches()).toBe(0)
        expect(queue.add).not.toHaveBeenCalled()
      })

      // 平台侧定时后本地不再持有定时器，若 cancelBatch 仍以「是否清到 timer」判定成败，
      // 用户点「取消排期」将永远失败。这条锁防止该回归。
      it('排期后取消批次成功（不依赖本地定时器是否存在）', () => {
        const manager = setup([{ platforms: ['toutiao'], publishTime: future(60) }])
        manager.scheduleBatch('batch-1')

        expect(manager.cancelBatch('batch-1')).toBe(true)
        expect(store.updateBatchJob).toHaveBeenCalledWith(
          'batch-1', expect.objectContaining({ status: 'cancelled' }), undefined
        )
      })

      it('已是终态的批次取消返回 false（不误报成功）', () => {
        const manager = setup([{ platforms: ['toutiao'], publishTime: future(60) }])
        store.batch.status = 'done'

        expect(manager.cancelBatch('batch-1')).toBe(false)
      })

      it('不存在的批次取消返回 false', () => {
        const manager = setup([{ platforms: ['toutiao'], publishTime: future(60) }])

        expect(manager.cancelBatch('missing-batch')).toBe(false)
      })
    })


describe('BatchManager P2-7 派发层字段面（executeBatch ↔ scheduleBatch parity）', () => {
  /** 渲染层 buildBatchArticlePayload 落库后的真实形态（含条目级扩展字段面） */
  function fullStoredArticle (extra = {}) {
    return {
      title: '标题',
      content: '正文',
      contentFormat: 'markdown',
      platforms: ['toutiao'],
      publishTime: null,
      precheck: true,
      author: '作者',
      cover_url: 'https://example.com/a.png',
      cover_path: 'D:/a.png',
      cover_file: { path: 'D:/a.png', name: 'a.png' },
      video_path: 'D:/v.mp4',
      images: ['D:/1.png'],
      image_files: [{ path: 'D:/1.png' }],
      tags: ['标签'],
      topics: ['话题'],
      mentions: [{ name: '张三', text: '@张三' }],
      aiGenerated: false,
      platformOverrides: { wechat_mp: { title: '覆盖标题', content: '' } },
      visibilitySemantic: 'private',
      ...extra,
    }
  }

  function setupWindow () {
    const win = new __electronMock.BrowserWindow()
    win.webContents.send = vi.fn()
    return win
  }

  beforeEach(() => {
    vi.clearAllMocks()
    __resetElectronMock()
    BatchManager.setTaskQueue(null)
    setupWindow()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('executeBatch 入队携带全部字段（旧白名单会在此变红）', async () => {
    const stored = fullStoredArticle()
    const store = createStore([stored])
    const queue = createQueue(() => 'task-1')
    BatchManager.setTaskQueue(queue)
    const manager = new BatchManager(store)

    await manager.executeBatch('batch-1')

    expect(queue.add).toHaveBeenCalledTimes(1)
    const enqueued = queue.add.mock.calls[0][0]
    expect(enqueued.article).toEqual({ ...stored, accountId: null })
    // 逐个点名本切片修复的键：白名单形态下这些一律丢失
    for (const key of [
      'cover_path', 'cover_file', 'images', 'image_files', 'tags', 'topics',
      'mentions', 'aiGenerated', 'contentFormat', 'platformOverrides', 'visibilitySemantic',
    ]) {
      expect(enqueued.article, `入队任务必须携带 ${key}`).toHaveProperty(key)
    }
  })

  it('executeBatch 与 scheduleBatch 携带同一字段面（parity 锁，一条路径单独丢键即红）', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-29T08:00:00.000Z'))

    const immediateStore = createStore([fullStoredArticle()])
    const immediateQueue = createQueue(() => 'task-now')
    BatchManager.setTaskQueue(immediateQueue)
    await new BatchManager(immediateStore).executeBatch('batch-1')

    // 平台侧定时（2026-10-07）：排期**立即**提交给平台，不再等本地定时器到点，
    // 因此这里既不需要推进时钟，publishTime 也必须满足平台最小提前量（5 分钟）。
    const future = new Date(Date.now() + 60 * 60000).toISOString()
    const scheduleStore = createStore([fullStoredArticle({ publishTime: future })])
    const scheduleQueue = createQueue(() => 'task-later')
    BatchManager.setTaskQueue(scheduleQueue)
    const scheduleManager = new BatchManager(scheduleStore)
    scheduleManager.scheduleBatch('batch-1')
    await vi.advanceTimersByTimeAsync(0)

    expect(immediateQueue.add).toHaveBeenCalledTimes(1)
    expect(scheduleQueue.add).toHaveBeenCalledTimes(1)
    const immediateKeys = Object.keys(immediateQueue.add.mock.calls[0][0].article).sort()
    const scheduleKeys = Object.keys(scheduleQueue.add.mock.calls[0][0].article).sort()
    expect(immediateKeys).toEqual(scheduleKeys)

      // accountId 必须落进 article：loadAuthForTask 读的是 article.accountId，
    // 只放 task 顶层会让排期批次回退到平台默认账号的凭证（本条锁住该缺陷）
    const immediateArticle = immediateQueue.add.mock.calls[0][0].article
    const scheduleArticle = scheduleQueue.add.mock.calls[0][0].article
    expect('accountId' in immediateArticle).toBe(true)
    expect('accountId' in scheduleArticle).toBe(true)
    expect(immediateArticle.accountId).toEqual(scheduleArticle.accountId)
  })

  it('accountId 由派发目标覆盖条目自带值（防「批次里残留的账号」冒充本次目标）', async () => {
    const store = createStore([fullStoredArticle({ accountId: 'stale-account', platforms: [{ platform: 'toutiao', accountId: 'wx-target' }] })])
    const queue = createQueue(() => 'task-1')
    BatchManager.setTaskQueue(queue)

    await new BatchManager(store).executeBatch('batch-1')

    const enqueued = queue.add.mock.calls[0][0]
    expect(enqueued.accountId).toBe('wx-target')
    expect(enqueued.article.accountId).toBe('wx-target')
  })
})
