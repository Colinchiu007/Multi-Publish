// @ts-check
/**
 * Keyword IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - keyword:start / keyword:stop / keyword:stop-all
 *
 * 只读操作不校验：keyword:status / keyword:history
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
  const mod = await import('./keyword')
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
    keywordMonitor: {
      startMonitoring: vi.fn(() => true),
      stopMonitoring: vi.fn(() => true),
      getStatus: vi.fn(() => ({ active: 0 })),
      getHistory: vi.fn(() => []),
      stopAll: vi.fn(),
    },
    ...overrides,
  }
}

// 不可信来源（外部网页）
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }
// 可信来源（dev localhost）
const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' } }

describe('keyword IPC 写操作 sender 校验', () => {
  it('keyword:start 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('keyword:start')

    const result = await handler(UNTRUSTED_EVENT, { keyword: '测试', opts: {} })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('keyword:stop 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('keyword:stop')

    const result = await handler(UNTRUSTED_EVENT, { keyword: '测试' })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('keyword:stop-all 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('keyword:stop-all')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })
})

describe('keyword IPC 可信来源正常工作', () => {
  it('keyword:start 可信来源正常调用 startMonitoring', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('keyword:start')

    const result = await handler(TRUSTED_EVENT, { keyword: '热搜词', opts: { interval: 60 } })

    expect(result).toEqual({ code: 0, data: { keyword: '热搜词' } })
    expect(deps.keywordMonitor.startMonitoring).toHaveBeenCalledWith('热搜词', { interval: 60 })
  })

  it('keyword:stop-all 可信来源正常调用 stopAll', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('keyword:stop-all')

    const result = await handler(TRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: true })
    expect(deps.keywordMonitor.stopAll).toHaveBeenCalled()
  })
})

describe('keyword IPC 只读操作不加 sender 校验', () => {
  it('keyword:status 外部来源也可调用（只读）', async () => {
    const deps = createMockDeps({
      keywordMonitor: { getStatus: vi.fn(() => ({ active: 2 })) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('keyword:status')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: { active: 2 } })
  })

  it('keyword:history 外部来源也可调用（只读）', async () => {
    const deps = createMockDeps({
      keywordMonitor: { getHistory: vi.fn(() => [{ id: 1 }]) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('keyword:history')

    const result = await handler(UNTRUSTED_EVENT, { keyword: '热搜词' })

    expect(result).toEqual({ code: 0, data: [{ id: 1 }] })
  })
})
