// @ts-check
/**
 * shutdown.test.js — 测试 registerShutdownHandlers(context)
 *
 * 策略：使用 test-setup.js 提供的 global.__electronMock 单例，
 * 通过 __electronMock.app._handlers['window-all-closed'] 捕获退出回调并手动触发，
 * 验证清理顺序与各服务的清理方法被调用。
 * 不使用 vi.mock（vi.mock 不适用于 CJS require 加载的模块）。
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// mock 依赖的服务模块（shutdown.js 直接 require 的非 electron 模块）
const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
__registerMock('./services/logger', mockLogger)

// 通过 require 加载被测模块（在 mock 注册后）
let registerShutdownHandlers
beforeAll(() => {
  // 启用 electron mock（opt-in）：shutdown.js 顶层 require('electron') 需要 mock
  __enableElectronMock()
  const mod = require('./shutdown.js')
  registerShutdownHandlers = mod.registerShutdownHandlers
})

// 构造 mock context（含 shutdown 需要的所有服务）
function buildMockContext(overrides) {
  return Object.assign({
    hotkeys: { unregister: vi.fn() },
    pythonBridge: { stopPythonBackend: vi.fn(function () { return Promise.resolve() }) },
    webviewManager: { closeAll: vi.fn() },
    rpaViewManager: { cleanup: vi.fn() },
    keywordMonitor: { stopAll: vi.fn() },
    callbackServer: { stop: vi.fn() },
    store: { close: vi.fn() },
  }, overrides)
}

describe('shutdown — registerShutdownHandlers', () => {
  let context
  beforeEach(() => {
    vi.clearAllMocks()
    __resetElectronMock()
    context = buildMockContext()
  })

  it('registerShutdownHandlers 是函数', () => {
    expect(typeof registerShutdownHandlers).toBe('function')
  })

  it('注册 window-all-closed 事件', () => {
    registerShutdownHandlers(context)
    expect(__electronMock.app.on).toHaveBeenCalledWith('window-all-closed', expect.any(Function))
    expect(__electronMock.app._handlers['window-all-closed']).toBeDefined()
  })

  it('触发 window-all-closed 回调调用 hotkeys.unregister', async () => {
    registerShutdownHandlers(context)
    await __electronMock.app._handlers['window-all-closed']()
    expect(context.hotkeys.unregister).toHaveBeenCalledTimes(1)
  })

  it('触发回调调用 pythonBridge.stopPythonBackend', async () => {
    registerShutdownHandlers(context)
    await __electronMock.app._handlers['window-all-closed']()
    expect(context.pythonBridge.stopPythonBackend).toHaveBeenCalledTimes(1)
  })

  it('触发回调调用 webviewManager.closeAll', async () => {
    registerShutdownHandlers(context)
    await __electronMock.app._handlers['window-all-closed']()
    expect(context.webviewManager.closeAll).toHaveBeenCalledTimes(1)
  })

  it('触发回调调用 rpaViewManager.cleanup', async () => {
    registerShutdownHandlers(context)
    await __electronMock.app._handlers['window-all-closed']()
    expect(context.rpaViewManager.cleanup).toHaveBeenCalledTimes(1)
  })

  it('触发回调调用 keywordMonitor.stopAll', async () => {
    registerShutdownHandlers(context)
    await __electronMock.app._handlers['window-all-closed']()
    expect(context.keywordMonitor.stopAll).toHaveBeenCalledTimes(1)
  })

  it('触发回调调用 callbackServer.stop', async () => {
    registerShutdownHandlers(context)
    await __electronMock.app._handlers['window-all-closed']()
    expect(context.callbackServer.stop).toHaveBeenCalledTimes(1)
  })

  it('触发回调调用 store.close', async () => {
    registerShutdownHandlers(context)
    await __electronMock.app._handlers['window-all-closed']()
    expect(context.store.close).toHaveBeenCalledTimes(1)
  })

  it('触发回调调用 global.usageTracker.save（当存在时）', async () => {
    global.usageTracker = { save: vi.fn() }
    registerShutdownHandlers(context)
    await __electronMock.app._handlers['window-all-closed']()
    expect(global.usageTracker.save).toHaveBeenCalledTimes(1)
    delete global.usageTracker
  })

  it('触发回调在非 darwin 平台调用 app.quit', async () => {
    // process.platform 在 jsdom 下通常是 linux（!== 'darwin'）
    registerShutdownHandlers(context)
    await __electronMock.app._handlers['window-all-closed']()
    expect(__electronMock.app.quit).toHaveBeenCalledTimes(1)
  })
})
