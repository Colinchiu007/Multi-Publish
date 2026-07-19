/**
 * phase2-bridges 单元测试
 * P1-C 试点：验证 Python bridges 启动/清理逻辑
 *
 * 注意：CJS 项目不 require('vitest')，使用 test-setup.js 注入的全局 describe/it/expect/vi
 */

// Mock logger
__registerMock('../services/logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

const log = require('../services/logger')
const { startBridges } = require('./phase2-bridges')

describe('phase2-bridges.startBridges', () => {
  let mockApp, mockPythonBridge, mockSplitterBridge, mockPromptBridge

  beforeEach(() => {
    mockApp = { on: vi.fn() }
    mockPythonBridge = {
      startPythonBackend: vi.fn(() => Promise.resolve()),
      stopPythonBackend: vi.fn(() => Promise.resolve()),
    }
    mockSplitterBridge = { start: vi.fn(() => Promise.resolve()), stop: vi.fn(() => Promise.resolve()) }
    mockPromptBridge = { start: vi.fn(() => Promise.resolve()), stop: vi.fn(() => Promise.resolve()) }
    log.info.mockClear()
    log.warn.mockClear()
    log.error.mockClear()
  })

  it('三个 bridge 全部启动成功 — 记录 2 条 info 日志', async () => {
    await startBridges({
      app: mockApp,
      pythonBridge: mockPythonBridge,
      splitterBridge: mockSplitterBridge,
      promptBridge: mockPromptBridge,
    })
    expect(mockPythonBridge.startPythonBackend).toHaveBeenCalledTimes(1)
    expect(mockSplitterBridge.start).toHaveBeenCalledTimes(1)
    expect(mockPromptBridge.start).toHaveBeenCalledTimes(1)
    expect(log.info).toHaveBeenCalledWith('App', 'SplitterBridge started')
    expect(log.info).toHaveBeenCalledWith('App', 'PromptBridge started')
  })

  it('pythonBridge 失败 — 不阻断其他 bridge 启动', async () => {
    mockPythonBridge.startPythonBackend = vi.fn(() => Promise.reject(new Error('python down')))
    await startBridges({
      app: mockApp,
      pythonBridge: mockPythonBridge,
      splitterBridge: mockSplitterBridge,
      promptBridge: mockPromptBridge,
    })
    expect(log.error).toHaveBeenCalledWith('App', 'Failed to start Python backend: python down')
    expect(mockSplitterBridge.start).toHaveBeenCalledTimes(1)
    expect(mockPromptBridge.start).toHaveBeenCalledTimes(1)
  })

  it('splitterBridge 失败 — promptBridge 仍启动，记录 warn', async () => {
    mockSplitterBridge.start = vi.fn(() => Promise.reject(new Error('splitter crash')))
    await startBridges({
      app: mockApp,
      pythonBridge: mockPythonBridge,
      splitterBridge: mockSplitterBridge,
      promptBridge: mockPromptBridge,
    })
    expect(log.warn).toHaveBeenCalledWith('App', 'SplitterBridge failed to start: splitter crash')
    expect(mockPromptBridge.start).toHaveBeenCalledTimes(1)
    expect(log.info).toHaveBeenCalledWith('App', 'PromptBridge started')
  })

  it('返回显式可等待的 bridge 清理函数，不注册异步 before-quit 监听器', async () => {
    const stopBridges = await startBridges({
      app: mockApp,
      pythonBridge: mockPythonBridge,
      splitterBridge: mockSplitterBridge,
      promptBridge: mockPromptBridge,
    })
    expect(stopBridges).toBeTypeOf('function')
    expect(mockApp.on).not.toHaveBeenCalled()
    await stopBridges()
    expect(mockPythonBridge.stopPythonBackend).toHaveBeenCalledTimes(1)
    expect(mockSplitterBridge.stop).toHaveBeenCalledTimes(1)
    expect(mockPromptBridge.stop).toHaveBeenCalledTimes(1)
  })

  it('bridge 清理幂等且等待全部异步 stop 完成', async () => {
    let resolveSplitterStop
    mockSplitterBridge.stop = vi.fn(() => new Promise((resolve) => { resolveSplitterStop = resolve }))
    const stopBridges = await startBridges({
      app: mockApp,
      pythonBridge: mockPythonBridge,
      splitterBridge: mockSplitterBridge,
      promptBridge: mockPromptBridge,
    })

    const firstStop = stopBridges()
    const secondStop = stopBridges()
    let settled = false
    firstStop.then(() => { settled = true })
    await Promise.resolve()

    expect(firstStop).toBe(secondStop)
    expect(settled).toBe(false)
    resolveSplitterStop()
    await firstStop
    expect(mockPythonBridge.stopPythonBackend).toHaveBeenCalledTimes(1)
    expect(mockSplitterBridge.stop).toHaveBeenCalledTimes(1)
    expect(mockPromptBridge.stop).toHaveBeenCalledTimes(1)
  })

  it('bridge 清理中单个 stop 失败 — 不影响其他 stop', async () => {
    mockSplitterBridge.stop = vi.fn(() => Promise.reject(new Error('stop fail')))
    const stopBridges = await startBridges({
      app: mockApp,
      pythonBridge: mockPythonBridge,
      splitterBridge: mockSplitterBridge,
      promptBridge: mockPromptBridge,
    })
    await stopBridges()
    expect(log.warn).toHaveBeenCalledWith('App', 'SplitterBridge stop failed: stop fail')
    expect(mockPythonBridge.stopPythonBackend).toHaveBeenCalledTimes(1)
    expect(mockPromptBridge.stop).toHaveBeenCalledTimes(1)
  })

  it('promptBridge 失败 — splitterBridge 仍启动，记录 warn', async () => {
    mockPromptBridge.start = vi.fn(() => Promise.reject(new Error('prompt crash')))
    await startBridges({
      app: mockApp,
      pythonBridge: mockPythonBridge,
      splitterBridge: mockSplitterBridge,
      promptBridge: mockPromptBridge,
    })
    expect(log.warn).toHaveBeenCalledWith('App', 'PromptBridge failed to start: prompt crash')
    expect(mockSplitterBridge.start).toHaveBeenCalledTimes(1)
    expect(log.info).toHaveBeenCalledWith('App', 'SplitterBridge started')
  })
})
