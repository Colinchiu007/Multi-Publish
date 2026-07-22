function createFakeWindowClass() {
  const instances = []
  class FakeBrowserWindow {
    constructor(options) {
      this.options = options
      this.handlers = new Map()
      this.webContents = {
        on: (event, handler) => this.handlers.set(`webContents:${event}`, handler),
        setWindowOpenHandler: (handler) => { this.windowOpenHandler = handler },
        loadURL: vi.fn(async (url) => { this.loadedUrl = url }),
        isDestroyed: () => this.closed,
      }
      this.closed = false
      this.handlers.set('ready-to-show', null)
      instances.push(this)
    }

    once(event, handler) { this.handlers.set(event, handler) }
    show() { this.shown = true }
    close() {
      if (this.closed) return
      this.closed = true
      this.handlers.get('closed')?.()
    }
    emit(event, ...args) { this.handlers.get(event)?.(...args) }
  }
  return { FakeBrowserWindow, instances }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('IdentityAuthWindow', () => {
  let fake
  let shell
  let authSession

  beforeEach(() => {
    fake = createFakeWindowClass()
    shell = { openExternal: vi.fn(async () => {}) }
    authSession = {
      id: 'isolated-logto-session',
      on: vi.fn(),
      removeListener: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
    }
  })

  it('创建隔离、安全且稳定尺寸的认证窗口，并在 ready-to-show 后展示', async () => {
    const { IdentityAuthWindow } = require('./identity-auth-window')
    const authWindow = new IdentityAuthWindow({
      endpoint: 'https://auth.example.com',
      redirectUri: 'http://127.0.0.1:16526/auth/callback',
      BrowserWindow: fake.FakeBrowserWindow,
      session: { fromPartition: vi.fn(() => authSession) },
      shell,
      getParentWindow: () => ({ id: 'main-window' }),
    })

    await authWindow.open('https://auth.example.com/oidc/auth?state=abc')
    const window = fake.instances[0]
    expect(window.options).toMatchObject({
      width: 520,
      height: 720,
      show: false,
      modal: true,
      parent: { id: 'main-window' },
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: authSession,
      },
    })
    expect(window.options.webPreferences).not.toHaveProperty('preload')
    expect(window.shown).toBeFalsy()
    window.emit('ready-to-show')
    expect(window.shown).toBe(true)
  })

  it('只允许 Logto issuer 与固定回调地址，阻止任意导航并拒绝新窗口', async () => {
    const { IdentityAuthWindow } = require('./identity-auth-window')
    const authWindow = new IdentityAuthWindow({
      endpoint: 'https://auth.example.com',
      redirectUri: 'http://127.0.0.1:16526/auth/callback',
      BrowserWindow: fake.FakeBrowserWindow,
      session: { fromPartition: vi.fn(() => authSession) },
      shell,
    })
    const authorizationUrl = 'https://auth.example.com/sign-in?state=state-1'
    await authWindow.open(authorizationUrl)
    const window = fake.instances[0]
    const navigate = window.handlers.get('webContents:will-navigate')
    const blocked = { preventDefault: vi.fn() }
    navigate(blocked, 'https://evil.example/phish')
    expect(blocked.preventDefault).toHaveBeenCalledTimes(1)
    expect(shell.openExternal).toHaveBeenCalledWith(authorizationUrl)
    expect(window.windowOpenHandler({ url: 'https://evil.example/new-window' })).toEqual({ action: 'deny' })
    expect(window.windowOpenHandler({ url: 'https://auth.example.com/account' })).toEqual({ action: 'deny' })
    const permissionHandler = authSession.setPermissionRequestHandler.mock.calls[0][0]
    const permissionDecision = vi.fn()
    permissionHandler(null, 'media', permissionDecision)
    expect(permissionDecision).toHaveBeenCalledWith(false)
    const downloadHandler = authSession.on.mock.calls.find(([event]) => event === 'will-download')[1]
    const downloadEvent = { preventDefault: vi.fn() }
    downloadHandler(downloadEvent)
    expect(downloadEvent.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('页面加载失败时关闭认证窗口并返回脱敏错误', async () => {
    const { IdentityAuthWindow } = require('./identity-auth-window')
    const loadError = new Error('ERR_CONNECTION_RESET https://secret.example')
    const failingFake = createFakeWindowClass()
    class FailingWindow extends failingFake.FakeBrowserWindow {
      constructor(options) {
        super(options)
        this.webContents.loadURL = vi.fn(async () => { throw loadError })
      }
    }
    const failing = new IdentityAuthWindow({
      endpoint: 'https://auth.example.com',
      redirectUri: 'http://127.0.0.1:16526/auth/callback',
      BrowserWindow: FailingWindow,
      session: { fromPartition: vi.fn(() => authSession) },
      shell,
    })
    await expect(failing.open('https://auth.example.com/sign-in')).rejects.toMatchObject({
      code: 'IDENTITY_AUTH_WINDOW_LOAD_FAILED',
      message: 'IDENTITY_AUTH_WINDOW_LOAD_FAILED: 登录页面加载失败',
    })
    expect(failingFake.instances[0].closed).toBe(true)
  })

  it('允许回调导航，关闭窗口时通知等待方并可安全重复关闭', async () => {
    const { IdentityAuthWindow } = require('./identity-auth-window')
    const authWindow = new IdentityAuthWindow({
      endpoint: 'https://auth.example.com',
      redirectUri: 'http://127.0.0.1:16526/auth/callback',
      BrowserWindow: fake.FakeBrowserWindow,
      session: { fromPartition: vi.fn(() => authSession) },
      shell,
    })
    await authWindow.open('https://auth.example.com/sign-in')
    const window = fake.instances[0]
    const navigate = window.handlers.get('webContents:will-navigate')
    const callbackEvent = { preventDefault: vi.fn() }
    navigate(callbackEvent, 'http://127.0.0.1:16526/auth/callback?code=x&state=y')
    expect(callbackEvent.preventDefault).not.toHaveBeenCalled()
    const closed = authWindow.waitForClosed()
    authWindow.close()
    await expect(closed).resolves.toBeUndefined()
    expect(authSession.removeListener).toHaveBeenCalledWith('will-download', expect.any(Function))
    expect(() => authWindow.close()).not.toThrow()
  })

  it('旧窗口延迟加载失败不会误关后续认证窗口', async () => {
    const { IdentityAuthWindow } = require('./identity-auth-window')
    const loads = [deferred(), deferred()]
    let index = 0
    class DelayedWindow extends fake.FakeBrowserWindow {
      constructor(options) {
        super(options)
        const load = loads[index++]
        this.webContents.loadURL = vi.fn(() => load.promise)
      }
    }
    const authWindow = new IdentityAuthWindow({
      endpoint: 'https://auth.example.com',
      redirectUri: 'http://127.0.0.1:16526/auth/callback',
      BrowserWindow: DelayedWindow,
      session: { fromPartition: vi.fn(() => authSession) },
      shell,
    })

    const firstOpen = authWindow.open('https://auth.example.com/sign-in?attempt=1')
    while (fake.instances.length < 1) await Promise.resolve()
    const secondOpen = authWindow.open('https://auth.example.com/sign-in?attempt=2')
    while (fake.instances.length < 2) await Promise.resolve()
    loads[0].reject(new Error('旧窗口加载失败'))
    await expect(firstOpen).resolves.toBeUndefined()
    loads[1].resolve()
    await expect(secondOpen).resolves.toBeUndefined()
    expect(fake.instances[0].closed).toBe(true)
    expect(fake.instances[1].closed).toBe(false)
  })
})
