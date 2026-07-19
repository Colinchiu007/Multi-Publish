// phase3-services.test.js — 不 require('vitest')，使用 test-setup.js 注入的全局 describe/it/expect/vi
__registerMock('../services/logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})
const mockLoginStatusMonitor = { start: vi.fn(), stop: vi.fn() }
const mockCreateLoginStatusMonitor = vi.fn(() => mockLoginStatusMonitor)
__registerMock('../services/login-status-monitor', {
  createLoginStatusMonitor: mockCreateLoginStatusMonitor,
})
__registerMock('../publishers/account-manager', {})
__registerMock('../services/analytics-providers', {
  xiaohongshuProvider: { name: 'xhs' },
  douyinProvider: { name: 'douyin' },
})

const log = require('../services/logger')
const { startServices } = require('./phase3-services')

function makeMockDeps(overrides) {
  const mockUsageTracker = {
    trackSession: vi.fn(),
    getStats: vi.fn(),
  }
  const mockContainer = {
    get: vi.fn((key) => {
      if (key === 'publishIntervalGuard') return {}
      return {}
    }),
  }
  const mockStore = {
    init: vi.fn(),
    close: vi.fn(),
    setSetting: vi.fn(),
    getSetting: vi.fn(() => null),
    addCallbackLog: vi.fn(),
  }
  const mockTaskQueue = {
    setStateSaver: vi.fn(),
    deserialize: vi.fn(() => 0),
  }
  const mockCallbackServer = {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
  }
  const mockScheduler = {
    restore: vi.fn(() => 0),
    stopAll: vi.fn(),
  }
  const mockKeywordMonitor = {
    onAlert: vi.fn(),
    getAllHistories: vi.fn(() => ({})),
  }
  const mockAnalyticsService = {
    registerProvider: vi.fn(),
  }
  const mockCloudPublisher = vi.fn()
  mockCloudPublisher.prototype.registerIpcHandlers = vi.fn()
  const mockGetMainWin = vi.fn(() => null)

  return Object.assign({
    container: mockContainer,
    usageTracker: mockUsageTracker,
    store: mockStore,
    taskQueue: mockTaskQueue,
    callbackServer: mockCallbackServer,
    scheduler: mockScheduler,
    keywordMonitor: mockKeywordMonitor,
    analyticsService: mockAnalyticsService,
    CloudPublisher: mockCloudPublisher,
    getMainWin: mockGetMainWin,
  }, overrides)
}

describe('phase3-services.startServices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('使用注入的 usageTracker 记录会话，不写入 global', async () => {
    const mockUsageTracker = { trackSession: vi.fn(), getStats: vi.fn() }
    const deps = makeMockDeps({
      usageTracker: mockUsageTracker,
    })
    await startServices(deps)
    expect(mockUsageTracker.trackSession).toHaveBeenCalled()
  })

  it('store.init 被调用', async () => {
    const deps = makeMockDeps()
    await startServices(deps)
    expect(deps.store.init).toHaveBeenCalled()
  })

  it('taskQueue.setStateSaver 被调用', async () => {
    const deps = makeMockDeps()
    await startServices(deps)
    expect(deps.taskQueue.setStateSaver).toHaveBeenCalled()
  })

  it('callbackServer.start 被调用（await）', async () => {
    const deps = makeMockDeps()
    await startServices(deps)
    expect(deps.callbackServer.start).toHaveBeenCalled()
  })

  it('callbackServer.start 失败 — 不抛错，记录 warn', async () => {
    const deps = makeMockDeps({
      callbackServer: { start: vi.fn(async () => { throw new Error('port in use') }) },
    })
    await startServices(deps)
    expect(log.warn).toHaveBeenCalledWith('App', 'Callback server failed to start (port may be in use): port in use')
  })

  it('scheduler.restore 被调用', async () => {
    const deps = makeMockDeps()
    await startServices(deps)
    expect(deps.scheduler.restore).toHaveBeenCalled()
  })

  it('savedState 存在时 taskQueue.deserialize 被调用', async () => {
    const deps = makeMockDeps({
      store: {
        init: vi.fn(),
        setSetting: vi.fn(),
        getSetting: vi.fn(() => '{"tasks":[]}'),
        addCallbackLog: vi.fn(),
      },
      taskQueue: {
        setStateSaver: vi.fn(),
        deserialize: vi.fn(() => 3),
      },
    })
    await startServices(deps)
    expect(deps.taskQueue.deserialize).toHaveBeenCalledWith('{"tasks":[]}')
    expect(deps.store.setSetting).toHaveBeenCalledWith('task_queue_state', null)
  })

  it('keywordMonitor.onAlert 被调用', async () => {
    const deps = makeMockDeps()
    await startServices(deps)
    expect(deps.keywordMonitor.onAlert).toHaveBeenCalled()
  })

  it('analytics providers 注册成功', async () => {
    const deps = makeMockDeps()
    await startServices(deps)
    expect(deps.analyticsService.registerProvider).toHaveBeenCalledWith('xiaohongshu', { name: 'xhs' })
    expect(deps.analyticsService.registerProvider).toHaveBeenCalledWith('douyin', { name: 'douyin' })
  })

  it('CloudPublisher 仅构造并返回，IPC 延迟到 Phase 5 受控注册', async () => {
    const deps = makeMockDeps()
    const result = await startServices(deps)

    expect(deps.CloudPublisher).toHaveBeenCalled()
    expect(result.cloudPublisher).toBeInstanceOf(deps.CloudPublisher)
    expect(deps.CloudPublisher.prototype.registerIpcHandlers).not.toHaveBeenCalled()
  })

  it('启动成功时返回退出阶段需要的定时器和登录监控引用', async () => {
    const deps = makeMockDeps()

    const result = await startServices(deps)

    expect(result.keywordPersistTimer).toBeDefined()
    expect(result.loginStatusMonitor).toBe(mockLoginStatusMonitor)
  })

  it('CloudPublisher 构造失败时回滚已经启动的阶段3资源', async () => {
    const registerError = new Error('CloudPublisher constructor failed')
    const CloudPublisher = vi.fn(function () { throw registerError })
    const deps = makeMockDeps({ CloudPublisher })
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    await expect(startServices(deps)).rejects.toBe(registerError)

    expect(mockLoginStatusMonitor.stop).toHaveBeenCalledTimes(1)
    expect(deps.scheduler.stopAll).toHaveBeenCalledTimes(1)
    expect(deps.callbackServer.stop).toHaveBeenCalledTimes(1)
    expect(deps.taskQueue.setStateSaver).toHaveBeenLastCalledWith(null)
    expect(deps.store.close).toHaveBeenCalledTimes(1)
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
  })
})
