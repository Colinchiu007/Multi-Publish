import { beforeEach, describe, expect, it, vi } from 'vitest'

__enableElectronMock()

const supportsApi = vi.fn()
const shouldUseApi = vi.fn()
const publishViaApi = vi.fn()

__registerMock('@multi-publish/api-publish-engine', {
  supportsApi,
  publishViaApi,
  apiRouter: { shouldUseApi },
})

let RpaViewManager

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  const module = await import('./rpa-view-manager.js')
  RpaViewManager = module.default || module
})

describe('RpaViewManager API 路由', () => {
  it('平台配置与适配器同时允许时优先走 API', async () => {
    shouldUseApi.mockReturnValue(true)
    supportsApi.mockReturnValue(true)
    publishViaApi.mockResolvedValue({ success: true, publishId: 'api-1' })
    const manager = new RpaViewManager()

    await expect(manager.publish(
      'weibo',
      { title: '标题' },
      { cookies: [{ name: 'session', value: 'secret' }] },
      1000,
    )).resolves.toEqual({ success: true, publishId: 'api-1' })

    expect(shouldUseApi).toHaveBeenCalledWith('weibo')
    expect(publishViaApi).toHaveBeenCalledTimes(1)
  })

  it('has_api 关闭时即使存在适配器也直接走 RPA', async () => {
    shouldUseApi.mockReturnValue(false)
    supportsApi.mockReturnValue(true)
    const manager = new RpaViewManager()
    const win = { destroy: vi.fn() }
    vi.spyOn(manager, '_createWindow').mockReturnValue(win)
    vi.spyOn(manager, '_publish_wechat_mp').mockResolvedValue({ success: true, platform: 'wechat_mp' })

    await expect(manager.publish('wechat_mp', { accountId: 'acc-1' }, {}, 1000))
      .resolves.toEqual({ success: true, platform: 'wechat_mp' })

    expect(publishViaApi).not.toHaveBeenCalled()
    expect(manager._createWindow).toHaveBeenCalledTimes(1)
  })

  it('账号绑定代理时跳过 API，并在恢复凭证前设置 Electron 代理', async () => {
    shouldUseApi.mockReturnValue(true)
    supportsApi.mockReturnValue(true)
    const manager = new RpaViewManager()
    const events = []
    const win = {
      destroy: vi.fn(),
      webContents: {
        session: { setProxy: vi.fn(async () => { events.push('proxy') }) },
      },
    }
    vi.spyOn(manager, '_createWindow').mockReturnValue(win)
    vi.spyOn(manager, '_restoreCookies').mockImplementation(async () => { events.push('cookies') })
    vi.spyOn(manager, '_publish_wechat_mp').mockImplementation(async () => {
      events.push('publish')
      return { success: true, platform: 'wechat_mp' }
    })

    await expect(manager.publish(
      'wechat_mp',
      { accountId: 'acc-proxy' },
      {
        cookies: [{ name: 'sid', value: 'secret', domain: '.mp.weixin.qq.com' }],
        proxy: { host: '127.0.0.1', port: 8080, type: 'http' },
      },
      1000,
    )).resolves.toEqual({ success: true, platform: 'wechat_mp' })

    expect(publishViaApi).not.toHaveBeenCalled()
    expect(win.webContents.session.setProxy).toHaveBeenCalledWith({ proxyRules: 'http://127.0.0.1:8080' })
    expect(events).toEqual(['proxy', 'cookies', 'publish'])
  })

  it('在平台认证来源加载完成后恢复 localStorage 和 IndexedDB', async () => {
    shouldUseApi.mockReturnValue(false)
    supportsApi.mockReturnValue(false)
    const events = []
    const handlers = []
    const win = {
      destroy: vi.fn(),
      webContents: {
        session: { cookies: { set: vi.fn() } },
        once: vi.fn((_event, handler) => handlers.push(handler)),
        loadURL: vi.fn(async (url) => {
          events.push('load:' + url)
          await Promise.all(handlers.splice(0).map(handler => handler()))
        }),
        executeJavaScript: vi.fn(async (script) => {
          events.push(script.includes('localStorage.setItem') ? 'local-storage' : 'indexed-db')
        }),
      },
    }
    const manager = new RpaViewManager()
    vi.spyOn(manager, '_createWindow').mockReturnValue(win)
    vi.spyOn(manager, '_publish_wechat_mp').mockImplementation(async () => {
      events.push('publish')
      return { success: true, platform: 'wechat_mp' }
    })

    await expect(manager.publish(
      'wechat_mp',
      { accountId: 'acc-storage' },
      { localStorage: { token: 'private' }, indexedDB: { auth: { tokens: [] } } },
      1000,
    )).resolves.toEqual({ success: true, platform: 'wechat_mp' })

    expect(events).toEqual([
      'load:https://mp.weixin.qq.com/',
      'local-storage',
      'indexed-db',
      'publish',
    ])
  })

  it('代理设置失败时中止发布，不能回退为直连', async () => {
    shouldUseApi.mockReturnValue(true)
    supportsApi.mockReturnValue(true)
    const manager = new RpaViewManager()
    const win = {
      destroy: vi.fn(),
      webContents: { session: { setProxy: vi.fn(async () => { throw new Error('代理不可用') }) } },
    }
    vi.spyOn(manager, '_createWindow').mockReturnValue(win)
    const publishSpy = vi.spyOn(manager, '_publish_wechat_mp')

    await expect(manager.publish(
      'wechat_mp',
      { accountId: 'acc-proxy' },
      { proxy: { host: '127.0.0.1', port: 8080, type: 'http' } },
      1000,
    )).resolves.toMatchObject({ success: false, error: '代理不可用' })

    expect(publishViaApi).not.toHaveBeenCalled()
    expect(publishSpy).not.toHaveBeenCalled()
  })
})
