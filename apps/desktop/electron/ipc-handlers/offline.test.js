// @ts-check
/**
 * Offline IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - offline:add-to-cache / offline:clear-cache
 *
 * 只读操作不校验：offline:status / offline:is-offline / offline:cached-tasks
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock logger 防止真实日志污染（注：vi.mock 对 CJS require 不生效，仅作声明；
// 真正拦截 require('../services/logger') 通过 __registerMock 完成）
const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
__registerMock('./services/logger', mockLogger)
__registerMock('../services/logger', mockLogger)

// Mock offline-manager 避免 require 链拉起 fs/path 真实文件 IO
const mockOfflineManager = {
  getStatus: vi.fn(() => ({ offline: false, cachedCount: 0, cachedTasks: [] })),
  isOffline: vi.fn(() => false),
  loadCache: vi.fn(() => []),
  addToCache: vi.fn(() => true),
  clearSuccessfulTasks: vi.fn(),
}
__registerMock('./services/offline-manager', mockOfflineManager)
__registerMock('../services/offline-manager', mockOfflineManager)

// 启用 electron mock，withSenderCheck 通过 require('electron').app 读取 isPackaged
__enableElectronMock()

let registerHandlers
let originalNodeEnv
let originalIsPackaged

beforeEach(async () => {
  vi.resetModules()
  // 重置 mock 调用记录
  mockOfflineManager.addToCache.mockClear()
  mockOfflineManager.clearSuccessfulTasks.mockClear()
  mockOfflineManager.getStatus.mockClear()
  // 信任 dev localhost:5174 — 模拟未打包开发模式
  originalNodeEnv = process.env.NODE_ENV
  originalIsPackaged = __electronMock.app.isPackaged
  delete process.env.NODE_ENV
  __electronMock.app.isPackaged = false
  const mod = await import('./offline')
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

// 不可信来源（外部网页）
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }
// 可信来源（dev localhost）
const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' } }

describe('offline IPC 写操作 sender 校验', () => {
  it('offline:add-to-cache 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, {})
    const handler = ipcMain._get('offline:add-to-cache')

    const result = await handler(UNTRUSTED_EVENT, { id: 'task-1' })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(mockOfflineManager.addToCache).not.toHaveBeenCalled()
  })

  it('offline:clear-cache 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, {})
    const handler = ipcMain._get('offline:clear-cache')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(mockOfflineManager.clearSuccessfulTasks).not.toHaveBeenCalled()
  })
})

describe('offline IPC 只读操作不加 sender 校验', () => {
  it('offline:status 外部来源也可调用（只读）', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, {})
    const handler = ipcMain._get('offline:status')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result.code).toBe(0)
    expect(result.data).toEqual({ offline: false, cachedCount: 0, cachedTasks: [] })
  })
})

describe('offline IPC 可信来源正常工作', () => {
  it('offline:add-to-cache 可信来源正常调用 addToCache', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, {})
    const handler = ipcMain._get('offline:add-to-cache')

    const result = await handler(TRUSTED_EVENT, { id: 'task-1' })

    expect(result).toEqual({ code: 0, data: true, message: '已缓存' })
    expect(mockOfflineManager.addToCache).toHaveBeenCalledWith({ id: 'task-1' })
  })

  it('offline:clear-cache 可信来源正常调用 clearSuccessfulTasks', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, {})
    const handler = ipcMain._get('offline:clear-cache')

    const result = await handler(TRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: true, message: '已清理' })
    expect(mockOfflineManager.clearSuccessfulTasks).toHaveBeenCalled()
  })
})
