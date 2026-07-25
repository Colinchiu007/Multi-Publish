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
const mockAccountManager = { setOwnerSubjectProvider: vi.fn() }
__registerMock('../publishers/account-manager', mockAccountManager)
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
      if (key === 'batchManager') return mockBatchManager
      return {}
    }),
  }
  const mockStore = {
    init: vi.fn(),
    close: vi.fn(),
    setOwnerSubjectProvider: vi.fn(),
    setSetting: vi.fn(),
    getSetting: vi.fn(() => null),
    setUserSetting: vi.fn(),
    getUserSetting: vi.fn(() => null),
    addCallbackLog: vi.fn(),
  }
  const mockTaskQueue = {
    setStateSaver: vi.fn(),
    setOwnerSubjectProvider: vi.fn(),
    deserialize: vi.fn(() => 0),
  }
  const mockCommentManager = {
    setOwnerSubjectProvider: vi.fn(),
  }
  const mockBatchManager = {
    setOwnerSubjectProvider: vi.fn(),
  }
  const mockCallbackServer = {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
  }
  const mockScheduler = {
    restore: vi.fn(() => 0),
    setOwnerSubjectProvider: vi.fn(),
    stopAll: vi.fn(),
  }
  const mockKeywordMonitor = {
    onAlert: vi.fn(),
    getAllHistories: vi.fn(() => ({})),
  }
  const mockAnalyticsService = {
    registerProvider: vi.fn(),
  }
  const mockPythonBridge = {
    setAuthService: vi.fn(),
  }
  const mockCloudPublisher = vi.fn()
  mockCloudPublisher.prototype.registerIpcHandlers = vi.fn()
  const mockGetMainWin = vi.fn(() => null)

  return Object.assign({
    container: mockContainer,
    usageTracker: mockUsageTracker,
    store: mockStore,
    taskQueue: mockTaskQueue,
    commentManager: mockCommentManager,
    batchManager: mockBatchManager,
    callbackServer: mockCallbackServer,
    scheduler: mockScheduler,
    keywordMonitor: mockKeywordMonitor,
    analyticsService: mockAnalyticsService,
    pythonBridge: mockPythonBridge,
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

  it('callbackServer 半启动失败时立即清理，并且后续 rollback 不重复停止', async () => {
    const callbackServer = {
      start: vi.fn(async () => { throw new Error('partial startup failure') }),
      stop: vi.fn(async () => {}),
    }
    const deps = makeMockDeps({ callbackServer })

    const result = await startServices(deps)

    expect(callbackServer.stop).toHaveBeenCalledTimes(1)
    await result.rollback()
    expect(callbackServer.stop).toHaveBeenCalledTimes(1)
  })

  it('callbackServer 首次清理失败后，rollback 会重新尝试停止', async () => {
    const callbackServer = {
      start: vi.fn(async () => { throw new Error('partial startup failure') }),
      stop: vi.fn()
        .mockRejectedValueOnce(new Error('stop failed'))
        .mockResolvedValueOnce(undefined),
    }
    const deps = makeMockDeps({ callbackServer })

    const result = await startServices(deps)

    expect(callbackServer.stop).toHaveBeenCalledTimes(1)
    await result.rollback()
    expect(callbackServer.stop).toHaveBeenCalledTimes(2)
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

  it('关键词监控聚合状态写入当前用户命名空间', async () => {
    vi.useFakeTimers()
    const deps = makeMockDeps()
    deps.keywordMonitor.getAllHistories.mockReturnValue({ topic: [{ total: 1 }] })
    try {
      const result = await startServices(deps)
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      expect(deps.store.setUserSetting).toHaveBeenCalledWith(
        'keyword_monitor_state',
        JSON.stringify({ topic: [{ total: 1 }] }),
      )
      await result.rollback()
    } finally {
      vi.useRealTimers()
    }
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

  it('身份服务注入 CloudPublisher 并随阶段结果返回', async () => {
    const identityService = {
      getState: vi.fn(() => ({ status: 'authenticated', user: { sub: 'user-a' } })),
    }
    const createIdentityService = vi.fn(async () => identityService)
    const deps = makeMockDeps({ createIdentityService })
    const result = await startServices(deps)

    expect(createIdentityService).toHaveBeenCalledWith(expect.objectContaining({ store: deps.store }))
    expect(deps.CloudPublisher).toHaveBeenCalledWith(expect.objectContaining({ authService: identityService }))
    expect(deps.pythonBridge.setAuthService).toHaveBeenCalledWith(identityService)
    expect(deps.store.setOwnerSubjectProvider).toHaveBeenCalledWith(expect.any(Function))
    const ownerProvider = deps.store.setOwnerSubjectProvider.mock.calls[0][0]
    expect(ownerProvider()).toBe('user-a')
    expect(result.identityService).toBe(identityService)
    expect(deps.scheduler.setOwnerSubjectProvider).toHaveBeenCalledWith(expect.any(Function))
    expect(deps.taskQueue.setOwnerSubjectProvider).toHaveBeenCalledWith(expect.any(Function))
    expect(deps.commentManager.setOwnerSubjectProvider).toHaveBeenCalledWith(expect.any(Function))
    expect(deps.batchManager.setOwnerSubjectProvider).toHaveBeenCalledWith(expect.any(Function))
    expect(mockAccountManager.setOwnerSubjectProvider).toHaveBeenCalledWith(expect.any(Function))
  })

  it('身份服务把 owner provider 注入扫码登录服务，并在回滚时先关闭会话再移除 provider', async () => {
    const qrCodeLogin = { close: vi.fn(), setOwnerSubjectProvider: vi.fn() }
    const identityService = {
      getState: vi.fn(() => ({ status: 'authenticated', user: { sub: 'user-a' } })),
    }
    const deps = makeMockDeps({ createIdentityService: vi.fn(async () => identityService) })
    deps.container.get.mockImplementation((key) => {
      if (key === 'publishIntervalGuard') return {}
      if (key === 'qrCodeLogin') return qrCodeLogin
      return {}
    })

    const result = await startServices(deps)

    expect(qrCodeLogin.setOwnerSubjectProvider).toHaveBeenCalledWith(expect.any(Function))
    const ownerProvider = qrCodeLogin.setOwnerSubjectProvider.mock.calls[0][0]
    expect(ownerProvider()).toBe('user-a')
    await result.rollback()
    expect(qrCodeLogin.close).toHaveBeenCalledWith({ notifyRenderer: false })
    expect(qrCodeLogin.setOwnerSubjectProvider).toHaveBeenLastCalledWith(null)
    expect(qrCodeLogin.close.mock.invocationCallOrder[0])
      .toBeLessThan(qrCodeLogin.setOwnerSubjectProvider.mock.invocationCallOrder.at(-1))
  })

  it('扫码服务仅实现 close 时，回滚仍会关闭遗留会话', async () => {
    const qrCodeLogin = { close: vi.fn() }
    const deps = makeMockDeps()
    deps.container.get.mockImplementation((key) => {
      if (key === 'publishIntervalGuard') return {}
      if (key === 'qrCodeLogin') return qrCodeLogin
      return {}
    })

    const result = await startServices(deps)

    await result.rollback()
    expect(qrCodeLogin.close).toHaveBeenCalledWith({ notifyRenderer: false })
  })

  it('扫码会话关闭失败时仍会移除 owner provider', async () => {
    const qrCodeLogin = {
      close: vi.fn(() => { throw new Error('close failed') }),
      setOwnerSubjectProvider: vi.fn(),
    }
    const identityService = {
      getState: vi.fn(() => ({ status: 'authenticated', user: { sub: 'user-a' } })),
    }
    const deps = makeMockDeps({ createIdentityService: vi.fn(async () => identityService) })
    deps.container.get.mockImplementation((key) => {
      if (key === 'publishIntervalGuard') return {}
      if (key === 'qrCodeLogin') return qrCodeLogin
      return {}
    })

    const result = await startServices(deps)

    await result.rollback()
    expect(qrCodeLogin.setOwnerSubjectProvider).toHaveBeenLastCalledWith(null)
  })

  it('身份状态变更时恢复任务失败不会向身份服务回抛', async () => {
    let onStateChanged
    const scheduler = {
      restore: vi.fn()
        .mockReturnValueOnce(0)
        .mockImplementationOnce(() => { throw new Error('restore failed') }),
      setOwnerSubjectProvider: vi.fn(),
      stopAll: vi.fn(),
    }
    const identityService = {
      getState: vi.fn(() => ({ status: 'authenticated', user: { sub: 'user-a' } })),
      onStateChanged: vi.fn((listener) => {
        onStateChanged = listener
        return vi.fn()
      }),
    }
    const deps = makeMockDeps({
      scheduler,
      createIdentityService: vi.fn(async () => identityService),
    })

    await startServices(deps)

    expect(() => onStateChanged({ status: 'authenticated', user: { sub: 'user-b' } })).not.toThrow()
    expect(log.warn).toHaveBeenCalledWith('Identity', 'State change restore failed: restore failed')
  })

  it('AccountManager 身份注入不依赖 Store 是否实现 owner provider', async () => {
    const deps = makeMockDeps({
      store: {
        init: vi.fn(),
        close: vi.fn(),
        setSetting: vi.fn(),
        getSetting: vi.fn(() => null),
        setUserSetting: vi.fn(),
        getUserSetting: vi.fn(() => null),
        addCallbackLog: vi.fn(),
      },
      createIdentityService: vi.fn(async () => ({
        getState: vi.fn(() => ({ user: { sub: 'user-a' } })),
      })),
    })

    await startServices(deps)

    expect(mockAccountManager.setOwnerSubjectProvider).toHaveBeenCalledWith(expect.any(Function))
  })

  it.each(['1', 'true', 'yes', 'on', ' TRUE '])('required=%s 时身份初始化失败必须阻止启动', async (required) => {
    const previous = process.env.IDENTITY_AUTH_REQUIRED
    process.env.IDENTITY_AUTH_REQUIRED = required
    const failure = new Error('identity bootstrap failed')
    const deps = makeMockDeps({ createIdentityService: vi.fn(async () => { throw failure }) })
    try {
      await expect(startServices(deps)).rejects.toBe(failure)
      expect(deps.CloudPublisher).not.toHaveBeenCalled()
    } finally {
      if (previous === undefined) delete process.env.IDENTITY_AUTH_REQUIRED
      else process.env.IDENTITY_AUTH_REQUIRED = previous
    }
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
    const identityService = {
      getState: vi.fn(() => ({ status: 'authenticated', user: { sub: 'user-a' } })),
      dispose: vi.fn(async () => {}),
    }
    const deps = makeMockDeps({
      CloudPublisher,
      createIdentityService: vi.fn(async () => identityService),
    })
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    await expect(startServices(deps)).rejects.toBe(registerError)

    expect(mockLoginStatusMonitor.stop).toHaveBeenCalledTimes(1)
    expect(deps.scheduler.stopAll).toHaveBeenCalledTimes(1)
    expect(deps.callbackServer.stop).toHaveBeenCalledTimes(1)
    expect(deps.taskQueue.setStateSaver).toHaveBeenLastCalledWith(null)
    expect(deps.scheduler.setOwnerSubjectProvider).toHaveBeenLastCalledWith(null)
    expect(deps.taskQueue.setOwnerSubjectProvider).toHaveBeenLastCalledWith(null)
    expect(deps.commentManager.setOwnerSubjectProvider).toHaveBeenLastCalledWith(null)
    expect(deps.batchManager.setOwnerSubjectProvider).toHaveBeenLastCalledWith(null)
    expect(mockAccountManager.setOwnerSubjectProvider).toHaveBeenLastCalledWith(null)
    expect(deps.pythonBridge.setAuthService).toHaveBeenLastCalledWith(null)
    expect(identityService.dispose).toHaveBeenCalledTimes(1)
    expect(deps.store.close).toHaveBeenCalledTimes(1)
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
  })
})
