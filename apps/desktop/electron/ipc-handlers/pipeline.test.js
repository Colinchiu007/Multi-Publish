// @ts-check
/**
 * Pipeline IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - 所有启动、控制、检查点推进和注册类写通道
 *
 * 运行状态和流水线定义也属于应用私有数据，统一执行 sender 校验。
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

const READ_PROTECTED_CHANNELS = [
  ['pipeline:list', 'listPipelines', []],
  ['pipeline:get', 'getPipeline', ['default']],
  ['pipeline:status', 'getStatus', ['default']],
  ['pipeline:history', 'getHistory', []],
  ['pipeline:fetch', 'fetchPipelineFromBackend', ['default']],
  ['pipeline:getRunContext', 'getRunContext', ['run-1']],
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

describe('pipeline IPC 查询 sender 校验', () => {
  it.each([...NEW_PROTECTED_CHANNELS, ...READ_PROTECTED_CHANNELS])(
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

  it('拒绝非法流水线名和 runId', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)

    await expect(ipcMain._get('pipeline:get')(TRUSTED_EVENT, '')).resolves.toEqual({
      code: -2, message: '缺少或非法流水线名称',
    })
    await expect(ipcMain._get('pipeline:getRunContext')(TRUSTED_EVENT, 42)).resolves.toEqual({
      code: -2, message: '缺少或非法 runId',
    })
  })
})

describe('pipeline:getRunContext 模型服务异常快照下发（按运行归属）', () => {
  // handler 在调用时 require("../services/provider-anomaly")（CJS），vi.mock 不拦截 CJS require，
  // 必须用 __registerMock 拦截 Module._load，让 handler 与测试共享同一 mock 实例。
  let anomalyMock
  beforeEach(() => {
    anomalyMock = {
      ProviderAnomalyBus: class {},
      providerAnomalyBus: {
        snapshot: vi.fn(() => []),
        snapshotSince: vi.fn(() => []),
        report: vi.fn(),
        clear: vi.fn(),
        isSlow: vi.fn(() => false),
      },
      slowThresholdMs: () => 60000,
      MAX_SNAPSHOT: 5,
    }
    __registerMock('./services/provider-anomaly', anomalyMock)
  })
  const RUN_SNAPSHOT = {
    id: 'run-1', stages: [], context: {}, createdAt: '2026-08-13T01:00:00.000Z',
  }

  it('存在异常时附带 providerWarnings 且以运行 createdAt 为边界过滤', async () => {
    anomalyMock.providerAnomalyBus.snapshotSince.mockReturnValue([
      { providerId: 'agnes-llm', category: 'llm', latencyMs: 90000, kind: 'slow' },
    ])

    const deps = createMockDeps({
      pipelineEngine: { getRunSnapshot: vi.fn().mockReturnValue(RUN_SNAPSHOT) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)

    const result = await ipcMain._get('pipeline:getRunContext')(TRUSTED_EVENT, 'run-1')
    expect(result.code).toBe(0)
    expect(result.data.id).toBe('run-1')
    expect(anomalyMock.providerAnomalyBus.snapshotSince).toHaveBeenCalledWith('2026-08-13T01:00:00.000Z')
    expect(result.data.providerWarnings).toEqual([
      expect.objectContaining({ providerId: 'agnes-llm', kind: 'slow' }),
    ])
  })

  it('运行创建之前的旧异常不附加到新运行（跨运行残留回归）', async () => {
    // snapshotSince 按 createdAt 边界过滤后无该运行内的异常
    anomalyMock.providerAnomalyBus.snapshotSince.mockReturnValue([])

    const deps = createMockDeps({
      pipelineEngine: { getRunSnapshot: vi.fn().mockReturnValue(RUN_SNAPSHOT) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)

    const result = await ipcMain._get('pipeline:getRunContext')(TRUSTED_EVENT, 'run-1')
    expect(result.code).toBe(0)
    expect(anomalyMock.providerAnomalyBus.snapshotSince).toHaveBeenCalledWith('2026-08-13T01:00:00.000Z')
    expect(result.data).toEqual(RUN_SNAPSHOT)
    expect(result.data.providerWarnings).toBeUndefined()
  })

  it('运行快照无 createdAt 时仍返回上下文（snapshotSince 回退全量，不隐藏警告）', async () => {
    anomalyMock.providerAnomalyBus.snapshotSince.mockReturnValue([
      { providerId: 'agnes-llm', category: 'llm', latencyMs: 90000, kind: 'slow' },
    ])

    const deps = createMockDeps({
      pipelineEngine: { getRunSnapshot: vi.fn().mockReturnValue({ id: 'run-1', stages: [], context: {} }) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)

    const result = await ipcMain._get('pipeline:getRunContext')(TRUSTED_EVENT, 'run-1')
    expect(result.code).toBe(0)
    expect(anomalyMock.providerAnomalyBus.snapshotSince).toHaveBeenCalledWith(undefined)
    expect(result.data.providerWarnings).toEqual([
      expect.objectContaining({ providerId: 'agnes-llm', kind: 'slow' }),
    ])
  })

  it('无异常时不附加 providerWarnings 字段（保持返回结构稳定）', async () => {
    anomalyMock.providerAnomalyBus.snapshotSince.mockReturnValue([])

    const deps = createMockDeps({
      pipelineEngine: { getRunSnapshot: vi.fn().mockReturnValue({ id: 'run-1', stages: [], context: {} }) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)

    const result = await ipcMain._get('pipeline:getRunContext')(TRUSTED_EVENT, 'run-1')
    expect(result.code).toBe(0)
    expect(result.data).toEqual({ id: 'run-1', stages: [], context: {} })
    expect(result.data.providerWarnings).toBeUndefined()
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

// ============================================================
// 阶段进度实时推送（openspec pipeline-progress-real-time-push）
// ============================================================
describe('阶段进度实时推送桥（pipeline:update）', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllTimers()
  })

  function installBridge({ withWindow = true, events = ['stage:progress'] } = {}) {
    const listeners = {}
    const on = vi.fn((event, cb) => { listeners[event] = cb; return () => {} })
    const getRunSnapshot = vi.fn((runId, opts) => ({
      runId,
      progressOnly: Boolean(opts && opts.progressOnly),
      stages: [],
      status: { status: 'running', progress: 40 },
    }))
    const send = vi.fn()
    const windows = withWindow
      ? [{ isDestroyed: () => false, webContents: { isDestroyed: () => false, send }, isVisible: () => true }]
      : []
    const deps = createMockDeps({
      pipelineEngine: { on, getRunSnapshot },
      BrowserWindow: { getAllWindows: vi.fn(() => windows) },
    })
    const ipcMain = createMockIpcMain()
    const cleanup = registerHandlers(ipcMain, deps)
    return { listeners, on, getRunSnapshot, send, deps, ipcMain, cleanup }
  }

  it('安装事件桥：订阅 stage:start/stage:progress/stage:complete/stage:fail/checkpoint:pause/pipeline:complete/pipeline:fail', () => {
    const { on } = installBridge()
    const subscribed = on.mock.calls.map(c => c[0])
    expect(subscribed).toEqual(expect.arrayContaining([
      'stage:start', 'stage:progress', 'stage:complete', 'stage:fail',
      'checkpoint:pause', 'pipeline:complete', 'pipeline:fail',
    ]))
  })

  it('stage:progress 高频更新：500ms 窗口内合并为一次 webContents.send（progressOnly 快照）', () => {
    vi.useFakeTimers()
    const { listeners, send, getRunSnapshot } = installBridge()
    listeners['stage:progress']({ runId: 'run-1' })
    listeners['stage:progress']({ runId: 'run-1' })
    listeners['stage:progress']({ runId: 'run-1' })
    expect(send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('pipeline:update', expect.objectContaining({ runId: 'run-1', progressOnly: true }))
    expect(getRunSnapshot).toHaveBeenCalledWith('run-1', { progressOnly: true })
  })

  it('run 终态（pipeline:complete）立即发送，不等节流窗口', () => {
    vi.useFakeTimers()
    const { listeners, send } = installBridge({ events: ['pipeline:complete'] })
    listeners['pipeline:complete']({ runId: 'run-1' })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('pipeline:update', expect.objectContaining({ runId: 'run-1' }))
  })

  it('无可见/受信窗口时静默跳过发送（不抛错）', () => {
    vi.useFakeTimers()
    const { listeners, send } = installBridge({ withWindow: false })
    expect(() => listeners['stage:progress']({ runId: 'run-1' })).not.toThrow()
    vi.advanceTimersByTime(500)
    expect(send).not.toHaveBeenCalled()
  })

  it('cleanup 清空计时器并取消订阅（不泄漏）', () => {
    vi.useFakeTimers()
    const { listeners, send, cleanup } = installBridge()
    listeners['stage:progress']({ runId: 'run-1' })
    expect(typeof cleanup).toBe('object')
    expect(typeof cleanup.cleanup).toBe('function')
    cleanup.cleanup()
    vi.advanceTimersByTime(500)
    expect(send).not.toHaveBeenCalled()
  })
})

// ============================================================
// Story2Video 批量创作（openspec story2video-batch-create）
// ============================================================
describe('Story2Video 批量创作 IPC', () => {
  function createBatchDeps(overrides = {}) {
    return createMockDeps({
      story2videoBatchQueue: {
        createBatch: vi.fn(async () => ({ success: true, batchId: 'batch_1', items: [{ itemId: 'i1', status: 'running' }] })),
        getBatches: vi.fn(() => []),
        cancelBatchItems: vi.fn(() => ({ success: true, cancelled: 1 })),
      },
      ...overrides,
    })
  }

  it('story2video:batch:create 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createBatchDeps())
    const handler = ipcMain._get('story2video:batch:create')

    const result = await handler(UNTRUSTED_EVENT, { mode: 'text', texts: ['a'] })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('story2video:batch:create 成功返回 batchId + items', async () => {
    const queue = { createBatch: vi.fn(async () => ({ success: true, batchId: 'batch_1', items: [{ itemId: 'i1' }] })) }
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps({ story2videoBatchQueue: queue }))

    const result = await ipcMain._get('story2video:batch:create')(TRUSTED_EVENT, { mode: 'text', texts: ['文案A'] })

    expect(result).toEqual({ code: 0, data: { batchId: 'batch_1', items: [{ itemId: 'i1' }] } })
    expect(queue.createBatch).toHaveBeenCalledWith({ mode: 'text', texts: ['文案A'] })
  })

  it('story2video:batch:create 校验失败透传 errorCode + failedItems', async () => {
    const queue = {
      createBatch: vi.fn(async () => ({ success: false, error: '至少输入 1 条文案', errorCode: 'BATCH_NO_ITEMS', failedItems: [] })),
    }
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps({ story2videoBatchQueue: queue }))

    const result = await ipcMain._get('story2video:batch:create')(TRUSTED_EVENT, { mode: 'text', texts: [] })

    expect(result).toMatchObject({ code: -2, message: '至少输入 1 条文案', errorCode: 'BATCH_NO_ITEMS', failedItems: [] })
  })

  it('story2video:batch:status 返回批次列表', async () => {
    const queue = { getBatches: vi.fn(() => [{ id: 'batch_1', summary: { running: 1 } }]) }
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps({ story2videoBatchQueue: queue }))

    const result = await ipcMain._get('story2video:batch:status')(TRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: [{ id: 'batch_1', summary: { running: 1 } }] })
  })

  it('story2video:batch:cancel 缺少 batchId 返回校验错误', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createBatchDeps())

    const result = await ipcMain._get('story2video:batch:cancel')(TRUSTED_EVENT, {})

    expect(result).toEqual({ code: -2, message: '缺少或非法 batchId' })
  })

  it('story2video:batch:cancel 成功返回取消数量', async () => {
    const queue = { cancelBatchItems: vi.fn(() => ({ success: true, cancelled: 2 })) }
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps({ story2videoBatchQueue: queue }))

    const result = await ipcMain._get('story2video:batch:cancel')(TRUSTED_EVENT, { batchId: 'batch_1', itemIds: ['i1', 'i2'] })

    expect(result).toEqual({ code: 0, data: { success: true, cancelled: 2 } })
    expect(queue.cancelBatchItems).toHaveBeenCalledWith('batch_1', ['i1', 'i2'])
  })

  it('story2video:pick-batch-files 通过 dialog 过滤 .txt/.md 并返回路径+名称', async () => {
    const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['C:/a.txt', 'C:/b.md'] })) }
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps({ dialog }))

    const result = await ipcMain._get('story2video:pick-batch-files')(TRUSTED_EVENT)

    expect(result).toEqual({
      code: 0,
      data: { files: [{ path: 'C:/a.txt', name: 'a.txt' }, { path: 'C:/b.md', name: 'b.md' }] },
    })
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '文本文件', extensions: ['txt', 'md'] }],
    }))
  })

  it('story2video:pick-batch-files 取消返回空列表', async () => {
    const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) }
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps({ dialog }))

    const result = await ipcMain._get('story2video:pick-batch-files')(TRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: { files: [] } })
  })

  it('批量队列服务缺失时返回错误 envelope 不抛错', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())

    const createResult = await ipcMain._get('story2video:batch:create')(TRUSTED_EVENT, { mode: 'text', texts: ['a'] })
    expect(createResult.code).toBe(-1)

    const statusResult = await ipcMain._get('story2video:batch:status')(TRUSTED_EVENT)
    expect(statusResult).toEqual({ code: -1, message: '批量创作队列服务不可用', data: [] })
  })
})
