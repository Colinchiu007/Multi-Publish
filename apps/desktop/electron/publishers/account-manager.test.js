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
    expect(hasCredential).toHaveBeenCalledWith('account-1', expectedDir)
  })
})
