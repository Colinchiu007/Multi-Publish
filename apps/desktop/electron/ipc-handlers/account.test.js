// @ts-check
/**
 * Account IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - auth:open-login / auth:login-silent / account:add / account:delete
 * - auth:save-credentials（已迁移，回归保护）
 *
 * 只读操作不校验：accounts:list / auth:close / account:check-login / account:list
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
  const mod = await import('./account')
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
    authViewManager: { openLogin: vi.fn(), loginSilent: vi.fn(), close: vi.fn() },
    pythonBridge: { requestBackend: vi.fn() },
    AccountManager: { addAccount: vi.fn(), deleteAccount: vi.fn(), listAccounts: vi.fn(), checkLoginStatus: vi.fn() },
    BACKEND_PLATFORMS: new Set(),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    BrowserWindow: { getAllWindows: vi.fn(() => []) },
    ...overrides,
  }
}

// 不可信来源（外部网页）
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }
// 可信来源（dev localhost）
const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' } }

describe('account IPC 写操作 sender 校验', () => {
  it('auth:open-login 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('auth:open-login')

    const result = await handler(UNTRUSTED_EVENT, 'wechat')

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('auth:login-silent 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('auth:login-silent')

    const result = await handler(UNTRUSTED_EVENT, { platform: 'wechat', cookies: [] })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('account:add 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('account:add')

    const result = await handler(UNTRUSTED_EVENT, 'wechat')

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('account:delete 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('account:delete')

    const result = await handler(UNTRUSTED_EVENT, 'acc-1')

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('auth:save-credentials 回归保护：仍拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('auth:save-credentials')

    const result = await handler(UNTRUSTED_EVENT, { accountId: 'acc-1', cookies: [] })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })
})

describe('account IPC 可信来源正常工作', () => {
  it('auth:open-login 可信来源缺参返回校验错误', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('auth:open-login')

    const result = await handler(TRUSTED_EVENT, undefined)

    // platform 为 undefined，_isSafePathSegment 返回 false
    expect(result.code).toBe(-2)
    expect(result.message).toMatch(/platform/)
  })

  it('account:add 可信来源正常调用 AccountManager', async () => {
    const mockAccount = { id: 'acc-1', platform: 'wechat' }
    const deps = createMockDeps({
      AccountManager: { addAccount: vi.fn().mockResolvedValue(mockAccount) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('account:add')

    const result = await handler(TRUSTED_EVENT, 'wechat')

    expect(result).toEqual({ code: 0, data: mockAccount, message: '账号添加成功' })
    expect(deps.AccountManager.addAccount).toHaveBeenCalledWith('wechat')
  })

  it('account:list 只读操作不加 sender 校验，外部来源也可调用', async () => {
    const deps = createMockDeps({
      AccountManager: { listAccounts: vi.fn().mockResolvedValue([]) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('account:list')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: [] })
  })
})
