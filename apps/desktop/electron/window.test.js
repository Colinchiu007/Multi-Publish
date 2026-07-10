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

describe('window — createWindow', () => {
  let context
  beforeEach(() => {
    vi.clearAllMocks()
    __resetElectronMock()
    context = buildMockContext()
    // window.js 内 _ipcRegistered 为模块级标记（R28：防止 macOS activate 重复注册 IPC），
    // 跨用例残留会导致除首次 createWindow 外 registerIpcHandlers 不再调用。
    // 每个用例前清缓存重新 require，使 _ipcRegistered 复位为 false。
    delete require.cache[require.resolve('./window.js')]
    createWindow = require('./window.js').createWindow
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

  it('webPreferences.sandbox = true', () => {
    createWindow(context)
    const opts = __electronMock.BrowserWindow.mock.calls[0][0]
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
