const fs = require('fs')
const os = require('os')
const path = require('path')

const restorer = require('../electron/services/account-state-restorer')

describe('account-state-restorer owner 隔离', () => {
  let userDataDir
  let previousDir

  beforeEach(() => {
    previousDir = process.env.ELECTRON_USER_DATA_DIR
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'account-state-test-'))
    process.env.ELECTRON_USER_DATA_DIR = userDataDir
    restorer.init()
  })

  afterEach(() => {
    if (previousDir === undefined) delete process.env.ELECTRON_USER_DATA_DIR
    else process.env.ELECTRON_USER_DATA_DIR = previousDir
    fs.rmSync(userDataDir, { recursive: true, force: true })
  })

  it('相同 platform/accountId 的不同 owner 记录互不覆盖', () => {
    restorer.saveAccountRecord({ platform: 'douyin', accountId: 'shared', accountInfo: { name: 'A' } }, 'user-a')
    restorer.saveAccountRecord({ platform: 'douyin', accountId: 'shared', accountInfo: { name: 'B' } }, 'user-b')

    expect(restorer.getAccountRecord('douyin', 'shared', 'user-a').accountInfo.name).toBe('A')
    expect(restorer.getAccountRecord('douyin', 'shared', 'user-b').accountInfo.name).toBe('B')
    expect(restorer.listLoggedInAccounts('user-a')).toHaveLength(1)
    expect(restorer.listLoggedInAccounts('user-b')).toHaveLength(1)
  })

  it('owner 查询不会读取无 owner 的 legacy 记录', () => {
    restorer.saveAccountRecord({ platform: 'douyin', accountId: 'legacy', cookies: [] })

    expect(restorer.getAccountRecord('douyin', 'legacy', 'user-a')).toBeNull()
    expect(restorer.listLoggedInAccounts('user-a')).toEqual([])
    expect(restorer.getAccountRecord('douyin', 'legacy')).not.toBeNull()
  })

  it('删除只移除指定 owner 的记录', () => {
    restorer.saveAccountRecord({ platform: 'douyin', accountId: 'shared', cookies: [{ value: 'a' }] }, 'user-a')
    restorer.saveAccountRecord({ platform: 'douyin', accountId: 'shared', cookies: [{ value: 'b' }] }, 'user-b')

    restorer.deleteAccountRecord('douyin', 'shared', 'user-a')

    expect(restorer.getAccountRecord('douyin', 'shared', 'user-a')).toBeNull()
    expect(restorer.getAccountRecord('douyin', 'shared', 'user-b')).not.toBeNull()
  })

  it('空 owner 不会被当成 legacy 或通配符', () => {
    expect(() => restorer.saveAccountRecord({ platform: 'douyin', accountId: 'x' }, '')).toThrow()
    expect(() => restorer.getAccountRecord('douyin', 'x', '')).toThrow()
  })
})
