import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * account:credential-names 诊断通道契约
 *
 * 这个接口唯一的存在理由：**只输出 Cookie 名、永不输出 value**，
 * 让主进程内能确认「发布链所需凭据是否存在」，而不必在进程外硬解 DPAPI。
 *
 * 安全不变量（任一被破坏即视为漏洞）：
 *   1. 响应里绝不出现任何 cookie 的 value
 *   2. 缺必需凭据时必须显式报 missing，不能靠「整体看起来有 cookie」糊弄
 *   3. 解密失败必须如实报错，不能当「无 cookie」
 *   4. platform / accountId 走既有安全路径校验
 */
const { registerCredentialDiagnostics, REQUIRED_COOKIE_MARKERS } = require('../ipc-handlers/account-credential-diagnostics')

const OK = 0
const VALIDATION_ERROR = 'VALIDATION_ERROR'
const REQUEST_ERROR = 'REQUEST_ERROR'

function setup ({ cookies, loadError } = {}) {
  const handlers = {}
  const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn } }
  const deps = {
    AccountManager: {
      loadSavedCredentials: vi.fn(() => {
        if (loadError) throw loadError
        return { cookies }
      }),
    },
    credentialStore: {},
  }
  registerCredentialDiagnostics({
    deps,
    ipcMain,
    withSenderCheck: (fn) => fn,
    EC: { VALIDATION_ERROR, REQUEST_ERROR },
    ipcLog: vi.fn(),
  })
  return handlers
}

describe('account:credential-names（只输出 cookie 名）', () => {
  it('回传 names/present/missing，且**不含任何 value**', async () => {
    const handlers = setup({
      cookies: [
        { name: 'a1', value: 'SECRET-A1-VALUE' },
        { name: 'access-token-creator.xiaohongshu.com', value: 'SECRET-AT-VALUE' },
        { name: 'web_session', value: 'SECRET-WS' },
      ],
    })
    const res = await handlers['account:credential-names']({}, { platform: 'xiaohongshu', accountId: 'a1eac276' })

    expect(res.code).toBe(OK)
    expect(res.data.count).toBe(3)
    expect(res.data.names).toEqual(['a1', 'access-token-creator.xiaohongshu.com', 'web_session'])
    expect(res.data.present).toEqual({ a1: true, 'access-token-creator.xiaohongshu.com': true })
    expect(res.data.missing).toEqual([])

    // 安全不变量：整个响应序列化后不得出现任一 secret 片段
    const serialized = JSON.stringify(res)
    expect(serialized).not.toContain('SECRET-A1-VALUE')
    expect(serialized).not.toContain('SECRET-AT-VALUE')
    expect(serialized).not.toContain('SECRET-WS')
    expect(serialized).not.toContain('value')
  })

  it('缺 AT token 时必须显式报 missing（不得因「有其它 cookie」而看起来齐全）', async () => {
    const handlers = setup({
      cookies: [{ name: 'a1', value: 'SECRET-A1' }, { name: 'web_session', value: 'SECRET-WS' }],
    })
    const res = await handlers['account:credential-names']({}, { platform: 'xiaohongshu', accountId: 'acc-1' })

    expect(res.code).toBe(OK)
    expect(res.data.present.a1).toBe(true)
    expect(res.data.present['access-token-creator.xiaohongshu.com']).toBe(false)
    expect(res.data.missing).toEqual(['access-token-creator.xiaohongshu.com'])
  })

  it('解密失败必须如实报错，不能当「无 cookie」', async () => {
    const handlers = setup({ loadError: new Error('DPAPI unprotect failed') })
    const res = await handlers['account:credential-names']({}, { platform: 'xiaohongshu', accountId: 'acc-1' })
    expect(res.code).toBe(REQUEST_ERROR)
    expect(res.data.readable).toBe(false)
  })

  it('platform / accountId 非法一律拒绝（走既有安全路径校验）', async () => {
    const handlers = setup({ cookies: [{ name: 'a1', value: 'x' }] })
    for (const bad of [
      { platform: '../etc', accountId: 'acc' },
      { platform: 'xiaohongshu', accountId: 'a/b' },
      { platform: '', accountId: '' },
      {},
    ]) {
      const res = await handlers['account:credential-names']({}, bad)
      expect(res.code).toBe(VALIDATION_ERROR)
      expect(res.data.names).toEqual([])
    }
  })

  it('REQUIRED_COOKIE_MARKERS 必须覆盖 xiaohongshu 发布链的两个硬凭据', () => {
    expect(REQUIRED_COOKIE_MARKERS.xiaohongshu).toEqual(
      expect.arrayContaining(['a1', 'access-token-creator.xiaohongshu.com']),
    )
  })
})