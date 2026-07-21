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
})
