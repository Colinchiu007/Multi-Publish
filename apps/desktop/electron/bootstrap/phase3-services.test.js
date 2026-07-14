// phase3-services.test.js — 不 require('vitest')，使用 test-setup.js 注入的全局 describe/it/expect/vi
__registerMock('../services/logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})
__registerMock('../services/login-status-monitor', {
  createLoginStatusMonitor: vi.fn(() => ({ start: vi.fn() })),
})
__registerMock('../publishers/account-manager', {})
__registerMock('../services/analytics-providers', {
  xiaohongshuProvider: { name: 'xhs' },
  douyinProvider: { name: 'douyin' },
})

const log = require('../services/logger')
const { startServices } = require('./phase3-services')

function makeMockDeps(overrides) {
  const mockContainer = {
    get: vi.fn((key) => {
      if (key === 'usageTracker') return { trackSession: vi.fn(), getStats: vi.fn() }
      if (key === 'publishIntervalGuard') return {}
      return {}
    }),
  }
  const mockStore = {
    init: vi.fn(),
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
  }
  const mockScheduler = {
    restore: vi.fn(() => 0),
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
    delete global.usageTracker
  })

  it('usageTracker.trackSession 被调用 + global.usageTracker 被设置', async () => {
    const mockUsageTracker = { trackSession: vi.fn(), getStats: vi.fn() }
    const deps = makeMockDeps({
      container: {
        get: vi.fn((key) => {
          if (key === 'usageTracker') return mockUsageTracker
          if (key === 'publishIntervalGuard') return {}
          return {}
        }),
      },
    })
    await startServices(deps)
    expect(mockUsageTracker.trackSession).toHaveBeenCalled()
    expect(global.usageTracker).toBe(mockUsageTracker)
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
    expect(log.warn).toHaveBeenCalledWith('App', 'Callback server failed to start (port may be in use):', 'port in use')
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

  it('CloudPublisher 构造 + registerIpcHandlers 被调用', async () => {
    const deps = makeMockDeps()
    await startServices(deps)
    expect(deps.CloudPublisher).toHaveBeenCalled()
  })
})
