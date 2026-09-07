// @ts-check
/**
 * RpaViewManager session mixin — cookie 恢复逻辑回归测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

__enableElectronMock()

let sessionMixin

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  sessionMixin = require('./rpa-view-session')
})

function createWin () {
  const setCookie = vi.fn().mockResolvedValue(undefined)
  const win = {
    webContents: {
      session: { cookies: { set: setCookie } },
    },
  }
  return { win, setCookie }
}

describe('rpa-view-session — _restoreCookies', () => {
  it('无 domain/url 的 cookie 按平台默认域名补 url 恢复', async () => {
    const { win, setCookie } = createWin()
    const cookies = [
      { name: 'token', value: 'abc', secure: true },
      { name: 'sid', value: 'xyz' },
    ]
    await sessionMixin._restoreCookies.call({}, win, cookies, 'wechat_mp')

    expect(setCookie).toHaveBeenCalledTimes(2)
    expect(setCookie).toHaveBeenCalledWith(expect.objectContaining({
      name: 'token',
      value: 'abc',
      url: 'https://mp.weixin.qq.com/',
    }))
    expect(setCookie).toHaveBeenCalledWith(expect.objectContaining({
      name: 'sid',
      value: 'xyz',
      url: 'https://mp.weixin.qq.com/',
    }))
  })

  it('未知平台且无 domain/url 的 cookie 被跳过', async () => {
    const { win, setCookie } = createWin()
    await sessionMixin._restoreCookies.call({}, win, [{ name: 'x', value: 'y' }], 'unknown_platform')
    expect(setCookie).not.toHaveBeenCalled()
  })

  it('有 domain 的 cookie 保持原 domain 恢复', async () => {
    const { win, setCookie } = createWin()
    await sessionMixin._restoreCookies.call({}, win, [
      { name: 'bduss', value: 'v', domain: '.baidu.com', secure: true },
    ], 'baijiahao')
    expect(setCookie).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://baidu.com/',
      domain: '.baidu.com',
    }))
  })
})

describe('rpa-view-session — _restoreAuthPartitionCookies 前缀匹配', () => {
  function mockFs (dirs) {
    const fs = require('fs')
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      const s = String(p).replace(/\\/g, '/')
      return s.endsWith('/Partitions')
    })
    vi.spyOn(fs, 'readdirSync').mockReturnValue(dirs)
    vi.spyOn(fs, 'statSync').mockImplementation(() => ({ isDirectory: () => true }))
  }

  function mockSession (cookieCount) {
    const cookies = Array.from({ length: cookieCount }, (_, i) => ({
      name: 'c' + i,
      value: 'v' + i,
      domain: '.mp.weixin.qq.com',
      secure: true,
    }))
    const electron = require('electron')
    electron.session.fromPartition = vi.fn(() => ({
      cookies: {
        get: vi.fn().mockResolvedValue(cookies),
        set: vi.fn().mockResolvedValue(undefined),
      },
    }))
  }

  it('匹配 auth-{accountId} 格式分区（auth-auth-wechat_mp-*）', async () => {
    mockFs(['auth-auth-wechat_mp-1788773549544', 'other-dir'])
    mockSession(3)
    const { win, setCookie } = createWin()
    const restored = await sessionMixin._restoreAuthPartitionCookies.call({}, win, 'wechat_mp', 'auth-wechat_mp-1788773549544')
    expect(restored).toBe(3)
    expect(setCookie).toHaveBeenCalledTimes(3)
  })

  it('匹配 account-{accountId} 格式分区', async () => {
    mockFs(['account-acc-1', 'browse-tab-1'])
    mockSession(2)
    const { win, setCookie } = createWin()
    const restored = await sessionMixin._restoreAuthPartitionCookies.call({}, win, 'wechat_mp', 'acc-1')
    expect(restored).toBe(2)
    expect(setCookie).toHaveBeenCalledTimes(2)
  })

  it('无匹配分区时返回 0', async () => {
    mockFs(['browse-tab-1', 'other'])
    mockSession(0)
    const restored = await sessionMixin._restoreAuthPartitionCookies.call({}, createWin().win, 'wechat_mp', 'acc-1')
    expect(restored).toBe(0)
  })
})
