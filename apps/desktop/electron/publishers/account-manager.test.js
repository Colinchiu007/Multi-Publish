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

describe('account-manager — 捕获凭证持久化', () => {
  beforeEach(() => {
    global.__enableElectronMock()
    global.__resetElectronMock()
  })

  it('只在主进程内合并账号状态与加密凭证', () => {
    const accountManager = loadAccountManager()
    const loadCredential = vi.spyOn(accountManager.credentialStore, 'loadCredential').mockReturnValue({
      cookies: [{ name: 'session', value: 'secret', domain: '.mp.weixin.qq.com' }],
      localStorage: { token: 'private' },
      indexedDB: { secure: { token: 'indexed' } },
      accountInfo: { nickname: '公众号' },
    })
    const getAccountRecord = vi.spyOn(accountManager.accountStateRestorer, 'getAccountRecord').mockReturnValue({
      accountId: 'account-1',
      platform: 'wechat_mp',
      accountInfo: { nickname: '旧元数据' },
    })

    expect(typeof accountManager.loadSavedCredentials).toBe('function')
    const result = accountManager.loadSavedCredentials('account-1', 'wechat_mp')

    expect(loadCredential).toHaveBeenCalledWith('account-1', '/tmp/test-electron-path')
    expect(getAccountRecord).toHaveBeenCalledWith('wechat_mp', 'account-1')
    expect(result).toEqual({
      cookies: [{ name: 'session', value: 'secret', domain: '.mp.weixin.qq.com' }],
      localStorage: { token: 'private' },
      indexedDB: { secure: { token: 'indexed' } },
      accountInfo: { nickname: '公众号' },
    })
  })

  it('拒绝与请求平台不匹配的加密凭证，避免跨平台 Cookie 注入', () => {
    const accountManager = loadAccountManager()
    vi.spyOn(accountManager.credentialStore, 'loadCredential').mockReturnValue({
      platform: 'wechat_mp',
      cookies: [{ name: 'session', value: 'secret', domain: '.mp.weixin.qq.com' }],
      localStorage: {},
      indexedDB: {},
      accountInfo: {},
    })
    vi.spyOn(accountManager.accountStateRestorer, 'getAccountRecord').mockReturnValue({
      accountId: 'account-1',
      platform: 'wechat_mp',
    })

    expect(accountManager.loadSavedCredentials('account-1', 'zhihu')).toBeNull()
  })

  it('拒绝没有可信平台归属的旧凭证', () => {
    const accountManager = loadAccountManager()
    vi.spyOn(accountManager.credentialStore, 'loadCredential').mockReturnValue({
      cookies: [{ name: 'session', value: 'secret' }],
      localStorage: {},
      indexedDB: {},
      accountInfo: {},
    })
    vi.spyOn(accountManager.accountStateRestorer, 'getAccountRecord').mockReturnValue(null)

    expect(accountManager.loadSavedCredentials('legacy-unbound', 'wechat_mp')).toBeNull()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('后端只写公开元数据，完整凭证只进入加密存储', async () => {
    const pythonBridge = require('../services/python-bridge')
    vi.spyOn(pythonBridge, 'requestBackend').mockResolvedValue({
      code: 0,
      data: { id: 'account-1', platform: 'wechat_mp', name: '公众号' },
    })
    const accountManager = loadAccountManager()
    const saveRecord = vi.spyOn(accountManager.accountStateRestorer, 'saveAccountRecord').mockReturnValue(true)
    const saveCredential = vi.spyOn(accountManager.credentialStore, 'saveCredential').mockReturnValue(true)
    const cookies = [{ name: 'session', value: 'secret', domain: '.mp.weixin.qq.com' }]
    const localStorage = { token: 'private' }

    const result = await accountManager.saveCapturedAccount('wechat_mp', {
      cookies,
      localStorage,
      name: '公众号',
      accountInfo: { platformAccountId: 'wx-1' },
    })

    expect(result).toEqual({ id: 'account-1', platform: 'wechat_mp', name: '公众号' })
    expect(pythonBridge.requestBackend).toHaveBeenCalledWith('POST', '/api/accounts', {
      platform: 'wechat_mp',
      name: '公众号',
    })
    expect(saveRecord).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account-1',
      platform: 'wechat_mp',
    }))
    expect(saveRecord.mock.calls[0][0]).not.toHaveProperty('cookies')
    expect(saveRecord.mock.calls[0][0]).not.toHaveProperty('localStorage')
    expect(saveCredential).toHaveBeenCalledWith(
      'account-1',
      { platform: 'wechat_mp', cookies, localStorage, indexedDB: {}, accountInfo: { platformAccountId: 'wx-1' } },
      '/tmp/test-electron-path',
    )
  })

  it('没有有效 Cookie 时拒绝创建空登录账号', async () => {
    const pythonBridge = require('../services/python-bridge')
    const requestBackend = vi.spyOn(pythonBridge, 'requestBackend')
    const accountManager = loadAccountManager()

    await expect(accountManager.saveCapturedAccount('wechat_mp', {
      cookies: [],
      localStorage: {},
      name: '公众号',
    })).rejects.toThrow('未捕获到有效登录凭证')
    expect(requestBackend).not.toHaveBeenCalled()
  })

  it('没有 Cookie 但包含 localStorage token 时仍可保存账号', async () => {
    const pythonBridge = require('../services/python-bridge')
    vi.spyOn(pythonBridge, 'requestBackend').mockResolvedValue({
      code: 0,
      data: { id: 'account-local-token', platform: 'zhihu', name: '知乎账号' },
    })
    const accountManager = loadAccountManager()
    vi.spyOn(accountManager.credentialStore, 'saveCredential').mockReturnValue(true)
    vi.spyOn(accountManager.accountStateRestorer, 'saveAccountRecord').mockReturnValue(true)

    await expect(accountManager.saveCapturedAccount('zhihu', {
      cookies: [],
      localStorage: { access_token: 'private-token' },
      name: '知乎账号',
    })).resolves.toEqual({ id: 'account-local-token', platform: 'zhihu', name: '知乎账号' })

    expect(pythonBridge.requestBackend).toHaveBeenCalledWith('POST', '/api/accounts', {
      platform: 'zhihu',
      name: '知乎账号',
    })
  })

  it('归一化无效凭证字段，并允许仅凭 IndexedDB 保存账号', async () => {
    const pythonBridge = require('../services/python-bridge')
    vi.spyOn(pythonBridge, 'requestBackend').mockResolvedValue({
      code: 0,
      data: { accountId: 'account-indexed-db', platform: 'wechat_mp' },
    })
    const accountManager = loadAccountManager()
    const saveRecord = vi.spyOn(accountManager.accountStateRestorer, 'saveAccountRecord').mockReturnValue(true)
    const saveCredential = vi.spyOn(accountManager.credentialStore, 'saveCredential').mockReturnValue(true)

    await expect(accountManager.saveCapturedAccount('wechat_mp', {
      cookies: 'invalid',
      localStorage: [],
      indexedDB: { auth: { token: 'private' } },
      name: '   ',
      accountInfo: [],
    })).resolves.toEqual({ accountId: 'account-indexed-db', platform: 'wechat_mp' })

    expect(pythonBridge.requestBackend).toHaveBeenCalledWith('POST', '/api/accounts', {
      platform: 'wechat_mp',
      name: accountManager.PLATFORM_NAMES.wechat_mp,
    })
    expect(saveRecord).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account-indexed-db',
      platformAccountId: '',
      accountInfo: {},
    }))
    expect(saveCredential).toHaveBeenCalledWith(
      'account-indexed-db',
      { platform: 'wechat_mp', cookies: [], localStorage: {}, indexedDB: { auth: { token: 'private' } }, accountInfo: {} },
      '/tmp/test-electron-path',
    )
  })

  it.each([
    null,
    undefined,
    'invalid',
    { cookies: {}, localStorage: [], indexedDB: [] },
  ])('拒绝归一化后仍为空的凭证: %j', async captured => {
    const pythonBridge = require('../services/python-bridge')
    const requestBackend = vi.spyOn(pythonBridge, 'requestBackend')
    const accountManager = loadAccountManager()

    await expect(accountManager.saveCapturedAccount('wechat_mp', captured))
      .rejects.toThrow('未捕获到有效登录凭证')
    expect(requestBackend).not.toHaveBeenCalled()
  })

  it('后端保存失败或未返回账号 ID 时不写入本地凭证', async () => {
    const pythonBridge = require('../services/python-bridge')
    const requestBackend = vi.spyOn(pythonBridge, 'requestBackend')
      .mockResolvedValueOnce({ code: 1, message: '后端拒绝保存' })
      .mockResolvedValueOnce({ code: 0, data: {} })
    const accountManager = loadAccountManager()
    const saveRecord = vi.spyOn(accountManager.accountStateRestorer, 'saveAccountRecord')
    const saveCredential = vi.spyOn(accountManager.credentialStore, 'saveCredential')
    const captured = { cookies: [{ name: 'session', value: 'secret', domain: '.mp.weixin.qq.com' }] }

    await expect(accountManager.saveCapturedAccount('wechat_mp', captured))
      .rejects.toThrow('后端拒绝保存')
    await expect(accountManager.saveCapturedAccount('wechat_mp', captured))
      .rejects.toThrow('保存账号后未返回账号 ID')
    expect(saveRecord).not.toHaveBeenCalled()
    expect(saveCredential).not.toHaveBeenCalled()
  })

  it('加密凭证写入失败时回滚后端账号并拒绝返回成功', async () => {
    const pythonBridge = require('../services/python-bridge')
    const requestBackend = vi.spyOn(pythonBridge, 'requestBackend')
      .mockResolvedValueOnce({ code: 0, data: { id: 'account-rollback', platform: 'wechat_mp' } })
      .mockResolvedValueOnce({ code: 0, data: true })
    const accountManager = loadAccountManager()
    vi.spyOn(accountManager.credentialStore, 'saveCredential').mockReturnValue(false)
    const saveRecord = vi.spyOn(accountManager.accountStateRestorer, 'saveAccountRecord')

    await expect(accountManager.saveCapturedAccount('wechat_mp', {
      cookies: [{ name: 'session', value: 'secret', domain: '.mp.weixin.qq.com' }],
    })).rejects.toThrow('加密凭证保存失败')

    expect(requestBackend).toHaveBeenNthCalledWith(2, 'DELETE', '/api/accounts/account-rollback')
    expect(saveRecord).not.toHaveBeenCalled()
  })

  it.each(['', null, undefined, 'a/b', 'id!', 'id\n'])('删除前拒绝非法账号 ID: %j', async accountId => {
    const pythonBridge = require('../services/python-bridge')
    const requestBackend = vi.spyOn(pythonBridge, 'requestBackend')
    const accountManager = loadAccountManager()

    await expect(accountManager.deleteAccount(accountId)).rejects.toThrow('缺少或非法账号 ID')
    expect(requestBackend).not.toHaveBeenCalled()
  })

  it('后端删除失败时保留本地状态和加密凭证', async () => {
    const pythonBridge = require('../services/python-bridge')
    vi.spyOn(pythonBridge, 'requestBackend')
      .mockResolvedValueOnce({ code: 0, data: { platform: 'wechat_mp' } })
      .mockResolvedValueOnce({ code: 1, message: '删除被拒绝' })
    const accountManager = loadAccountManager()
    const deleteRecord = vi.spyOn(accountManager.accountStateRestorer, 'deleteAccountRecord')
    const deleteCredential = vi.spyOn(accountManager.credentialStore, 'deleteCredential')

    await expect(accountManager.deleteAccount('account-1')).rejects.toThrow('删除被拒绝')
    expect(deleteRecord).not.toHaveBeenCalled()
    expect(deleteCredential).not.toHaveBeenCalled()
  })

  it('后端查询账号失败时仍按账号 ID 清理全部本地状态', async () => {
    const pythonBridge = require('../services/python-bridge')
    vi.spyOn(pythonBridge, 'requestBackend')
      .mockRejectedValueOnce(new Error('查询失败'))
      .mockResolvedValueOnce({ code: 0, data: true })
    const accountManager = loadAccountManager()
    vi.spyOn(accountManager.accountStateRestorer, 'listLoggedInAccounts').mockReturnValue([
      { accountId: 'account-1', platform: 'zhihu' },
    ])
    const deleteRecords = vi.spyOn(accountManager.accountStateRestorer, 'deleteAccountRecordsById').mockReturnValue(true)
    const deleteCredential = vi.spyOn(accountManager.credentialStore, 'deleteCredential').mockReturnValue(true)

    await expect(accountManager.deleteAccount('account-1')).resolves.toBe(true)
    expect(deleteRecords).toHaveBeenCalledWith('account-1')
    expect(deleteCredential).toHaveBeenCalledWith('account-1', '/tmp/test-electron-path')
  })

  it('只从加密存储恢复凭证，账号状态仅补充公开元数据', () => {
    const accountManager = loadAccountManager()
    const loadCredential = vi.spyOn(accountManager.credentialStore, 'loadCredential')
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({
        platform: 'wechat_mp',
        cookies: [{ name: 'session', value: 'encrypted-cookie', domain: '.mp.weixin.qq.com' }],
        localStorage: { token: 'encrypted' },
        indexedDB: { secure: true },
        accountInfo: { id: 'encrypted' },
      })
      .mockReturnValueOnce(null)
    const getAccountRecord = vi.spyOn(accountManager.accountStateRestorer, 'getAccountRecord')
      .mockReturnValueOnce({
        accountInfo: { id: 'record' },
      })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)

    expect(accountManager.loadSavedCredentials('record-only', 'wechat_mp')).toBeNull()
    expect(accountManager.loadSavedCredentials('encrypted-only', 'wechat_mp')).toEqual({
      cookies: [{ name: 'session', value: 'encrypted-cookie', domain: '.mp.weixin.qq.com' }],
      localStorage: { token: 'encrypted' },
      indexedDB: { secure: true },
      accountInfo: { id: 'encrypted' },
    })
    expect(accountManager.loadSavedCredentials('missing', 'wechat_mp')).toBeNull()
  })

  it('本地凭证检查只认可加密存储，公开状态记录不能伪装为登录态', () => {
    const accountManager = loadAccountManager()
    const hasCredential = vi.spyOn(accountManager.credentialStore, 'hasCredential')
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
    vi.spyOn(accountManager.credentialStore, 'loadCredential').mockReturnValue({
      platform: 'wechat_mp',
      cookies: [{ name: 'session', value: 'encrypted-cookie', domain: '.mp.weixin.qq.com' }],
      localStorage: {},
      accountInfo: {},
    })
    vi.spyOn(accountManager.accountStateRestorer, 'getAccountRecord').mockReturnValue({ platform: 'wechat_mp' })

    expect(accountManager.checkLocalCredentials('wechat_mp', 'encrypted-only')).toBe(true)
    expect(accountManager.checkLocalCredentials('wechat_mp', 'record-only')).toBe(false)
    expect(hasCredential).toHaveBeenCalledTimes(2)
  })

  it('删除账号后同步清理本地状态和加密凭证', async () => {
    const pythonBridge = require('../services/python-bridge')
    vi.spyOn(pythonBridge, 'requestBackend')
      .mockResolvedValueOnce({ code: 0, data: { id: 'account-1', platform: 'wechat_mp' } })
      .mockResolvedValueOnce({ code: 0, data: true })
    const accountManager = loadAccountManager()
    const deleteRecords = vi.spyOn(accountManager.accountStateRestorer, 'deleteAccountRecordsById').mockReturnValue(true)
    const deleteCredential = vi.spyOn(accountManager.credentialStore, 'deleteCredential').mockReturnValue(true)

    await expect(accountManager.deleteAccount('account-1')).resolves.toBe(true)

    expect(deleteRecords).toHaveBeenCalledWith('account-1')
    expect(deleteCredential).toHaveBeenCalledWith('account-1', '/tmp/test-electron-path')
  })

  it('后端删除成功后本地状态清理异常不改变删除结果，并继续清理其他凭证', async () => {
    const pythonBridge = require('../services/python-bridge')
    vi.spyOn(pythonBridge, 'requestBackend')
      .mockResolvedValueOnce({ code: 0, data: { id: 'account-1', platform: 'wechat_mp' } })
      .mockResolvedValueOnce({ code: 0, data: true })
    const accountManager = loadAccountManager()
    vi.spyOn(accountManager.accountStateRestorer, 'deleteAccountRecordsById').mockImplementation(() => {
      throw new Error('state file locked')
    })
    const deleteCredential = vi.spyOn(accountManager.credentialStore, 'deleteCredential').mockReturnValue(true)

    await expect(accountManager.deleteAccount('account-1')).resolves.toBe(true)
    expect(deleteCredential).toHaveBeenCalledWith('account-1', '/tmp/test-electron-path')
  })

  it('加密凭据文件存在但删除失败时返回可重试错误并保留公开状态索引', async () => {
    const pythonBridge = require('../services/python-bridge')
    vi.spyOn(pythonBridge, 'requestBackend')
      .mockResolvedValueOnce({ code: 0, data: { id: 'account-1', platform: 'wechat_mp' } })
      .mockResolvedValueOnce({ code: 0, data: true })
    const accountManager = loadAccountManager()
    vi.spyOn(accountManager.credentialStore, 'hasCredential').mockReturnValue(true)
    vi.spyOn(accountManager.credentialStore, 'deleteCredential').mockReturnValue(false)
    const deleteRecords = vi.spyOn(accountManager.accountStateRestorer, 'deleteAccountRecordsById')

    await expect(accountManager.deleteAccount('account-1'))
      .rejects.toThrow('清理本地加密凭据失败')
    expect(deleteRecords).not.toHaveBeenCalled()
  })

  it('后端账号已不存在时仍重试本地凭据和状态清理', async () => {
    const pythonBridge = require('../services/python-bridge')
    vi.spyOn(pythonBridge, 'requestBackend')
      .mockResolvedValueOnce({ detail: '账号不存在' })
      .mockResolvedValueOnce({ detail: '账号不存在' })
    const accountManager = loadAccountManager()
    vi.spyOn(accountManager.credentialStore, 'hasCredential').mockReturnValue(true)
    const deleteCredential = vi.spyOn(accountManager.credentialStore, 'deleteCredential').mockReturnValue(true)
    const deleteRecords = vi.spyOn(accountManager.accountStateRestorer, 'deleteAccountRecordsById').mockReturnValue(true)

    await expect(accountManager.deleteAccount('account-1')).resolves.toBe(true)
    expect(deleteCredential).toHaveBeenCalledWith('account-1', '/tmp/test-electron-path')
    expect(deleteRecords).toHaveBeenCalledWith('account-1')
  })

  it.each([
    ['../wechat_mp', 'account-1'],
    ['wechat_mp', '../account-1'],
    ['wechat_mp', 'account?other=1'],
  ])('检查登录状态前纵深拒绝非法路径段: %s / %s', async (platform, accountId) => {
    const pythonBridge = require('../services/python-bridge')
    const requestBackend = vi.spyOn(pythonBridge, 'requestBackend')
    const accountManager = loadAccountManager()

    await expect(accountManager.checkLoginStatus(platform, accountId))
      .resolves.toEqual({ valid: false, message: '缺少或非法平台/账号参数' })
    expect(requestBackend).not.toHaveBeenCalled()
  })

  it('仅有 localStorage 凭证时仍使用隐藏页面检查登录状态', async () => {
    const playwrightPath = require.resolve('../services/playwright-manager')
    const actualPlaywrightManager = require(playwrightPath)
    const page = {
      context: () => ({ addCookies: vi.fn() }),
      addInitScript: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(true),
      close: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue('https://mp.weixin.qq.com/cgi-bin/home'),
    }
    const getContext = vi.fn().mockResolvedValue({ newPage: vi.fn().mockResolvedValue(page) })
    global.__registerMock(playwrightPath, { getContext })

    try {
      const accountManager = loadAccountManager()
      vi.spyOn(accountManager.credentialStore, 'loadCredential').mockReturnValue({
        platform: 'wechat_mp',
        cookies: [],
        localStorage: { accessToken: 'secret' },
        accountInfo: {},
      })
      vi.spyOn(accountManager.accountStateRestorer, 'getAccountRecord').mockReturnValue(null)

      await expect(accountManager.checkLoginStatus('wechat_mp', 'account-storage'))
        .resolves.toEqual({ valid: true, message: 'Cookie 有效，登录正常' })
      expect(getContext).toHaveBeenCalledWith({ show: false })
      expect(page.addInitScript).toHaveBeenCalledTimes(1)
    } finally {
      global.__registerMock(playwrightPath, actualPlaywrightManager)
    }
  })
})
