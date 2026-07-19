// @ts-check
/**
 * Pipeline IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - 所有启动、控制、检查点推进和注册类写通道
 *
 * 只读操作不校验：pipeline:list / pipeline:status / pipeline:get
 *                / pipeline:definitions / pipeline:list-orchestrated
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock logger 防止真实日志污染
vi.mock('../services/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

// 启用 electron mock，withSenderCheck 通过 require('electron').app 读取 isPackaged
__enableElectronMock()

let registerHandlers
let originalNodeEnv
let originalIsPackaged

beforeEach(async () => {
  vi.resetModules()
  // 信任 dev localhost:5174 — 模拟未打包开发模式
  originalNodeEnv = process.env.NODE_ENV
  originalIsPackaged = __electronMock.app.isPackaged
  delete process.env.NODE_ENV
  __electronMock.app.isPackaged = false
  const mod = await import('./pipeline')
  registerHandlers = mod.default || mod
})

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
  __electronMock.app.isPackaged = originalIsPackaged
})

function createMockIpcMain() {
  const handlers = {}
  return {
    handle: vi.fn((channel, fn) => { handlers[channel] = fn }),
    on: vi.fn(),
    _get: (channel) => handlers[channel],
  }
}

function createMockDeps(overrides = {}) {
  return {
    pipelineEngine: {
      listPipelines: vi.fn(() => []),
      getPipeline: vi.fn(),
      start: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
      getStatus: vi.fn(),
      advance: vi.fn(),
      getHistory: vi.fn(() => []),
      fetchPipelineFromBackend: vi.fn(),
      startOrchestrated: vi.fn(),
      executeStage: vi.fn(),
      advanceToNextCheckpoint: vi.fn(),
      getRunContext: vi.fn(),
      pauseWithCheckpoint: vi.fn(),
      resumeFromCheckpoint: vi.fn(),
      registerPipeline: vi.fn(),
      registerStageExecutor: vi.fn(),
    },
    BrowserWindow: { getAllWindows: vi.fn(() => []) },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  }
}

// 不可信来源（外部网页）
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }
// 可信来源（dev localhost）
const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' } }

const NEW_PROTECTED_CHANNELS = [
  ['pipeline:pause', 'pause', []],
  ['pipeline:resume', 'resume', []],
  ['pipeline:advance', 'advance', []],
  ['pipeline:executeStage', 'executeStage', ['run-1']],
  ['pipeline:advanceToNextCheckpoint', 'advanceToNextCheckpoint', ['run-2']],
  ['pipeline:pauseWithCheckpoint', 'pauseWithCheckpoint', []],
  ['pipeline:resumeFromCheckpoint', 'resumeFromCheckpoint', []],
  ['pipeline:registerPipeline', 'registerPipeline', [{ name: 'custom', stages: [] }]],
  ['pipeline:registerStageExecutor', 'registerStageExecutor', ['render', vi.fn()]],
]

describe('pipeline IPC 写操作 sender 校验', () => {
  it('pipeline:start 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('pipeline:start')

    const result = await handler(UNTRUSTED_EVENT, 'default', {})

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('pipeline:cancel 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('pipeline:cancel')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('pipeline:startOrchestrated 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('pipeline:startOrchestrated')

    const result = await handler(UNTRUSTED_EVENT, 'default', {})

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it.each(NEW_PROTECTED_CHANNELS)(
    '%s 拒绝外部网页调用且不执行 pipelineEngine.%s',
    async (channel, method, args) => {
      const deps = createMockDeps()
      const ipcMain = createMockIpcMain()
      registerHandlers(ipcMain, deps)

      const result = await ipcMain._get(channel)(UNTRUSTED_EVENT, ...args)

      expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
      expect(deps.pipelineEngine[method]).not.toHaveBeenCalled()
    },
  )
})

describe('pipeline IPC 只读操作不加 sender 校验', () => {
  it('pipeline:list 外部来源也可调用，返回正常数据', async () => {
    const mockList = [{ name: 'default', stages: [] }]
    const deps = createMockDeps({
      pipelineEngine: { listPipelines: vi.fn(() => mockList) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('pipeline:list')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: mockList })
    expect(deps.pipelineEngine.listPipelines).toHaveBeenCalled()
  })
})

describe('pipeline IPC 可信来源写操作正常工作', () => {
  it('pipeline:start 可信来源正常调用 pipelineEngine.start', async () => {
    const mockResult = { runId: 'run-1' }
    const deps = createMockDeps({
      pipelineEngine: { start: vi.fn().mockResolvedValue(mockResult) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('pipeline:start')

    const result = await handler(TRUSTED_EVENT, 'default', {})

    expect(result).toEqual({ code: 0, data: mockResult })
    expect(deps.pipelineEngine.start).toHaveBeenCalledWith('default', {})
  })

  it('pipeline:cancel 可信来源正常调用 pipelineEngine.cancel', async () => {
    const deps = createMockDeps({
      pipelineEngine: { cancel: vi.fn(() => true) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('pipeline:cancel')

    const result = await handler(TRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: true })
    expect(deps.pipelineEngine.cancel).toHaveBeenCalled()
  })

  it('pipeline:startOrchestrated 可信来源正常调用 pipelineEngine.startOrchestrated', async () => {
    const mockResult = { runId: 'orch-1' }
    const deps = createMockDeps({
      pipelineEngine: { startOrchestrated: vi.fn().mockResolvedValue(mockResult) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('pipeline:startOrchestrated')

    const result = await handler(TRUSTED_EVENT, 'default', {})

    expect(result).toEqual({ code: 0, data: mockResult })
    expect(deps.pipelineEngine.startOrchestrated).toHaveBeenCalledWith('default', {})
  })

  it.each(NEW_PROTECTED_CHANNELS)(
    '%s 可信来源保持 pipelineEngine.%s 参数与返回合同',
    async (channel, method, args) => {
      const expected = { channel, accepted: true }
      const deps = createMockDeps()
      deps.pipelineEngine[method].mockReturnValue(expected)
      const ipcMain = createMockIpcMain()
      registerHandlers(ipcMain, deps)

      const result = await ipcMain._get(channel)(TRUSTED_EVENT, ...args)

      expect(result).toEqual({ code: 0, data: expected })
      expect(deps.pipelineEngine[method]).toHaveBeenCalledTimes(1)
      expect(deps.pipelineEngine[method]).toHaveBeenCalledWith(...args)
    },
  )
})
