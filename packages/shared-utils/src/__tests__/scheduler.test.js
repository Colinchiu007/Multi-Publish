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

  // 平台侧定时（2026-10-07）：排期在 create() 时即提交给平台，平台服务器到点发布。
// 头条 minLeadMinutes=5 ⇒ 所有夹具偏移必须 ≥5 分钟，否则会被平台窗口校验拦下。
const MIN_LEAD_MS = 10 * 60 * 1000
const futureTime = (offset = MIN_LEAD_MS) => new Date(BASE_TIME.getTime() + Math.max(offset, MIN_LEAD_MS)).toISOString()

// 派发在 create() 内部即发起（异步），断言前需 await 它走完。
const flush = () => vi.advanceTimersByTimeAsync(0)

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

// 平台侧定时（2026-10-07）：排期在 create() 时即提交给平台，由平台服务器到点发布，
// 因此**不存在「本地定时器被时钟跳变/休眠带偏」的问题** —— 本地不再武装任何定时器。
// 时钟漂移与休眠自愈改由平台侧承担（应用关着也能发），这是本次架构变更的核心收益。
// rearm() 保留为兼容 API（对外签名不变），语义退化为「只恢复 legacy 的 pending 记录」。
describe('rearm（平台侧语义下退化为 legacy 恢复）', () => {
    it('create 后不武装本地定时器，且立即提交给平台', async () => {
      const taskQueue = { add: vi.fn(() => Promise.resolve()) }
      scheduler.setTaskQueue(taskQueue)
      const entry = scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime(2 * 60 * 60 * 1000) })
      await flush()

      expect(vi.getTimerCount()).toBe(0)
      expect(taskQueue.add).toHaveBeenCalledOnce()
      expect(scheduler.list().find(t => t.id === entry.id).status).toBe('executed')
    })

    it('rearm 不会对已提交平台的任务重复派发', async () => {
      const taskQueue = { add: vi.fn(() => Promise.resolve()) }
      scheduler.setTaskQueue(taskQueue)
      scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime(2 * 60 * 60 * 1000) })
      await flush()

      scheduler.rearm()
      scheduler.rearm()
      scheduler.rearm()
      await flush()

      expect(taskQueue.add).toHaveBeenCalledOnce()
    })

    it('rearm 只恢复 legacy pending 记录，不重放已提交平台的任务', async () => {
      const taskQueue = { add: vi.fn(() => Promise.resolve()) }
      scheduler.setTaskQueue(taskQueue)
      const submitted = scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime(3_600_000) })
      await flush()

      // 播种一条 legacy pending（迁移前遗留），验证它仍会被恢复
      const legacyId = 'legacy-pending-1'
      fs.appendFileSync(filePath, JSON.stringify({
        id: legacyId, platform: 'toutiao', article: { title: 'L' }, accountId: null,
        status: 'pending', publishTime: futureTime(3_600_000), createdAt: new Date().toISOString()
      }) + '\n', 'utf-8')

      expect(scheduler.rearm()).toBe(1)

      const statuses = new Map(scheduler.list().map(t => [t.id, t.status]))
      expect(statuses.get(submitted.id)).toBe('executed')
    })

    it('stopAll 之后 rearm 不再武装任何定时器', () => {
      scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime(2 * 60 * 60 * 1000) })
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
      const entry = isolated.create({ platform: 'toutiao', article: { title: 'A' }, publishTime: futureTime() })

      vi.advanceTimersByTime(10_000)
      await vi.advanceTimersByTimeAsync(0)

      expect(onDispatchFailed).toHaveBeenCalledWith(expect.objectContaining({
        id: entry.id, platform: 'toutiao', reason: '队列已暂停'
      }))
      isolated.stopAll()
    })

    // D1 修复后的新契约：submitted 标记写不进去 ⇒ 任务从未提交平台 ⇒
    // create() 必须抛错（绝不吞掉后留给 restore 当 legacy 本地任务派发）。
    it('submitted 标记写盘失败时 create 抛错并通知，绝不静默回落本地定时', async () => {
      const onDispatchFailed = vi.fn()
      const failingFs = {
        ...fs,
        renameSync: vi.fn(() => { throw new Error('磁盘只读') })
      }
      const isolated = createScheduler({ app, fs: failingFs, logger, onDispatchFailed })
      isolated.setTaskQueue({ add: vi.fn() })

      expect(() => isolated.create({ platform: 'toutiao', article: {}, publishTime: futureTime() }))
        .toThrow(/磁盘只读/)
      expect(onDispatchFailed).toHaveBeenCalledWith(
        expect.objectContaining({ stage: 'mark-submitted' })
      )
      isolated.stopAll()
    })

    it('成功派发不触发失败回调', async () => {
      const onDispatchFailed = vi.fn()
      const isolated = createScheduler({ app, logger, onDispatchFailed })
      let finishEnqueue
      const taskQueue = { add: vi.fn(() => new Promise(resolve => { finishEnqueue = resolve })) }
      isolated.setTaskQueue(taskQueue)
      isolated.create({ platform: 'toutiao', article: {}, publishTime: futureTime() })

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
      isolated.create({ platform: 'toutiao', article: {}, publishTime: futureTime() })

      vi.advanceTimersByTime(10_000)
      await vi.advanceTimersByTimeAsync(0)

      expect(isolated.list()[0].status).toBe('failed')
      isolated.stopAll()
    })
  })

  it('按 owner 隔离相同 ID 的任务列表和取消操作', () => {
    const entries = [
      { id: 'shared', owner_subject: 'user-a', platform: 'toutiao', article: {}, status: 'pending', publishTime: futureTime() },
      { id: 'shared', owner_subject: 'user-b', platform: 'toutiao', article: {}, status: 'pending', publishTime: futureTime() },
    ]
    fs.writeFileSync(filePath, entries.map(JSON.stringify).join('\n') + '\n', 'utf-8')

    expect(scheduler.list('user-a')).toEqual([entries[0]])
    expect(scheduler.cancel('shared', 'user-a')).toBe(true)
    expect(scheduler.list('user-a')[0].status).toBe('cancelled')
    expect(scheduler.list('user-b')[0].status).toBe('pending')
  })

  it('注入身份 provider 后创建任务写入 owner，缺少 sub 时 fail-closed', () => {
    scheduler.setOwnerSubjectProvider(() => 'user-a')
    const entry = scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime() })

    expect(entry.owner_subject).toBe('user-a')
    // create 返回的是提交瞬间的快照，磁盘状态已被后续认领推进；
    // 因此按字段断言，不做整条深比较。
    expect(scheduler.list()).toEqual([expect.objectContaining({
      id: entry.id, owner_subject: 'user-a', platform: 'toutiao'
    })])

    scheduler.setOwnerSubjectProvider(() => null)
    expect(() => scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime() })).toThrow('登录会话缺少用户标识')
    expect(() => scheduler.list()).toThrow('登录会话缺少用户标识')
    expect(() => scheduler.cancel(entry.id)).toThrow('登录会话缺少用户标识')
    expect(() => scheduler.restore()).toThrow('登录会话缺少用户标识')
  })

  it('create 以 JSONL 持久化任务，平台侧语义下不注册本地定时器', () => {
    const article = { title: '定时文章' }
    const entry = scheduler.create({ platform: 'toutiao', article, publishTime: futureTime() })

    expect(entry).toMatchObject({
      platform: 'toutiao',
      article,
      // 平台侧：创建即提交给平台（submitted），不再是等待本地定时器的 pending
      status: 'submitted',
      publishTime: futureTime(),
      createdAt: BASE_TIME.toISOString()
    })
    expect(entry.id).toMatch(/^[a-z0-9]+$/)
    expect(readEntries()[0]).toMatchObject({ id: entry.id, platform: 'toutiao', article })
    expect(app.getPath).toHaveBeenCalledWith('userData')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('身份模式持久化可信 owner，并以该 owner 提交到队列', async () => {
    scheduler.setOwnerSubjectProvider(() => 'user-a')
    const taskQueue = { addForOwner: vi.fn(() => 'queue-task-a') }
    scheduler.setTaskQueue(taskQueue)

    const entry = scheduler.create({
      platform: 'toutiao',
      article: { title: '归属文章' },
      owner_subject: 'forged-user',
      publishTime: futureTime(),
    })

    expect(entry).toMatchObject({ owner_subject: 'user-a' })
    await flush()
    expect(taskQueue.addForOwner).toHaveBeenCalledWith(
      expect.objectContaining({ owner_subject: 'user-a' }),
      'user-a',
    )
  })

  it('到点派发的任务带 publishMode scheduled（发布历史可区分定时/立即发布）', async () => {
    const taskQueue = { add: vi.fn(() => 'queue-task-mode') }
    scheduler.setTaskQueue(taskQueue)

    scheduler.create({ platform: 'toutiao', article: { title: '定时文章' }, publishTime: futureTime() })
    await flush()

    expect(taskQueue.add).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'toutiao', publishMode: 'scheduled' }),
    )
  })

  it('身份模式下队列缺少 addForOwner 时拒绝降级为无归属入队', async () => {
    scheduler.setOwnerSubjectProvider(() => 'user-a')
    const taskQueue = { add: vi.fn(() => 'legacy-task') }
    scheduler.setTaskQueue(taskQueue)
    const entry = scheduler.create({
      platform: 'toutiao',
      article: { title: '不能降级' },
      publishTime: futureTime(),
    })

    await flush()

    expect(taskQueue.add).not.toHaveBeenCalled()
    expect(scheduler.list('user-a').find(task => task.id === entry.id)).toMatchObject({ status: 'failed' })
  })

  it('身份切换发生在认领期间时保留原任务，且不向新用户会话派发', async () => {
    let currentOwner = 'user-a'
    scheduler.setOwnerSubjectProvider(() => currentOwner)
    const taskQueue = { addForOwner: vi.fn(() => 'queue-task-a') }
    scheduler.setTaskQueue(taskQueue)
    const entry = scheduler.create({
      platform: 'toutiao',
      article: { title: '切换保护' },
      publishTime: futureTime(),
    })

    currentOwner = 'user-b'
    await flush()
    expect(taskQueue.addForOwner).not.toHaveBeenCalled()

    currentOwner = 'user-a'
    // R4 修复：owner 切换期间未触达平台，回退状态是 'submitted' 而非 'pending'。
    // 用 'pending' 会把它变成 restore() 的「legacy 本地任务」桶，重开本地兜底后门。
    expect(scheduler.list('user-a').find(task => task.id === entry.id).status).toBe('submitted')
    // submitted 不属于 restore 的恢复范围 —— 需显式重新提交
    expect(scheduler.restore('user-a')).toBe(0)
  })

  it.each([
    [null, '任务参数必须是对象'],
    [{ article: {}, publishTime: futureTime() }, 'platform 必须是非空字符串'],
    [{ platform: '   ', article: {}, publishTime: futureTime() }, 'platform 必须是非空字符串'],
    [{ platform: 'toutiao', publishTime: futureTime() }, 'article 必须是对象'],
    [{ platform: 'toutiao', article: [], publishTime: futureTime() }, 'article 必须是对象'],
    [{ platform: 'toutiao', article: {}, publishTime: 'not-a-date' }, 'publishTime 必须是有效的未来时间'],
    [{ platform: 'toutiao', article: {}, publishTime: BASE_TIME.toISOString() }, 'publishTime 必须是有效的未来时间'],
    [{ platform: 'toutiao', article: {}, publishTime: new Date(BASE_TIME.getTime() - 1).toISOString() }, 'publishTime 必须是有效的未来时间'],
  ])('create 拒绝无效任务且不留下 pending 记录 %#', (input, message) => {
    expect(() => scheduler.create(input)).toThrow(message)
    expect(scheduler.list()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  // 旧用例「分段唤醒后时钟回拨/前跳」测的是 MAX_TIMER_DELAY 分段定时器 ——
  // 平台侧语义下本地不再武装任何定时器，该能力整体消失（时钟漂移由平台承担）。
  // 但原用例覆盖的「极端跨度」仍有价值：改为校验平台跨度约束，
  // 避免 30 天/365 天排期本地通过、被平台默默拒绝。
  it('超过平台最大跨度（30 天）的排期在创建时即被拒绝', () => {
    const taskQueue = { add: vi.fn() }
    scheduler.setTaskQueue(taskQueue)

    expect(() => scheduler.create({
      platform: 'toutiao', article: {}, publishTime: new Date(BASE_TIME.getTime() + 365 * DAY_MS).toISOString()
    })).toThrow(/30/)
    expect(taskQueue.add).not.toHaveBeenCalled()
  })

  it('短于平台最小提前量（5 分钟）的排期在创建时即被拒绝', () => {
    const taskQueue = { add: vi.fn() }
    scheduler.setTaskQueue(taskQueue)

    expect(() => scheduler.create({
      platform: 'toutiao', article: {}, publishTime: new Date(BASE_TIME.getTime() + 10_000).toISOString()
    })).toThrow(/5/)
    expect(taskQueue.add).not.toHaveBeenCalled()
  })

  it('创建后即把任务提交到 taskQueue 并持久化 executed 状态', async () => {
    const taskQueue = { add: vi.fn(() => Promise.resolve('queue-task-1')) }
    scheduler.setTaskQueue(taskQueue)
    const entry = scheduler.create({ platform: 'toutiao', article: { title: 'A' }, publishTime: futureTime(2 * 60 * 60 * 1000) })

    await flush()

    expect(taskQueue.add).toHaveBeenCalledOnce()
    // publishMode: 'scheduled' — 定时派发任务的模式标记（写发布历史用）；
    // publishTime — 平台侧定时的核心：publisher 据此组装该平台的定时字段
    expect(taskQueue.add).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'toutiao',
      article: { title: 'A' },
      publishMode: 'scheduled',
      publishTime: futureTime(2 * 60 * 60 * 1000)
    }))
    expect(scheduler.list().find(task => task.id === entry.id).status).toBe('executed')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('派发前持久化 dispatching，派发中的任务不可取消或覆盖状态', async () => {
    let finishDispatch
    const dispatchPending = new Promise(resolve => { finishDispatch = resolve })
    const taskQueue = { add: vi.fn(() => dispatchPending) }
    scheduler.setTaskQueue(taskQueue)
    const entry = scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime() })

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

  // D1 修复后：submitted 标记本身就走 writeFileSync（tmp+rename），
  // 所以「前 N 次写失败」会命中 submitted 标记 ⇒ create 直接抛错，不再进入认领重试。
  // 这正是要的：标记写不进去 = 从未提交平台，绝不能继续。
  it('submitted 标记写盘暂时失败时不进入认领，create 抛错且不派发', async () => {
    let writeAttempts = 0
    const flakyFs = {
      ...fs,
      writeFileSync: vi.fn((target, ...args) => {
        writeAttempts += 1
        if (writeAttempts <= 2) throw new Error('临时写盘失败')
        return fs.writeFileSync(target, ...args)
      })
    }
    const isolated = createScheduler({ app, fs: flakyFs, logger })
    const taskQueue = { add: vi.fn() }
    isolated.setTaskQueue(taskQueue)

    expect(() => isolated.create({ platform: 'toutiao', article: {}, publishTime: futureTime() }))
      .toThrow(/临时写盘失败/)
    expect(taskQueue.add).not.toHaveBeenCalled()
    await isolated.stopAll()
  })

  // submitted 标记写入成功、dispatching 认领的 rename 持续失败时：
  // 必须不派发，且记录不得停留在 pending（那是 restore 的 legacy 本地任务桶）。
  it('dispatching 认领写盘持续失败时不派发、不留 pending 后门', async () => {
    let renameCalls = 0
    const failingFs = {
      ...fs,
      renameSync: vi.fn((from, to) => {
        renameCalls += 1
        // 第一次 rename = submitted 标记（放行）；之后 = dispatching 认领（全部失败）
        if (renameCalls === 1) return fs.renameSync(from, to)
        throw new Error('磁盘持续不可写')
      })
    }
    const isolated = createScheduler({ app, fs: failingFs, logger })
    const taskQueue = { add: vi.fn() }
    isolated.setTaskQueue(taskQueue)

    isolated.create({ platform: 'toutiao', article: {}, publishTime: futureTime(2 * 60 * 60 * 1000) })
    await vi.runAllTimersAsync()

    expect(taskQueue.add).not.toHaveBeenCalled()

    const record = isolated.list()[0]
    // 关键：不得停留在 pending（那是 restore 的「legacy 本地任务」桶）
    expect(record.status).not.toBe('pending')
    expect(isolated.restore()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    await isolated.stopAll()
  })

  it('taskQueue 同步抛错时持久化 failed 状态并记录错误', async () => {
    const taskQueue = { add: vi.fn(() => { throw new Error('队列不可用') }) }
    scheduler.setTaskQueue(taskQueue)
    const entry = scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime() })

    await flush()

    expect(scheduler.list().find(task => task.id === entry.id).status).toBe('failed')
    expect(logger.error).toHaveBeenCalledWith(
      'Scheduler',
      `Failed to execute scheduled task ${entry.id}: 队列不可用`
    )
  })

  it('taskQueue 异步拒绝时同样持久化 failed 状态', async () => {
    const taskQueue = { add: vi.fn(() => Promise.reject(new Error('异步入队失败'))) }
    scheduler.setTaskQueue(taskQueue)
    const entry = scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime() })

    await flush()

    expect(scheduler.list().find(task => task.id === entry.id).status).toBe('failed')
    expect(logger.error).toHaveBeenCalledWith(
      'Scheduler',
      `Failed to execute scheduled task ${entry.id}: 异步入队失败`
    )
  })

  it('未注入 taskQueue 时不会静默丢弃到期任务', async () => {
    const entry = scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime() })

    await flush()

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

    expect(() => isolated.create({ platform: 'toutiao', article: {}, publishTime: futureTime() }))
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

  // 平台侧语义下的取消契约：
  //  ① 已提交平台（executed）不可取消 —— 平台持有排期且无撤销接口，本地改判 cancelled
  //     只会造成「用户以为取消成功、平台照发」；
  //  ② legacy pending（迁移前遗留）仍可取消，且不产生 .tmp 残留。
  it('cancel 对已提交平台的任务返回 false，对 legacy pending 生效且不留 .tmp', async () => {
    const taskQueue = { add: vi.fn(() => Promise.resolve()) }
    scheduler.setTaskQueue(taskQueue)
    const submitted = scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime(2 * 60 * 60 * 1000) })
    await flush()

    // 已提交平台 ⇒ 拒绝取消
    expect(scheduler.list().find(t => t.id === submitted.id).status).toBe('executed')
    expect(scheduler.cancel(submitted.id)).toBe(false)

    // legacy pending ⇒ 可取消
    fs.appendFileSync(filePath, JSON.stringify({
      id: 'legacy-1', platform: 'toutiao', article: {}, accountId: null,
      status: 'pending', publishTime: futureTime(2 * 60 * 60 * 1000), createdAt: new Date().toISOString()
    }) + '\n', 'utf-8')

    expect(scheduler.cancel('legacy-1')).toBe(true)
    expect(scheduler.list().find(t => t.id === 'legacy-1').status).toBe('cancelled')
    expect(scheduler.cancel('legacy-1')).toBe(false)
    expect(scheduler.cancel('missing-task')).toBe(false)
    expect(fs.existsSync(filePath + '.tmp')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  // D1 修复后：submitted 标记写不进去，create() 当场抛错 —— 任务从未提交平台，
  // 也就没有任何「可取消的在途任务」。cancel 路径只在状态写失败时抛错。
  it('状态持久化失败时 create 抛错，记录不得被改写为 cancelled', () => {
    const failingFs = { ...fs, writeFileSync: vi.fn(() => { throw new Error('写入失败') }) }
    const isolated = createScheduler({ app, fs: failingFs, logger })

    expect(() => isolated.create({ platform: 'toutiao', article: {}, publishTime: futureTime(2 * 60 * 60 * 1000) }))
      .toThrow(/定时任务状态持久化失败|写入失败/)
    expect(isolated.list().every(t => t.status !== 'cancelled')).toBe(true)
    isolated.stopAll()
  })

  it('restore 只恢复 legacy pending 记录，executed/cancelled 不重放', async () => {
    const pending = { id: 'pending-1', platform: 'toutiao', article: { title: 'P' }, status: 'pending', publishTime: futureTime() }
    const executed = { id: 'executed-1', platform: 'toutiao', article: {}, status: 'executed', publishTime: futureTime() }
    const cancelled = { id: 'cancelled-1', platform: 'toutiao', article: {}, status: 'cancelled', publishTime: futureTime() }
    fs.writeFileSync(filePath, [pending, executed, cancelled].map(JSON.stringify).join('\n') + '\n', 'utf-8')
    const taskQueue = { add: vi.fn(() => Promise.resolve()) }
    scheduler.setTaskQueue(taskQueue)

    expect(scheduler.restore()).toBe(1)
    // legacy pending 的 publishTime 在未来 ⇒ 仍走本地定时器，到点才派发（不是创建即派发）
    expect(vi.getTimerCount()).toBe(1)
    expect(taskQueue.add).not.toHaveBeenCalled()
    // legacy pending 也要携带 publishTime，publisher 才能组装平台定时字段
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)
    expect(taskQueue.add).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'toutiao', article: { title: 'P' }, publishMode: 'scheduled', publishTime: pending.publishTime
    }))
  })

  it('restore 不重放遗留 dispatching 记录（平台侧已排期，重放会重复提交）', async () => {
    const pending = { id: 'pending-1', platform: 'toutiao', article: { title: 'P' }, status: 'pending', publishTime: futureTime() }
    const interrupted = { id: 'dispatching-1', platform: 'toutiao', article: { title: 'D' }, status: 'dispatching', publishTime: futureTime() }
    const failed = { id: 'failed-1', platform: 'toutiao', article: {}, status: 'failed', publishTime: futureTime() }
    fs.writeFileSync(filePath, [pending, interrupted, failed].map(JSON.stringify).join('\n') + '\n', 'utf-8')
    const taskQueue = { add: vi.fn(() => Promise.resolve()) }
    scheduler.setTaskQueue(taskQueue)

    // 只有 legacy pending 被恢复（仍走本地定时器，到点派发）；
    // dispatching 代表已提交平台，failed 是终态 —— 二者都不重放
    expect(scheduler.restore()).toBe(1)
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)
    expect(taskQueue.add).toHaveBeenCalledOnce()
    expect(taskQueue.add.mock.calls[0][0].article.title).toBe('P')
  })

  it('restore 不重放已提交平台的任务，重复调用也不派发', async () => {
    const taskQueue = { add: vi.fn(() => Promise.resolve()) }
    scheduler.setTaskQueue(taskQueue)
    scheduler.create({ platform: 'toutiao', article: { title: 'S' }, publishTime: futureTime(2 * 60 * 60 * 1000) })
    await flush()
    const beforeCalls = taskQueue.add.mock.calls.length

    expect(scheduler.restore()).toBe(0)
    expect(scheduler.restore()).toBe(0)
    expect(taskQueue.add.mock.calls.length).toBe(beforeCalls)
  })

  it('重复 restore 不会为同一 legacy pending 任务注册重复定时器', () => {
    const pending = { id: 'pending-1', platform: 'toutiao', article: { title: 'P' }, status: 'pending', publishTime: futureTime() }
    fs.writeFileSync(filePath, JSON.stringify(pending) + '\n', 'utf-8')
    scheduler.setTaskQueue({ add: vi.fn() })

    expect(scheduler.restore()).toBe(1)
    expect(scheduler.restore()).toBe(1) // 已跟踪，不重复武装
    expect(vi.getTimerCount()).toBe(1)
  })

  it('stopAll 之后不再武装定时器，legacy 任务也不会被派发', async () => {
    const pending = { id: 'pending-1', platform: 'toutiao', article: {}, status: 'pending', publishTime: futureTime() }
    fs.writeFileSync(filePath, JSON.stringify(pending) + '\n', 'utf-8')
    const taskQueue = { add: vi.fn(() => Promise.resolve()) }
    scheduler.setTaskQueue(taskQueue)

    scheduler.stopAll()
    expect(scheduler.rearm()).toBe(0)
    await flush()
    expect(taskQueue.add).not.toHaveBeenCalled()
  })

  it('stopAll 抑制进行中派发的后续写状态', async () => {
    let finishEnqueue
    const taskQueue = { add: vi.fn(() => new Promise(resolve => { finishEnqueue = resolve })) }
    scheduler.setTaskQueue(taskQueue)
    const entry = scheduler.create({ platform: 'toutiao', article: { title: 'A' }, publishTime: futureTime(2 * 60 * 60 * 1000) })
    await flush()
    expect(scheduler.list().find(t => t.id === entry.id).status).toBe('dispatching')

    const stopped = scheduler.stopAll()
    finishEnqueue()
    await stopped

    // stopAll 之后不再把状态改写为 executed（进程正在退出，结果已无意义）
    expect(scheduler.list().find(t => t.id === entry.id).status).toBe('dispatching')
    // 且该记录不会被下次启动重放（平台侧语义）
    const restored = createScheduler({ app, logger })
    restored.setTaskQueue({ add: vi.fn() })
    expect(restored.restore()).toBe(0)
    restored.stopAll()
  })

  // P1：无界增长。旧实现没有任何 prune/rotate：executed/cancelled/failed 条目永久留���，
  // 且 updateStatus 每次状态迁移都「全量读-改-写」整个文件，成本随历史线性增长。
  describe('终态记录剪枝', () => {
    const seedTerminal = (id, status, createdAt) => {
      fs.appendFileSync(filePath, JSON.stringify({
        id, platform: 'toutiao', article: {}, accountId: null,
        status, publishTime: createdAt, createdAt
      }) + '\n', 'utf-8')
    }

    it('create 成功后裁剪超龄终态记录，pending 任务必须保留', () => {
      seedTerminal('old-executed', 'executed', new Date(BASE_TIME.getTime() - 90 * DAY_MS).toISOString())
      seedTerminal('old-cancelled', 'cancelled', new Date(BASE_TIME.getTime() - 90 * DAY_MS).toISOString())
      seedTerminal('old-failed', 'failed', new Date(BASE_TIME.getTime() - 90 * DAY_MS).toISOString())
      seedTerminal('recent-executed', 'executed', new Date(BASE_TIME.getTime() - 1 * DAY_MS).toISOString())
      seedTerminal('stale-pending', 'pending', new Date(BASE_TIME.getTime() - 90 * DAY_MS).toISOString())

      scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime() })

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
      const entry = scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime() })

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
      scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime() })

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
          // rename 顺序（平台侧语义）：#1 submitted 标记 → #2 dispatching 认领 → #3 剪枝。
          // 只有让第 3 次失败，才真正命中剪枝；前两次必须放行，否则 create 会先抛错。
          if (renameCalls === 3) throw new Error('剪枝重写失败')
          return realRename(from, to)
        })
      }
      const isolated = createScheduler({ app, fs: flakyFs, logger })
      const entry = isolated.create({ platform: 'toutiao', article: {}, publishTime: futureTime(2 * 60 * 60 * 1000) })

      expect(entry.status).toBe('submitted')
      expect(readEntries().some(line => line.id === entry.id)).toBe(true)
      // 剪枝失败只记 warn，不影响任务创建
      expect(logger.warn).toHaveBeenCalledWith(
        'Scheduler',
        expect.stringContaining('Failed to prune scheduled task records')
      )
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
