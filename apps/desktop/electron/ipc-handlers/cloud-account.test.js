// @ts-check
/**
 * 账号云镜像 IPC 边界合同测试（electron/ipc-handlers/cloud-account.js）
 *
 * 为什么必须有：`cloud-account-sync.js` 服务层已有 34 条用例，preload 有方法清单结构锁，
 * 但**IPC 这一层**此前只被间接覆盖。而这一层恰好是 fail-closed 的落点：
 * `ownerSubject()` 取不到身份时必须**一个字节都不往外发**——"没发"这件事在没有本文件时无人验证；
 * 同理「异常会不会逃逸到渲染进程」「新增通道会不会漏挂 withSenderCheck」也只有这里能锁。
 *
 * mock 口径：主进程代码用 `require()` 加载，`vi.mock` 只在 SSR 转换层生效、**拦不住 CJS require**
 * （见 test-setup.js 的说明），因此服务与检测链路一律走 `__registerMock`；
 * 匹配按 resolved filename，注册两条相对形式与 `ipc-handlers/offline.test.js` 保持一致。
 * 可信/不可信只由 `senderFrame.url` 决定，口径与 `account.test.js` 相同。
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
__registerMock('./services/logger', mockLogger)
__registerMock('../services/logger', mockLogger)

/** 服务层整体替身：本文件只锁 IPC 边界，不重测服务语义。 */
const service = {
  digest: vi.fn(),
  sync: vi.fn(),
  disconnect: vi.fn(),
  requestAbort: vi.fn(),
}
/** 每次 registerHandlers 都会构造一次服务，按序捕获它收到的 opts（接线合同的证据面）。 */
const wired = []
const serviceModule = {
  createCloudAccountSync: (opts) => {
    wired.push(opts)
    return service
  },
}
__registerMock('./services/cloud-account-sync', serviceModule)
__registerMock('../services/cloud-account-sync', serviceModule)

const httpChecker = {
  fetchAccountInfoViaHttpApi: vi.fn(),
  checkLoginViaHttpApi: vi.fn(),
}
__registerMock('./publishers/http-login-checker', httpChecker)
__registerMock('../publishers/http-login-checker', httpChecker)

// 启用 electron mock，withSenderCheck 通过 require('electron').app 读取 isPackaged
__enableElectronMock()

let registerHandlers
let originalNodeEnv
let originalIsPackaged

const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' } }
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }

const CLOUD_CHANNELS = [
  'accounts:cloud-digest',
  'accounts:cloud-sync',
  'accounts:cloud-disconnect',
  'accounts:cloud-sync-abort',
]

/** 抛出型桩：嵌在对象字面量里会让括号层级难读且易错，统一提到模块级 */
function throwState () { throw new Error('identity session store locked') }
function throwPath () { throw new Error('no userData in portable mode') }
function throwWindows () { throw new Error('window manager down') }

/** 最近一次注入给服务层的依赖 */
function lastOpts () { return wired[wired.length - 1] }

beforeEach(async () => {
  vi.resetModules()
  wired.length = 0
  for (const fn of Object.values(service)) fn.mockReset()
  for (const fn of Object.values(mockLogger)) fn.mockClear()
  originalNodeEnv = process.env.NODE_ENV
  originalIsPackaged = __electronMock.app.isPackaged
  delete process.env.NODE_ENV
  __electronMock.app.isPackaged = false
  const mod = await import('./cloud-account')
  registerHandlers = mod.default || mod
})

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
  __electronMock.app.isPackaged = originalIsPackaged
})

function createMockIpcMain () {
  /** @type {Record<string, any>} */
  const handlers = {}
  return {
    handle: vi.fn((channel, fn) => { handlers[channel] = fn }),
    on: vi.fn(),
    _get: (channel) => handlers[channel],
  }
}

function createDeps (overrides = {}) {
  return {
    app: { getPath: vi.fn(() => 'D:/tmp/mp-cloud-ipc-test-userdata') },
    BrowserWindow: { getAllWindows: vi.fn(() => []) },
    AccountManager: {},
    credentialStore: { loadCredential: vi.fn(), saveCredential: vi.fn() },
    identityService: { getState: () => ({ user: { sub: 'sub-abc' } }), memberApiService: { request: vi.fn() } },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  }
}

/** 注册并拿到通道 handler（每次都用新 ipcMain，避免用例间串味） */
function register (deps) {
  const ipcMain = createMockIpcMain()
  registerHandlers(ipcMain, deps)
  return ipcMain
}

describe('云账号通道的注册与 sender 校验覆盖面', () => {
  it('四条通道都以字面量注册，且不多不少恰好这四条', () => {
    const ipcMain = register(createDeps())
    // 精确数组断言（QM-3）：新增通道若漏挂 withSenderCheck，本用例先把它抓出来
    expect(ipcMain.handle.mock.calls.map((c) => c[0]).sort()).toEqual([...CLOUD_CHANNELS].sort())
  })

  it.each(CLOUD_CHANNELS)('%s 拒绝外部网页调用，且完全不下沉到服务层', async (channel) => {
    const ipcMain = register(createDeps())
    const result = await ipcMain._get(channel)(UNTRUSTED_EVENT, {})
    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(service.digest).not.toHaveBeenCalled()
    expect(service.sync).not.toHaveBeenCalled()
    expect(service.disconnect).not.toHaveBeenCalled()
    expect(service.requestAbort).not.toHaveBeenCalled()
  })
})

describe('ownerSubject 取不到身份时一律 fail closed（不发出任何云端请求）', () => {
  /** @type {Array<[string, any]>} */
  const cases = [
    ['未注入 identityService', undefined],
    ['getState 抛异常', { getState: throwState }],
    ['state 里没有 user', { getState: () => ({}) }],
    ['sub 是空白串', { getState: () => ({ user: { sub: '   ' } }) }],
    ['sub 不是字符串', { getState: () => ({ user: { sub: 12345 } }) }],
  ]

  for (const [name, identityService] of cases) {
    it(`digest / sync / disconnect 三条通道都返回 AUTH_ERROR（${name}）`, async () => {
      const ipcMain = register(createDeps({ identityService }))
      for (const channel of ['accounts:cloud-digest', 'accounts:cloud-sync', 'accounts:cloud-disconnect']) {
        const result = await ipcMain._get(channel)(TRUSTED_EVENT, { confirm: 'cloud' })
        expect(result).toEqual({ code: -3, message: '无法识别当前用户', data: null })
      }
      expect(service.digest).not.toHaveBeenCalled()
      expect(service.sync).not.toHaveBeenCalled()
      expect(service.disconnect).not.toHaveBeenCalled()
    })
  }

  it('取不到身份时留 warn 日志，不静默（AGENTS.md「静默配置失败必须留日志」同族纪律）', async () => {
    const deps = createDeps({ identityService: undefined })
    const ipcMain = register(deps)
    await ipcMain._get('accounts:cloud-digest')(TRUSTED_EVENT)
    expect(deps.log.warn).toHaveBeenCalledWith('AccountIPC', expect.stringContaining('auth-failed'))
    expect(deps.log.error).not.toHaveBeenCalled()
  })
})

describe('正常路径的 IPC 合同形状', () => {
  it('digest 以 sub 为参调用服务，并原样透传服务返回的对象（不重新包壳）', async () => {
    const payload = { code: 0, data: { reachable: true, total: 3, localCount: 2 } }
    service.digest.mockResolvedValue(payload)
    const ipcMain = register(createDeps())

    const result = await ipcMain._get('accounts:cloud-digest')(TRUSTED_EVENT)

    expect(service.digest).toHaveBeenCalledWith('sub-abc')
    expect(result).toBe(payload)
  })

  it('sync 成功与「未完成」都如实透传，不因非零结论被改写成成功', async () => {
    const summary = { created: 0, updated: 0, unchanged: 0, restored: 0, skipped: 0, conflicts: 0, invalid: 0, uidUnavailable: 0, failed: 0 }
    const ok = { code: 0, data: { ...summary, created: 1, aborted: false } }
    const partial = { code: 0, errorCode: 'PARTIAL', data: { ...summary, failed: 2, aborted: false } }
    service.sync.mockResolvedValueOnce(ok).mockResolvedValueOnce(partial)
    const ipcMain = register(createDeps())

    expect(await ipcMain._get('accounts:cloud-sync')(TRUSTED_EVENT)).toBe(ok)
    expect(await ipcMain._get('accounts:cloud-sync')(TRUSTED_EVENT)).toBe(partial)
  })

  it('disconnect 的 confirm 缺省时传空串，IPC 层不替用户臆造确认值', async () => {
    service.disconnect.mockResolvedValue({ code: -1, errorCode: 'CONFIRM_REQUIRED' })
    const ipcMain = register(createDeps())

    await ipcMain._get('accounts:cloud-disconnect')(TRUSTED_EVENT, {})
    expect(service.disconnect).toHaveBeenLastCalledWith('sub-abc', '')

    await ipcMain._get('accounts:cloud-disconnect')(TRUSTED_EVENT, { confirm: 'cloud' })
    expect(service.disconnect).toHaveBeenLastCalledWith('sub-abc', 'cloud')

    await ipcMain._get('accounts:cloud-disconnect')(TRUSTED_EVENT, { confirm: 42 })
    expect(service.disconnect).toHaveBeenLastCalledWith('sub-abc', '')
  })

  it('abort 不需要身份，但必须回 {code:0,data:{aborted}} 形状', async () => {
    service.requestAbort.mockReturnValue(true)
    const ipcMain = register(createDeps({ identityService: undefined }))

    const result = await ipcMain._get('accounts:cloud-sync-abort')(TRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: { aborted: true } })
    expect(service.requestAbort).toHaveBeenCalledTimes(1)
  })
})

describe('异常不得逃逸到渲染进程', () => {
  it('服务抛 Error → REQUEST_ERROR + 原始消息，且写 error 日志', async () => {
    service.sync.mockRejectedValue(new Error('sqlite busy'))
    const deps = createDeps()
    const ipcMain = register(deps)

    const result = await ipcMain._get('accounts:cloud-sync')(TRUSTED_EVENT)

    expect(result).toEqual({ code: -1, message: 'sqlite busy', data: null })
    expect(deps.log.error).toHaveBeenCalledWith('AccountIPC', expect.stringContaining('exception'))
  })

  it('抛出非 Error 值时也要给出字符串消息', async () => {
    service.digest.mockRejectedValue('plain-string-failure')
    const ipcMain = register(createDeps())

    const result = await ipcMain._get('accounts:cloud-digest')(TRUSTED_EVENT)

    expect(result).toEqual({ code: -1, message: 'plain-string-failure', data: null })
  })
})

describe('注入给服务层的依赖（IPC ↔ 服务 的接线合同）', () => {
  it('apiClient 只在 memberApiService 存在时接线，否则保持 null（不造半吊子客户端）', () => {
    register(createDeps())
    expect(typeof lastOpts().apiClient.request).toBe('function')

    register(createDeps({ identityService: { getState: () => ({ user: { sub: 's' } }) } }))
    expect(lastOpts().apiClient).toBeNull()
  })

  it('userData 路径取不到时退化为空串并留 warn，而不是让注册整体失败', () => {
    const deps = createDeps({ app: { getPath: vi.fn(throwPath) } })
    expect(() => register(deps)).not.toThrow()
    expect(lastOpts().userDataDir).toBe('')
    expect(deps.log.warn).toHaveBeenCalledWith('AccountIPC', expect.stringContaining('userdata-path-failed'))
  })

  it('广播按字面量通道发出；窗口取不到或已销毁时静默失败，绝不阻断同步', () => {
    const send = vi.fn()
    register(createDeps({
      BrowserWindow: { getAllWindows: vi.fn(() => [{ isDestroyed: () => false, webContents: { send } }]) },
    }))
    lastOpts().broadcast({ type: 'start', accountId: 'a1' })
    expect(send).toHaveBeenCalledWith('accounts:cloud-sync-progress', { type: 'start', accountId: 'a1' })

    register(createDeps({
      BrowserWindow: { getAllWindows: vi.fn(() => [{ isDestroyed: () => true, webContents: { send: vi.fn() } }]) },
    }))
    expect(() => lastOpts().broadcast({ type: 'done' })).not.toThrow()
    expect(send).toHaveBeenCalledTimes(1)

    register(createDeps({ BrowserWindow: { getAllWindows: vi.fn(throwWindows) } }))
    expect(() => lastOpts().broadcast({ type: 'done' })).not.toThrow()
  })
})
