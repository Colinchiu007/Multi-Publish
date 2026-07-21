// @ts-check
/**
 * Phase5-IPC P1-B 回归测试：IPC sender 来源验证
 *
 * 验证：
 *   - 可信来源（app://, file://, dev localhost）正常处理
 *   - 不可信来源（https://evil.com）返回默认值不处理
 *   - event.senderFrame 缺失时返回 false（防呆）
 */
__enableElectronMock()

// Mock logger
__registerMock('../services/logger', {
  info: () => {},
  warn: () => {},
  error: () => {},
})

// Mock ipc-handlers/index（由测试控制同步失败和异步拒绝）
const mockRegisterAllHandlers = vi.fn()
__registerMock('../ipc-handlers', mockRegisterAllHandlers)

const { ipcMain, BrowserWindow } = require('electron')
const {
  registerAllIpcHandlers,
  isTrustedSender,
  runIpcRegistrationTransaction,
} = require('./phase5-ipc')

function makeTrustedEvent() {
  return { senderFrame: { url: 'app://localhost/index.html' } }
}

function makeUntrustedEvent() {
  return { senderFrame: { url: 'https://evil.example/' } }
}

describe('usageTracker context 注入', () => {
  const app = { isPackaged: true }

  beforeEach(() => {
    vi.clearAllMocks()
    __resetElectronMock()
    mockRegisterAllHandlers.mockReset()
    mockRegisterAllHandlers.mockImplementation(() => {})
  })

  it('usage:* handlers 只调用 context 中的 usageTracker', async () => {
    const usageTracker = {
      getStats: vi.fn(() => ({ sessions: 2 })),
      getDailyStats: vi.fn(() => ({ '2026-07-17': 3 })),
      trackEvent: vi.fn(),
    }
    registerAllIpcHandlers({ app, BrowserWindow, context: { usageTracker } })

    // controlledIpcMain 的 dynamicallyAuthorizedHandler 是 async，需 await
    await expect(ipcMain._handlers['usage:stats'](makeTrustedEvent())).resolves.toEqual({ sessions: 2 })
    await expect(ipcMain._handlers['usage:daily'](makeTrustedEvent())).resolves.toEqual({ '2026-07-17': 3 })
    await expect(ipcMain._handlers['usage:track'](makeTrustedEvent(), {
      feature: 'publish', action: 'start', detail: { platform: 'wechat' },
    })).resolves.toBe(true)
    expect(usageTracker.getStats).toHaveBeenCalledTimes(1)
    expect(usageTracker.getDailyStats).toHaveBeenCalledTimes(1)
    expect(usageTracker.trackEvent).toHaveBeenCalledWith('publish', 'start', { platform: 'wechat' })
  })

  it('usage:* handlers 拒绝不可信来源且不调用 usageTracker', async () => {
    const usageTracker = {
      getStats: vi.fn(() => ({ sessions: 2 })),
      getDailyStats: vi.fn(() => ({ '2026-07-17': 3 })),
      trackEvent: vi.fn(),
    }
    registerAllIpcHandlers({ app, BrowserWindow, context: { usageTracker } })

    const expected = { code: -3, message: '未授权的调用来源' }
    await expect(ipcMain._handlers['usage:stats'](makeUntrustedEvent())).resolves.toEqual(expected)
    await expect(ipcMain._handlers['usage:daily'](makeUntrustedEvent())).resolves.toEqual(expected)
    await expect(ipcMain._handlers['usage:track'](makeUntrustedEvent(), {
      feature: 'publish', action: 'start', detail: { platform: 'wechat' },
    })).resolves.toEqual(expected)

    expect(usageTracker.getStats).not.toHaveBeenCalled()
    expect(usageTracker.getDailyStats).not.toHaveBeenCalled()
    expect(usageTracker.trackEvent).not.toHaveBeenCalled()
  })

  it('context 未提供 usageTracker 时保持默认返回值', async () => {
    registerAllIpcHandlers({ app, BrowserWindow, context: {} })
    await expect(ipcMain._handlers['usage:stats'](makeTrustedEvent())).resolves.toEqual({
      features: {}, events: [], sessions: 0,
    })
    await expect(ipcMain._handlers['usage:daily'](makeTrustedEvent())).resolves.toEqual({})
    await expect(ipcMain._handlers['usage:track'](makeTrustedEvent(), { feature: 'x' })).resolves.toBe(true)
  })

  it('生产注册入口向 Store IPC 注入凭证与账号状态存储', () => {
    const context = {}

    registerAllIpcHandlers({ app, BrowserWindow, context })

    const dependencies = mockRegisterAllHandlers.mock.calls[0][1]
    expect(dependencies.credentialStore).toBe(require('../services/credential-store'))
    expect(dependencies.accountStateRestorer).toBe(require('../services/account-state-restorer'))
  })
})

describe('IPC 注册生命周期', () => {
  const app = { isPackaged: true }

  beforeEach(() => {
    vi.clearAllMocks()
    __resetElectronMock()
    mockRegisterAllHandlers.mockReset()
    mockRegisterAllHandlers.mockImplementation(() => {})
  })

  function useStrictHandle() {
    const originalHandle = ipcMain.handle
    ipcMain.handle = vi.fn(function (channel, handler) {
      if (this._handlers[channel]) {
        throw new Error('Attempted to register a second handler for ' + channel)
      }
      this._handlers[channel] = handler
    })
    return () => { ipcMain.handle = originalHandle }
  }

  it('同步注册中断会回滚已添加的 channel，重试成功后保持幂等', () => {
    const restoreHandle = useStrictHandle()
    const context = {}
    mockRegisterAllHandlers
      .mockImplementationOnce((target) => {
        target.handle('phase5:partial-sync', vi.fn())
        target.on('phase5:partial-listener', vi.fn())
        throw new Error('业务 IPC 同步注册失败')
      })
      .mockImplementationOnce((target) => {
        target.handle('phase5:partial-sync', vi.fn())
      })

    try {
      expect(() => registerAllIpcHandlers({ app, BrowserWindow, context }))
        .toThrow('业务 IPC 同步注册失败')
      expect(ipcMain._handlers['phase5:partial-sync']).toBeUndefined()
      expect(ipcMain._handlers['phase5:partial-listener']).toBeUndefined()
      expect(ipcMain._handlers['usage:stats']).toBeUndefined()

      expect(() => registerAllIpcHandlers({ app, BrowserWindow, context })).not.toThrow()
      expect(ipcMain._handlers['phase5:partial-sync']).toBeDefined()
      expect(ipcMain._handlers['usage:stats']).toBeDefined()

      expect(() => registerAllIpcHandlers({ app, BrowserWindow, context })).not.toThrow()
      expect(mockRegisterAllHandlers).toHaveBeenCalledTimes(2)
    } finally {
      restoreHandle()
    }
  })

  it('异步注册拒绝会回滚已添加的 channel，并允许后续重试', async () => {
    const restoreHandle = useStrictHandle()
    const context = {}
    mockRegisterAllHandlers
      .mockImplementationOnce(async (target) => {
        target.handle('phase5:partial-async', vi.fn())
        await Promise.resolve()
        throw new Error('业务 IPC 异步注册失败')
      })
      .mockImplementationOnce((target) => {
        target.handle('phase5:partial-async', vi.fn())
      })

    try {
      await expect(registerAllIpcHandlers({ app, BrowserWindow, context }))
        .rejects.toThrow('业务 IPC 异步注册失败')
      expect(ipcMain._handlers['phase5:partial-async']).toBeUndefined()
      expect(ipcMain._handlers['usage:stats']).toBeUndefined()

      await expect(Promise.resolve().then(() => {
        return registerAllIpcHandlers({ app, BrowserWindow, context })
      })).resolves.toBeUndefined()
      expect(ipcMain._handlers['phase5:partial-async']).toBeDefined()
      expect(mockRegisterAllHandlers).toHaveBeenCalledTimes(2)
    } finally {
      restoreHandle()
    }
  })

  it('成功注册后重复调用不会再次注册任何 handler', () => {
    const restoreHandle = useStrictHandle()
    const context = {}

    try {
      registerAllIpcHandlers({ app, BrowserWindow, context })
      expect(() => registerAllIpcHandlers({ app, BrowserWindow, context })).not.toThrow()
      expect(mockRegisterAllHandlers).toHaveBeenCalledTimes(1)
    } finally {
      restoreHandle()
    }
  })

  it('业务 handler 通过真实注册入口动态响应许可证升降级', async () => {
    let isPro = false
    const licenseManager = { isPro: vi.fn(() => isPro) }
    const businessHandler = vi.fn(async () => ({ code: 0, data: 'ok' }))
    const context = { licenseManager }

    mockRegisterAllHandlers.mockImplementation((target) => {
      target.handle('phase5:restricted-channel', businessHandler)
    })

    registerAllIpcHandlers({ app, BrowserWindow, context })
    const registeredHandler = ipcMain._handlers['phase5:restricted-channel']

    await expect(registeredHandler(makeTrustedEvent(), { value: 'free' }))
      .resolves.toMatchObject({ code: -3 })
    expect(businessHandler).not.toHaveBeenCalled()

    isPro = true
    await expect(registeredHandler(makeTrustedEvent(), { value: 'pro' }))
      .resolves.toEqual({ code: 0, data: 'ok' })
    expect(businessHandler).toHaveBeenCalledTimes(1)

    isPro = false
    await expect(registeredHandler(makeTrustedEvent(), { value: 'downgraded' }))
      .resolves.toMatchObject({ code: -3 })
    expect(businessHandler).toHaveBeenCalledTimes(1)
  })

  it('CloudPublisher 也通过 Phase 5 受控 facade 注册', async () => {
    let isPro = false
    const businessHandler = vi.fn(async () => ({ code: 0, data: 'submitted' }))
    const licenseManager = { isPro: vi.fn(() => isPro) }
    const cloudPublisher = {
      registerIpcHandlers: vi.fn((target) => {
        target.handle('cloud-publisher:restricted-smoke', businessHandler)
      }),
    }
    const context = { cloudPublisher, licenseManager }

    registerAllIpcHandlers({ app, BrowserWindow, context })
    const handler = ipcMain._handlers['cloud-publisher:restricted-smoke']

    await expect(handler(makeTrustedEvent(), { title: 'free' }))
      .resolves.toMatchObject({ code: -3 })
    expect(businessHandler).not.toHaveBeenCalled()

    isPro = true
    await expect(handler(makeTrustedEvent(), { title: 'pro' }))
      .resolves.toEqual({ code: 0, data: 'submitted' })
    expect(cloudPublisher.registerIpcHandlers).toHaveBeenCalledTimes(1)
    expect(businessHandler).toHaveBeenCalledTimes(1)
  })

  it('并发异步注册事务按顺序执行，并在结束后恢复 ipcMain 方法', async () => {
    const originalHandle = ipcMain.handle
    let releaseFirst
    let releaseSecond
    let secondStarted = false
    const firstGate = new Promise((resolve) => { releaseFirst = resolve })
    const secondGate = new Promise((resolve) => { releaseSecond = resolve })

    const first = runIpcRegistrationTransaction(ipcMain, async () => {
      ipcMain.handle('phase5:concurrent-first', vi.fn())
      await firstGate
    })
    const second = runIpcRegistrationTransaction(ipcMain, async () => {
      secondStarted = true
      ipcMain.handle('phase5:concurrent-second', vi.fn())
      await secondGate
    })

    expect(secondStarted).toBe(false)
    releaseFirst()
    await first
    await Promise.resolve()
    expect(secondStarted).toBe(true)
    releaseSecond()
    await second

    expect(ipcMain.handle).toBe(originalHandle)
    expect(ipcMain._handlers['phase5:concurrent-first']).toBeDefined()
    expect(ipcMain._handlers['phase5:concurrent-second']).toBeDefined()
  })
})

describe('P1-B: isTrustedSender', () => {
  const mockApp = { isPackaged: false }
  const mockAppPackaged = { isPackaged: true, getAppPath: () => require('path').resolve(__dirname, '..') }

  function makeEvent(url) {
    return { senderFrame: { url } }
  }

  it('accepts app:// protocol (production)', () => {
    expect(isTrustedSender(makeEvent('app://localhost/index.html'), mockAppPackaged)).toBe(true)
  })

  it('accepts file:// protocol', () => {
    const fileUrl = require('url').pathToFileURL(require('path').resolve(__dirname, '../dist/index.html')).href
    expect(isTrustedSender(makeEvent(fileUrl), mockAppPackaged)).toBe(true)
  })

  it('accepts http://localhost in dev mode', () => {
    expect(isTrustedSender(makeEvent('http://localhost:5174/'), mockApp)).toBe(true)
  })

  it('accepts http://127.0.0.1 in dev mode', () => {
    expect(isTrustedSender(makeEvent('http://127.0.0.1:5174/'), mockApp)).toBe(true)
  })

  it('rejects http://localhost in production (app.isPackaged=true)', () => {
    expect(isTrustedSender(makeEvent('http://localhost:5173/'), mockAppPackaged)).toBe(false)
  })

  it('rejects https://evil.com (untrusted origin)', () => {
    expect(isTrustedSender(makeEvent('https://evil.com/'), mockApp)).toBe(false)
  })

  it('rejects https://evil.com in production', () => {
    expect(isTrustedSender(makeEvent('https://evil.com/'), mockAppPackaged)).toBe(false)
  })

  it('rejects when event is null/undefined', () => {
    expect(isTrustedSender(null, mockApp)).toBe(false)
    expect(isTrustedSender(undefined, mockApp)).toBe(false)
  })

  it('rejects when senderFrame is missing', () => {
    expect(isTrustedSender({}, mockApp)).toBe(false)
    expect(isTrustedSender({ senderFrame: null }, mockApp)).toBe(false)
  })

  it('rejects when url is empty', () => {
    expect(isTrustedSender({ senderFrame: { url: '' } }, mockApp)).toBe(false)
    expect(isTrustedSender({ senderFrame: { url: null } }, mockApp)).toBe(false)
  })

  it('rejects when app is null (defensive)', () => {
    // app:// 不依赖 app 实例；file:// 仍必须落在应用 dist 目录。
    expect(isTrustedSender(makeEvent('app://localhost/'), null)).toBe(true)
    expect(isTrustedSender(makeEvent('file:///app/'), null)).toBe(false)
    // 但 dev localhost 需要 app，app 为 null 时不应通过
    expect(isTrustedSender(makeEvent('http://localhost:5173/'), null)).toBe(false)
  })
})
