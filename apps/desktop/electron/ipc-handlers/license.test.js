import { afterEach, describe, expect, it, vi } from 'vitest'

const registerLicenseHandlers = require('./license')

function registerAccessLevelHandler({ app, isPro = false }) {
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
    },
  )
  return listeners['auth:get-access-level']
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

  it.each([
    ['NODE_ENV', 'development'],
    ['ELECTRON_IS_DEV', '1'],
  ])('打包应用忽略 %s=%s 的管理员提权', (name, value) => {
    process.env[name] = value
    const handler = registerAccessLevelHandler({ app: { isPackaged: true }, isPro: false })
    const event = {}

    handler(event)

    expect(event.returnValue).toBe('public')
  })

  it('打包应用的专业许可证只返回 authenticated', () => {
    process.env.ELECTRON_IS_DEV = '1'
    const handler = registerAccessLevelHandler({ app: { isPackaged: true }, isPro: true })
    const event = {}

    handler(event)

    expect(event.returnValue).toBe('authenticated')
  })

  it('未打包开发应用仍可获得 admin', () => {
    process.env.NODE_ENV = 'development'
    const handler = registerAccessLevelHandler({ app: { isPackaged: false }, isPro: false })
    const event = {}

    handler(event)

    expect(event.returnValue).toBe('admin')
  })
})
