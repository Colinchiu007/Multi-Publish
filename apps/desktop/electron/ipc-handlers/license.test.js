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
    // 生产模式：不可信来源返回 public
    process.env.NODE_ENV = 'production'
    const handler = registerAccessLevelHandler({ app: { isPackaged: true }, isPro: true })
    const event = { senderFrame: { url: 'https://evil.example/' } }

    handler(event)

    expect(event.returnValue).toBe('public')
  })

  // Bug fix (QM-5) 回归保护：开发模式 admin 短路必须优先于 isTrustedSender
  // 之前同步 IPC 没有复用异步 IPC 的 dev 短路，导致开发环境下 preload sendSync 拿到 'public'，
  // authenticated 级别方法（storeGetPublishStats / onRenderProgress 等）被错误拦截。
  it('开发模式 + app.isPackaged=false → admin 短路优先，不依赖 isTrustedSender', () => {
    process.env.NODE_ENV = 'development'
    const handler = registerAccessLevelHandler({ app: { isPackaged: false }, isPro: false })
    // 即使来源不可信，开发模式短路也应该返回 admin
    const event = { senderFrame: { url: 'https://evil.example/' } }

    handler(event)

    expect(event.returnValue).toBe('admin')
  })

  it('开发模式 + ELECTRON_IS_DEV=1 + 未打包 → admin 短路', () => {
    process.env.ELECTRON_IS_DEV = '1'
    delete process.env.NODE_ENV
    const handler = registerAccessLevelHandler({ app: { isPackaged: false }, isPro: false })
    const event = { senderFrame: { url: 'http://localhost:5174/' } }

    handler(event)

    expect(event.returnValue).toBe('admin')
  })

  it('生产模式 + app.isPackaged=true → 不走 dev 短路，走 isTrustedSender', () => {
    process.env.NODE_ENV = 'production'
    const handler = registerAccessLevelHandler({ app: { isPackaged: true }, isPro: false })
    // app:// 协议可信
    const event = makeTrustedEvent()

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

// 2026-10-07 新增：license:activate 的打包态拒收。
//
// 逃逸分析：`licenseManager.activate(key)` 原本只对 key 做 `trim()`，没有任何
// 有效性校验——输入 `a` / `随便什么字符串` / `"   "` 一律返回 true，并写入
// type=pro + expiresAt=null（永不过期）+ 8 项 PRO_FEATURES。而 preload 通过
// contextBridge 把 licenseActivate 暴露给渲染层，`UpgradeModal` 的激活码输入框
// 在正式包可见 ⇒ 任意字符串即可白嫖永久 Pro。
//
// 本文件此前 8 条用例全测访问级别，`activate()` 本身零覆盖 —— 这就是逃逸路径。
describe('license:activate 打包态拒收（P0 权限泄漏）', () => {
  function makeHandlers({ isPackaged, activateImpl }) {
    const listeners = {}
    __registerMock('electron', { app: { isPackaged } })
    const licenseManager = {
      isPro: vi.fn(() => false),
      getInfo: vi.fn(() => ({ type: 'free' })),
      activate: vi.fn(activateImpl || (() => true)),
      deactivate: vi.fn(),
      activateTrial: vi.fn(),
    }
    registerLicenseHandlers(
      // license.js 用 `ipcMain.handle(...)` 注册业务通道，只有 `auth:get-access-level`
      // 走 `on(...)`。两个都要接到 listeners，否则 `listeners['license:activate']`
      // 是 undefined（首次 CI 就是这么红的：TypeError: handler is not a function）。
      { handle: (ch, h) => { listeners[ch] = h }, on: (ch, h) => { listeners[ch] = h } },
      { app: { isPackaged }, licenseManager, identityService: undefined },
    )
    return { handler: listeners['license:activate'], licenseManager }
  }

  it('正式构建（isPackaged=true）拒收，且不触碰 licenseManager.activate', async () => {
    const { handler, licenseManager } = makeHandlers({ isPackaged: true })
    const r = await handler(makeTrustedEvent(), 'MP-ANY-KEY')
    expect(r.code).not.toBe(0)
    expect(r.data).toBe(false)
    expect(r.message).toContain('账号核销')
    expect(licenseManager.activate).not.toHaveBeenCalled()
  })

  it('只有明确 false 才放行——undefined 同样拒收', async () => {
    // `app.isPackaged !== false` 是严格不等：undefined 属「非明确开发态」必须拒收。
    const { handler, licenseManager } = makeHandlers({ isPackaged: undefined })
    const r = await handler(makeTrustedEvent(), 'MP-ANY-KEY')
    expect(r.code).not.toBe(0)
    expect(licenseManager.activate).not.toHaveBeenCalled()
  })

  it('开发构建（isPackaged=false）才走到 licenseManager.activate', async () => {
    const { handler, licenseManager } = makeHandlers({ isPackaged: false })
    const r = await handler(makeTrustedEvent(), 'MP-DEV-KEY')
    expect(licenseManager.activate).toHaveBeenCalledWith('MP-DEV-KEY')
    expect(r.code).toBe(0)
  })

  it('拦截优先于 key 校验：任意 key 都先被拒（含空白）', async () => {
    // 若把 key 校验挪到拦截之前，空白 key 会先返回「激活失败」，反而暴露了
    // 校验分支的存在。此处锁定判断顺序。
    const { handler, licenseManager } = makeHandlers({ isPackaged: true })
    const r = await handler(makeTrustedEvent(), '   ')
    expect(r.message).toContain('账号核销')
    expect(licenseManager.activate).not.toHaveBeenCalled()
  })
})
