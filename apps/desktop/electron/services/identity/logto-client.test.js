describe('createLogtoClient', () => {
  it('以 Native public client 配置 SDK 并使用系统浏览器导航', async () => {
    const opened = []
    const constructed = []
    class FakeClient {
      constructor(config, adapter) { constructed.push({ config, adapter }) }
    }
    const { createLogtoClient } = require('./logto-client')
    const storage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }
    const client = await createLogtoClient({
      endpoint: 'https://id.example.com/', appId: 'native-app', resource: 'https://api.multi-publish.com',
      scopes: ['profile:read'], storage, shell: { openExternal: async (url) => opened.push(url) },
      loadModule: async () => ({ default: FakeClient, createRequester: (fn) => fn }),
    })

    expect(client).toBeInstanceOf(FakeClient)
    expect(constructed[0].config).toEqual({ endpoint: 'https://id.example.com', appId: 'native-app', resources: ['https://api.multi-publish.com'], scopes: ['profile:read'] })
    expect(constructed[0].config).not.toHaveProperty('appSecret')
    const preparedState = client.prepareSignInState()
    expect(preparedState).toMatch(/^[A-Za-z0-9_-]{16,}$/)
    expect(await constructed[0].adapter.generateState()).toBe(preparedState)
    expect(await constructed[0].adapter.generateState()).not.toBe(preparedState)
    await constructed[0].adapter.navigate('https://id.example.com/oidc/auth', { for: 'sign-in' })
    expect(opened).toEqual(['https://id.example.com/oidc/auth'])
    expect(constructed[0].adapter.storage).toBe(storage)
  })

  it('配置认证窗口时优先在应用内导航，并暴露关闭/取消钩子', async () => {
    const navigated = []
    const authWindow = {
      open: vi.fn(async (url, parameters) => { navigated.push({ url, parameters }) }),
      close: vi.fn(async () => {}),
      waitForClosed: vi.fn(() => new Promise(() => {})),
    }
    class FakeClient { constructor(config, adapter) { this.adapter = adapter } }
    const { createLogtoClient } = require('./logto-client')
    const client = await createLogtoClient({
      endpoint: 'https://id.example.com', appId: 'native-app', resource: 'https://api.multi-publish.com',
      authWindow,
      storage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
      loadModule: async () => ({ default: FakeClient, createRequester: (fn) => fn }),
      shell: { openExternal: vi.fn() },
    })
    await client.adapter.navigate('https://id.example.com/oidc/auth', { for: 'sign-in' })
    expect(navigated).toEqual([{ url: 'https://id.example.com/oidc/auth', parameters: { for: 'sign-in' } }])
    await client.closeSignInWindow()
    expect(authWindow.close).toHaveBeenCalledTimes(1)
    expect(client.waitForSignInWindowClosed()).toBeInstanceOf(Promise)
  })

  it('缺少 endpoint/appId/resource 时拒绝启动', async () => {
    const { createLogtoClient } = require('./logto-client')
    await expect(createLogtoClient({ endpoint: '', appId: '', resource: '' })).rejects.toMatchObject({ code: 'IDENTITY_CONFIG_INVALID' })
  })

  it('生产身份端点拒绝明文 HTTP，避免授权码或 Token 泄露', async () => {
    const { createLogtoClient } = require('./logto-client')
    await expect(createLogtoClient({
      endpoint: 'http://id.example.com', appId: 'native-app', resource: 'https://api.multi-publish.com',
    })).rejects.toMatchObject({ code: 'IDENTITY_CONFIG_INVALID' })
  })

  it('本机开发 Logto 端点允许回环 HTTP', async () => {
    const { createLogtoClient } = require('./logto-client')
    class FakeClient { constructor() {} }
    await expect(createLogtoClient({
      endpoint: 'http://127.0.0.1:3001', appId: 'native-app', resource: 'https://api.multi-publish.com',
      loadModule: async () => ({ default: FakeClient, createRequester: (fn) => fn }),
      storage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
      fetcher: async () => ({ ok: true }),
      shell: { openExternal: async () => {} },
    })).resolves.toBeInstanceOf(FakeClient)
  })
})
