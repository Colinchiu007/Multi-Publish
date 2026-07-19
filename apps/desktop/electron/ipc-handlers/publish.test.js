// @ts-check
/**
 * Publish IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - publish:wechat / publish:batch / queue:cancel
 *
 * 只读操作不校验：queue:status / queue:history / history:list / history:get / dashboard:stats
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

// Mock offline-manager 避免 publish:wechat 拉起额外依赖
vi.mock('../services/offline-manager', () => ({
  isOffline: vi.fn(() => false),
  addToCache: vi.fn(),
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
  const mod = await import('./publish')
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
    taskQueue: {
      add: vi.fn(() => 'task-1'),
      cancel: vi.fn(() => true),
      getStatus: vi.fn(() => ({})),
      getHistory: vi.fn(() => []),
    },
    history: {
      listRecords: vi.fn(() => ({ total: 0, records: [] })),
      getRecord: vi.fn(() => null),
      getStats: vi.fn(() => ({})),
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

describe('publish IPC 写操作 sender 校验', () => {
  it('publish:wechat 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('publish:wechat')

    const result = await handler(UNTRUSTED_EVENT, { title: 'test' })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('publish:batch 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('publish:batch')

    const result = await handler(UNTRUSTED_EVENT, { platforms: ['wechat'], article: {} })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('queue:cancel 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('queue:cancel')

    const result = await handler(UNTRUSTED_EVENT, 'task-1')

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })
})

describe('publish IPC 可信来源正常工作', () => {
  it('publish:wechat 可信来源正常入队', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('publish:wechat')

    const result = await handler(TRUSTED_EVENT, { title: 'hello' })

    expect(result.code).toBe(0)
    expect(result.data).toEqual({ taskId: 'task-1' })
    expect(deps.taskQueue.add).toHaveBeenCalled()
  })

  it('publish:batch 可信来源正常批量入队', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('publish:batch')

    const result = await handler(TRUSTED_EVENT, { platforms: ['wechat', 'douyin'], article: { title: 'x' } })

    expect(result.code).toBe(0)
    expect(deps.taskQueue.add).toHaveBeenCalledTimes(2)
  })

  it('queue:cancel 可信来源正常取消', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('queue:cancel')

    const result = await handler(TRUSTED_EVENT, 'task-1')

    expect(result).toEqual({ code: 0, data: true, message: '任务已取消' })
    expect(deps.taskQueue.cancel).toHaveBeenCalledWith('task-1')
  })

  it('queue:status 只读操作不加 sender 校验，外部来源也可调用', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('queue:status')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result.code).toBe(0)
  })
})
