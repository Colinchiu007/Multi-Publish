// @ts-check
/**
 * window.test.js — 测试 createWindow(context)
 *
 * 策略：使用 test-setup.js 提供的 global.__electronMock 单例（稳定 BrowserWindow mock），
 * 注入 mock context，验证窗口创建/事件/IPC 注册行为。
 * 不使用 vi.mock（vi.mock 不适用于 CJS require 加载的模块）。
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// mock 依赖的服务模块（window.js 直接 require 的非 electron 模块）
const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
__registerMock('./services/logger', mockLogger)

// 通过 require 加载被测模块（在 mock 注册后）
let createWindow
let isAllowedMainWindowUrl
beforeAll(() => {
  // 启用 electron mock（opt-in）：window.js 顶层 require('electron') 需要 mock
  __enableElectronMock()
})

// 构造一个 mock context（含 createWindow 需要的所有 manager）
function buildMockContext(overrides) {
  const mk = () => ({
    setMainWindow: vi.fn(),
    setGetMainWin: vi.fn(),
    registerIpcHandlers: vi.fn(),
    _onWindowResize: vi.fn(),
    resize: vi.fn(),
    init: vi.fn(),
  })
  return Object.assign({
    authViewManager: mk(),
    rpaViewManager: mk(),
    webviewManager: mk(),
    qrCodeLogin: mk(),
    oauthManager: mk(),
    batchManager: mk(),
    urlCollector: mk(),
    providerManager: mk(),
    viralEngine: mk(),
    commentManager: mk(),
    contentIntelligence: mk(),
    publishImpactTracker: mk(),
    systemTray: { init: vi.fn() },
    hotkeys: { register: vi.fn() },
    autoUpdater: { init: vi.fn() },
    firstRun: { runSetup: vi.fn() },
  }, overrides)
}

// 便捷访问最新的 BrowserWindow 实例
function lastWindow() {
  const instances = __electronMock.BrowserWindow._instances
  return instances[instances.length - 1]
}

function mockNextWindowWithDestroy() {
  const originalImplementation = __electronMock.BrowserWindow.getMockImplementation()
  __electronMock.BrowserWindow.mockImplementationOnce(function (options) {
    originalImplementation.call(this, options)
    this.destroy = vi.fn()
  })
}

function captureWindowOpenHandler(context) {
  const originalImplementation = __electronMock.BrowserWindow.getMockImplementation()
  const setWindowOpenHandler = vi.fn()
  __electronMock.BrowserWindow.mockImplementationOnce(function (options) {
    originalImplementation.call(this, options)
    this.webContents.setWindowOpenHandler = setWindowOpenHandler
  })
  createWindow(context)
  expect(setWindowOpenHandler).toHaveBeenCalledTimes(1)
  return setWindowOpenHandler.mock.calls[0][0]
}

describe('window — createWindow', () => {
  let context
  beforeEach(() => {
    vi.clearAllMocks()
    __resetElectronMock()
    __electronMock.shell.openExternal = vi.fn().mockResolvedValue(undefined)
    context = buildMockContext()
    // window.js 内 _ipcRegistered 为模块级标记（R28：防止 macOS activate 重复注册 IPC），
    // 跨用例残留会导致除首次 createWindow 外 registerIpcHandlers 不再调用。
    // 每个用例前清缓存重新 require，使 _ipcRegistered 复位为 false。
    delete require.cache[require.resolve('./window.js')]
    const windowModule = require('./window.js')
    createWindow = windowModule.createWindow
    isAllowedMainWindowUrl = windowModule.isAllowedMainWindowUrl
  })

  it('createWindow 是函数', () => {
    expect(typeof createWindow).toBe('function')
  })

  it('创建 BrowserWindow（验证 width/height）', () => {
    createWindow(context)
    expect(__electronMock.BrowserWindow).toHaveBeenCalledTimes(1)
    const opts = __electronMock.BrowserWindow.mock.calls[0][0]
    expect(opts.width).toBe(1280)
    expect(opts.height).toBe(800)
  })

  it('设置 minWidth / minHeight', () => {
    createWindow(context)
    const opts = __electronMock.BrowserWindow.mock.calls[0][0]
    expect(opts.minWidth).toBe(1024)
    expect(opts.minHeight).toBe(600)
  })

  it('webPreferences.contextIsolation = true', () => {
    createWindow(context)
    const opts = __electronMock.BrowserWindow.mock.calls[0][0]
    expect(opts.webPreferences.contextIsolation).toBe(true)
  })

  it('webPreferences.nodeIntegration = false', () => {
    createWindow(context)
    const opts = __electronMock.BrowserWindow.mock.calls[0][0]
    expect(opts.webPreferences.nodeIntegration).toBe(false)
  })

  it('主窗口使用单文件 preload 并启用 sandbox', () => {
    createWindow(context)
    const opts = __electronMock.BrowserWindow.mock.calls[0][0]
    expect(opts.webPreferences.preload.replace(/\\/g, '/'))
      .toMatch(/\/electron\/preload\/index\.bundle\.js$/)
    expect(opts.webPreferences.sandbox).toBe(true)
  })

  it('show: false（延迟显示）', () => {
    createWindow(context)
    const opts = __electronMock.BrowserWindow.mock.calls[0][0]
    expect(opts.show).toBe(false)
  })

  it('开发环境加载 localhost:5174', () => {
    process.env.NODE_ENV = 'development'
    createWindow(context)
    const win = lastWindow()
    expect(win.loadURL).toHaveBeenCalledWith('http://localhost:5174')
    delete process.env.NODE_ENV
  })

  it('生产环境加载 dist/index.html', () => {
    delete process.env.NODE_ENV
    // 模拟生产：--dev 不在 argv 且 app.isPackaged = true
    // isDev = NODE_ENV === 'development' || argv.includes('--dev') || !app.isPackaged
    // 当 isPackaged=true 时 !isPackaged=false，isDev=false → loadFile 路径
    __electronMock.app.isPackaged = true
    const origArgv = process.argv
    process.argv = ['node', 'main.js']
    try {
      createWindow(context)
      const win = lastWindow()
      expect(win.loadFile).toHaveBeenCalled()
    } finally {
      process.argv = origArgv
      __electronMock.app.isPackaged = false
    }
  })

  it('主窗口导航只允许可信应用来源', () => {
    process.env.NODE_ENV = 'development'
    expect(isAllowedMainWindowUrl('http://localhost:5174/#/accounts')).toBe(true)
    expect(isAllowedMainWindowUrl('http://localhost.evil.example:5174/')).toBe(false)
    expect(isAllowedMainWindowUrl('https://evil.example/')).toBe(false)
    delete process.env.NODE_ENV
  })

  it.each([
    'https://example.com/published/1',
    'http://example.com/help',
  ])('可信外链 %s 由系统浏览器打开且不创建 Electron 子窗口', async (url) => {
    const handler = captureWindowOpenHandler(context)

    expect(handler({ url })).toEqual({ action: 'deny' })
    await Promise.resolve()
    expect(__electronMock.shell.openExternal).toHaveBeenCalledWith(url)
  })

  it.each([
    'javascript:alert(1)',
    'file:///C:/Windows/System32/drivers/etc/hosts',
    'data:text/html,<script>alert(1)</script>',
    'https://user:secret@example.com/',
    'not a url',
  ])('危险或无效外链 %s 被拒绝且不调用系统浏览器', (url) => {
    const handler = captureWindowOpenHandler(context)

    expect(handler({ url })).toEqual({ action: 'deny' })
    expect(__electronMock.shell.openExternal).not.toHaveBeenCalled()
  })

  it.each([
    ['Promise 拒绝', (mock, error) => mock.mockRejectedValueOnce(error)],
    ['同步抛错', (mock, error) => mock.mockImplementationOnce(() => { throw error })],
  ])('系统浏览器打开%s时记录错误且保持拒绝 Electron 子窗口', async (_, configureFailure) => {
    const openError = new Error('无法打开系统浏览器')
    configureFailure(__electronMock.shell.openExternal, openError)
    const handler = captureWindowOpenHandler(context)

    expect(handler({ url: 'https://example.com/' })).toEqual({ action: 'deny' })
    await Promise.resolve()
    await Promise.resolve()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'window',
      '打开外部链接失败：无法打开系统浏览器',
    )
  })

  it('绑定 ready-to-show 事件', () => {
    createWindow(context)
    const win = lastWindow()
    expect(win._handlers['ready-to-show']).toBeDefined()
    expect(typeof win._handlers['ready-to-show']).toBe('function')
  })

  it('绑定 closed 事件', () => {
    createWindow(context)
    const win = lastWindow()
    expect(win._handlers['closed']).toBeDefined()
  })

  it('绑定 resize 事件', () => {
    createWindow(context)
    const win = lastWindow()
    expect(win._handlers['resize']).toBeDefined()
  })

  it('ready-to-show 回调调用 mainWindow.show', () => {
    createWindow(context)
    const win = lastWindow()
    win._handlers['ready-to-show']()
    expect(win.show).toHaveBeenCalledTimes(1)
  })

  it('resize 回调调用 authViewManager._onWindowResize / webviewManager.resize / qrCodeLogin._onWindowResize', () => {
    createWindow(context)
    const win = lastWindow()
    win._handlers['resize']()
    expect(context.authViewManager._onWindowResize).toHaveBeenCalledTimes(1)
    expect(context.webviewManager.resize).toHaveBeenCalledTimes(1)
    expect(context.qrCodeLogin._onWindowResize).toHaveBeenCalledTimes(1)
  })

  it('调用 authViewManager.setMainWindow', () => {
    createWindow(context)
    expect(context.authViewManager.setMainWindow).toHaveBeenCalledTimes(1)
  })

  it('调用 rpaViewManager.setMainWindow', () => {
    createWindow(context)
    expect(context.rpaViewManager.setMainWindow).toHaveBeenCalledTimes(1)
  })

  it('调用 webviewManager.setMainWindow + registerIpcHandlers', () => {
    createWindow(context)
    expect(context.webviewManager.setMainWindow).toHaveBeenCalledTimes(1)
    expect(context.webviewManager.registerIpcHandlers).toHaveBeenCalledTimes(1)
  })

  it('调用 qrCodeLogin.setMainWindow + registerIpcHandlers', () => {
    createWindow(context)
    expect(context.qrCodeLogin.setMainWindow).toHaveBeenCalledTimes(1)
    expect(context.qrCodeLogin.registerIpcHandlers).toHaveBeenCalledTimes(1)
  })

  it('调用 oauthManager.setMainWindow + registerIpcHandlers', () => {
    createWindow(context)
    expect(context.oauthManager.setMainWindow).toHaveBeenCalledTimes(1)
    expect(context.oauthManager.registerIpcHandlers).toHaveBeenCalledTimes(1)
  })

  it('服务型 IPC 统一拒绝外部来源，并动态响应许可证升级', async () => {
    const originalPackaged = __electronMock.app.isPackaged
    let isPro = false
    const businessHandler = vi.fn(async () => ({ code: 0, data: 'saved' }))
    context.licenseManager = { isPro: vi.fn(() => isPro) }
    context.providerManager.registerIpcHandlers.mockImplementation(() => {
      __electronMock.ipcMain.handle('provider:restricted-smoke', businessHandler)
    })
    __electronMock.app.isPackaged = true

    try {
      createWindow(context)
      const handler = __electronMock.ipcMain._handlers['provider:restricted-smoke']
      const trustedEvent = { senderFrame: { url: 'app://localhost/index.html' } }
      const untrustedEvent = { senderFrame: { url: 'https://evil.example/' } }

      await expect(handler(untrustedEvent, { key: 'stolen' }))
        .resolves.toMatchObject({ code: -3 })
      await expect(handler(trustedEvent, { key: 'free' }))
        .resolves.toMatchObject({ code: -3 })
      expect(businessHandler).not.toHaveBeenCalled()

      isPro = true
      await expect(handler(trustedEvent, { key: 'pro' }))
        .resolves.toEqual({ code: 0, data: 'saved' })
      expect(businessHandler).toHaveBeenCalledTimes(1)
    } finally {
      __electronMock.app.isPackaged = originalPackaged
    }
  })

  it('Logto 身份启用时服务型 IPC 不接受本地 Pro license 提权', async () => {
    const originalPackaged = __electronMock.app.isPackaged
    let identityStatus = 'signed_out'
    const businessHandler = vi.fn(async () => ({ code: 0, data: 'saved' }))
    context.licenseManager = { isPro: vi.fn(() => true) }
    context.identityService = { getState: vi.fn(() => ({ status: identityStatus })) }
    context.providerManager.registerIpcHandlers.mockImplementation(() => {
      __electronMock.ipcMain.handle('provider:identity-smoke', businessHandler)
    })
    __electronMock.app.isPackaged = true

    try {
      createWindow(context)
      const handler = __electronMock.ipcMain._handlers['provider:identity-smoke']
      const trustedEvent = { senderFrame: { url: 'app://localhost/index.html' } }

      await expect(handler(trustedEvent)).resolves.toMatchObject({ code: -3 })
      identityStatus = 'authenticated'
      await expect(handler(trustedEvent)).resolves.toEqual({ code: 0, data: 'saved' })
    } finally {
      __electronMock.app.isPackaged = originalPackaged
    }
  })

  it('IPC 注册中断后只重试未完成项，全部成功后保持幂等', () => {
    mockNextWindowWithDestroy()
    context.oauthManager.registerIpcHandlers.mockImplementationOnce(() => {
      throw new Error('OAuth IPC 注册失败')
    })

    expect(() => createWindow(context)).toThrow('OAuth IPC 注册失败')
    const failedWindow = lastWindow()
    expect(failedWindow.destroy).toHaveBeenCalledTimes(1)
    expect(context.authViewManager.setMainWindow).not.toHaveBeenCalled()
    expect(context.rpaViewManager.setMainWindow).not.toHaveBeenCalled()
    expect(context.webviewManager.setMainWindow).not.toHaveBeenCalled()
    expect(context.webviewManager.registerIpcHandlers).toHaveBeenCalledTimes(1)
    expect(context.qrCodeLogin.registerIpcHandlers).toHaveBeenCalledTimes(1)
    expect(context.oauthManager.registerIpcHandlers).toHaveBeenCalledTimes(1)
    expect(context.batchManager.registerIpcHandlers).not.toHaveBeenCalled()

    expect(() => createWindow(context)).not.toThrow()
    expect(context.webviewManager.registerIpcHandlers).toHaveBeenCalledTimes(1)
    expect(context.qrCodeLogin.registerIpcHandlers).toHaveBeenCalledTimes(1)
    expect(context.oauthManager.registerIpcHandlers).toHaveBeenCalledTimes(2)
    expect(context.batchManager.registerIpcHandlers).toHaveBeenCalledTimes(1)
    expect(context.publishImpactTracker.registerIpcHandlers).toHaveBeenCalledTimes(1)

    createWindow(context)
    expect(context.webviewManager.registerIpcHandlers).toHaveBeenCalledTimes(1)
    expect(context.qrCodeLogin.registerIpcHandlers).toHaveBeenCalledTimes(1)
    expect(context.oauthManager.registerIpcHandlers).toHaveBeenCalledTimes(2)
    expect(context.batchManager.registerIpcHandlers).toHaveBeenCalledTimes(1)
    expect(context.publishImpactTracker.registerIpcHandlers).toHaveBeenCalledTimes(1)
  })

  it('单个 IPC 注册器部分成功后抛错会回滚 channel 并可重试', () => {
    const originalHandle = __electronMock.ipcMain.handle
    const partialChannel = 'oauth:partial-registration'
    __electronMock.ipcMain.handle = vi.fn(function (channel, handler) {
      if (this._handlers[channel]) {
        throw new Error('Attempted to register a second handler for ' + channel)
      }
      this._handlers[channel] = handler
    })
    context.oauthManager.registerIpcHandlers
      .mockImplementationOnce(() => {
        __electronMock.ipcMain.handle(partialChannel, vi.fn())
        throw new Error('OAuth IPC 注册中断')
      })
      .mockImplementationOnce(() => {
        __electronMock.ipcMain.handle(partialChannel, vi.fn())
      })

    try {
      expect(() => createWindow(context)).toThrow('OAuth IPC 注册中断')
      expect(__electronMock.ipcMain._handlers[partialChannel]).toBeUndefined()

      expect(() => createWindow(context)).not.toThrow()
      expect(__electronMock.ipcMain._handlers[partialChannel]).toBeDefined()
      expect(context.oauthManager.registerIpcHandlers).toHaveBeenCalledTimes(2)
      expect(context.webviewManager.registerIpcHandlers).toHaveBeenCalledTimes(1)
    } finally {
      __electronMock.ipcMain.handle = originalHandle
    }
  })

  it('IPC 注册器异步拒绝会销毁窗口、回滚 channel，并可重试', async () => {
    const originalHandle = __electronMock.ipcMain.handle
    const partialChannel = 'oauth:partial-async-registration'
    __electronMock.ipcMain.handle = vi.fn(function (channel, handler) {
      if (this._handlers[channel]) {
        throw new Error('Attempted to register a second handler for ' + channel)
      }
      this._handlers[channel] = handler
    })
    mockNextWindowWithDestroy()
    context.oauthManager.registerIpcHandlers
      .mockImplementationOnce(async () => {
        __electronMock.ipcMain.handle(partialChannel, vi.fn())
        await Promise.resolve()
        throw new Error('OAuth IPC 异步注册失败')
      })
      .mockImplementationOnce(() => {
        __electronMock.ipcMain.handle(partialChannel, vi.fn())
      })

    try {
      const creation = createWindow(context)
      const failedWindow = lastWindow()
      await expect(creation).rejects.toThrow('OAuth IPC 异步注册失败')
      expect(failedWindow.destroy).toHaveBeenCalledTimes(1)
      expect(context.authViewManager.setMainWindow).not.toHaveBeenCalled()
      expect(context.rpaViewManager.setMainWindow).not.toHaveBeenCalled()
      expect(context.webviewManager.setMainWindow).not.toHaveBeenCalled()
      expect(__electronMock.ipcMain._handlers[partialChannel]).toBeUndefined()

      const recoveredWindow = await createWindow(context)
      expect(recoveredWindow).toBe(lastWindow())
      expect(__electronMock.ipcMain._handlers[partialChannel]).toBeDefined()
      expect(context.oauthManager.registerIpcHandlers).toHaveBeenCalledTimes(2)
      expect(context.webviewManager.registerIpcHandlers).toHaveBeenCalledTimes(1)
      expect(context.authViewManager.setMainWindow).toHaveBeenCalledTimes(1)
    } finally {
      __electronMock.ipcMain.handle = originalHandle
    }
  })

  it('异步 IPC 注册未完成时复用同一个窗口创建 Promise', async () => {
    let releaseRegistration
    const registrationGate = new Promise((resolve) => { releaseRegistration = resolve })
    context.oauthManager.registerIpcHandlers.mockImplementationOnce(() => registrationGate)

    const firstCreation = createWindow(context)
    const secondCreation = createWindow(context)

    expect(secondCreation).toBe(firstCreation)
    expect(__electronMock.BrowserWindow).toHaveBeenCalledTimes(1)

    releaseRegistration()
    const [firstWindow, secondWindow] = await Promise.all([firstCreation, secondCreation])
    expect(secondWindow).toBe(firstWindow)
    expect(context.oauthManager.registerIpcHandlers).toHaveBeenCalledTimes(1)
    expect(context.authViewManager.setMainWindow).toHaveBeenCalledTimes(1)
  })

  it('窗口初始化失败时清除 manager 引用并销毁窗口', () => {
    const initializationError = new Error('tray initialization failed')
    mockNextWindowWithDestroy()
    context.systemTray.init.mockImplementationOnce(function () {
      throw initializationError
    })

    expect(() => createWindow(context)).toThrow(initializationError)

    const failedWindow = lastWindow()
    expect(failedWindow.destroy).toHaveBeenCalledTimes(1)
    for (const name of [
      'authViewManager', 'rpaViewManager', 'webviewManager', 'qrCodeLogin', 'oauthManager',
    ]) {
      expect(context[name].setMainWindow).toHaveBeenLastCalledWith(null)
    }
  })

  it('调用 systemTray.init', () => {
    createWindow(context)
    expect(context.systemTray.init).toHaveBeenCalledTimes(1)
  })

  it('调用 hotkeys.register', () => {
    createWindow(context)
    expect(context.hotkeys.register).toHaveBeenCalledTimes(1)
  })

  it('调用 autoUpdater.init', () => {
    createWindow(context)
    expect(context.autoUpdater.init).toHaveBeenCalledTimes(1)
  })

  it('调用 firstRun.runSetup', () => {
    createWindow(context)
    expect(context.firstRun.runSetup).toHaveBeenCalledTimes(1)
  })

  it('返回 mainWindow 实例', () => {
    const result = createWindow(context)
    expect(result).toBeDefined()
    expect(result).toBe(lastWindow())
  })
})
