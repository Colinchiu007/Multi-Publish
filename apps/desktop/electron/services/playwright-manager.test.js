import { afterEach, describe, expect, it, vi } from 'vitest'

__enableElectronMock()

let playwrightManager

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  __resetElectronMock()
})

describe('playwright-manager 会话隔离', () => {
  it('按调用用途控制兼容窗口是否可见', async () => {
    const module = await import('./playwright-manager.js')
    playwrightManager = module.default || module

    const visiblePage = (await playwrightManager.getContext({ show: true })).newPage()
    const hiddenPage = (await playwrightManager.getContext({ show: false })).newPage()

    expect(visiblePage._win._opts.show).toBe(true)
    expect(hiddenPage._win._opts.show).toBe(false)
  })

  it('每个兼容上下文使用独立的非持久 session', async () => {
    const partitions = []
    __electronMock.session.fromPartition = vi.fn(partition => {
      partitions.push(partition)
      return { cookies: { get: vi.fn(), set: vi.fn() } }
    })
    const module = await import('./playwright-manager.js')
    playwrightManager = module.default || module

    const firstContext = await playwrightManager.getContext()
    const secondContext = await playwrightManager.getContext()
    const firstPage = firstContext.newPage()
    const secondPage = secondContext.newPage()

    expect(partitions).toHaveLength(2)
    expect(new Set(partitions).size).toBe(2)
    expect(partitions.every(partition => !partition.startsWith('persist:'))).toBe(true)
    expect(firstPage._win._opts.webPreferences.session).not.toBe(secondPage._win._opts.webPreferences.session)
  })

  it('提供 account:add 依赖的 evaluate、waitForFunction 和元素查询接口', async () => {
    const isolatedSession = { cookies: { get: vi.fn().mockResolvedValue([]), set: vi.fn() } }
    __electronMock.session.fromPartition = vi.fn(() => isolatedSession)
    const module = await import('./playwright-manager.js')
    playwrightManager = module.default || module
    const page = (await playwrightManager.getContext()).newPage()
    page._win.webContents.session = isolatedSession
    page._win.webContents.executeJavaScript = vi.fn()
      .mockResolvedValueOnce({ token: 'secret' })
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce('公众号账号')

    await expect(page.evaluate(() => ({ token: localStorage.getItem('token') })))
      .resolves.toEqual({ token: 'secret' })
    await expect(page.waitForFunction(
      loginHost => window.location.host !== loginHost,
      'mp.weixin.qq.com',
      { timeout: 100, polling: 1 },
    )).resolves.toBe(true)

    const element = await page.$('.weui-desktop-account__name')
    expect(element).not.toBeNull()
    await expect(element.textContent()).resolves.toBe('公众号账号')
  })

  it('把 Playwright Cookie 正确转换为 Electron Cookie 并可逆读取', async () => {
    const cookieSet = vi.fn().mockResolvedValue(undefined)
    const isolatedSession = {
      cookies: {
        set: cookieSet,
        get: vi.fn().mockResolvedValue([{
          name: 'session',
          value: 'secret',
          domain: '.mp.weixin.qq.com',
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'lax',
          expirationDate: 1893456000,
        }]),
      },
    }
    __electronMock.session.fromPartition = vi.fn(() => isolatedSession)
    const module = await import('./playwright-manager.js')
    playwrightManager = module.default || module
    const context = await playwrightManager.getContext()
    const page = context.newPage()
    page._win.webContents.session = isolatedSession

    await page.context().addCookies([{
      name: 'session',
      value: 'secret',
      domain: '.mp.weixin.qq.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      expires: 1893456000,
    }])

    expect(cookieSet).toHaveBeenCalledWith({
      url: 'https://mp.weixin.qq.com/',
      name: 'session',
      value: 'secret',
      domain: '.mp.weixin.qq.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      expirationDate: 1893456000,
    })
    await expect(context.cookies()).resolves.toEqual([{
      name: 'session',
      value: 'secret',
      domain: '.mp.weixin.qq.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      expires: 1893456000,
    }])
  })
})
