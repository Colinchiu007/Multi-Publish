import { afterEach, describe, expect, it, vi } from 'vitest'

const registerLicenseHandlers = require('./license')

function registerAccessLevelHandler({ app, isPro = false, identityService }) {
  const listeners = {}
  registerLicenseHandlers(
    {
      handle: vi.fn(),
      on(channel, handler) {
        listeners[channel] = handler
      },
    },
    {
      app,
      licenseManager: { isPro: vi.fn(() => isPro) },
      identityService,
    },
  )
  return listeners['auth:get-access-level']
}

// 可信来源事件 — app:// 协议始终可信，不依赖 isPackaged
function makeTrustedEvent() {
  return { senderFrame: { url: 'app://localhost/index.html' } }
}

describe('许可证同步访问级别', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalElectronIsDev = process.env.ELECTRON_IS_DEV

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    if (originalElectronIsDev === undefined) delete process.env.ELECTRON_IS_DEV
    else process.env.ELECTRON_IS_DEV = originalElectronIsDev
  })

  it('不可信来源始终返回 public，防止外部页面探测许可证状态', () => {
    process.env.NODE_ENV = 'development'
    const handler = registerAccessLevelHandler({ app: { isPackaged: false }, isPro: true })
    const event = { senderFrame: { url: 'https://evil.example/' } }

    handler(event)

    expect(event.returnValue).toBe('public')
  })

  it.each([
    ['NODE_ENV', 'development'],
    ['ELECTRON_IS_DEV', '1'],
  ])('打包应用忽略 %s=%s 的管理员提权', (name, value) => {
    process.env[name] = value
    const handler = registerAccessLevelHandler({ app: { isPackaged: true }, isPro: false })
    const event = makeTrustedEvent()

    handler(event)

    expect(event.returnValue).toBe('public')
  })

  it('打包应用的专业许可证只返回 authenticated', () => {
    process.env.ELECTRON_IS_DEV = '1'
    const handler = registerAccessLevelHandler({ app: { isPackaged: true }, isPro: true })
    const event = makeTrustedEvent()

    handler(event)

    expect(event.returnValue).toBe('authenticated')
  })

  it('Logto 已登录时同步访问级别以身份为准，不依赖本地 license', () => {
    const handler = registerAccessLevelHandler({
      app: { isPackaged: true },
      isPro: false,
      identityService: { getState: () => ({ status: 'authenticated' }) },
    })
    const event = makeTrustedEvent()

    handler(event)

    expect(event.returnValue).toBe('authenticated')
  })

  it('Logto 已启用但已退出时本地 Pro license 不能提权', () => {
    const handler = registerAccessLevelHandler({
      app: { isPackaged: true },
      isPro: true,
      identityService: { getState: () => ({ status: 'signed_out' }) },
    })
    const event = makeTrustedEvent()

    handler(event)

    expect(event.returnValue).toBe('public')
  })

  it('未打包开发应用仍可获得 admin', () => {
    process.env.NODE_ENV = 'development'
    const handler = registerAccessLevelHandler({ app: { isPackaged: false }, isPro: false })
    const event = makeTrustedEvent()

    handler(event)

    expect(event.returnValue).toBe('admin')
  })
})
