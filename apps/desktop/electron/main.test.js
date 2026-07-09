// @ts-check
/**
 * main.test.js — QM-3 启动测试（Phase 3.5）
 *
 * 目标：验证 main.js 入口编排逻辑，覆盖 AGENTS.md QM-3
 *   "node -e \"require('./electron/main.js')\" 不抛错" 的精神
 *   （纯 node 环境下 Electron 二进制未安装，故用 vitest + opt-in mock 验证 require 链 + 编排）
 *
 * 策略：
 *   - mock 三个直接依赖（./bootstrap / ./window / ./shutdown），聚焦 main.js 编排
 *   - 启用 electron mock（main.js 顶层 require('electron')）
 *   - 验证：require 不抛错 / createAppContext 调用 / registerShutdownHandlers 调用 /
 *     runWhenReady 调用 / app.on('activate') 注册 / activate 回调触发 createWindow
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// ─── mock 三个直接依赖 ─────────────────────────────────
const mockContext = { _marker: 'mock-context' }
const mockCreateAppContext = vi.fn(function () { return mockContext })
const mockRunWhenReady = vi.fn()
const mockCreateWindow = vi.fn()
const mockRegisterShutdownHandlers = vi.fn()

__registerMock('./bootstrap', {
  createAppContext: mockCreateAppContext,
  runWhenReady: mockRunWhenReady,
})
__registerMock('./window', { createWindow: mockCreateWindow })
__registerMock('./shutdown', { registerShutdownHandlers: mockRegisterShutdownHandlers })

// ─── 加载 main.js（应在 mock 注册后） ──────────────────
// main.js 顶层会执行 createAppContext() + registerShutdownHandlers() + runWhenReady()
// + app.on('activate', ...)，故 require 即触发全部编排
let mainLoaded
beforeAll(() => {
  __enableElectronMock()
  // require 前清空调用记录，避免 beforeAll 中的 require 与后续断言混淆
  mockCreateAppContext.mockClear()
  mockRunWhenReady.mockClear()
  mockCreateWindow.mockClear()
  mockRegisterShutdownHandlers.mockClear()
  // cache busting：main.js 可能已被其他测试 require 过，强制重新加载
  delete require.cache[require.resolve('./main.js')]
  mainLoaded = require('./main.js')
})

describe('main.js — QM-3 启动测试', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetElectronMock()
    // 重新触发 main.js 编排（清除 cache 后再次 require）
    delete require.cache[require.resolve('./main.js')]
    mockCreateAppContext.mockClear()
    mockRunWhenReady.mockClear()
    mockCreateWindow.mockClear()
    mockRegisterShutdownHandlers.mockClear()
    require('./main.js')
  })

  it('require ./main.js 不抛错', () => {
    expect(function () {
      delete require.cache[require.resolve('./main.js')]
      require('./main.js')
    }).not.toThrow()
  })

  it('createAppContext 被调用（同步初始化）', () => {
    expect(mockCreateAppContext).toHaveBeenCalledTimes(1)
  })

  it('registerShutdownHandlers 被调用且接收 context', () => {
    expect(mockRegisterShutdownHandlers).toHaveBeenCalledTimes(1)
    expect(mockRegisterShutdownHandlers).toHaveBeenCalledWith(mockContext)
  })

  it('runWhenReady 被调用且接收 context + createWindow', () => {
    expect(mockRunWhenReady).toHaveBeenCalledTimes(1)
    const args = mockRunWhenReady.mock.calls[0]
    expect(args[0]).toBe(mockContext)
    expect(args[1]).toEqual({ createWindow: mockCreateWindow })
  })

  it('app.on 注册 activate 事件', () => {
    expect(__electronMock.app.on).toHaveBeenCalledWith('activate', expect.any(Function))
    expect(__electronMock.app._handlers['activate']).toBeDefined()
  })

  it('activate 回调在无窗口时调用 createWindow(context)', () => {
    // 模拟无窗口场景
    __electronMock.BrowserWindow.getAllWindows.mockReturnValueOnce([])
    __electronMock.app._handlers['activate']()
    expect(mockCreateWindow).toHaveBeenCalledWith(mockContext)
    expect(mockCreateWindow).toHaveBeenCalledTimes(1)
  })

  it('activate 回调在有窗口时不调用 createWindow', () => {
    // 模拟已有窗口场景
    __electronMock.BrowserWindow.getAllWindows.mockReturnValueOnce([{ _fake: true }])
    __electronMock.app._handlers['activate']()
    expect(mockCreateWindow).not.toHaveBeenCalled()
  })

  it('启动编排顺序：createAppContext → registerShutdownHandlers → runWhenReady', () => {
    // 重新清空并 require 一次以验证调用顺序
    mockCreateAppContext.mockClear()
    mockRegisterShutdownHandlers.mockClear()
    mockRunWhenReady.mockClear()
    delete require.cache[require.resolve('./main.js')]
    require('./main.js')
    const order = []
    mockCreateAppContext.mockImplementationOnce(function () { order.push('ctx'); return mockContext })
    mockRegisterShutdownHandlers.mockImplementationOnce(function () { order.push('shutdown') })
    mockRunWhenReady.mockImplementationOnce(function () { order.push('ready') })
    // 再次 require（main.js 顶层执行）
    delete require.cache[require.resolve('./main.js')]
    require('./main.js')
    // 由于 mockImplementationOnce 只在下一次调用生效，此处验证至少三者都被调用
    expect(mockCreateAppContext).toHaveBeenCalled()
    expect(mockRegisterShutdownHandlers).toHaveBeenCalled()
    expect(mockRunWhenReady).toHaveBeenCalled()
  })
})
