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
    usageTracker: { save: vi.fn() },
    stopBridges: vi.fn(function () { return Promise.resolve() }),
    loginStatusMonitor: { stop: vi.fn() },
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

  it('注册 before-quit 事件并返回显式 shutdown 函数', () => {
    const shutdown = registerShutdownHandlers(context)
    expect(shutdown).toBeTypeOf('function')
    expect(__electronMock.app.on).toHaveBeenCalledWith('before-quit', expect.any(Function))
  })

  it('macOS 关闭全部窗口时保留进程级服务', async () => {
    registerShutdownHandlers(context, { platform: 'darwin' })

    await __electronMock.app._handlers['window-all-closed']()

    expect(context.stopBridges).not.toHaveBeenCalled()
    expect(context.store.close).not.toHaveBeenCalled()
    expect(__electronMock.app.quit).not.toHaveBeenCalled()
  })

  it('显式 shutdown 幂等并等待 bridge 清理完成', async () => {
    let resolveBridges
    context.stopBridges = vi.fn(function () {
      return new Promise((resolve) => { resolveBridges = resolve })
    })
    const shutdown = registerShutdownHandlers(context)

    const first = shutdown()
    const second = shutdown()
    let settled = false
    first.then(() => { settled = true })
    await vi.waitFor(() => {
      expect(context.stopBridges).toHaveBeenCalledTimes(1)
    })

    expect(first).toBe(second)
    expect(settled).toBe(false)
    resolveBridges()
    await first
    expect(context.stopBridges).toHaveBeenCalledTimes(1)
    expect(context.store.close).toHaveBeenCalledTimes(1)
  })

  it('before-quit 阻止立即退出，等待 shutdown 后再次 quit', async () => {
    let resolveBridges
    context.stopBridges = vi.fn(function () {
      return new Promise((resolve) => { resolveBridges = resolve })
    })
    registerShutdownHandlers(context)
    const event = { preventDefault: vi.fn() }

    const quitPromise = __electronMock.app._handlers['before-quit'](event)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(__electronMock.app.quit).not.toHaveBeenCalled()

    await vi.waitFor(() => {
      expect(context.stopBridges).toHaveBeenCalledTimes(1)
    })
    resolveBridges()
    await quitPromise
    expect(__electronMock.app.quit).toHaveBeenCalledTimes(1)
  })

  it('等待异步 scheduler 清理完成后才继续关闭存储并退出', async () => {
    let resolveScheduler
    context.scheduler = {
      stopAll: vi.fn(function () {
        return new Promise((resolve) => { resolveScheduler = resolve })
      }),
    }
    registerShutdownHandlers(context)

    const quitPromise = __electronMock.app._handlers['window-all-closed']()
    await vi.waitFor(() => {
      expect(context.scheduler.stopAll).toHaveBeenCalledTimes(1)
    })

    expect(context.store.close).not.toHaveBeenCalled()
    expect(__electronMock.app.quit).not.toHaveBeenCalled()

    resolveScheduler()
    await quitPromise
    expect(context.store.close).toHaveBeenCalledTimes(1)
    expect(__electronMock.app.quit).toHaveBeenCalledTimes(1)
  })

  it('异步清理拒绝时记录错误并继续后续清理', async () => {
    const cleanupError = new Error('scheduler stop failed')
    context.scheduler = { stopAll: vi.fn(function () { return Promise.reject(cleanupError) }) }
    registerShutdownHandlers(context)

    await __electronMock.app._handlers['window-all-closed']()

    expect(mockLogger.error).toHaveBeenCalledWith('App', 'Error stopping scheduler: ' + cleanupError.message)
    expect(context.store.close).toHaveBeenCalledTimes(1)
    expect(__electronMock.app.quit).toHaveBeenCalledTimes(1)
  })

  it('等待异步 store.close 完成后才调用 app.quit', async () => {
    let resolveStore
    context.store.close = vi.fn(function () {
      return new Promise((resolve) => { resolveStore = resolve })
    })
    registerShutdownHandlers(context)

    const quitPromise = __electronMock.app._handlers['window-all-closed']()
    await vi.waitFor(() => {
      expect(context.store.close).toHaveBeenCalledTimes(1)
    })

    expect(__electronMock.app.quit).not.toHaveBeenCalled()
    resolveStore()
    await quitPromise
    expect(__electronMock.app.quit).toHaveBeenCalledTimes(1)
  })

  it('window-all-closed 与 before-quit 并发时复用同一次清理', async () => {
    let resolveBridges
    context.stopBridges = vi.fn(function () {
      return new Promise((resolve) => { resolveBridges = resolve })
    })
    registerShutdownHandlers(context)
    const event = { preventDefault: vi.fn() }

    const closePromise = __electronMock.app._handlers['window-all-closed']()
    const beforeQuitPromise = __electronMock.app._handlers['before-quit'](event)
    await vi.waitFor(() => {
      expect(context.stopBridges).toHaveBeenCalledTimes(1)
    })
    resolveBridges()
    await Promise.all([closePromise, beforeQuitPromise])

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(context.stopBridges).toHaveBeenCalledTimes(1)
    expect(context.store.close).toHaveBeenCalledTimes(1)
    expect(__electronMock.app.quit).toHaveBeenCalledTimes(1)
  })

  it('触发 window-all-closed 回调调用 hotkeys.unregister', async () => {
    registerShutdownHandlers(context)
    await __electronMock.app._handlers['window-all-closed']()
    expect(context.hotkeys.unregister).toHaveBeenCalledTimes(1)
  })

  it('触发回调调用显式 bridge 清理函数', async () => {
    registerShutdownHandlers(context)
    await __electronMock.app._handlers['window-all-closed']()
    expect(context.stopBridges).toHaveBeenCalledTimes(1)
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

  it('触发回调停止登录状态监控', async () => {
    registerShutdownHandlers(context)
    await __electronMock.app._handlers['window-all-closed']()
    expect(context.loginStatusMonitor.stop).toHaveBeenCalledTimes(1)
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

  it('触发回调调用 context.usageTracker.save', async () => {
    registerShutdownHandlers(context)
    await __electronMock.app._handlers['window-all-closed']()
    expect(context.usageTracker.save).toHaveBeenCalledTimes(1)
  })

  it('注册后注入的 keyword 持久化定时器仍会在退出时清理', async () => {
    const timer = { id: 'late-timer' }
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {})
    registerShutdownHandlers(context)
    context.keywordPersistTimer = timer

    await __electronMock.app._handlers['window-all-closed']()

    expect(clearIntervalSpy).toHaveBeenCalledWith(timer)
  })

  it('触发回调在非 darwin 平台调用 app.quit', async () => {
    // process.platform 在 jsdom 下通常是 linux（!== 'darwin'）
    registerShutdownHandlers(context)
    await __electronMock.app._handlers['window-all-closed']()
    expect(__electronMock.app.quit).toHaveBeenCalledTimes(1)
  })
})
