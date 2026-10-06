const fs = require('fs')
const os = require('os')
const path = require('path')
const { createScheduler } = require('../scheduler')

const BASE_TIME = new Date('2026-07-17T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_TIMER_DELAY = 2_147_483_647

describe('Scheduler 共享实现', () => {
  let tempDir
  let filePath
  let app
  let logger
  let scheduler

  const futureTime = (offset = 10_000) => new Date(BASE_TIME.getTime() + offset).toISOString()

  const readEntries = () => fs.readFileSync(filePath, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(BASE_TIME)
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-scheduler-'))
    filePath = path.join(tempDir, 'scheduled-tasks.jsonl')
    app = { getPath: vi.fn(() => tempDir) }
    logger = { error: vi.fn(), warn: vi.fn() }
    scheduler = createScheduler({ app, logger })
  })

  afterEach(() => {
    scheduler.stopAll()
    vi.useRealTimers()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('暴露完整且稳定的实例 API', () => {
    expect(Object.keys(scheduler).sort()).toEqual([
      'cancel', 'create', 'list', 'rearm', 'restore', 'setOwnerSubjectProvider', 'setTaskQueue', 'stopAll'
    ])
  })

  // 休眠/唤醒与时钟跳变后必须能强制重算剩余延时。
  // restore() 对已武装任务走 isTaskTracked 分支直接跳过，无法纠正漂移，
  // 所以需要 rearm()：先解除全部定时器，再按当前墙钟重新武装。
  describe('rearm 强制重算', () => {
    it('清除已武装定时器并按新墙钟重新计时，时钟前跳后立即到点派发', async () => {
      const taskQueue = { add: vi.fn() }
      scheduler.setTaskQueue(taskQueue)
      const entry = scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime(10_000) })
      expect(vi.getTimerCount()).toBe(1)

      // 系统时钟前跳 1 小时：原 setTimeout 仍按相对延时等待，任务会迟到一小时
      vi.setSystemTime(new Date(BASE_TIME.getTime() + 60 * 60 * 1000))
      expect(vi.getTimerCount()).toBe(1)

      const rearmed = scheduler.rearm()

      expect(rearmed).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(taskQueue.add).toHaveBeenCalledOnce()
      expect(scheduler.list().find(task => task.id === entry.id).status).toBe('executed')
    })

    it('rearm 不会让同一任务双派发', async () => {
      const taskQueue = { add: vi.fn() }
      scheduler.setTaskQueue(taskQueue)
      scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime(10_000) })

      scheduler.rearm()
      scheduler.rearm()
      scheduler.rearm()
      await vi.advanceTimersByTimeAsync(10_000)

      expect(taskQueue.add).toHaveBeenCalledOnce()
    })

    it('rearm 保留未到点的 pending 任务，且不影响终态记录', async () => {
      const taskQueue = { add: vi.fn() }
      scheduler.setTaskQueue(taskQueue)
      const pending = scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime(3_600_000) })
      const cancelled = scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime(3_600_000) })
      scheduler.cancel(cancelled.id)

      expect(scheduler.rearm()).toBe(1)

      const statuses = new Map(scheduler.list().map(task => [task.id, task.status]))
      expect(statuses.get(pending.id)).toBe('pending')
      expect(statuses.get(cancelled.id)).toBe('cancelled')
      await vi.advanceTimersByTimeAsync(10_000)
      expect(taskQueue.add).not.toHaveBeenCalled()
    })

    it('stopAll 之后 rearm 不再武装任何定时器', () => {
      scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime(10_000) })
      scheduler.stopAll()
      expect(scheduler.rearm()).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  // 派发失败的用户可见性：旧实现只 logger.error，用户在 UI 上完全看不到
  // 「我排的定时任务没发出去」——状态变 failed 但既无提示、也进不了发布历史。
  describe('派发失败通知', () => {
    it('入队失败时回调 onDispatchFailed，携带任务身份与失败原因', async () => {
      const onDispatchFailed = vi.fn()
      const isolated = createScheduler({ app, logger, onDispatchFailed })
      isolated.setTaskQueue({ add: vi.fn(() => { throw new Error('队列已暂停') }) })
      const entry = isolated.create({ platform: 'wechat', article: { title: 'A' }, publishTime: futureTime() })

      vi.advanceTimersByTime(10_000)
      await vi.advanceTimersByTimeAsync(0)

      expect(onDispatchFailed).toHaveBeenCalledWith(expect.objectContaining({
        id: entry.id, platform: 'wechat', reason: '队列已暂停'
      }))
      isolated.stopAll()
    })

    it('认领持久化最终失败（放弃认领）也要通知', async () => {
      const onDispatchFailed = vi.fn()
      const failingFs = {
        ...fs,
        renameSync: vi.fn(() => { throw new Error('磁盘只读') })
      }
      const isolated = createScheduler({ app, fs: failingFs, logger, onDispatchFailed })
      isolated.setTaskQueue({ add: vi.fn() })
      isolated.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

      vi.advanceTimersByTime(10_000)
      await vi.advanceTimersByTimeAsync(2000)

      expect(onDispatchFailed).toHaveBeenCalledWith(
        expect.objectContaining({ reason: expect.stringContaining('磁盘只读') })
      )
      isolated.stopAll()
    })

    it('成功派发不触发失败回调', async () => {
      const onDispatchFailed = vi.fn()
      const isolated = createScheduler({ app, logger, onDispatchFailed })
      let finishEnqueue
      const taskQueue = { add: vi.fn(() => new Promise(resolve => { finishEnqueue = resolve })) }
      isolated.setTaskQueue(taskQueue)
      isolated.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

      vi.advanceTimersByTime(10_000)
      await vi.advanceTimersByTimeAsync(0)

      expect(taskQueue.add).toHaveBeenCalledOnce()
      expect(onDispatchFailed).not.toHaveBeenCalled()

      finishEnqueue()
      await isolated.stopAll()
    })

    it('未注入回调时派发失败不抛异常（向后兼容）', async () => {
      const isolated = createScheduler({ app, logger })
      isolated.setTaskQueue({ add: vi.fn(() => { throw new Error('队列不可用') }) })
      isolated.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

      vi.advanceTimersByTime(10_000)
      await vi.advanceTimersByTimeAsync(0)

      expect(isolated.list()[0].status).toBe('failed')
      isolated.stopAll()
    })
  })

  it('按 owner 隔离相同 ID 的任务列表和取消操作', () => {
    const entries = [
      { id: 'shared', owner_subject: 'user-a', platform: 'wechat', article: {}, status: 'pending', publishTime: futureTime() },
      { id: 'shared', owner_subject: 'user-b', platform: 'douyin', article: {}, status: 'pending', publishTime: futureTime() },
    ]
    fs.writeFileSync(filePath, entries.map(JSON.stringify).join('\n') + '\n', 'utf-8')

    expect(scheduler.list('user-a')).toEqual([entries[0]])
    expect(scheduler.cancel('shared', 'user-a')).toBe(true)
    expect(scheduler.list('user-a')[0].status).toBe('cancelled')
    expect(scheduler.list('user-b')[0].status).toBe('pending')
  })

  it('注入身份 provider 后创建任务写入 owner，缺少 sub 时 fail-closed', () => {
    scheduler.setOwnerSubjectProvider(() => 'user-a')
    const entry = scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

    expect(entry.owner_subject).toBe('user-a')
    expect(scheduler.list()).toEqual([entry])

    scheduler.setOwnerSubjectProvider(() => null)
    expect(() => scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime() })).toThrow('登录会话缺少用户标识')
    expect(() => scheduler.list()).toThrow('登录会话缺少用户标识')
    expect(() => scheduler.cancel(entry.id)).toThrow('登录会话缺少用户标识')
    expect(() => scheduler.restore()).toThrow('登录会话缺少用户标识')
  })

  it('create 以 JSONL 持久化 pending 任务并注册未来定时器', () => {
    const article = { title: '定时文章' }
    const entry = scheduler.create({ platform: 'wechat', article, publishTime: futureTime() })

    expect(entry).toMatchObject({
      platform: 'wechat',
      article,
      status: 'pending',
      publishTime: futureTime(),
      createdAt: BASE_TIME.toISOString()
    })
    expect(entry.id).toMatch(/^[a-z0-9]+$/)
    expect(readEntries()).toEqual([entry])
    expect(app.getPath).toHaveBeenCalledWith('userData')
    expect(vi.getTimerCount()).toBe(1)
  })

  it('身份模式持久化可信 owner，并以该 owner 提交到队列', async () => {
    scheduler.setOwnerSubjectProvider(() => 'user-a')
    const taskQueue = { addForOwner: vi.fn(() => 'queue-task-a') }
    scheduler.setTaskQueue(taskQueue)

    const entry = scheduler.create({
      platform: 'wechat',
      article: { title: '归属文章' },
      owner_subject: 'forged-user',
      publishTime: futureTime(),
    })

    expect(entry).toMatchObject({ owner_subject: 'user-a' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(taskQueue.addForOwner).toHaveBeenCalledWith(
      expect.objectContaining({ owner_subject: 'user-a' }),
      'user-a',
    )
  })

  it('到点派发的任务带 publishMode scheduled（发布历史可区分定时/立即发布）', async () => {
    const taskQueue = { add: vi.fn(() => 'queue-task-mode') }
    scheduler.setTaskQueue(taskQueue)

    scheduler.create({ platform: 'wechat', article: { title: '定时文章' }, publishTime: futureTime() })
    await vi.advanceTimersByTimeAsync(10_000)

    expect(taskQueue.add).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'wechat', publishMode: 'scheduled' }),
    )
  })

  it('身份模式下队列缺少 addForOwner 时拒绝降级为无归属入队', async () => {
    scheduler.setOwnerSubjectProvider(() => 'user-a')
    const taskQueue = { add: vi.fn(() => 'legacy-task') }
    scheduler.setTaskQueue(taskQueue)
    const entry = scheduler.create({
      platform: 'wechat',
      article: { title: '不能降级' },
      publishTime: futureTime(),
    })

    await vi.advanceTimersByTimeAsync(10_000)

    expect(taskQueue.add).not.toHaveBeenCalled()
    expect(scheduler.list('user-a').find(task => task.id === entry.id)).toMatchObject({ status: 'failed' })
  })

  it('身份切换发生在认领期间时保留原任务，且不向新用户会话派发', async () => {
    let currentOwner = 'user-a'
    scheduler.setOwnerSubjectProvider(() => currentOwner)
    const taskQueue = { addForOwner: vi.fn(() => 'queue-task-a') }
    scheduler.setTaskQueue(taskQueue)
    const entry = scheduler.create({
      platform: 'wechat',
      article: { title: '切换保护' },
      publishTime: futureTime(),
    })

    currentOwner = 'user-b'
    await vi.advanceTimersByTimeAsync(10_000)
    expect(taskQueue.addForOwner).not.toHaveBeenCalled()

    currentOwner = 'user-a'
    expect(scheduler.list('user-a').find(task => task.id === entry.id).status).toBe('pending')
    expect(scheduler.restore('user-a')).toBe(1)
    await vi.runAllTimersAsync()
    expect(taskQueue.addForOwner).toHaveBeenCalledWith(
      expect.objectContaining({ owner_subject: 'user-a' }),
      'user-a',
    )
  })

  it.each([
    [null, '任务参数必须是对象'],
    [{ article: {}, publishTime: futureTime() }, 'platform 必须是非空字符串'],
    [{ platform: '   ', article: {}, publishTime: futureTime() }, 'platform 必须是非空字符串'],
    [{ platform: 'wechat', publishTime: futureTime() }, 'article 必须是对象'],
    [{ platform: 'wechat', article: [], publishTime: futureTime() }, 'article 必须是对象'],
    [{ platform: 'wechat', article: {}, publishTime: 'not-a-date' }, 'publishTime 必须是有效的未来时间'],
    [{ platform: 'wechat', article: {}, publishTime: BASE_TIME.toISOString() }, 'publishTime 必须是有效的未来时间'],
    [{ platform: 'wechat', article: {}, publishTime: new Date(BASE_TIME.getTime() - 1).toISOString() }, 'publishTime 必须是有效的未来时间'],
  ])('create 拒绝无效任务且不留下 pending 记录 %#', (input, message) => {
    expect(() => scheduler.create(input)).toThrow(message)
    expect(scheduler.list()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([25, 30, 365])('%d 天后的任务分段等待且不会提前执行', async (days) => {
    const taskQueue = { add: vi.fn() }
    scheduler.setTaskQueue(taskQueue)
    const delay = days * DAY_MS
    const entry = scheduler.create({
      platform: 'wechat',
      article: { title: `${days} 天任务` },
      publishTime: new Date(BASE_TIME.getTime() + delay).toISOString(),
    })

    await vi.advanceTimersByTimeAsync(delay - 1)
    expect(taskQueue.add).not.toHaveBeenCalled()
    expect(scheduler.list().find(task => task.id === entry.id).status).toBe('pending')

    await vi.advanceTimersByTimeAsync(1)
    expect(taskQueue.add).toHaveBeenCalledOnce()
    expect(scheduler.list().find(task => task.id === entry.id).status).toBe('executed')
  })

  it('分段唤醒后时钟回拨会按新的剩余时间继续等待', async () => {
    const taskQueue = { add: vi.fn() }
    scheduler.setTaskQueue(taskQueue)
    const publishTime = new Date(BASE_TIME.getTime() + 30 * DAY_MS).toISOString()
    scheduler.create({ platform: 'wechat', article: {}, publishTime })

    await vi.advanceTimersByTimeAsync(MAX_TIMER_DELAY)
    expect(taskQueue.add).not.toHaveBeenCalled()

    vi.setSystemTime(new Date(BASE_TIME.getTime() + 20 * DAY_MS))
    await vi.advanceTimersByTimeAsync(10 * DAY_MS - 1)
    expect(taskQueue.add).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(taskQueue.add).toHaveBeenCalledOnce()
  })

  it('分段唤醒后时钟前跳会在下一次检查时立即派发', async () => {
    const taskQueue = { add: vi.fn() }
    scheduler.setTaskQueue(taskQueue)
    const publishTime = new Date(BASE_TIME.getTime() + 30 * DAY_MS).toISOString()
    scheduler.create({ platform: 'wechat', article: {}, publishTime })

    await vi.advanceTimersByTimeAsync(MAX_TIMER_DELAY)
    expect(taskQueue.add).not.toHaveBeenCalled()

    vi.setSystemTime(new Date(BASE_TIME.getTime() + 40 * DAY_MS))
    await vi.advanceTimersToNextTimerAsync()
    expect(taskQueue.add).toHaveBeenCalledOnce()
  })

  it('到期后把任务提交到 taskQueue 并持久化 executed 状态', async () => {
    const taskQueue = { add: vi.fn(() => 'queue-task-1') }
    scheduler.setTaskQueue(taskQueue)
    const entry = scheduler.create({ platform: 'wechat', article: { title: 'A' }, publishTime: futureTime() })

    await vi.advanceTimersByTimeAsync(10_000)

    expect(taskQueue.add).toHaveBeenCalledOnce()
    // publishMode: 'scheduled' — 定时派发任务的模式标记（写发布历史用）
    expect(taskQueue.add).toHaveBeenCalledWith({ platform: 'wechat', article: { title: 'A' }, publishMode: 'scheduled' })
    expect(scheduler.list().find(task => task.id === entry.id).status).toBe('executed')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('派发前持久化 dispatching，派发中的任务不可取消或覆盖状态', async () => {
    let finishDispatch
    const dispatchPending = new Promise(resolve => { finishDispatch = resolve })
    const taskQueue = { add: vi.fn(() => dispatchPending) }
    scheduler.setTaskQueue(taskQueue)
    const entry = scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

    vi.advanceTimersByTime(10_000)
    await Promise.resolve()

    expect(taskQueue.add).toHaveBeenCalledOnce()
    expect(scheduler.list().find(task => task.id === entry.id).status).toBe('dispatching')
    expect(scheduler.cancel(entry.id)).toBe(false)
    expect(scheduler.list().find(task => task.id === entry.id).status).toBe('dispatching')

    finishDispatch()
    await Promise.resolve()
    await Promise.resolve()

    expect(scheduler.list().find(task => task.id === entry.id).status).toBe('executed')
  })

  it('dispatching 状态暂时写盘失败时有界重试，且只向队列派发一次', async () => {
    let claimWriteAttempts = 0
    const flakyFs = {
      ...fs,
      writeFileSync: vi.fn((target, ...args) => {
        claimWriteAttempts += 1
        if (claimWriteAttempts <= 2) throw new Error('临时写盘失败')
        return fs.writeFileSync(target, ...args)
      })
    }
    const isolated = createScheduler({ app, fs: flakyFs, logger })
    const taskQueue = { add: vi.fn() }
    isolated.setTaskQueue(taskQueue)
    const entry = isolated.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

    await vi.runAllTimersAsync()

    expect(taskQueue.add).toHaveBeenCalledOnce()
    expect(isolated.list().find(task => task.id === entry.id).status).toBe('executed')
    expect(logger.warn).toHaveBeenCalledTimes(2)
    await isolated.stopAll()
  })

  it('dispatching 状态持续写盘失败时停止重试，不派发且不产生未处理拒绝', async () => {
    const failingFs = {
      ...fs,
      writeFileSync: vi.fn(() => { throw new Error('磁盘持续不可写') })
    }
    const isolated = createScheduler({ app, fs: failingFs, logger })
    const taskQueue = { add: vi.fn() }
    isolated.setTaskQueue(taskQueue)
    const entry = isolated.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

    await vi.runAllTimersAsync()

    expect(failingFs.writeFileSync).toHaveBeenCalledTimes(3)
    expect(taskQueue.add).not.toHaveBeenCalled()
    expect(isolated.list().find(task => task.id === entry.id).status).toBe('pending')
    expect(logger.error).toHaveBeenCalledWith(
      'Scheduler',
      `Failed to persist dispatching state for task ${entry.id} after 3 attempts: 磁盘持续不可写`
    )
    expect(vi.getTimerCount()).toBe(0)
    await isolated.stopAll()
  })

  it('taskQueue 同步抛错时持久化 failed 状态并记录错误', async () => {
    const taskQueue = { add: vi.fn(() => { throw new Error('队列不可用') }) }
    scheduler.setTaskQueue(taskQueue)
    const entry = scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

    await vi.advanceTimersByTimeAsync(10_000)

    expect(scheduler.list().find(task => task.id === entry.id).status).toBe('failed')
    expect(logger.error).toHaveBeenCalledWith(
      'Scheduler',
      `Failed to execute scheduled task ${entry.id}: 队列不可用`
    )
  })

  it('taskQueue 异步拒绝时同样持久化 failed 状态', async () => {
    const taskQueue = { add: vi.fn(() => Promise.reject(new Error('异步入队失败'))) }
    scheduler.setTaskQueue(taskQueue)
    const entry = scheduler.create({ platform: 'douyin', article: {}, publishTime: futureTime() })

    await vi.advanceTimersByTimeAsync(10_000)

    expect(scheduler.list().find(task => task.id === entry.id).status).toBe('failed')
    expect(logger.error).toHaveBeenCalledWith(
      'Scheduler',
      `Failed to execute scheduled task ${entry.id}: 异步入队失败`
    )
  })

  it('未注入 taskQueue 时不会静默丢弃到期任务', async () => {
    const entry = scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

    await vi.advanceTimersByTimeAsync(10_000)

    expect(scheduler.list().find(task => task.id === entry.id).status).toBe('failed')
    expect(logger.error).toHaveBeenCalledWith(
      'Scheduler',
      `Failed to execute scheduled task ${entry.id}: Task queue is not configured`
    )
  })

  it('create 持久化失败时抛错且不注册定时器', () => {
    const diskError = new Error('磁盘已满')
    const failingFs = { ...fs, appendFileSync: vi.fn(() => { throw diskError }) }
    const isolated = createScheduler({ app, fs: failingFs, logger })

    expect(() => isolated.create({ platform: 'wechat', article: {}, publishTime: futureTime() }))
      .toThrow('磁盘已满')
    expect(logger.error).toHaveBeenCalledWith('Scheduler', 'Failed to persist task: 磁盘已满')
    expect(vi.getTimerCount()).toBe(0)
    isolated.stopAll()
  })

  it('list 在文件不存在时返回空数组，并忽略空行和损坏行', () => {
    expect(scheduler.list()).toEqual([])
    fs.writeFileSync(filePath, '\n{"id":"ok","status":"pending"}\n{broken}\n', 'utf-8')

    expect(scheduler.list()).toEqual([{ id: 'ok', status: 'pending' }])
  })

  it('list 读取失败时降级为空数组并记录错误', () => {
    const readError = new Error('权限拒绝')
    const failingFs = {
      ...fs,
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => { throw readError })
    }
    const isolated = createScheduler({ app, fs: failingFs, logger })

    expect(isolated.list()).toEqual([])
    expect(logger.error).toHaveBeenCalledWith('Scheduler', 'Failed to list scheduled tasks: 权限拒绝')
  })

  it('cancel 原子改写状态、移除临时文件并清除对应定时器', async () => {
    const taskQueue = { add: vi.fn() }
    scheduler.setTaskQueue(taskQueue)
    const entry = scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

    expect(scheduler.cancel(entry.id)).toBe(true)

    expect(scheduler.list().find(task => task.id === entry.id).status).toBe('cancelled')
    expect(scheduler.cancel(entry.id)).toBe(false)
    expect(scheduler.cancel('missing-task')).toBe(false)
    expect(fs.existsSync(filePath + '.tmp')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(taskQueue.add).not.toHaveBeenCalled()
  })

  it('cancel 持久化失败时保留定时器，避免内存与磁盘状态分裂', () => {
    const failingFs = { ...fs, writeFileSync: vi.fn(() => { throw new Error('写入失败') }) }
    const isolated = createScheduler({ app, fs: failingFs, logger })
    isolated.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

    expect(() => isolated.cancel(readEntries()[0].id)).toThrow('写入失败')
    expect(vi.getTimerCount()).toBe(1)
    isolated.stopAll()
  })

  it('restore 只恢复 pending 任务并保持文章与平台参数', async () => {
    const pending = { id: 'pending-1', platform: 'wechat', article: { title: 'P' }, status: 'pending', publishTime: futureTime() }
    const executed = { id: 'executed-1', platform: 'douyin', article: {}, status: 'executed', publishTime: futureTime() }
    const cancelled = { id: 'cancelled-1', platform: 'bilibili', article: {}, status: 'cancelled', publishTime: futureTime() }
    fs.writeFileSync(filePath, [pending, executed, cancelled].map(JSON.stringify).join('\n') + '\n', 'utf-8')
    const taskQueue = { add: vi.fn() }
    scheduler.setTaskQueue(taskQueue)

    expect(scheduler.restore()).toBe(1)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(taskQueue.add).toHaveBeenCalledOnce()
    expect(taskQueue.add).toHaveBeenCalledWith({ platform: 'wechat', article: { title: 'P' }, publishMode: 'scheduled' })
  })

  it('restore 同时恢复 pending 与进程中断遗留的 dispatching 任务', async () => {
    const pending = { id: 'pending-1', platform: 'wechat', article: { title: 'P' }, status: 'pending', publishTime: futureTime() }
    const interrupted = { id: 'dispatching-1', platform: 'douyin', article: { title: 'D' }, status: 'dispatching', publishTime: futureTime() }
    const failed = { id: 'failed-1', platform: 'bilibili', article: {}, status: 'failed', publishTime: futureTime() }
    fs.writeFileSync(filePath, [pending, interrupted, failed].map(JSON.stringify).join('\n') + '\n', 'utf-8')
    const taskQueue = { add: vi.fn() }
    scheduler.setTaskQueue(taskQueue)

    expect(scheduler.restore()).toBe(2)
    expect(vi.getTimerCount()).toBe(2)

    await vi.advanceTimersByTimeAsync(10_000)

    expect(taskQueue.add).toHaveBeenCalledTimes(2)
    expect(taskQueue.add).toHaveBeenCalledWith({ platform: 'wechat', article: { title: 'P' }, publishMode: 'scheduled' })
    expect(taskQueue.add).toHaveBeenCalledWith({ platform: 'douyin', article: { title: 'D' }, publishMode: 'scheduled' })
    expect(scheduler.list().filter(task => task.status === 'executed')).toHaveLength(2)
  })

  it('restore 对离线期间过期的任务立即补发一次，重复调用不会双派发', async () => {
    let finishDispatch
    const dispatchPending = new Promise(resolve => { finishDispatch = resolve })
    const overdue = {
      id: 'overdue-1',
      platform: 'wechat',
      article: { title: '错过发布时间' },
      status: 'pending',
      publishTime: new Date(BASE_TIME.getTime() - 1_000).toISOString()
    }
    fs.writeFileSync(filePath, JSON.stringify(overdue) + '\n', 'utf-8')
    const taskQueue = { add: vi.fn(() => dispatchPending) }
    scheduler.setTaskQueue(taskQueue)

    expect(scheduler.restore()).toBe(1)
    await Promise.resolve()
    await Promise.resolve()
    expect(taskQueue.add).toHaveBeenCalledOnce()
    expect(scheduler.restore()).toBe(1)
    expect(taskQueue.add).toHaveBeenCalledOnce()

    finishDispatch()
    await Promise.resolve()
    await Promise.resolve()
    expect(scheduler.list().find(task => task.id === overdue.id).status).toBe('executed')
  })

  it('重复 restore 不会为同一 pending 任务注册重复定时器', () => {
    const pending = { id: 'pending-1', platform: 'wechat', article: {}, status: 'pending', publishTime: futureTime() }
    fs.writeFileSync(filePath, JSON.stringify(pending) + '\n', 'utf-8')

    expect(scheduler.restore()).toBe(1)
    expect(scheduler.restore()).toBe(1)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('stopAll 清除全部定时器且不会改写任务状态', async () => {
    const taskQueue = { add: vi.fn() }
    scheduler.setTaskQueue(taskQueue)
    scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime(5_000) })
    scheduler.create({ platform: 'douyin', article: {}, publishTime: futureTime(10_000) })
    expect(vi.getTimerCount()).toBe(2)

    scheduler.stopAll()

    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(taskQueue.add).not.toHaveBeenCalled()
    expect(scheduler.list().every(task => task.status === 'pending')).toBe(true)
  })

  it('stopAll 抑制进行中派发的后续写状态，并允许下次启动恢复', async () => {
    let finishDispatch
    const dispatchPending = new Promise(resolve => { finishDispatch = resolve })
    const taskQueue = { add: vi.fn(() => dispatchPending) }
    scheduler.setTaskQueue(taskQueue)
    const entry = scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

    vi.advanceTimersByTime(10_000)
    await Promise.resolve()
    await Promise.resolve()
    expect(taskQueue.add).toHaveBeenCalledOnce()
    expect(scheduler.list().find(task => task.id === entry.id).status).toBe('dispatching')

    const stopped = scheduler.stopAll()
    finishDispatch()
    await stopped

    expect(scheduler.list().find(task => task.id === entry.id).status).toBe('dispatching')

    const restored = createScheduler({ app, logger })
    const restoredQueue = { add: vi.fn() }
    restored.setTaskQueue(restoredQueue)
    expect(restored.restore()).toBe(1)
    await Promise.resolve()
    await Promise.resolve()

    expect(restoredQueue.add).toHaveBeenCalledOnce()
    expect(restored.list().find(task => task.id === entry.id).status).toBe('executed')
    await restored.stopAll()
  })

  // P1：无界增长。旧实现没有任何 prune/rotate：executed/cancelled/failed 条目永久留���，
  // 且 updateStatus 每次状态迁移都「全量读-改-写」整个文件，成本随历史线性增长。
  describe('终态记录剪枝', () => {
    const seedTerminal = (id, status, createdAt) => {
      fs.appendFileSync(filePath, JSON.stringify({
        id, platform: 'wechat', article: {}, accountId: null,
        status, publishTime: createdAt, createdAt
      }) + '\n', 'utf-8')
    }

    it('create 成功后裁剪超龄终态记录，pending 任务必须保留', () => {
      seedTerminal('old-executed', 'executed', new Date(BASE_TIME.getTime() - 90 * DAY_MS).toISOString())
      seedTerminal('old-cancelled', 'cancelled', new Date(BASE_TIME.getTime() - 90 * DAY_MS).toISOString())
      seedTerminal('old-failed', 'failed', new Date(BASE_TIME.getTime() - 90 * DAY_MS).toISOString())
      seedTerminal('recent-executed', 'executed', new Date(BASE_TIME.getTime() - 1 * DAY_MS).toISOString())
      seedTerminal('stale-pending', 'pending', new Date(BASE_TIME.getTime() - 90 * DAY_MS).toISOString())

      scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

      const ids = readEntries().map(entry => entry.id)
      expect(ids).not.toContain('old-executed')
      expect(ids).not.toContain('old-cancelled')
      expect(ids).not.toContain('old-failed')
      expect(ids).toContain('recent-executed')   // 保留期内终态留痕
      expect(ids).toContain('stale-pending')      // 任何 pending 都不许被裁掉
      expect(readEntries().length).toBe(3)
    })

    it('终态记录超过条数上限时只保留最近的 N 条', () => {
      for (let index = 0; index < 600; index += 1) {
        seedTerminal(`bulk-${index}`, 'executed', new Date(BASE_TIME.getTime() - index * 1000).toISOString())
      }
      const entry = scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

      const entries = readEntries()
      // 上限只约束终态条目；本次新建的 pending 任务必须保留，故总数 = 上限 + 1
      const terminal = entries.filter(item => item.status === 'executed')
      expect(terminal.length).toBeLessThanOrEqual(200)
      expect(entries.length).toBeLessThanOrEqual(201)
      expect(entries.some(item => item.id === 'bulk-0')).toBe(true)
      expect(entries.some(item => item.id === entry.id)).toBe(true)
    })

    it('裁剪只重写一次数据文件，且不产生残留 .tmp', () => {
      for (let index = 0; index < 300; index += 1) {
        seedTerminal(`bulk-${index}`, 'executed', new Date(BASE_TIME.getTime() - index * 1000).toISOString())
      }
      const before = Date.now()
      scheduler.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

      expect(readEntries().filter(item => item.status === 'executed').length).toBeLessThanOrEqual(200)
      expect(fs.existsSync(filePath + '.tmp')).toBe(false)
      expect(Date.now() - before).toBeLessThan(5000)
    })

    it('裁剪异常不得影响 create 成功（旁路容错）', () => {
      for (let index = 0; index < 300; index += 1) {
        seedTerminal(`bulk-${index}`, 'executed', new Date(BASE_TIME.getTime() - index * 1000).toISOString())
      }
      const realRename = fs.renameSync
      let renameCalls = 0
      const flakyFs = {
        ...fs,
        renameSync: vi.fn((from, to) => {
          renameCalls += 1
          // 第一次（剪枝重写）失败，第二次（create 后的正常路径）放行
          if (renameCalls === 1) throw new Error('剪枝重写失败')
          return realRename(from, to)
        })
      }
      const isolated = createScheduler({ app, fs: flakyFs, logger })
      const entry = isolated.create({ platform: 'wechat', article: {}, publishTime: futureTime() })

      expect(entry.status).toBe('pending')
      expect(readEntries().some(line => line.id === entry.id)).toBe(true)
      isolated.stopAll()
    })
  })
})

describe('Scheduler 共享兼容入口', () => {
  // CI 高负载时 require('../..') 触发整包入口模块加载（含 Electron 相关依赖探测），
  // 10s 默认超时不够用（实测 CI 15.2s vs 本地 1.5s），显式放宽到 60s
  it('保留既有 API 并额外暴露实例工厂', { timeout: 60000 }, () => {
    const schedulerModule = require('../scheduler')
    const sharedUtils = require('..')
    expect(Object.keys(schedulerModule).sort()).toEqual([
      'cancel', 'create', 'createScheduler', 'list', 'rearm', 'restore', 'setOwnerSubjectProvider', 'setTaskQueue', 'stopAll'
    ])
    expect(sharedUtils.createScheduler).toBe(schedulerModule.createScheduler)
  })
})
