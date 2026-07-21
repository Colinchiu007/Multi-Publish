// @ts-check
/**
 * Account IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - auth:open-login / auth:login-silent / account:add / account:delete / account:check-login / account:list
 *
 * 公开账号列表通过字段白名单脱敏；触发浏览器检查和旧列表通道必须校验来源。
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
    authViewManager: { openLogin: vi.fn(), completeLogin: vi.fn(), loginSilent: vi.fn(), close: vi.fn() },
    pythonBridge: { requestBackend: vi.fn() },
    AccountManager: {
      addAccount: vi.fn(),
      saveCapturedAccount: vi.fn(),
      deleteAccount: vi.fn(),
      listAccounts: vi.fn(),
      checkLoginStatus: vi.fn(),
      loadSavedCredentials: vi.fn(),
    },
    BACKEND_PLATFORMS: new Set(),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    BrowserWindow: { getAllWindows: vi.fn(() => []) },
    store: { getSetting: vi.fn(), setSetting: vi.fn() },
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

  it('auth:complete-login 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    const deps = createMockDeps()
    registerHandlers(ipcMain, deps)

    const result = await ipcMain._get('auth:complete-login')(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(deps.authViewManager.completeLogin).not.toHaveBeenCalled()
  })

  it('auth:close 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    const deps = createMockDeps()
    registerHandlers(ipcMain, deps)

    const result = await ipcMain._get('auth:close')(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(deps.authViewManager.close).not.toHaveBeenCalled()
  })

  it('account:check-login 拒绝外部网页触发账号验证', async () => {
    const ipcMain = createMockIpcMain()
    const deps = createMockDeps()
    registerHandlers(ipcMain, deps)

    const result = await ipcMain._get('account:check-login')(UNTRUSTED_EVENT, {
      platform: 'wechat_mp',
      accountId: 'acc-1',
    })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(deps.AccountManager.checkLoginStatus).not.toHaveBeenCalled()
  })

  it('不再注册允许渲染层提交敏感凭证的 auth:save-credentials', () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())

    expect(ipcMain._get('auth:save-credentials')).toBeUndefined()
  })
})

describe('account IPC 可信来源正常工作', () => {
  it('accounts:list 规范化账号状态、合并默认账号并移除敏感字段', async () => {
    const deps = createMockDeps()
    deps.pythonBridge.requestBackend.mockResolvedValue({
      code: 0,
      data: [{
        id: 'acc-1',
        platform: 'wechat_mp',
        name: '公众号',
        is_active: true,
        cookies: [{ name: 'session', value: 'secret' }],
        auth_data: { local_storage: { token: 'private' } },
        access_token: '不得暴露',
        refresh_token: '不得暴露',
      }],
    })
    deps.store.getSetting.mockReturnValue('acc-1')
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)

    const denied = await ipcMain._get('accounts:list')(UNTRUSTED_EVENT)
    const result = await ipcMain._get('accounts:list')(TRUSTED_EVENT)

    expect(denied).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(result).toEqual({
      code: 0,
      data: [{
        id: 'acc-1',
        platform: 'wechat_mp',
        name: '公众号',
        account_name: '公众号',
        is_active: true,
        status: 'active',
        is_default: true,
      }],
    })
  })

  it('auth:open-login 可信来源缺参返回校验错误', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('auth:open-login')

    const result = await handler(TRUSTED_EVENT, undefined)

    // platform 为 undefined，_isSafePathSegment 返回 false
    expect(result.code).toBe(-2)
    expect(result.message).toMatch(/platform/)
  })

  it('auth:open-login 后端登录成功时只返回脱敏账号字段', async () => {
    const send = vi.fn()
    const deps = createMockDeps({
      BACKEND_PLATFORMS: new Set(['youtube']),
      BrowserWindow: {
        getAllWindows: vi.fn(() => [{
          isDestroyed: vi.fn(() => false),
          webContents: { send },
        }]),
      },
    })
    deps.pythonBridge.requestBackend.mockResolvedValue({
      code: 0,
      data: {
        account_id: 'yt-1',
        platform: 'youtube',
        name: '频道账号',
        cookies: [{ name: 'session', value: 'secret' }],
        access_token: 'private-token',
      },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)

    const result = await ipcMain._get('auth:open-login')(TRUSTED_EVENT, 'youtube')

    expect(result).toEqual({
      code: 0,
      data: {
        id: 'yt-1',
        platform: 'youtube',
        name: '频道账号',
        account_name: '频道账号',
        status: 'active',
        is_default: false,
      },
      message: '登录成功',
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain('private-token')
    expect(send).toHaveBeenCalledWith('auth:completed', { platform: 'youtube', accountId: 'yt-1' })
  })

  it('auth:open-login 捕获的浏览器凭据只交给主进程加密存储', async () => {
    const captured = {
      name: '公众号',
      cookies: [{ name: 'session', value: 'secret' }],
      localStorage: { token: 'private' },
      indexedDB: { auth: { token: 'private' } },
    }
    const deps = createMockDeps()
    const send = vi.fn()
    deps.BrowserWindow.getAllWindows.mockReturnValue([{
      isDestroyed: vi.fn(() => false),
      webContents: { send },
    }])
    deps.authViewManager.openLogin.mockResolvedValue(captured)
    deps.AccountManager.saveCapturedAccount.mockResolvedValue({
      id: 'account-1',
      platform: 'wechat_mp',
      name: '公众号',
      cookies: captured.cookies,
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)

    const result = await ipcMain._get('auth:open-login')(TRUSTED_EVENT, 'wechat_mp')

    expect(deps.AccountManager.saveCapturedAccount).toHaveBeenCalledWith('wechat_mp', captured)
    expect(deps.pythonBridge.requestBackend).not.toHaveBeenCalled()
    expect(result).toEqual({
      code: 0,
      data: {
        id: 'account-1',
        platform: 'wechat_mp',
        name: '公众号',
        account_name: '公众号',
        status: 'active',
        is_default: false,
      },
      message: '账号添加成功',
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain('private')
    expect(send).toHaveBeenCalledWith('auth:completed', { platform: 'wechat_mp', accountId: 'account-1' })
  })

  it('auth:complete-login 只触发主进程提取，不接收渲染层凭证', async () => {
    const deps = createMockDeps()
    deps.authViewManager.completeLogin.mockResolvedValue(true)
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)

    const result = await ipcMain._get('auth:complete-login')(TRUSTED_EVENT)

    expect(deps.authViewManager.completeLogin).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ code: 0, data: true, message: '正在保存账号' })
  })

  it('auth:login-silent 只接收账号标识，并从主进程凭证库读取登录数据', async () => {
    const credentials = {
      cookies: [{ name: 'session', value: 'secret' }],
      localStorage: { token: 'private' },
    }
    const deps = createMockDeps()
    deps.AccountManager.loadSavedCredentials.mockReturnValue(credentials)
    deps.authViewManager.loginSilent.mockResolvedValue({ valid: true, accountName: '公众号' })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)

    const result = await ipcMain._get('auth:login-silent')(TRUSTED_EVENT, {
      platform: 'wechat_mp',
      accountId: 'acc-1',
    })

    expect(deps.AccountManager.loadSavedCredentials).toHaveBeenCalledWith('acc-1', 'wechat_mp')
    expect(deps.authViewManager.loginSilent).toHaveBeenCalledWith(
      'wechat_mp',
      credentials.cookies,
      credentials.localStorage,
    )
    expect(result).toEqual({ code: 0, data: { valid: true, accountName: '公众号' } })
  })

  it('auth:login-silent 拒绝渲染层夹带凭证或非法账号路径段', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)

    const result = await ipcMain._get('auth:login-silent')(TRUSTED_EVENT, {
      platform: 'wechat_mp',
      accountId: '../acc-1',
      cookies: [{ name: 'session', value: 'secret' }],
      localStorage: { token: 'private' },
    })

    expect(result.code).toBe(-2)
    expect(deps.AccountManager.loadSavedCredentials).not.toHaveBeenCalled()
    expect(deps.authViewManager.loginSilent).not.toHaveBeenCalled()
  })

  it('account:check-login 在所有分支统一拒绝非法 platform 和 accountId', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('account:check-login')

    const badPlatform = await handler(TRUSTED_EVENT, { platform: '../wechat_mp', accountId: 'acc-1' })
    const badAccount = await handler(TRUSTED_EVENT, { platform: 'wechat_mp', accountId: 'acc/1' })

    expect(badPlatform.code).toBe(-2)
    expect(badAccount.code).toBe(-2)
    expect(deps.AccountManager.checkLoginStatus).not.toHaveBeenCalled()
    expect(deps.pythonBridge.requestBackend).not.toHaveBeenCalled()
  })

  it('account:check-login 对后端平台也按 accountId 检查指定账号', async () => {
    const deps = createMockDeps({ BACKEND_PLATFORMS: new Set(['youtube']) })
    deps.AccountManager.checkLoginStatus.mockResolvedValue({ valid: true, message: '登录有效' })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)

    const result = await ipcMain._get('account:check-login')(TRUSTED_EVENT, {
      platform: 'youtube',
      accountId: 'yt-2',
    })

    expect(deps.AccountManager.checkLoginStatus).toHaveBeenCalledWith('youtube', 'yt-2')
    expect(deps.pythonBridge.requestBackend).not.toHaveBeenCalled()
    expect(result).toEqual({ code: 0, data: { valid: true, message: '登录有效' } })
  })

  it('account:add 可信来源正常调用 AccountManager', async () => {
    const mockAccount = {
      id: 'acc-1',
      platform: 'wechat',
      name: '公众号',
      cookies: [{ name: 'session', value: 'secret' }],
      localStorage: { token: 'private' },
    }
    const deps = createMockDeps({
      AccountManager: { addAccount: vi.fn().mockResolvedValue(mockAccount) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('account:add')

    const result = await handler(TRUSTED_EVENT, 'wechat')

    expect(result).toEqual({
      code: 0,
      data: {
        id: 'acc-1',
        platform: 'wechat',
        name: '公众号',
        account_name: '公众号',
        status: 'active',
        is_default: false,
      },
      message: '账号添加成功',
    })
    expect(deps.AccountManager.addAccount).toHaveBeenCalledWith('wechat')
  })

  it('account:add 拒绝非法平台路径段', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)

    const result = await ipcMain._get('account:add')(TRUSTED_EVENT, '../wechat')

    expect(result).toEqual({ code: -2, message: '缺少或非法 platform 参数' })
    expect(deps.AccountManager.addAccount).not.toHaveBeenCalled()
  })

  it('account:list 拒绝外部来源，可信来源只返回脱敏字段', async () => {
    const deps = createMockDeps({
      AccountManager: { listAccounts: vi.fn().mockResolvedValue([{
        id: 'acc-1',
        platform: 'wechat_mp',
        name: '公众号',
        cookies: [{ name: 'session', value: 'secret' }],
        access_token: 'private',
      }]) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('account:list')

    const denied = await handler(UNTRUSTED_EVENT)
    const result = await handler(TRUSTED_EVENT)

    expect(denied).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(result).toEqual({ code: 0, data: [{
      id: 'acc-1',
      platform: 'wechat_mp',
      name: '公众号',
      account_name: '公众号',
      status: 'active',
      is_default: false,
    }] })
  })
})
