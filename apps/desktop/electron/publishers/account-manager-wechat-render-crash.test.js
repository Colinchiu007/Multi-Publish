// @ts-check
/**
 * 复现并回归 2026-10-06 事故：wechat_mp（微信公众号）账号有 Cookie、但 HTTP 登录检测
 * inconclusive（实测：redirect to /cgi-bin/home?token=... — 判 inconclusive → 回退浏览器）时，
 * 旧实现 fallthrough 到隐藏 sandbox 窗口 DOM 检测，mp.weixin.qq.com 触发原生渲染崩溃
 * （crashpad not connected，Electron 主进程 exit code 0xC0000005 / 0xFFFF7003），
 * 整个应用在启动期批量登录校验阶段退出，导致所有 CDP E2E 连带失败。
 *
 * 与 toutiao 事故（account-manager-toutiao-render-crash.test.js）同源同类，
 * 差别只在崩溃码从 0xFFFF7003 观测为 0xC0000005（ACCESS_VIOLATION）。
 * 修复：把 wechat_mp 纳入「即将开隐藏浏览器」这一步的渲染崩溃守卫，
 * HTTP 不确定时判未确认（INCONCLUSIVE），绝不开会崩的隐藏窗口。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const modulePath = './account-manager'

function loadAccountManager () {
  delete require.cache[require.resolve(modulePath)]
  return require(modulePath)
}

describe('checkLoginStatus 渲染崩溃保护（wechat_mp 隐藏窗口原生崩溃）', () => {
  beforeEach(() => {
    global.__enableElectronMock()
    global.__resetElectronMock()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('wechat_mp 有 Cookie 且 HTTP 检测不确定时，不开隐藏浏览器、不返回浏览器判定的成功', async () => {
    const playwrightPath = require.resolve('../services/playwright-manager')
    const httpCheckerPath = require.resolve('./http-login-checker')
    const actualPlaywrightManager = require(playwrightPath)
    const actualHttpChecker = require(httpCheckerPath)

    // getContext 若被调用即代表走了会崩溃的隐藏窗口路径；用抛错实现来暴露它。
    const getContext = vi.fn(() => { throw new Error('RENDER_CRASH_PRONE: hidden browser must not be opened for wechat_mp') })
    global.__registerMock(playwrightPath, { getContext })
    // 实测形态：redirect 命中但判 inconclusive，返回 null 迫使代码在
    // 「降级浏览器」与「判未确认」间二选一。
    global.__registerMock(httpCheckerPath, { tryHttpLoginCheck: vi.fn().mockResolvedValue(null) })

    try {
      const accountManager = loadAccountManager()
      vi.spyOn(accountManager.credentialStore, 'loadCredential').mockReturnValue({
        platform: 'wechat_mp',
        cookies: [{ name: 'slave_sid', value: 's3cr3t', domain: 'mp.weixin.qq.com' }],
        localStorage: { token: '1015618563' },
        accountInfo: {},
      })
      vi.spyOn(accountManager.accountStateRestorer, 'getAccountRecord').mockReturnValue({ platform: 'wechat_mp', status: 'active' })

      const result = await accountManager.checkLoginStatus('wechat_mp', 'wechat-crash-acc')

      // 核心安全不变量：绝不打开会崩溃的隐藏窗口
      expect(getContext).not.toHaveBeenCalled()
      // 且不得返回由浏览器 DOM 检测判定的成功
      expect(result.code).not.toBe('CHECK_LOGIN_SUCCESS')
    } finally {
      global.__registerMock(playwrightPath, actualPlaywrightManager)
      global.__registerMock(httpCheckerPath, actualHttpChecker)
    }
  })

  it('baijiahao 有 Cookie 但 HTTP 检测不支持时，不开隐藏浏览器（2026-10-06 原生崩溃）', async () => {
    const playwrightPath = require.resolve('../services/playwright-manager')
    const httpCheckerPath = require.resolve('./http-login-checker')
    const actualPlaywrightManager = require(playwrightPath)
    const actualHttpChecker = require(httpCheckerPath)

    // baijiahao 未注册 HTTP_CHECK_APIS（http-login-checker.js:64-260 无该键），
    // tryHttpLoginCheck 恒返回 null —— 浏览器降级是它唯一的检测路径，也因此每次
    // 启动批量校验都开隐藏窗口并触发原生崩溃。
    const getContext = vi.fn(() => { throw new Error('RENDER_CRASH_PRONE: hidden browser must not be opened for baijiahao') })
    global.__registerMock(playwrightPath, { getContext })
    global.__registerMock(httpCheckerPath, { tryHttpLoginCheck: vi.fn().mockResolvedValue(null) })

    try {
      const accountManager = loadAccountManager()
      vi.spyOn(accountManager.credentialStore, 'loadCredential').mockReturnValue({
        platform: 'baijiahao',
        cookies: [{ name: 'BAIDUID', value: 's3cr3t', domain: '.baidu.com' }],
        localStorage: {},
        accountInfo: {},
      })
      vi.spyOn(accountManager.accountStateRestorer, 'getAccountRecord').mockReturnValue({ platform: 'baijiahao', status: 'active' })

      const result = await accountManager.checkLoginStatus('baijiahao', 'bjh-crash-acc')

      expect(getContext).not.toHaveBeenCalled()
      expect(result.code).not.toBe('CHECK_LOGIN_SUCCESS')
    } finally {
      global.__registerMock(playwrightPath, actualPlaywrightManager)
      global.__registerMock(httpCheckerPath, actualHttpChecker)
    }
  })

  it('wechat_mp 走 HTTP 检测确定有效时，返回 HTTP 结果且不开隐藏浏览器', async () => {
    const playwrightPath = require.resolve('../services/playwright-manager')
    const httpCheckerPath = require.resolve('./http-login-checker')
    const actualPlaywrightManager = require(playwrightPath)
    const actualHttpChecker = require(httpCheckerPath)

    const getContext = vi.fn(() => { throw new Error('RENDER_CRASH_PRONE: hidden browser must not be opened for wechat_mp') })
    global.__registerMock(playwrightPath, { getContext })
    global.__registerMock(httpCheckerPath, { tryHttpLoginCheck: vi.fn().mockResolvedValue({ valid: true, code: 'CHECK_LOGIN_SUCCESS_HTTP_API' }) })

    try {
      const accountManager = loadAccountManager()
      vi.spyOn(accountManager.credentialStore, 'loadCredential').mockReturnValue({
        platform: 'wechat_mp',
        cookies: [{ name: 'slave_sid', value: 's3cr3t', domain: 'mp.weixin.qq.com' }],
        localStorage: {},
        accountInfo: {},
      })
      vi.spyOn(accountManager.accountStateRestorer, 'getAccountRecord').mockReturnValue({ platform: 'wechat_mp', status: 'active' })

      const result = await accountManager.checkLoginStatus('wechat_mp', 'wechat-http-acc')
      // HTTP 确定有效即返回 HTTP 结果（不进浏览器分支）
      expect(result.code).toBe('CHECK_LOGIN_SUCCESS_HTTP_API')
      expect(result.valid).toBe(true)
      expect(getContext).not.toHaveBeenCalled()
    } finally {
      global.__registerMock(playwrightPath, actualPlaywrightManager)
      global.__registerMock(httpCheckerPath, actualHttpChecker)
    }
  })
})
