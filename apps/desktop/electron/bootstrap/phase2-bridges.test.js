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
  let beforeQuitHandlers

  beforeEach(() => {
    beforeQuitHandlers = []
    mockApp = {
      on: vi.fn((event, handler) => {
        if (event === 'before-quit') beforeQuitHandlers.push(handler)
      }),
    }
    mockPythonBridge = { startPythonBackend: vi.fn(() => Promise.resolve()) }
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
    expect(log.error).toHaveBeenCalledWith('App', 'Failed to start Python backend:', 'python down')
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

  it('before-quit 注册 — 触发时调用 stop', async () => {
    await startBridges({
      app: mockApp,
      pythonBridge: mockPythonBridge,
      splitterBridge: mockSplitterBridge,
      promptBridge: mockPromptBridge,
    })
    expect(mockApp.on).toHaveBeenCalledWith('before-quit', expect.any(Function))
    expect(beforeQuitHandlers).toHaveLength(1)
    // 模拟 before-quit 触发
    await beforeQuitHandlers[0]()
    expect(mockSplitterBridge.stop).toHaveBeenCalledTimes(1)
    expect(mockPromptBridge.stop).toHaveBeenCalledTimes(1)
  })

  it('before-quit 中 stop 失败 — 不影响其他 stop', async () => {
    mockSplitterBridge.stop = vi.fn(() => Promise.reject(new Error('stop fail')))
    await startBridges({
      app: mockApp,
      pythonBridge: mockPythonBridge,
      splitterBridge: mockSplitterBridge,
      promptBridge: mockPromptBridge,
    })
    await beforeQuitHandlers[0]()
    expect(log.warn).toHaveBeenCalledWith('App', 'SplitterBridge stop failed: stop fail')
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
