// @ts-check
/**
 * AccountManager 回归测试
 *
 * 覆盖 Electron app.getPath 不可用时的本地凭证目录 fallback。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'

const modulePath = './account-manager'

function loadAccountManager() {
  delete require.cache[require.resolve(modulePath)]
  return require(modulePath)
}

describe('account-manager — userData fallback', () => {
  beforeEach(() => {
    global.__enableElectronMock()
    global.__resetElectronMock()
  })

  afterEach(() => {
    global.__electronMock.app.getPath = function () { return '/tmp/test-electron-path' }
    vi.restoreAllMocks()
  })

  it('app.getPath 失败时使用用户主目录下的 .multi-publish，避免递归崩溃', () => {
    global.__electronMock.app.getPath = function () {
      throw new Error('electron app path unavailable')
    }

    const accountManager = loadAccountManager()
    const expectedDir = path.join(os.homedir(), '.multi-publish')
    const hasCredential = vi
      .spyOn(accountManager.credentialStore, 'hasCredential')
      .mockReturnValue(false)
    vi
      .spyOn(accountManager.accountStateRestorer, 'getAccountRecord')
      .mockReturnValue(null)

    expect(accountManager.checkLocalCredentials('wechat_mp', 'account-1')).toBe(false)
    expect(hasCredential).toHaveBeenCalledWith('account-1', expectedDir, undefined)
  })
})

describe('account-manager — Logto owner 隔离', () => {
  beforeEach(() => {
    global.__enableElectronMock()
    global.__resetElectronMock()
    global.__electronMock.app.getPath = function () { return 'C:/test-user-data' }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('添加账号时把当前用户 sub 写入状态与加密凭证命名空间', async () => {
    const accountManager = loadAccountManager()
    accountManager.setOwnerSubjectProvider(() => 'user-a')

    const page = {
      addInitScript: vi.fn(async () => {}),
      goto: vi.fn(async () => {}),
      waitForSelector: vi.fn(async () => {}),
      $: vi.fn(async () => null),
      evaluate: vi.fn()
        .mockResolvedValueOnce({ token: 'local-token' })
        .mockResolvedValueOnce({ platformAccountId: 'platform-user-a' }),
      close: vi.fn(async () => {}),
    }
    const context = {
      newPage: vi.fn(async () => page),
      cookies: vi.fn(async () => [{ name: 'sid', value: 'cookie-a' }]),
    }
    vi.spyOn(require('../services/playwright-manager'), 'getContext').mockResolvedValue(context)
    vi.spyOn(require('../services/python-bridge'), 'requestBackend').mockResolvedValue({
      code: 0,
      data: { id: 'account-a' },
    })
    const saveRecord = vi.spyOn(accountManager.accountStateRestorer, 'saveAccountRecord')
      .mockImplementation(() => {})
    const saveCredential = vi.spyOn(accountManager.credentialStore, 'saveCredential')
      .mockImplementation(() => {})

    await accountManager.addAccount('wechat_mp')

    expect(saveRecord).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'account-a', platform: 'wechat_mp' }),
      'user-a',
      'C:/test-user-data',
    )
    expect(saveCredential).toHaveBeenCalledWith(
      'account-a',
      expect.objectContaining({ platform: 'wechat_mp' }),
      'C:/test-user-data',
      'user-a',
    )
  })

  it('删除账号时同时清理当前 owner 的加密凭证和状态记录', async () => {
    const accountManager = loadAccountManager()
    accountManager.setOwnerSubjectProvider(() => 'user-a')
    const requestBackend = vi.spyOn(require('../services/python-bridge'), 'requestBackend')
      .mockResolvedValueOnce({ code: 0, data: { id: 'account-a', platform: 'douyin' } })
      .mockResolvedValueOnce({ code: 0 })
    const deleteCredential = vi.spyOn(accountManager.credentialStore, 'deleteCredential')
      .mockReturnValue(true)
    const deleteRecord = vi.spyOn(accountManager.accountStateRestorer, 'deleteAccountRecord')
      .mockImplementation(() => {})

    await expect(accountManager.deleteAccount('account-a')).resolves.toBe(true)

    expect(requestBackend).toHaveBeenNthCalledWith(1, 'GET', '/api/accounts/account-a')
    expect(requestBackend).toHaveBeenNthCalledWith(2, 'DELETE', '/api/accounts/account-a')
    expect(deleteCredential).toHaveBeenCalledWith('account-a', 'C:/test-user-data', 'user-a')
    expect(deleteRecord).toHaveBeenCalledWith('douyin', 'account-a', 'user-a', 'C:/test-user-data')
  })

  it('恢复账号时只读取当前 owner，并恢复 Cookie 与 localStorage', async () => {
    const accountManager = loadAccountManager()
    accountManager.setOwnerSubjectProvider(() => 'user-a')
    const loadCredential = vi.spyOn(accountManager.credentialStore, 'loadCredential')
      .mockReturnValue({
        platform: 'douyin',
        localStorage: { token: 'local-token' },
        accountInfo: { nickName: '用户 A' },
      })
    const getRecord = vi.spyOn(accountManager.accountStateRestorer, 'getAccountRecord')
      .mockReturnValue({ cookies: [{ name: 'sid', value: 'cookie-a', domain: '.douyin.com' }] })
    const session = { cookies: { set: vi.fn(async () => {}) } }
    const webContents = { executeJavaScript: vi.fn(async () => {}) }

    const result = await accountManager.openSavedAccount('account-a', 'douyin', {
      session,
      webContents,
    })

    expect(result.isLoggedIn).toBe(true)
    expect(loadCredential).toHaveBeenCalledWith('account-a', 'C:/test-user-data', 'user-a')
    expect(getRecord).toHaveBeenCalledWith('douyin', 'account-a', 'user-a', 'C:/test-user-data')
    expect(session.cookies.set).toHaveBeenCalled()
    expect(webContents.executeJavaScript).toHaveBeenCalled()
  })

  it('平台不匹配或身份服务缺少 sub 时拒绝使用本地凭证', () => {
    const accountManager = loadAccountManager()
    accountManager.setOwnerSubjectProvider(() => 'user-a')
    vi.spyOn(accountManager.credentialStore, 'loadCredential').mockReturnValue({
      platform: 'wechat_mp',
      localStorage: { token: 'secret' },
    })
    vi.spyOn(accountManager.accountStateRestorer, 'getAccountRecord').mockReturnValue(null)

    expect(accountManager.checkLocalCredentials('douyin', 'account-a')).toBe(false)

    accountManager.setOwnerSubjectProvider(() => null)
    expect(() => accountManager.checkLocalCredentials('douyin', 'account-a'))
      .toThrow('登录会话缺少用户标识')
  })
})
