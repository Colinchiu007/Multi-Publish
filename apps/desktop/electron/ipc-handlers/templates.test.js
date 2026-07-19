// @ts-check
/**
 * Templates IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - template:add / template:update / template:delete
 *
 * 只读操作不校验：template:list / template:get
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
  const mod = await import('./templates')
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
    templateManager: {
      list: vi.fn(() => []),
      get: vi.fn(() => null),
      add: vi.fn(() => ({ id: 'tpl-1' })),
      update: vi.fn(() => null),
      delete: vi.fn(() => false),
      listByCategory: vi.fn(() => []),
    },
    ...overrides,
  }
}

// 不可信来源（外部网页）
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }
// 可信来源（dev localhost）
const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' } }

describe('templates IPC 写操作 sender 校验', () => {
  it('template:add 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('template:add')

    const result = await handler(UNTRUSTED_EVENT, { name: 'evil' })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('template:update 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('template:update')

    const result = await handler(UNTRUSTED_EVENT, { id: 'tpl-1', updates: {} })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('template:delete 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('template:delete')

    const result = await handler(UNTRUSTED_EVENT, 'tpl-1')

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })
})

describe('templates IPC 可信来源/只读操作正常工作', () => {
  it('template:list 只读操作不加 sender 校验，外部来源也可调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('template:list')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: [] })
  })

  it('template:get 只读操作不加 sender 校验，外部来源也可调用', async () => {
    const mockTpl = { id: 'tpl-1', name: 'T1' }
    const deps = createMockDeps({
      templateManager: { get: vi.fn(() => mockTpl) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('template:get')

    const result = await handler(UNTRUSTED_EVENT, 'tpl-1')

    expect(result).toEqual({ code: 0, data: mockTpl })
  })

  it('template:add 可信来源正常调用 templateManager.add', async () => {
    const mockAdded = { id: 'tpl-1', name: 'T1' }
    const deps = createMockDeps({
      templateManager: { add: vi.fn(() => mockAdded) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('template:add')

    const result = await handler(TRUSTED_EVENT, { name: 'T1' })

    expect(result).toEqual({ code: 0, data: mockAdded, message: '模板已添加' })
    expect(deps.templateManager.add).toHaveBeenCalledWith({ name: 'T1' })
  })
})
