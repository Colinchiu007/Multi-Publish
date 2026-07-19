// @ts-check
/**
 * Proxy IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - proxy:add / proxy:add-batch / proxy:remove / proxy:remove-dead
 *
 * 只读操作不校验：proxy:list / proxy:test / proxy:test-all / proxy:status / proxy:get-next
 * 注意：proxy:reset 虽然是状态变更但不在本次迁移范围。
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
  const mod = await import('./proxy')
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
    proxyPool: {
      addProxy: vi.fn(() => 'proxy-1'),
      addProxies: vi.fn(),
      size: vi.fn(() => 0),
      getProxies: vi.fn(() => []),
      remove: vi.fn(() => true),
      testProxy: vi.fn(async () => ({ ok: true })),
      testAll: vi.fn(async () => []),
      getStatus: vi.fn(() => ({ total: 0, alive: 0, dead: 0 })),
      getNextProxy: vi.fn(() => null),
      reset: vi.fn(),
      removeDead: vi.fn(() => 0),
    },
    ...overrides,
  }
}

// 不可信来源（外部网页）
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }
// 可信来源（dev localhost）
const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' } }

describe('proxy IPC 写操作 sender 校验', () => {
  it('proxy:add 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('proxy:add')

    const result = await handler(UNTRUSTED_EVENT, { host: '1.1.1.1', port: 8080 })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('proxy:add-batch 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('proxy:add-batch')

    const result = await handler(UNTRUSTED_EVENT, { proxies: [] })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('proxy:remove 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('proxy:remove')

    const result = await handler(UNTRUSTED_EVENT, { id: 'proxy-1' })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('proxy:remove-dead 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('proxy:remove-dead')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })
})

describe('proxy IPC 可信来源与只读操作正常工作', () => {
  it('proxy:add 可信来源正常调用 proxyPool.addProxy', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('proxy:add')

    const result = await handler(TRUSTED_EVENT, { host: '1.1.1.1', port: 8080, type: 'http' })

    expect(result).toEqual({ code: 0, data: { id: 'proxy-1' } })
    expect(deps.proxyPool.addProxy).toHaveBeenCalledWith('1.1.1.1', 8080, 'http')
  })

  it('proxy:list 只读操作不加 sender 校验，外部来源也可调用', async () => {
    const deps = createMockDeps({
      proxyPool: {
        ...createMockDeps().proxyPool,
        getProxies: vi.fn(() => [{ id: 'proxy-1', host: '1.1.1.1' }]),
      },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('proxy:list')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: [{ id: 'proxy-1', host: '1.1.1.1' }] })
  })

  it('proxy:status 只读操作不加 sender 校验', async () => {
    const deps = createMockDeps({
      proxyPool: {
        ...createMockDeps().proxyPool,
        getStatus: vi.fn(() => ({ total: 5, alive: 3, dead: 2 })),
      },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('proxy:status')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: { total: 5, alive: 3, dead: 2 } })
  })
})
