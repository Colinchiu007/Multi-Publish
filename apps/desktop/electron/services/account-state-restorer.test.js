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

  it('相同账号 ID 在不同 owner 下隔离查询和删除', () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-state-'))
    process.env.ELECTRON_USER_DATA_DIR = userDataDir
    restorer.saveAccountRecord({ accountId: 'acct-shared', platform: 'douyin', accountInfo: { name: 'A' } }, 'user-a')
    restorer.saveAccountRecord({ accountId: 'acct-shared', platform: 'douyin', accountInfo: { name: 'B' } }, 'user-b')

    expect(restorer.getAccountRecord('douyin', 'acct-shared', 'user-a').accountInfo).toEqual({ name: 'A' })
    expect(restorer.getAccountRecord('douyin', 'acct-shared', 'user-b').accountInfo).toEqual({ name: 'B' })
    expect(restorer.listLoggedInAccounts('user-a')).toEqual([
      expect.objectContaining({ accountId: 'acct-shared', owner_subject: 'user-a' }),
    ])
    expect(restorer.deleteAccountRecordsById('acct-shared', 'user-a')).toBe(true)
    expect(restorer.getAccountRecord('douyin', 'acct-shared', 'user-a')).toBeNull()
    expect(restorer.getAccountRecord('douyin', 'acct-shared', 'user-b')).not.toBeNull()
  })

  it('显式非法 owner 不会被吞掉并回退到 legacy 数据', () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-state-'))
    process.env.ELECTRON_USER_DATA_DIR = userDataDir

    expect(() => restorer.saveAccountRecord({ accountId: 'acct', platform: 'douyin' }, null)).toThrow('登录会话缺少用户标识')
    expect(() => restorer.getAccountRecord('douyin', 'acct', null)).toThrow('登录会话缺少用户标识')
    expect(() => restorer.deleteAccountRecord('douyin', 'acct', null)).toThrow('登录会话缺少用户标识')
    expect(() => restorer.deleteAccountRecordsById('acct', null)).toThrow('登录会话缺少用户标识')
    expect(() => restorer.listLoggedInAccounts(null)).toThrow('登录会话缺少用户标识')
  })

  it('purgeExpired 继续支持显式 userDataDir', () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-state-'))
    const stateDir = path.join(userDataDir, 'accounts')
    fs.mkdirSync(stateDir, { recursive: true })
    fs.writeFileSync(path.join(stateDir, 'state.jsonl'), [
      JSON.stringify({ accountId: 'old', platform: 'douyin', timestamp: 0 }),
      JSON.stringify({ accountId: 'new', platform: 'douyin', timestamp: Date.now() }),
    ].join('\n') + '\n')

    expect(restorer.purgeExpired(90, userDataDir)).toBe(1)
    expect(fs.readFileSync(path.join(stateDir, 'state.jsonl'), 'utf8')).not.toContain('"old"')
  })
})
