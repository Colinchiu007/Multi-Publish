// @ts-check
/**
 * WebviewManager 虚拟登录标签测试（对齐蚁小二全屏登录体验）
 *
 * 场景：账号管理-添加账号-选择平台-打开登录页 → 登录视图以全屏标签
 * 形式呈现在 TabBar 中（而非弹窗），关闭后回退到之前的标签。
 */
const { getPlatformName } = require('@multi-publish/shared-utils/src/platform-definitions')

__enableElectronMock()

let WebviewManager, AUTH_TAB_ID
const credentialLoadMock = vi.fn(() => null)

beforeEach(async () => {
  vi.resetModules()
  __resetElectronMock()
  __registerMock('./logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
  __registerMock('./credential-store', { loadCredential: credentialLoadMock })
  patchViewAndSessionMocks()
  const mod = await import('./webview-manager.js')
  WebviewManager = mod.default || mod
  AUTH_TAB_ID = mod.AUTH_TAB_ID
})

afterEach(() => {
  vi.restoreAllMocks()
})

function createMainWindow () {
  return {
    isDestroyed: () => false,
    getBounds: () => ({ x: 0, y: 0, width: 1440, height: 900 }),
    webContents: { send: vi.fn() },
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
  }
}

function createBrowserView () {
  return {
    setVisible: vi.fn(),
    setBounds: vi.fn(),
    webContents: { close: vi.fn() }
  }
}

function createManagerWithBrowserTab () {
  const wm = new WebviewManager()
  wm.mainWindow = createMainWindow()
  wm._subscribers.add('test-subscriber')
  const view = createBrowserView()
  wm._tabViews.set('btab-1', view)
  wm._tabStates.set('btab-1', {
    url: 'https://creator.douyin.com/',
    title: '抖音创作者中心',
    loading: false,
    canGoBack: false,
    canGoForward: false
  })
  wm._activeTabId = 'btab-1'
  wm._homeTabId = 'home'
  return { wm, view }
}

function createFakeAuthViewManager () {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    onOpened: null,
    onClosed: null,
    _onWindowResize: vi.fn()
  }
}

describe('WebviewManager 虚拟登录标签（蚁小二对标）', () => {
  it('attachAuthViewManager 绑定开关钩子', () => {
    const wm = new WebviewManager()
    const auth = createFakeAuthViewManager()

    wm.attachAuthViewManager(auth)

    expect(typeof auth.onOpened).toBe('function')
    expect(typeof auth.onClosed).toBe('function')
  })

  it('登录视图打开 → 注入虚拟登录标签并广播 tab-created/tab-switched', () => {
    const { wm, view } = createManagerWithBrowserTab()
    const auth = createFakeAuthViewManager()
    wm.attachAuthViewManager(auth)

    auth.onOpened({ platform: 'douyin', accountId: null, url: 'https://creator.douyin.com/' })

    // 浏览器标签被隐藏
    expect(view.setVisible).toHaveBeenCalledWith(false)
    // 活动标签切换为登录标签
    expect(wm._activeTabId).toBe(AUTH_TAB_ID)
    // 广播事件
    const sends = wm.mainWindow.webContents.send.mock.calls.map(c => c[0])
    expect(sends).toContain('page-manager:tab-created')
    expect(sends).toContain('page-manager:tab-switched')
    const switched = wm.mainWindow.webContents.send.mock.calls.find(c => c[0] === 'page-manager:tab-switched')
    expect(switched[1].data).toMatchObject({
      tabId: AUTH_TAB_ID,
      url: 'https://creator.douyin.com/',
      title: getPlatformName('douyin') + '登录',
      isLogin: true
    })
  })

  it('getAllTabs/getActiveTab 包含登录标签（isLogin:true）', () => {
    const { wm } = createManagerWithBrowserTab()
    const auth = createFakeAuthViewManager()
    wm.attachAuthViewManager(auth)

    auth.onOpened({ platform: 'douyin', accountId: null, url: 'https://creator.douyin.com/' })

    const all = wm.getAllTabs()
    const loginTab = all.find(t => t.tabId === AUTH_TAB_ID)
    expect(loginTab).toMatchObject({
      isLogin: true,
      isActive: true,
      isHome: false,
      title: getPlatformName('douyin') + '登录'
    })

    const active = wm.getActiveTab()
    expect(active.tabId).toBe(AUTH_TAB_ID)
    expect(active.isLogin).toBe(true)
  })

  it('登录视图关闭 → 移除登录标签并回退到之前的浏览器标签', () => {
    const { wm, view } = createManagerWithBrowserTab()
    const auth = createFakeAuthViewManager()
    wm.attachAuthViewManager(auth)

    auth.onOpened({ platform: 'douyin', accountId: null, url: 'https://creator.douyin.com/' })
    wm.mainWindow.webContents.send.mockClear()
    auth.onClosed()

    expect(wm._authTabInfo).toBeNull()
    expect(wm.getAllTabs().find(t => t.tabId === AUTH_TAB_ID)).toBeUndefined()
    // 回退到之前的浏览器标签并重新显示
    expect(wm._activeTabId).toBe('btab-1')
    expect(view.setVisible).toHaveBeenLastCalledWith(true)
    const sends = wm.mainWindow.webContents.send.mock.calls.map(c => c[0])
    expect(sends).toContain('page-manager:tab-closed')
    expect(sends).toContain('page-manager:tab-switched')
  })

  it('登录视图关闭且无之前标签 → 回退到首页', () => {
    const wm = new WebviewManager()
    wm.mainWindow = createMainWindow()
    wm._subscribers.add('test-subscriber')
    wm._homeTabId = 'home'
    wm._activeTabId = 'home'
    const auth = createFakeAuthViewManager()
    wm.attachAuthViewManager(auth)

    auth.onOpened({ platform: 'douyin', accountId: null, url: 'https://creator.douyin.com/' })
    auth.onClosed()

    expect(wm._activeTabId).toBe('home')
    const switched = wm.mainWindow.webContents.send.mock.calls
      .filter(c => c[0] === 'page-manager:tab-switched')
      .pop()
    expect(switched[1].data.tabId).toBe('home')
  })

  it('switchToTab(登录标签) 显示登录视图并隐藏浏览器标签', () => {
    const { wm, view } = createManagerWithBrowserTab()
    const auth = createFakeAuthViewManager()
    wm.attachAuthViewManager(auth)
    auth.onOpened({ platform: 'douyin', accountId: null, url: 'https://creator.douyin.com/' })

    // 先切到浏览器标签（登录视图应被隐藏）
    wm.switchToTab('btab-1')
    expect(auth.hide).toHaveBeenCalled()
    expect(wm._activeTabId).toBe('btab-1')

    // 再切回登录标签
    const result = wm.switchToTab(AUTH_TAB_ID)
    expect(result).toBe(true)
    expect(auth.show).toHaveBeenCalled()
    expect(view.setVisible).toHaveBeenLastCalledWith(false)
    expect(wm._activeTabId).toBe(AUTH_TAB_ID)
  })

  it('登录标签不存在时 switchToTab(AUTH_TAB_ID) 返回 false', () => {
    const { wm } = createManagerWithBrowserTab()
    const auth = createFakeAuthViewManager()
    wm.attachAuthViewManager(auth)

    expect(wm.switchToTab(AUTH_TAB_ID)).toBe(false)
    expect(auth.show).not.toHaveBeenCalled()
  })

  it('closeTab(登录标签) 委托 authViewManager.close() 结束登录会话', () => {
    const { wm } = createManagerWithBrowserTab()
    const auth = createFakeAuthViewManager()
    wm.attachAuthViewManager(auth)
    auth.onOpened({ platform: 'douyin', accountId: null, url: 'https://creator.douyin.com/' })

    const result = wm.closeTab(AUTH_TAB_ID)
    expect(result).toBe(true)
    expect(auth.close).toHaveBeenCalledTimes(1)
  })

  it('切换到首页时隐藏登录视图', () => {
    const { wm } = createManagerWithBrowserTab()
    const auth = createFakeAuthViewManager()
    wm.attachAuthViewManager(auth)
    auth.onOpened({ platform: 'douyin', accountId: null, url: 'https://creator.douyin.com/' })

    wm.switchToTab('home')
    expect(auth.hide).toHaveBeenCalled()
    expect(wm._activeTabId).toBe('home')
  })

  it('登录标签活动态下 resize 由 AuthViewManager 重新定位', () => {
    const { wm } = createManagerWithBrowserTab()
    const auth = createFakeAuthViewManager()
    wm.attachAuthViewManager(auth)
    auth.onOpened({ platform: 'douyin', accountId: null, url: 'https://creator.douyin.com/' })

    wm.resize()
    expect(auth._onWindowResize).toHaveBeenCalled()
  })

  it('未挂载 AuthViewManager 时登录标签相关操作安全降级', () => {
    const { wm } = createManagerWithBrowserTab()

    expect(wm.switchToTab(AUTH_TAB_ID)).toBe(false)
    expect(wm.closeTab(AUTH_TAB_ID)).toBe(false)
    expect(() => wm.resize()).not.toThrow()
    expect(wm.getAllTabs().find(t => t.tabId === AUTH_TAB_ID)).toBeUndefined()
  })
})

function patchViewAndSessionMocks () {
  __electronMock.WebContentsView = function (opts) {
    this._opts = opts || {}
    const handlers = {}
    this.webContents = {
      _handlers: handlers,
      on: function (evt, fn) { handlers[evt] = fn },
      once: function () {},
      canGoBack: function () { return false },
      canGoForward: function () { return false },
      loadURL: vi.fn(function () { return Promise.resolve() }),
      executeJavaScript: vi.fn(function () { return Promise.resolve() }),
      isDestroyed: function () { return false },
    }
    this.setBounds = vi.fn()
    this.setVisible = vi.fn()
  }
  const partitions = []
  __electronMock.session._partitions = partitions
  __electronMock.session.fromPartition = function (partition) {
    const created = {
      partition,
      cookies: {
        setCalls: [],
        set: function (cookie) { created.cookies.setCalls.push(cookie); return Promise.resolve() },
        get: function () { return Promise.resolve([]) },
      },
      on: function () {},
    }
    partitions.push(created)
    return created
  }
  return partitions
}

describe('WebviewManager.createNewTabPage 账号登录态恢复', () => {
  beforeEach(() => {
    credentialLoadMock.mockReset()
    credentialLoadMock.mockReturnValue(null)
  })

  it('带 accountId 时使用按账号持久分区并从加密凭证恢复 Cookie', async () => {
    const partitions = patchViewAndSessionMocks()
    credentialLoadMock.mockReturnValue({
      cookies: [{ url: 'https://www.zhihu.com', name: 'session', value: 'abc' }],
      localStorage: { token: 'xyz' },
    })
    const mod = await import('./webview-manager.js')
    const WM = mod.default || mod
    const wm = new WM()
    wm.mainWindow = createMainWindow()

    const tabId = wm.createNewTabPage({ url: 'https://creator.zhihu.com', accountId: 'account-1' })

    expect(tabId).toBeTruthy()
    expect(credentialLoadMock).toHaveBeenCalledWith('account-1', expect.any(String))
    const created = partitions[partitions.length - 1]
    expect(created.partition).toBe('persist:account-account-1')
    expect(created.cookies.setCalls).toEqual([{ url: 'https://www.zhihu.com', name: 'session', value: 'abc' }])
  })

  it('凭证缺少 url 的 Cookie 以初始页面 URL 补齐后再注入', async () => {
    const partitions = patchViewAndSessionMocks()
    credentialLoadMock.mockReturnValue({ cookies: [{ name: 'sid', value: 'v1' }] })
    const mod = await import('./webview-manager.js')
    const WM = mod.default || mod
    const wm = new WM()
    wm.mainWindow = createMainWindow()

    wm.createNewTabPage({ url: 'https://creator.douyin.com', accountId: 'acc_2' })

    const created = partitions[partitions.length - 1]
    expect(created.cookies.setCalls).toEqual([{ url: 'https://creator.douyin.com', name: 'sid', value: 'v1' }])
  })

  it('页面加载完成后恢复凭证中的 localStorage', async () => {
    patchViewAndSessionMocks()
    credentialLoadMock.mockReturnValue({ localStorage: { token: 'xyz' } })
    const mod = await import('./webview-manager.js')
    const WM = mod.default || mod
    const wm = new WM()
    wm.mainWindow = createMainWindow()

    wm.createNewTabPage({ url: 'https://creator.zhihu.com', accountId: 'account-1' })

    const activeView = wm._tabViews.get(wm._activeTabId)
    activeView.webContents._handlers['did-finish-load']()
    expect(activeView.webContents.executeJavaScript).toHaveBeenCalled()
    const script = activeView.webContents.executeJavaScript.mock.calls[0][0]
    expect(script).toContain('"token":"xyz"')
  })

  it('无 accountId 时保持一次性浏览分区且不读取凭证', async () => {
    const partitions = patchViewAndSessionMocks()
    const mod = await import('./webview-manager.js')
    const WM = mod.default || mod
    const wm = new WM()
    wm.mainWindow = createMainWindow()

    wm.createNewTabPage({ url: 'https://www.baidu.com' })

    expect(credentialLoadMock).not.toHaveBeenCalled()
    const created = partitions[partitions.length - 1]
    expect(created.partition).toMatch(/^persist:browse-btab-\d+$/)
  })

  it('非法 accountId 或凭证读取失败时静默降级，不阻塞标签创建', async () => {
    const partitions = patchViewAndSessionMocks()
    const mod = await import('./webview-manager.js')
    const WM = mod.default || mod
    const wm = new WM()
    wm.mainWindow = createMainWindow()

    // 非法 accountId → 降级为一次性浏览分区，不读取凭证
    const fallbackTabId = wm.createNewTabPage({ url: 'https://creator.zhihu.com', accountId: 'bad/../id' })
    expect(fallbackTabId).toBeTruthy()
    expect(credentialLoadMock).not.toHaveBeenCalled()
    expect(partitions[partitions.length - 1].partition).toMatch(/^persist:browse-btab-\d+$/)

    // 合法 accountId 但凭证解密失败 → 仍创建账号分区标签，只是无 Cookie 注入
    credentialLoadMock.mockReset()
    credentialLoadMock.mockImplementation(() => { throw new Error('decrypt failed') })
    const tabId = wm.createNewTabPage({ url: 'https://creator.zhihu.com', accountId: 'account-1' })
    expect(tabId).toBeTruthy()
    const created = partitions[partitions.length - 1]
    expect(created.partition).toBe('persist:account-account-1')
    expect(created.cookies.setCalls).toEqual([])
  })
})
