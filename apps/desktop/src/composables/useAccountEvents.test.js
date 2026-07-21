import { beforeEach, describe, expect, it, vi } from 'vitest'

const subscriptions = vi.hoisted(() => ({
  authOpened: null,
  authCompleted: null,
  authClosed: null,
  qrOpened: null,
  qrDetected: null,
  qrCompleted: null,
  qrClosed: null,
  statusChanged: null,
}))
const unsubscribers = vi.hoisted(() => Array.from({ length: 8 }, () => vi.fn()))

vi.mock('@/api/publisher', () => ({
  onAuthViewOpened: vi.fn(callback => { subscriptions.authOpened = callback; return unsubscribers[0] }),
  onAuthCompleted: vi.fn(callback => { subscriptions.authCompleted = callback; return unsubscribers[1] }),
  onAuthViewClosed: vi.fn(callback => { subscriptions.authClosed = callback; return unsubscribers[2] }),
  onQrCodeOpened: vi.fn(callback => { subscriptions.qrOpened = callback; return unsubscribers[3] }),
  onQrCodeDetected: vi.fn(callback => { subscriptions.qrDetected = callback; return unsubscribers[4] }),
  onQrCodeCompleted: vi.fn(callback => { subscriptions.qrCompleted = callback; return unsubscribers[5] }),
  onQrCodeClosed: vi.fn(callback => { subscriptions.qrClosed = callback; return unsubscribers[6] }),
  onAccountStatusChanged: vi.fn(callback => { subscriptions.statusChanged = callback; return unsubscribers[7] }),
}))

import { useAccountEvents } from './useAccountEvents.js'

describe('useAccountEvents', () => {
  beforeEach(() => {
    Object.keys(subscriptions).forEach(key => { subscriptions[key] = null })
    unsubscribers.forEach(unsubscribe => unsubscribe.mockClear())
  })

  it('统一维护网页登录与扫码登录状态', () => {
    const onCompleted = vi.fn()
    const events = useAccountEvents({ onCompleted })
    events.start()

    subscriptions.authOpened({ platform: 'zhihu' })
    expect(events.loginVisible.value).toBe(true)
    expect(events.loginMode.value).toBe('browser')
    expect(events.platform.value).toBe('zhihu')

    subscriptions.qrOpened({ platform: 'wechat_mp' })
    expect(events.loginMode.value).toBe('qrcode')
    expect(events.qrStatus.value).toBe('waiting')

    const image = { src: 'data:image/png;base64,abc', width: 180, height: 180 }
    subscriptions.qrDetected({ platform: 'wechat_mp', image })
    expect(events.qrStatus.value).toBe('detected')
    expect(events.qrImage.value).toEqual(image)

    subscriptions.qrCompleted({ platform: 'wechat_mp', accountId: 'acc-1', accountName: '公众号' })
    expect(events.loginVisible.value).toBe(false)
    expect(events.qrStatus.value).toBe('completed')
    expect(events.qrImage.value).toBeNull()
    expect(onCompleted).toHaveBeenCalledWith(
      { platform: 'wechat_mp', accountId: 'acc-1', accountName: '公众号' },
      'qrcode',
    )
  })

  it('账号状态变化交给页面刷新，start 重复调用不会重复订阅', () => {
    const onStatusChanged = vi.fn()
    const events = useAccountEvents({ onStatusChanged })

    events.start()
    events.start()
    subscriptions.statusChanged({ expiredCount: 2 })

    expect(onStatusChanged).toHaveBeenCalledWith({ expiredCount: 2 })
    expect(events.isListening.value).toBe(true)
  })

  it('为异步页面回调安装拒绝处理器并把错误交给统一边界', () => {
    let rejectHandler
    const pending = {
      catch: vi.fn(handler => { rejectHandler = handler }),
    }
    const error = new Error('刷新账号失败')
    const onError = vi.fn()
    const events = useAccountEvents({
      onCompleted: vi.fn(() => pending),
      onError,
    })
    events.start()

    subscriptions.authCompleted({ platform: 'zhihu' })

    expect(pending.catch).toHaveBeenCalledTimes(1)
    rejectHandler(error)
    expect(onError).toHaveBeenCalledWith(error, 'completed')
    expect(events.lastError.value).toBe(error)
  })

  it('stop 会释放全部订阅并重置可见状态', () => {
    const events = useAccountEvents()
    events.start()
    events.markOpening('qrcode', 'wechat_mp')

    events.stop()

    expect(unsubscribers.every(unsubscribe => unsubscribe.mock.calls.length === 1)).toBe(true)
    expect(events.isListening.value).toBe(false)
    expect(events.loginVisible.value).toBe(false)
    expect(events.loginMode.value).toBeNull()
    expect(events.qrStatus.value).toBe('idle')
  })
})
