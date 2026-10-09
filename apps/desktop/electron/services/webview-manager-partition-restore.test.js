// @ts-check
/**
 * WebviewManager 账号分区凭证恢复测试（2026-10-09 快手开卡跳登录页事故回归对）
 *
 * 覆盖两条不变量：①「分区优先、快照仅按 name@domain 补缺」；②凡门控首个导航的
 * 恢复链必须带硬超时且永不 reject。
 *
 * 从 webview-manager.test.js 拆出，因为该文件已在 max-lines 测试挂账清单里（1649 行），
 * 继续堆叠会撞 TEST_LEDGER_GREW；口径见 AGENTS.md「测试文件同样要拆（按被测模块/场景分文件）」。
 * 夹具与主文件同构：loggerMock 必须跨用例为同一对象（credential-saver 等在 require 期
 * 就把 log 绑成本地引用，每轮新建 mock 会让日志断言只在单跑时成立、全量跑恒为 0 次）。
 */

__enableElectronMock()

const credentialLoadMock = vi.fn(() => null)

const loggerMock = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }

beforeEach(async () => {
  vi.resetModules()
  __resetElectronMock()
  Object.values(loggerMock).forEach(fn => fn.mockReset())
  __registerMock('./logger', loggerMock)
  __registerMock('./credential-store', { loadCredential: credentialLoadMock })
  patchViewAndSessionMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function createMainWindow () {
  return {
    isDestroyed: () => false,
    getBounds: () => ({ x: 0, y: 0, width: 1440, height: 900 }),
    // 客户区尺寸（真实 BrowserWindow 会扣除标题栏/菜单栏/边框）
    getContentBounds: () => ({ x: 8, y: 39, width: 1424, height: 861 }),
    webContents: { send: vi.fn() },
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
  }
}


function patchViewAndSessionMocks () {
  __electronMock.WebContentsView = function (opts) {
    this._opts = opts || {}
    const handlers = {}
    this.webContents = {
      _handlers: handlers,
      _windowOpenHandler: null,
      // 真实 Electron 中 webContents.session 即构造时 webPreferences.session 传入的分区，mock 必须同物挂接；
      // 否则 Cookie 提取路径在测试中永远是 undefined，吞错路径会被误放行（2026-09-22 getAll 回归教训）。
      session: (opts && opts.webPreferences && opts.webPreferences.session) || null,
      on: function (evt, fn) { handlers[evt] = fn },
      once: function () {},
      canGoBack: function () { return false },
      canGoForward: function () { return false },
      loadURL: vi.fn(function () { return Promise.resolve() }),
      executeJavaScript: vi.fn(function () { return Promise.resolve() }),
      isDestroyed: function () { return false },
      setWindowOpenHandler: function (fn) { this._windowOpenHandler = fn },
      // debugger mock：测试预设 __webContentsDebuggerFactory 返回 CDP stub；
      // 未预设时保持 undefined，等价真实环境 debugger 不可用（降级路径回归锚点）。
      debugger: (__electronMock.__webContentsDebuggerFactory ? __electronMock.__webContentsDebuggerFactory() : undefined),
    }
    this.setBounds = vi.fn()
    this.setVisible = vi.fn()
  }
  const partitions = []
  __electronMock.session._partitions = partitions
  // 测试可预设「分区残留 Cookie」：cleanSession 用例据此断言清除行为
  __electronMock.session._staleCookies = null
  __electronMock.session.fromPartition = function (partition) {
    const created = {
      partition,
      cookies: {
        // 契约：忠实镜像真实 Electron session.cookies API——只有 get/set/remove/flushStore，不存在 getAll。
        // 测试可通过 _store 预设 get() 返回值。
        setCalls: [],
        removeCalls: [],
        _store: undefined,
        set: function (cookie) { created.cookies.setCalls.push(cookie); return Promise.resolve() },
        get: function () { return Promise.resolve(created.cookies._store !== undefined ? created.cookies._store : (__electronMock.session._staleCookies || [])) },
        remove: function (url, name) { created.cookies.removeCalls.push({ url, name }); return Promise.resolve() },
        flushStore: function () { return Promise.resolve() },
      },
      on: function () {},
    }
    partitions.push(created)
    return created
  }
  return partitions
}

describe('开卡凭证恢复方向与门控超时（2026-10-09 / 2026-10-10 事故回归对）', () => {
  beforeEach(() => {
    credentialLoadMock.mockReset()
    credentialLoadMock.mockReturnValue(null)
  })

  // ─── 2026-10-09 快手开卡跳登录页事故回归对（两条不变量）───
  // 事故机理：加密快照恒旧（普通标签会话轮换不回写），旧实现把快照覆盖式写入
  // 账号分区，击穿分区实时会话 → 首开被判未登录；该失败导航被平台 Set-Cookie
  // 静默修补后"自愈"，呈现为「第一次登录页、之后正常」。
  // 旧测试套件对此结构性免疫：mock 的 cookies.get 默认返回空分区，
  // 「分区已有同名 Cookie」这一整类场景在测试里不可表示。
  it('回归（2026-10-09）：分区已有同 name+domain Cookie 时快照仅补缺、绝不覆盖', async () => {
    const partitions = patchViewAndSessionMocks()
    // 分区里已有更新鲜的同名 Cookie（平台服务端轮换产物），加密快照是陈旧值
    __electronMock.session._staleCookies = [
      { domain: '.kuaishou.com', name: 'kuaishou_sid', value: 'rotated-fresh' },
    ]
    credentialLoadMock.mockReturnValue({
      cookies: [
        { url: 'https://cp.kuaishou.com', domain: '.kuaishou.com', name: 'kuaishou_sid', value: 'stale-snapshot' },
        { url: 'https://cp.kuaishou.com', domain: '.kuaishou.com', name: 'kuaishou_extra', value: 'only-in-snapshot' },
      ],
    })
    const mod = await import('./webview-manager.js')
    const WM = mod.default || mod
    const wm = new WM()
    wm.mainWindow = createMainWindow()

    wm.createNewTabPage({ url: 'https://cp.kuaishou.com/article/publish/video', platform: 'kuaishou', accountId: 'ks-1' })
    await new Promise(resolve => setTimeout(resolve, 0))

    const created = partitions[partitions.length - 1]
    // 快照独有的 kuaishou_extra 正常补缺；分区已有的 kuaishou_sid 绝不被旧值覆盖。
    // 变异反证：实现退回「快照覆盖式写入」时，stale-snapshot 会出现在 setCalls → 本断言变红。
    expect(created.cookies.setCalls).toEqual([
      { url: 'https://cp.kuaishou.com', domain: '.kuaishou.com', name: 'kuaishou_extra', value: 'only-in-snapshot' },
    ])
    expect(created.cookies.setCalls.some(c => c.name === 'kuaishou_sid')).toBe(false)
  })

  it('回归（2026-10-09）：读分区 Cookie 失败时回退全量注入并出声（fail-open）', async () => {
    const partitions = patchViewAndSessionMocks()
    const originalFromPartition = __electronMock.session.fromPartition
    __electronMock.session.fromPartition = function (partition) {
      const created = originalFromPartition(partition)
      created.cookies.get = function () { return Promise.reject(new Error('partition-boom')) }
      return created
    }
    credentialLoadMock.mockReturnValue({
      cookies: [{ url: 'https://cp.kuaishou.com', name: 'kuaishou_sid', value: 'v1' }],
    })
    const mod = await import('./webview-manager.js')
    const WM = mod.default || mod
    const wm = new WM()
    wm.mainWindow = createMainWindow()

    wm.createNewTabPage({ url: 'https://cp.kuaishou.com/', platform: 'kuaishou', accountId: 'ks-2' })
    await new Promise(resolve => setTimeout(resolve, 0))

    const created = partitions[partitions.length - 1]
    // 读不出来就走旧行为（全量注入），「清空后首次恢复」能力不回退
    expect(created.cookies.setCalls).toEqual([{ url: 'https://cp.kuaishou.com', name: 'kuaishou_sid', value: 'v1' }])
    expect(loggerMock.warn.mock.calls.some(c => String(c[1] || '').includes('partition cookie read failed'))).toBe(true)
  })

  // ─── 门控护栏对（2026-10-10，QM-6 外部评审命中）───
  // 「读分区 → 补缺注入」被门控在首个导航之前，而账号分区的会话命令可永久挂起
  // （2026-09-24 头条事故）。没有超时护栏时症状从「首开登录页」升级成「白屏挂死」，
  // 且与 LS 注入不同——这条链原先既无时限、也不防同步抛错。
  it('回归（2026-10-10）：读分区挂起时导航仍发生（门控必须有超时）', async () => {
    const partitions = patchViewAndSessionMocks()
    const originalFromPartition = __electronMock.session.fromPartition
    __electronMock.session.fromPartition = function (partition) {
      const created = originalFromPartition(partition)
      created.cookies.get = function () { return new Promise(() => {}) }
      return created
    }
    credentialLoadMock.mockReturnValue({
      cookies: [{ url: 'https://cp.kuaishou.com', domain: '.kuaishou.com', name: 'kuaishou_sid', value: 'v' }],
    })
    process.env.MP_COOKIE_RESTORE_TIMEOUT_MS = '30'
    try {
      const mod = await import('./webview-manager.js')
      const WM = mod.default || mod
      const wm = new WM()
      wm.mainWindow = createMainWindow()
      wm.createNewTabPage({ url: 'https://cp.kuaishou.com/', platform: 'kuaishou', accountId: 'ks-3' })
      const view = wm._tabViews.get(wm._activeTabId)

      // 变异反证：摘掉超时护栏时导航被挂起的读无限期门控，本断言永不变绿（用户侧白屏）
      await new Promise(resolve => setTimeout(resolve, 300))
      expect(view.webContents.loadURL).toHaveBeenCalledWith('https://cp.kuaishou.com/')
      expect(loggerMock.warn.mock.calls.some(c => String(c[1] || '').includes('credential restore gate timed out'))).toBe(true)
      // 超时后的降级方向不是「改走全量注入」，也不是「取消注入」：挂起的链仍在后台自行收敛，
      // 但绝不再补发全量 set——分区本就是实时会话态，全量注入可能把陈旧快照盖回新鲜分区。
      expect(partitions[partitions.length - 1].cookies.setCalls).toEqual([])
    } finally {
      delete process.env.MP_COOKIE_RESTORE_TIMEOUT_MS
    }
  })

  it('回归（2026-10-10）：cookies.get 同步抛错也走全量注入回退，不得逃出建标签', async () => {
    const partitions = patchViewAndSessionMocks()
    const originalFromPartition = __electronMock.session.fromPartition
    __electronMock.session.fromPartition = function (partition) {
      const created = originalFromPartition(partition)
      created.cookies.get = function () { throw new Error('sync-boom') }
      return created
    }
    credentialLoadMock.mockReturnValue({
      cookies: [{ url: 'https://cp.kuaishou.com', name: 'kuaishou_sid', value: 'v1' }],
    })
    const mod = await import('./webview-manager.js')
    const WM = mod.default || mod
    const wm = new WM()
    wm.mainWindow = createMainWindow()

    // 变异反证：裸写 Promise.resolve(viewSession.cookies.get({})) 时同步抛错直接爆出 createNewTabPage
    expect(() => wm.createNewTabPage({ url: 'https://cp.kuaishou.com/', platform: 'kuaishou', accountId: 'ks-4' })).not.toThrow()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(partitions[partitions.length - 1].cookies.setCalls).toEqual([{ url: 'https://cp.kuaishou.com', name: 'kuaishou_sid', value: 'v1' }])
  })

  it('回归（2026-10-10）：快照无可用 Cookie 时不发起分区读（不在导航前加无谓 IPC）', async () => {
    const partitions = patchViewAndSessionMocks()
    const originalFromPartition = __electronMock.session.fromPartition
    let getCalls = 0
    __electronMock.session.fromPartition = function (partition) {
      const created = originalFromPartition(partition)
      const origGet = created.cookies.get
      created.cookies.get = function () { getCalls++; return origGet.apply(this, arguments) }
      return created
    }
    credentialLoadMock.mockReturnValue({ cookies: [] })
    const mod = await import('./webview-manager.js')
    const WM = mod.default || mod
    const wm = new WM()
    wm.mainWindow = createMainWindow()

    wm.createNewTabPage({ url: 'https://cp.kuaishou.com/', platform: 'kuaishou', accountId: 'ks-5' })
    await new Promise(resolve => setTimeout(resolve, 0))

    const created = partitions[partitions.length - 1]
    expect(getCalls).toBe(0)
    expect(created.cookies.setCalls).toEqual([])
    expect(wm._tabViews.get(wm._activeTabId).webContents.loadURL).toHaveBeenCalledWith('https://cp.kuaishou.com/')
  })

  it('回归（2026-10-10）：恢复日志的 injected 只计真正发起 set 的条数（被 normalize 判 null 的不计）', async () => {
    patchViewAndSessionMocks()
    credentialLoadMock.mockReturnValue({
      cookies: [
        { url: 'https://cp.kuaishou.com', domain: '.kuaishou.com', name: 'ok', value: 'v' },
        // value 非字符串 → normalizeElectronCookie 判 null：既不该被 set，也不该被算进 injected
        { url: 'https://cp.kuaishou.com', domain: '.kuaishou.com', name: 'broken', value: 42 },
      ],
    })
    const mod = await import('./webview-manager.js')
    const WM = mod.default || mod
    const wm = new WM()
    wm.mainWindow = createMainWindow()

    wm.createNewTabPage({ url: 'https://cp.kuaishou.com/', platform: 'kuaishou', accountId: 'ks-6' })
    await new Promise(resolve => setTimeout(resolve, 0))

    const line = loggerMock.info.mock.calls.map(c => String(c[1] || '')).find(m => m.includes('credential restore (partition-first)'))
    // 变异反证：injected 退回 credCookies.length - skipped 时记成 2 → 本断言变红
    expect(line).toContain('injected=1 skipped-existing=0')
  })

  it('回归（2026-10-10，QM-6 评审命中）：显式传入的 Cookie 注入链挂起时导航仍发生', async () => {
    const partitions = patchViewAndSessionMocks()
    const originalFromPartition = __electronMock.session.fromPartition
    __electronMock.session.fromPartition = function (partition) {
      const created = originalFromPartition(partition)
      const origSet = created.cookies.set
      created.cookies.set = function (cookie) {
        origSet.call(created.cookies, cookie)
        return new Promise(() => {})
      }
      return created
    }
    process.env.MP_COOKIE_RESTORE_TIMEOUT_MS = '30'
    try {
      const mod = await import('./webview-manager.js')
      const WM = mod.default || mod
      const wm = new WM()
      wm.mainWindow = createMainWindow()
      wm.createNewTabPage({
        url: 'https://cp.kuaishou.com/',
        platform: 'kuaishou',
        cookies: [{ url: 'https://cp.kuaishou.com/', name: 'supplied', value: 'v' }],
      })
      const view = wm._tabViews.get(wm._activeTabId)

      // 变异反证：摘掉本链的 _gateRestoreWithTimeout 时 Promise.all 永不收敛、导航被无限期门控（白屏）
      await new Promise(resolve => setTimeout(resolve, 300))
      expect(view.webContents.loadURL).toHaveBeenCalledWith('https://cp.kuaishou.com/')
      const warned = loggerMock.warn.mock.calls.map(c => String(c[1] || ''))
      expect(warned.some(m => m.includes('credential restore gate timed out') && m.includes('supplied-cookie:kuaishou:'))).toBe(true)
      expect(partitions[partitions.length - 1].cookies.setCalls.length).toBe(1)
    } finally {
      delete process.env.MP_COOKIE_RESTORE_TIMEOUT_MS
    }
  })

  it('回归（2026-10-10，QM-6 评审命中）：sameSite 已是规范化值 no_restriction 时必须直通，不得降级为 unspecified', async () => {
    const partitions = patchViewAndSessionMocks()
    const mod = await import('./webview-manager.js')
    const WM = mod.default || mod
    const wm = new WM()
    wm.mainWindow = createMainWindow()

    wm.createNewTabPage({
      url: 'https://cp.kuaishou.com/',
      platform: 'kuaishou',
      cookies: [
        // seed 侧（account-session-restore）写入分区时保留 no_restriction；开卡侧若把它降级成
        // unspecified，同一份凭证在两处的出站属性就相反——回填与实时捕获互相覆盖。
        { url: 'https://cp.kuaishou.com/', name: 'already_normalized', value: 'v', sameSite: 'no_restriction', secure: true },
        { url: 'https://cp.kuaishou.com/', name: 'from_none', value: 'v', sameSite: 'none', secure: true },
      ],
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    // 变异反证：sameSite 映射缺 no_restriction 直通分支时第一条降级为 unspecified → 本断言变红
    expect(partitions[partitions.length - 1].cookies.setCalls.map(c => c.sameSite)).toEqual(['no_restriction', 'no_restriction'])
  })
})
