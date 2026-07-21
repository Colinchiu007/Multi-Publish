__enableElectronMock()

describe('identity IPC', () => {
  it('注册状态、登录、切换和退出通道并返回脱敏结果', async () => {
    const registerIdentityHandlers = require('./identity')
    const handlers = {}
    const authService = {
      getState: vi.fn(() => ({ status: 'signed_out', user: null })),
      signIn: vi.fn(async () => ({ status: 'authenticated', user: { sub: 'sub-1' } })),
      switchAccount: vi.fn(async () => ({ status: 'authenticated', user: { sub: 'sub-2' } })),
      signOut: vi.fn(async () => ({ status: 'signed_out', user: null })),
    }
    registerIdentityHandlers({ handle: (channel, handler) => { handlers[channel] = handler } }, { authService })
    const event = { senderFrame: { url: 'app://localhost/index.html' } }

    await expect(handlers['identity:get-state'](event)).resolves.toEqual({ code: 0, data: { status: 'signed_out', user: null } })
    await expect(handlers['identity:sign-in'](event)).resolves.toMatchObject({ code: 0, data: { status: 'authenticated' } })
    await expect(handlers['identity:switch-account'](event)).resolves.toMatchObject({ code: 0, data: { user: { sub: 'sub-2' } } })
    await expect(handlers['identity:sign-out'](event)).resolves.toMatchObject({ code: 0, data: { status: 'signed_out' } })
    expect(authService.signIn).toHaveBeenCalledTimes(1)
    expect(authService.switchAccount).toHaveBeenCalledTimes(1)
    expect(authService.signOut).toHaveBeenCalledTimes(1)
  })

  it('不可信 sender 不能触发登录', async () => {
    const registerIdentityHandlers = require('./identity')
    const authService = { signIn: vi.fn() }
    const handlers = {}
    registerIdentityHandlers({ handle: (channel, handler) => { handlers[channel] = handler } }, { authService })
    await expect(handlers['identity:sign-in']({ senderFrame: { url: 'https://evil.example' } }))
      .resolves.toMatchObject({ code: -3 })
    expect(authService.signIn).not.toHaveBeenCalled()
  })

  it('身份服务未配置时返回稳定的禁用错误码', async () => {
    const registerIdentityHandlers = require('./identity')
    const handlers = {}
    registerIdentityHandlers({ handle: (channel, handler) => { handlers[channel] = handler } })
    const event = { senderFrame: { url: 'app://localhost/index.html' } }

    await expect(handlers['identity:get-state'](event)).resolves.toMatchObject({
      code: 0,
      data: { status: 'disabled' },
    })
    await expect(handlers['identity:sign-in'](event)).resolves.toMatchObject({
      message: 'IDENTITY_NOT_CONFIGURED',
    })
    await expect(handlers['identity:switch-account'](event)).resolves.toMatchObject({
      message: 'IDENTITY_NOT_CONFIGURED',
    })
  })

  it('状态读取异常时返回脱敏的统一错误响应', async () => {
    const registerIdentityHandlers = require('./identity')
    const handlers = {}
    const authService = {
      getState: vi.fn(() => {
        throw Object.assign(new Error('内部状态不可用'), { code: 'IDENTITY_STATE_UNAVAILABLE' })
      }),
    }
    registerIdentityHandlers({ handle: (channel, handler) => { handlers[channel] = handler } }, { authService })

    await expect(handlers['identity:get-state']({ senderFrame: { url: 'app://localhost/index.html' } }))
      .resolves.toEqual({ code: -3, message: 'IDENTITY_STATE_UNAVAILABLE' })
  })
})
