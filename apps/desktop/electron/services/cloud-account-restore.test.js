// @ts-check
/**
 * cloud-account-restore 回归测试 — 恢复写入的串行性 + 「排检测必须在锁外」
 *
 * 对应 openspec add-cloud-account-sync 残留「主进程同步 × 批量检测互斥」。恢复侧是那条竞态里
 * **改数据**的一侧：它把云端凭证覆盖到本机，并把登录态打回 `unverified(restored)`。若这两步
 * 插在某个检测的「读旧凭证」与「写结论」之间，就会得到「本机这份凭证从未被验证过却显示已登录」
 * （AGENTS.md「固化顺序」「单向证据规则」同时被破）。所以本文件锁两件事：
 *
 *  1. **saveCredential 与 persistLoginState 必须落在同一个临界区内**，且被同 accountId 的
 *     其他写者整体挡住——不能出现「凭证已覆盖、状态还是别人写的 active」这半格状态。
 *  2. **queueLoginCheck 必须在释放之后调用**。它会走同一把锁去检测同一账号；留在锁内即自死锁，
 *     表现为那次恢复之后该账号永远不再被检测，而日志一切正常。这是本文件里最容易被后来的
 *     "顺手重构" 破坏的一条，故用运行时断言（`accountStateLockHeld` 当场为 false），
 *     不写成源码文本断言。
 *
 * 用真实锁模块（不 mock）：要证的正是跨模块共用同一把键。
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest'

const { createRestoreFlow } = require('./cloud-account-restore')
const { withAccountStateLock, accountStateLockHeld } = require('./account-state-lock')

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * @param {{ saveCredential?: Function, queueLoginCheck?: Function, addAccount?: Function, persistLoginState?: Function, callApi?: Function }} [overrides]
 */
function createFlow (overrides = {}) {
  /** @type {string[]} */
  const events = []
  /** @type {any[]} */
  const persisted = []
  const credentialStore = {
    saveCredential: overrides.saveCredential || vi.fn(async () => { events.push('saveCredential') }),
  }
  const AccountManager = {
    addAccount: overrides.addAccount || vi.fn(async () => { events.push('addAccount'); return { code: 0, data: { id: 'acc-new' } } }),
    // 形状必须与真实 `AccountManager.persistLoginState(accountId, platform, status, validatedAt)`
    // 的位置签名逐字同形：恢复侧此前按对象形调用，而夹具也照对象形收，于是「status 恒为
    // undefined → 真源从未被写」被断言成了契约。夹具替被测方改了签名，就永远测不出漏配。
    persistLoginState: overrides.persistLoginState || vi.fn(async (accountId, platform, status, validatedAt) => {
      events.push('persistLoginState')
      persisted.push({ accountId, platform, status, validatedAt })
      return { ok: true, status }
    }),
  }
  const queueLoginCheck = overrides.queueLoginCheck || vi.fn(async (accountId) => {
    // 死锁防护的观察点：排检测时必须已经不在临界区里
    events.push('queueLoginCheck:held=' + String(accountStateLockHeld(accountId)))
  })
  const flow = createRestoreFlow({
    // 默认给一份可用凭证：restoreToLocal 走的分支需要 fetchCloudCredential 命中，
    // 否则它在 addAccount 之前就返回 FAILED，用例只是在测「云端没有这一行」。
    callApi: overrides.callApi || vi.fn(async () => ({
      credentials: [{
        platform: 'douyin',
        platformUid: 'uid-1',
        credential: { cookies: [{ name: 'k', value: 'v' }], localStorage: {} },
      }],
    })),
    AccountManager,
    credentialStore,
    queueLoginCheck,
    userDataDir: '/tmp/unused',
    now: () => 1000,
    log: () => {},
    accountTimeoutMs: 5000,
  })
  return { flow, events, persisted, credentialStore, AccountManager, queueLoginCheck }
}

describe('cloud-account-restore 恢复写入的串行合同', () => {
  it('凭证覆盖与状态回写处于同一临界区：同账号被他人持锁时两者都不得发生', async () => {
    const { flow, events } = createFlow()
    let release
    const held = withAccountStateLock('acc-1', () => new Promise((r) => { release = r }))

    const applying = flow.applyCredentialLocally('sub-1', 'acc-1', { cookies: [{ name: 'a', value: 'b' }] }, 'douyin')
    await flush()
    expect(events, '恢复侧在别的写者持锁期间就覆盖了凭证').toEqual([])

    release()
    await held
    const res = await applying
    expect(res).toMatchObject({ applied: true, code: '', queuedCheck: true })
    // 顺序不可颠倒：凭证未落盘不得声称该账号可用（AGENTS.md 固化顺序）
    expect(events).toEqual(['saveCredential', 'persistLoginState', 'queueLoginCheck:held=false'])
  })

  it('排本机检测发生在释放之后（留在锁内即自死锁，且不会有任何报错）', async () => {
    const { flow, events, queueLoginCheck } = createFlow()
    const applied = await flow.applyCredentialLocally('sub-1', 'acc-q', { cookies: [{ name: 'a', value: 'b' }] }, 'douyin')
    expect(applied).toMatchObject({ applied: true, queuedCheck: true })
    // 断言里的 held=false 不是装饰：它是上一行用例里唯一能区分「锁外排队」与「锁内排队」的证据
    expect(events).toContain('queueLoginCheck:held=false')
    expect(queueLoginCheck).toHaveBeenCalledWith('acc-q', { platform: 'douyin', reason: 'cloud-restored' })
    expect(accountStateLockHeld('acc-q')).toBe(false)
  })

  it('回写口径是 unverified（不继承云端结论），并按真实位置签名送达', async () => {
    const { flow, persisted } = createFlow()
    await flow.applyCredentialLocally('sub-1', 'acc-st', { cookies: [{ name: 'a', value: 'b' }] }, 'zhihu')
    expect(persisted.length).toBe(1)
    expect(persisted[0]).toMatchObject({ accountId: 'acc-st', platform: 'zhihu', status: 'unverified' })
    // last_validated 取本机此刻：它是 7 天超龄兜底的锚点，缺席会让僵尸绿灯提前或永不触发
    expect(Number.isNaN(new Date(persisted[0].validatedAt).getTime())).toBe(false)
  })

  it('状态回写失败：不得算这次覆盖成功，也不排检测，且必须出声', async () => {
    /** @type {string[]} */
    const logs = []
    /** @type {any[]} */
    const queued = []
    const flow = createRestoreFlow({
      callApi: vi.fn(async () => ({ credentials: [] })),
      AccountManager: {
        addAccount: vi.fn(),
        persistLoginState: vi.fn(async () => ({ ok: false, reason: 'invalid-status' })),
      },
      credentialStore: { saveCredential: vi.fn(async () => {}) },
      queueLoginCheck: vi.fn(async (...args) => { queued.push(args) }),
      userDataDir: '',
      now: () => 1000,
      log: (level, stage, detail) => logs.push(`${level}:${stage}:${detail}`),
      accountTimeoutMs: 5000,
    })
    const res = await flow.applyCredentialLocally('sub-1', 'acc-warn', { cookies: [{ name: 'a', value: 'b' }] }, 'douyin')

    // 这一条是外部评审的 Critical：只落 warn 却仍返回"成功"，等于把失败固化成契约
    expect(res).toEqual({ applied: false, code: 'RESTORE_STATUS_PERSIST_FAILED', queuedCheck: false })
    expect(queued.length, '状态没写成就不该排自证检测').toBe(0)
    const warned = logs.filter((l) => l.startsWith('warn:restore-status-failed'))
    expect(warned.length).toBe(1)
    expect(warned[0]).toContain('reason=invalid-status')
  })

  it('restoreToLocal：状态回写失败时回滚新建的账号并如实报失败（不留"有账号、状态不可信"的半成功）', async () => {
    const deleteAccount = vi.fn(async () => ({ code: 0 }))
    const flow = createRestoreFlow({
      callApi: vi.fn(async () => ({
        credentials: [{ platform: 'douyin', platformUid: 'uid-1', credential: { cookies: [{ name: 'k', value: 'v' }], localStorage: {} } }],
      })),
      AccountManager: {
        addAccount: vi.fn(async () => ({ code: 0, data: { id: 'acc-rb' } })),
        persistLoginState: vi.fn(async () => ({ ok: false, reason: 'backend-error' })),
        deleteAccount,
      },
      credentialStore: { saveCredential: vi.fn(async () => {}) },
      queueLoginCheck: vi.fn(async () => {}),
      userDataDir: '',
      now: () => 1000,
      log: () => {},
      accountTimeoutMs: 5000,
    })
    const res = await flow.restoreToLocal('sub-1', { platform: 'douyin', platformUid: 'uid-1', accountName: '抖音号' }, 0)

    expect(res.outcome).toBe('failed')
    expect(res.code).toBe('RESTORE_STATUS_PERSIST_FAILED')
    expect(deleteAccount).toHaveBeenCalledWith('acc-rb', { ownerSubject: 'sub-1' })
    // 回滚成功时不把 accountId 带出去（本机确实没留下了）
    expect(res.accountId).toBeNull()
  })

  it('queueLoginCheck 未注入（生产接线的现状）：queuedCheck 如实为 false，不得凭空许诺', async () => {
    const flow = createRestoreFlow({
      callApi: vi.fn(async () => ({ credentials: [] })),
      AccountManager: {
        addAccount: vi.fn(),
        persistLoginState: vi.fn(async () => ({ ok: true })),
      },
      credentialStore: { saveCredential: vi.fn(async () => {}) },
      queueLoginCheck: null,
      userDataDir: '',
      now: () => 1000,
      log: () => {},
      accountTimeoutMs: 5000,
    })
    const res = await flow.applyCredentialLocally('sub-1', 'acc-noq', { cookies: [{ name: 'a', value: 'b' }] }, 'zhihu')
    expect(res).toEqual({ applied: true, code: '', queuedCheck: false })
  })

  it('凭证落盘失败：不写登录态、不排检测、如实返回 false', async () => {
    const { flow, events, queueLoginCheck, AccountManager } = createFlow({
      saveCredential: vi.fn(async () => { throw new Error('DPAPI 不可用') }),
    })
    const res = await flow.applyCredentialLocally('sub-1', 'acc-fail', { cookies: [{ name: 'a', value: 'b' }] }, 'kuaishou')
    expect(res).toEqual({ applied: false, code: 'CREDENTIAL_PERSIST_FAILED', queuedCheck: false })
    expect(events).toEqual([])
    expect(AccountManager.persistLoginState).not.toHaveBeenCalled()
    expect(queueLoginCheck).not.toHaveBeenCalled()
  })

  it('restoreToLocal：新建账号后的凭证落盘与状态回写同样串行，排队检测仍在锁外', async () => {
    const { flow, events } = createFlow()
    let release
    const held = withAccountStateLock('acc-new', () => new Promise((r) => { release = r }))

    const restoring = flow.restoreToLocal('sub-1', {
      platform: 'douyin',
      platformUid: 'uid-1',
      accountName: '抖音号',
      displayName: '抖音号',
    }, 0)

    // 等到「新建账号」这一步确实发生（此时 accountId 才存在，锁键才有意义）。
    // 不靠固定次数的 flush：取云端凭证那一段有超时竞速，跳数不由本模块决定。
    for (let i = 0; i < 50 && !events.includes('addAccount'); i++) await flush()
    expect(events).toEqual(['addAccount'])
    // addAccount 不在锁内（那还没有 accountId 可作键）；下面要证的是凭证与状态两步必须在
    expect(events, '恢复侧在别的写者持锁期间就覆盖了凭证').not.toContain('saveCredential')

    release()
    await held
    const res = await restoring
    expect(res.outcome).toBe('restored')
    expect(events).toEqual([
      'addAccount', 'saveCredential', 'persistLoginState', 'queueLoginCheck:held=false',
    ])
  })

  it('不同账号的恢复互不阻塞（不得退化为全局单锁）', async () => {
    const { flow, events } = createFlow()
    let release
    const held = withAccountStateLock('acc-other', () => new Promise((r) => { release = r }))
    const applying = flow.applyCredentialLocally('sub-1', 'acc-free', { cookies: [{ name: 'a', value: 'b' }] }, 'bilibili')
    await flush()
    expect(events).toEqual(['saveCredential', 'persistLoginState', 'queueLoginCheck:held=false'])
    release()
    await held
    expect((await applying).applied).toBe(true)
  })
})

/**
 * 跨模块契约锁：把**真实**的 `AccountManager.persistLoginState` 装进恢复流跑一次。
 *
 * 为什么夹具断言不够：这次的根因正是「夹具与被写方签名不一致」——恢复侧按对象形调用，
 * 夹具也按对象形收，于是真实现里 `status` 恒为 undefined、直接 `invalid-status` 返回、
 * 一次 PATCH 都没发出去，而两侧测试全绿。按 AGENTS.md「契约夹具不得替对方剥壳」，
 * 跨包/跨模块契约必须**真跑一次**，并断言落到后端的那份 body。
 *
 * 不许 skip：account-manager 取不到即红（把锁改成「找不到就跳过」会退化成永久不执行）。
 */
describe('cloud-account-restore × 真实 AccountManager.persistLoginState 契约', () => {
  it('真实写者收到的是 { status: unverified, last_validated }，后端确实被 PATCH', async () => {
    __enableElectronMock()
    __resetElectronMock()
    /** @type {{method:string, path:string, body:any}[]} */
    const calls = []
    const bridge = {
      requestBackend: vi.fn(async (method, path, body) => {
        calls.push({ method, path, body })
        return { code: 0 }
      }),
    }
    const silentLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    // account-manager 用 CJS require 取依赖，vi.mock 拦不到 → 本仓的 __registerMock 按解析后文件名匹配，
    // 两种书写形式都登记，避免"注册了但没命中"的静默走真实实现。
    __registerMock('./python-bridge', bridge)
    __registerMock('../services/python-bridge', bridge)
    __registerMock('./logger', silentLog)
    __registerMock('../services/logger', silentLog)

    const { persistLoginState } = require('../publishers/account-manager')
    const flow = createRestoreFlow({
      callApi: vi.fn(async () => ({ credentials: [] })),
      AccountManager: { addAccount: vi.fn(), persistLoginState },
      credentialStore: { saveCredential: vi.fn(async () => {}) },
      queueLoginCheck: null,
      userDataDir: '',
      now: () => Date.parse('2026-09-27T00:00:00.000Z'),
      log: () => {},
      accountTimeoutMs: 5000,
    })

    const applied = await flow.applyCredentialLocally('sub-1', 'acc-real', { cookies: [{ name: 'k', value: 'v' }] }, 'douyin')
    expect(applied.applied).toBe(true)
    expect(calls.length, '恢复一次都没有写真源（正是本轮修掉的那条断链）').toBe(1)
    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].path).toBe('/api/accounts/acc-real')
    expect(calls[0].body.status).toBe('unverified')
    expect(calls[0].body.last_validated).toBe('2026-09-27T00:00:00.000Z')
    // 注入的 log 不得出现固化失败：真实现返回 { ok: true } 才算这条链接通
    expect(silentLog.warn).not.toHaveBeenCalled()
  })
})
