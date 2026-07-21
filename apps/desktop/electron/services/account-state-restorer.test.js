import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as restorer from './account-state-restorer.js'

const previousUserDataDir = process.env.ELECTRON_USER_DATA_DIR
let userDataDir

afterEach(() => {
  if (previousUserDataDir === undefined) delete process.env.ELECTRON_USER_DATA_DIR
  else process.env.ELECTRON_USER_DATA_DIR = previousUserDataDir
  if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true })
  userDataDir = undefined
})

describe('account-state-restorer', () => {
  it('首次保存时无需预先初始化即可创建状态目录', () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-state-'))
    process.env.ELECTRON_USER_DATA_DIR = userDataDir

    restorer.saveAccountRecord({
      accountId: 'acct-first-save',
      platform: 'zhihu',
      accountInfo: { nickname: '知乎账号' },
    })

    const statePath = path.join(userDataDir, 'accounts', 'state.jsonl')
    expect(fs.existsSync(statePath)).toBe(true)
    expect(restorer.getAccountRecord('zhihu', 'acct-first-save')).toEqual(expect.objectContaining({
      accountId: 'acct-first-save',
      platform: 'zhihu',
    }))
  })

  it('never writes cookies or browser storage to the JSONL state file', () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-state-'))
    process.env.ELECTRON_USER_DATA_DIR = userDataDir
    restorer.init()
    restorer.saveAccountRecord({
      accountId: 'acct-1',
      platform: 'wechat_mp',
      cookies: [{ name: 'session', value: 'secret' }],
      localStorage: { token: 'private' },
      accountInfo: { nickname: '公众号' },
    })

    const state = fs.readFileSync(path.join(userDataDir, 'accounts', 'state.jsonl'), 'utf8')
    expect(state).not.toContain('secret')
    expect(state).not.toContain('localStorage')
    expect(restorer.getAccountRecord('wechat_mp', 'acct-1')).toEqual(expect.objectContaining({
      accountId: 'acct-1',
      platform: 'wechat_mp',
    }))
  })

  it('账号公开状态不会写入 accountInfo 中嵌套的敏感字段', () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-state-'))
    process.env.ELECTRON_USER_DATA_DIR = userDataDir
    restorer.init()

    restorer.saveAccountRecord({
      accountId: 'acct-public-profile',
      platform: 'wechat_mp',
      accountInfo: {
        nickName: '公众号',
        avatar: 'https://example.com/avatar.png',
        platformAccountId: 'wx-1',
        token: 'private-token',
        profile: { secret: 'nested-secret' },
      },
    })

    const state = fs.readFileSync(path.join(userDataDir, 'accounts', 'state.jsonl'), 'utf8')
    expect(state).not.toContain('private-token')
    expect(state).not.toContain('nested-secret')
    expect(restorer.getAccountRecord('wechat_mp', 'acct-public-profile')?.accountInfo).toEqual({
      nickName: '公众号',
      avatar: 'https://example.com/avatar.png',
      platformAccountId: 'wx-1',
    })
  })

  it('redacts legacy plaintext records during initialization without losing metadata', () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-state-'))
    process.env.ELECTRON_USER_DATA_DIR = userDataDir
    const dir = path.join(userDataDir, 'accounts')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'state.jsonl'), JSON.stringify({
      accountId: 'acct-legacy',
      platform: 'zhihu',
      cookies: [{ name: 'session', value: 'legacy-secret' }],
      localStorage: { token: 'legacy-private' },
      accountInfo: { nickname: '知乎' },
    }) + '\n', 'utf8')

    restorer.init()
    const state = fs.readFileSync(path.join(dir, 'state.jsonl'), 'utf8')
    expect(state).not.toContain('legacy-secret')
    expect(state).not.toContain('legacy-private')
    expect(restorer.getAccountRecord('zhihu', 'acct-legacy')).toEqual(expect.objectContaining({
      accountId: 'acct-legacy',
      platform: 'zhihu',
      accountInfo: { nickname: '知乎' },
    }))
  })

  it('按账号 ID 删除所有平台的历史状态记录', () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-state-'))
    process.env.ELECTRON_USER_DATA_DIR = userDataDir
    restorer.saveAccountRecord({ accountId: 'acct-shared', platform: 'wechat_mp', accountInfo: { name: 'A' } })
    restorer.saveAccountRecord({ accountId: 'acct-shared', platform: 'zhihu', accountInfo: { name: 'B' } })
    restorer.saveAccountRecord({ accountId: 'acct-keep', platform: 'zhihu', accountInfo: { name: 'C' } })

    expect(restorer.deleteAccountRecordsById('acct-shared')).toBe(true)
    expect(restorer.listLoggedInAccounts()).toEqual([
      expect.objectContaining({ accountId: 'acct-keep', platform: 'zhihu' }),
    ])
  })
})
