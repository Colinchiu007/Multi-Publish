import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

__enableElectronMock()

let AuthViewManager

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  __resetElectronMock()
  const module = await import('./auth-view-manager.js')
  AuthViewManager = module.default || module
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function createView(cookies = [], localStorage = {}) {
  return {
    webContents: {
      session: { cookies: { get: vi.fn().mockResolvedValue(cookies) } },
      executeJavaScript: vi.fn(script => Promise.resolve(
        script.includes('__auth_helper__') ? localStorage : '测试账号',
      )),
      close: vi.fn(),
    },
  }
}

function createMainWindow() {
  return {
    getBounds: () => ({ width: 1440, height: 900 }),
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
    contentView: { removeChildView: vi.fn() },
  }
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('AuthViewManager 凭证边界', () => {
  it('恶意外部 URL 不能触发登录完成提取', async () => {
    const manager = new AuthViewManager()
    manager.currentPlatform = 'wechat_mp'
    manager.currentView = createView()
    manager._resolveLogin = vi.fn()
    const extract = vi.spyOn(manager, '_extractAuthData')

    manager._checkLoginCompleted('https://evil.example/?next=mp.weixin.qq.com/cgi-bin/home')
    await vi.advanceTimersByTimeAsync(3500)

    expect(extract).not.toHaveBeenCalled()
    expect(manager._resolveLogin).not.toHaveBeenCalled()
  })

  it('只提取当前平台域名范围内的 Cookie', async () => {
    const manager = new AuthViewManager()
    const view = createView([
      { name: 'valid', value: '1', domain: '.mp.weixin.qq.com' },
      { name: 'invalid', value: '2', domain: '.evil.example' },
    ])

    await expect(manager._extractAuthData(view, 'wechat_mp')).resolves.toEqual({
      cookies: [{ name: 'valid', value: '1', domain: '.mp.weixin.qq.com' }],
      name: '测试账号',
      localStorage: {},
    })
  })

  it('用户确认完成登录后由主进程提取凭证并结束当前会话', async () => {
    const manager = new AuthViewManager()
    const view = createView([{ name: 'session', value: '1', domain: '.mp.weixin.qq.com' }])
    const resolveLogin = vi.fn()
    manager.mainWindow = createMainWindow()
    manager.currentView = view
    manager.currentPlatform = 'wechat_mp'
    manager.currentAccountId = 'auth-wechat_mp-1'
    manager._resolveLogin = resolveLogin

    await expect(manager.completeLogin()).resolves.toBe(true)

    expect(resolveLogin).toHaveBeenCalledWith({
      cookies: [{ name: 'session', value: '1', domain: '.mp.weixin.qq.com' }],
      name: '测试账号',
      localStorage: {},
    })
    expect(manager.currentView).toBeNull()
    expect(manager.mainWindow.webContents.send).toHaveBeenCalledWith('auth:view-closed')
  })

  it('只有 localStorage 凭证的平台也能完成登录', async () => {
    const manager = new AuthViewManager()
    const view = createView([], { accessToken: 'token-value' })
    const resolveLogin = vi.fn()
    manager.mainWindow = createMainWindow()
    manager.currentView = view
    manager.currentPlatform = 'wechat_mp'
    manager.currentAccountId = 'auth-wechat_mp-storage'
    manager._resolveLogin = resolveLogin

    await expect(manager.completeLogin()).resolves.toBe(true)
    expect(resolveLogin).toHaveBeenCalledWith({
      cookies: [],
      name: '测试账号',
      localStorage: { accessToken: 'token-value' },
    })
  })

  it('并发确认同一登录会话时只完成一次', async () => {
    const manager = new AuthViewManager()
    const deferred = createDeferred()
    const view = createView([{ name: 'session', value: '1', domain: '.mp.weixin.qq.com' }])
    const resolveLogin = vi.fn()
    manager.mainWindow = createMainWindow()
    manager.currentView = view
    manager.currentPlatform = 'wechat_mp'
    manager.currentAccountId = 'auth-wechat_mp-1'
    manager._resolveLogin = resolveLogin
    vi.spyOn(manager, '_extractAuthData').mockReturnValue(deferred.promise)

    const first = manager.completeLogin()
    const second = manager.completeLogin()
    deferred.resolve({
      cookies: [{ name: 'session', value: '1', domain: '.mp.weixin.qq.com' }],
      name: '测试账号',
    })

    const results = await Promise.allSettled([first, second])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(resolveLogin).toHaveBeenCalledTimes(1)
  })

  it('重复成功导航只安排一次凭证提取', async () => {
    const manager = new AuthViewManager()
    const view = createView()
    manager.mainWindow = createMainWindow()
    manager.currentView = view
    manager.currentPlatform = 'wechat_mp'
    manager.currentAccountId = 'auth-wechat_mp-1'
    manager._resolveLogin = vi.fn()
    const extract = vi.spyOn(manager, '_extractAuthData').mockResolvedValue({ cookies: [], name: '' })

    const successUrl = 'https://mp.weixin.qq.com/cgi-bin/home?t=home/index'
    manager._checkLoginCompleted(successUrl)
    manager._checkLoginCompleted(successUrl)
    await vi.advanceTimersByTimeAsync(3000)

    expect(extract).toHaveBeenCalledTimes(1)
  })

  it('旧会话已开始的异步提取不能完成后续新会话', async () => {
    const manager = new AuthViewManager()
    const deferred = createDeferred()
    const oldView = createView()
    const oldResolve = vi.fn()
    manager.mainWindow = createMainWindow()
    manager.currentView = oldView
    manager.currentPlatform = 'wechat_mp'
    manager.currentAccountId = 'auth-wechat_mp-old'
    manager._resolveLogin = oldResolve
    const extract = vi.spyOn(manager, '_extractAuthData').mockReturnValue(deferred.promise)

    manager._checkLoginCompleted('https://mp.weixin.qq.com/cgi-bin/home?t=home/index')
    vi.advanceTimersByTime(3000)
    expect(extract).toHaveBeenCalledWith(oldView, 'wechat_mp')

    manager.close()
    const newView = createView()
    const newResolve = vi.fn()
    manager.currentView = newView
    manager.currentPlatform = 'wechat_mp'
    manager.currentAccountId = 'auth-wechat_mp-new'
    manager._resolveLogin = newResolve

    deferred.resolve({
      cookies: [{ name: 'old-session', value: '1', domain: '.mp.weixin.qq.com' }],
      name: '旧账号',
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(oldResolve).toHaveBeenCalledOnce()
    expect(oldResolve).toHaveBeenCalledWith({ cancelled: true })
    expect(newResolve).not.toHaveBeenCalled()
    expect(manager.currentView).toBe(newView)
  })

  it('旧视图迟到的成功事件不能替新会话安排凭证提取', async () => {
    const manager = new AuthViewManager()
    manager.mainWindow = createMainWindow()
    manager.currentView = createView()
    manager.currentPlatform = 'wechat_mp'
    manager.currentAccountId = 'auth-wechat_mp-old'
    manager._resolveLogin = vi.fn()
    const oldAttempt = manager._getLoginAttempt()

    manager.close()
    manager.currentView = createView()
    manager.currentPlatform = 'wechat_mp'
    manager.currentAccountId = 'auth-wechat_mp-new'
    manager._resolveLogin = vi.fn()
    manager._getLoginAttempt()
    const extract = vi.spyOn(manager, '_extractAuthData')

    manager._checkLoginCompleted(
      'https://mp.weixin.qq.com/cgi-bin/home?t=home/index',
      oldAttempt,
    )
    manager._scheduleAutoCompletion('cdp', oldAttempt)
    await vi.advanceTimersByTimeAsync(3500)

    expect(extract).not.toHaveBeenCalled()
    expect(manager._urlExtractTimer).toBeFalsy()
    expect(manager._cdpExtractTimer).toBeFalsy()
  })

  it('没有活动登录页时拒绝完成登录', async () => {
    const manager = new AuthViewManager()
    await expect(manager.completeLogin()).rejects.toThrow('没有正在进行的网页登录')
  })

  it('登录视图为主内容授权栏保留空间，并响应侧栏断点', () => {
    const manager = new AuthViewManager()
    const setBounds = vi.fn()
    manager.currentView = { setBounds }

    manager._positionView({ width: 1440, height: 900 })
    expect(setBounds).toHaveBeenLastCalledWith({ x: 280, y: 100, width: 1160, height: 800 })

    manager._positionView({ width: 1200, height: 800 })
    expect(setBounds).toHaveBeenLastCalledWith({ x: 0, y: 100, width: 1200, height: 700 })
  })
})
