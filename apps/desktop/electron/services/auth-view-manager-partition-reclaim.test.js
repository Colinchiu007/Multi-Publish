import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

__enableElectronMock()

let AuthViewManager
let base

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  __resetElectronMock()
  // 端到端：把 electron mock 的 userData 指到真实临时目录，回收动作直接在盘上验，
  // 不靠模块 spy（manager 用 CJS require 拿依赖，import() 得到的实例拦不到）。
  base = fs.mkdtempSync(path.join(os.tmpdir(), `mp-auth-wire-${process.pid}-`))
  fs.mkdirSync(path.join(base, 'session', 'Partitions'), { recursive: true })
  __electronMock.app.getPath = vi.fn(() => base)
  const module = await import('./auth-view-manager.js')
  AuthViewManager = module.default || module
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  try { fs.rmSync(base, { recursive: true, force: true }) } catch (_e) { /* 临时目录清不掉不影响结论 */ }
})

function mkPartitionDirs (names) {
  const root = path.join(base, 'session', 'Partitions')
  for (const n of names) fs.mkdirSync(path.join(root, n), { recursive: true })
}

function listed () {
  return fs.readdirSync(path.join(base, 'session', 'Partitions')).sort()
}

function createView (cookies = []) {
  const session = {
    cookies: { get: vi.fn().mockResolvedValue(cookies) },
    clearStorageData: vi.fn().mockResolvedValue(undefined),
    clearCache: vi.fn().mockResolvedValue(undefined),
  }
  return {
    session,
    view: {
      setBounds: vi.fn(),
      setZoomFactor: vi.fn(),
      setVisible: vi.fn(),
      webContents: {
        session,
        isDestroyed: () => false,
        on: vi.fn(),
        once: vi.fn(),
        off: vi.fn(),
        removeListener: vi.fn(),
        loadURL: vi.fn().mockResolvedValue(undefined),
        executeJavaScript: vi.fn().mockResolvedValue(''),
        getURL: vi.fn().mockReturnValue('https://mp.weixin.qq.com/'),
        close: vi.fn(),
        debugger: { attach: vi.fn(), detach: vi.fn(), sendCommand: vi.fn().mockResolvedValue({}), on: vi.fn() },
      },
    },
  }
}

function createMainWindow () {
  return {
    getBounds: () => ({ x: 0, y: 0, width: 1440, height: 900 }),
    getContentBounds: () => ({ x: 8, y: 39, width: 1424, height: 861 }),
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
  }
}

function arrange (cookies = []) {
  const { view, session } = createView(cookies)
  __electronMock.WebContentsView = vi.fn(function () { return view })
  __electronMock.session.fromPartition = vi.fn(function () { return session })
  const manager = new AuthViewManager()
  manager.setMainWindow(createMainWindow())
  return { manager, view, session }
}

const WECHAT_COOKIE = [{ name: 'slave_user', value: 'u1', domain: '.mp.weixin.qq.com' }]

describe('AuthViewManager ↔ 分区回收接线（#2701，端到端落在真目录上）', () => {
  it('openLogin 开局回收上一轮遗留：非最新删除、最新与账号分区保留', async () => {
    mkPartitionDirs([
      'auth-auth-wechat_mp-1790343224833',
      'auth-auth-wechat_mp-1790418403514',
      'account-18c23d34',
      'logto-identity',
    ])
    const { manager } = arrange()
    manager.openLogin('wechat_mp', 0)
    vi.runAllTimers()
    const left = listed()
    // 本次会话的分区在 mock 下不落盘，所以留下的应是夹具里字典序末位那一份，
    // 而 findAuthPartitionDir 读的也正是它 ⇒ 回收对发布兜底读取中性。
    expect(left.filter(n => n.startsWith('auth-auth-wechat_mp-'))).toEqual(['auth-auth-wechat_mp-1790418403514'])
    expect(left).toContain('account-18c23d34')
    expect(left).toContain('logto-identity')
    const { findAuthPartitionDir } = await import('./auth-partition.js')
    expect(findAuthPartitionDir('wechat_mp', null, base)).toBe('auth-auth-wechat_mp-1790418403514')
    manager.close()
  })

  it('close() 后本次会话真正持有的 session 被清空（递错句柄等于没清）', () => {
    const { manager, session } = arrange([])
    manager.openLogin('douyin', 0)
    session.clearStorageData.mockClear()
    manager.close()
    expect(session.clearStorageData).toHaveBeenCalledTimes(1)
    expect(session.clearCache).toHaveBeenCalledTimes(1)
  })

  it('取到凭证入库的会话不得被清空——发布链的磁盘兜底要看它', () => {
    const { manager, session } = arrange(WECHAT_COOKIE)
    manager.openLogin('wechat_mp', 0)
    manager.completeLogin()
    expect(session.clearStorageData).not.toHaveBeenCalled()
  })

  it('超时终态的会话同样走回收（timeout 不是「留着不管」的出口）', () => {
    const { manager, session } = arrange([])
    manager.openLogin('wechat_mp', 5000)
    session.clearStorageData.mockClear()
    const attempt = manager._activeLoginAttempt
    manager._settleLogin(attempt, { timeout: true })
    expect(session.clearStorageData).toHaveBeenCalledTimes(1)
  })

  it('同一会话成功取证后，后续未取证的会话仍会被清（跨会话不串）', () => {
    const ok = arrange(WECHAT_COOKIE)
    ok.manager.openLogin('wechat_mp', 0)
    ok.manager.completeLogin()
    // 假时钟下 Date.now() 冻结 ⇒ 两次登录会拿到同一 accountId，推进 5ms 才是生产形态
    vi.advanceTimersByTime(5)
    const bad = arrange([])
    bad.manager.openLogin('wechat_mp', 0)
    bad.manager.close()
    expect(bad.session.clearStorageData).toHaveBeenCalledTimes(1)
  })

  it('loginSilent 用完即清自己的 silent-auth 分区并回收目录', async () => {
    mkPartitionDirs(['silent-auth-zhihu-1790000000001', 'silent-auth-zhihu-1790000000002'])
    const { manager, session } = arrange([])
    __electronMock.BrowserWindow.mockImplementation(function () {
      this.webContents = session && {
        session,
        isDestroyed: () => false,
        on: vi.fn(),
        once: vi.fn(),
        off: vi.fn(),
        removeListener: vi.fn(),
        loadURL: vi.fn().mockRejectedValue(new Error('nav boom')),
        executeJavaScript: vi.fn().mockResolvedValue(''),
        getURL: vi.fn().mockReturnValue(''),
        getTitle: vi.fn().mockResolvedValue(''),
        debugger: { attach: vi.fn(), detach: vi.fn(), sendCommand: vi.fn(), on: vi.fn() },
      }
      this.destroy = vi.fn()
      this.show = vi.fn()
      this.isDestroyed = () => false
    })
    session.clearStorageData.mockClear()
    const result = await manager.loginSilent('wechat_mp', [], {}, {})
    vi.runAllTimers()
    expect(result.valid).toBe(false)
    expect(session.clearStorageData).toHaveBeenCalledTimes(1)
    expect(listed().filter(n => n.startsWith('silent-auth-zhihu-')).length).toBe(1)
  })
})

describe('auth-partition-reclaim：登录会话级动作', () => {
  let reclaimMod
  let authPartitionName
  beforeEach(async () => {
    reclaimMod = await import('./auth-partition-reclaim.js')
    authPartitionName = (await import('./auth-view-session.js')).authPartitionName
  })

  it('captured=true 时不清存储，但仍调度目录回收', () => {
    const log = { warn: vi.fn(), info: vi.fn() }
    const session = { clearStorageData: vi.fn(), clearCache: vi.fn() }
    reclaimMod.reclaimLoginSession({ accountId: 'auth-x-1', session, captured: true, log })
    expect(session.clearStorageData).not.toHaveBeenCalled()
    expect(reclaimMod.partitionNameOf('auth-x-1')).toBe('auth-auth-x-1')
  })

  it('captured 缺省视为未取证 ⇒ 清存储', () => {
    const session = { clearStorageData: vi.fn().mockResolvedValue(undefined), clearCache: vi.fn().mockResolvedValue(undefined) }
    reclaimMod.reclaimLoginSession({ accountId: 'auth-x-2', session })
    expect(session.clearStorageData).toHaveBeenCalledTimes(1)
  })

  it('已标记取证的分区名不再被清（跨会话不串）', () => {
    reclaimMod.markCaptured('auth-y-1')
    const session = { clearStorageData: vi.fn().mockResolvedValue(undefined), clearCache: vi.fn().mockResolvedValue(undefined) }
    reclaimMod.reclaimLoginSession({ accountId: 'auth-y-1', session })
    expect(session.clearStorageData).not.toHaveBeenCalled()
  })

  it('缺 accountId 时如实留痕，不静默当成「没有要回收的」', () => {
    const log = { warn: vi.fn(), info: vi.fn() }
    expect(reclaimMod.partitionNameOf(null)).toBe(null)
    reclaimMod.reclaimLoginSession({ accountId: null, session: null, log })
    expect(log.warn).toHaveBeenCalledWith('AuthReclaim', expect.stringContaining('no partition'))
  })

  it('分区名单一来源：回收端与 createSession 用同一个实现', async () => {
    const sessionMod = await import('./auth-view-session.js')
    let seen = null
    sessionMod.createSession('auth-wechat_mp-123', { fromPartition: function (p) { seen = p; return {} } })
    expect(seen).toBe('persist:' + reclaimMod.partitionNameOf('auth-wechat_mp-123'))
    expect(reclaimMod.partitionNameOf('auth-wechat_mp-123')).toBe(authPartitionName('auth-wechat_mp-123'))
  })
})
