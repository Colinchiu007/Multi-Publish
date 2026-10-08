// @ts-check
/**
 * ops-center-sync.resilience.test.js — ops-center-sync 的断连韧性接线
 *
 * 只测「接线」：三层降级（L1/L2/L3/default）、连接失败不推进 syncedAt 不覆盖 L2、
 * 6 个注入管理器的重放、降级事件与 ACK 的触发点。
 * 上报侧与快照侧的细节判据分别在 ops-resilience-reporter.test.js / ops-runtime-snapshot.test.js。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

__registerMock('./crypto', {
  isAvailable: () => true,
  encrypt: (key) => (key ? Buffer.from('enc_' + key) : null),
  decrypt: (value) => (value ? Buffer.from(value).toString('utf8').replace(/^enc_/, '') : ''),
  mask: (key) => (key ? key.slice(0, 4) + '****' + key.slice(-4) : '****'),
  setSafeStorage: () => {},
})

const nodeCrypto = require('crypto')
const { OpsCenterSync, canonicalJson } = require('./ops-center-sync')
const { SNAPSHOT_SETTING_KEY, computeConfigHash } = require('./ops-runtime-snapshot')

/**
 * DEV 签名密钥对**在测试进程内实时生成**，本文件不持有任何私钥字面量。
 *
 * 原因：pre-commit 的 CCG `verify-security` 以 `HARDCODED_PRIVATE_KEY`（critical）拦截，
 * 该规则 `extensions: ['*']` 且**没有** `excludePaths` —— 扫描器注释自己写着
 * 「测试夹具里的假凭据不是泄漏」，但那条豁免只加在别的规则上。规则只扫本次变更的文件，
 * 所以仓库里既有的 5 处 DEV 私钥（ops-center-sync.test.js / runtime-trust-anchor.test.js /
 * conftest.py 等）不在扫描集内；**新增文件带私钥就一定会被拦**。
 *
 * 为什么不能「从既有测试文件导入」：那些是 **ESM**（`import { describe... } from 'vitest'`），
 * 而本文件走 CJS `require`；更根本的是测试文件互相 import 会让 vitest 把对方的
 * **全部用例再注册一遍**（副本测试 = 双倍耗时 + 报告污染）。
 *
 * 为什么不能「放到一个普通 .js 支撑模块」：那等于把私钥换个文件名继续留在仓库里 ——
 * 只是让扫描器看不见，而不是让私钥不出现。
 *
 * 实时生成还顺带消除了另一层风险：DEV 私钥与生产默认公钥同源，任何拿到仓库的人都能
 * 给**未配置自定义信任锚**的打包版下发整份运行时策略（公告/版本/敏感词/应用菜单）。
 * 本文件验的是**验签通路本身**，不需要特定的固定密钥。
 */
const DEV_KEY_PAIR = nodeCrypto.generateKeyPairSync('ed25519')
const DEV_PRIVATE_KEY = DEV_KEY_PAIR.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const DEV_PUBLIC_KEY = DEV_KEY_PAIR.publicKey.export({ type: 'spki', format: 'pem' }).toString()

function signRuntimePayload (payload) {
  const { signature: _sig, ...rest } = payload
  const canonical = Buffer.from(canonicalJson(rest), 'utf-8')
  return { ...rest, signature: nodeCrypto.sign(null, canonical, DEV_PRIVATE_KEY).toString('base64') }
}

/** 与 ops-center-sync.test.js 同形的多键 settings 夹具（值按文本落、按解析后的值读） */
function makeStore (initial) {
  const rows = {}
  for (const [k, v] of Object.entries(initial || {})) rows[k] = JSON.stringify(v)
  return {
    getSetting: (k) => (k in rows ? JSON.parse(rows[k]) : ''),
    getSettingObject: (k, d = {}) => {
      const v = k in rows ? JSON.parse(rows[k]) : null
      return v && typeof v === 'object' && !Array.isArray(v) ? v : d
    },
    setSetting: (k, v) => { rows[k] = JSON.stringify(v) },
    _row: (k) => (k in rows ? JSON.parse(rows[k]) : undefined),
  }
}

const SYNC_KEY = 'opsCenterSync'
const RUNTIME_KEY = 'opsCenterRuntime'
const LOG = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), notify: vi.fn() }

function bootstrapPayload (overrides = {}) {
  return signRuntimePayload({
    announcements: [{ id: 'a1', title: '维护通知' }],
    update_policy: { auto_check: true },
    content_policy: { name: '默认', enabled: true, word_list: ['封禁词'], replacement: '***' },
    feature_flags: { cloud_publish: true },
    platform_defs: [{ key: 'douyin' }],
    content_templates: [{ id: 't1' }],
    keyword_watchlist: [{ word: '塌房' }],
    rewrite_strategies: [{ id: 's1' }],
    rewrite_hard_constraints: { items: [{ id: 'h1' }] },
    rewrite_ai_taste_map: [{ id: 'm1' }],
    pipelineOptions: { publish: { visible: true } },
    appMenu: { items: [{ key: 'home', sort_order: 1 }] },
    contentCategories: [{ key: 'film', label: '影视' }],
    synced_at: '2026-10-07T10:00:00Z',
    config_version: 42,
    config_hash: '',
    ...overrides,
  })
}

/** 让 signature 覆盖到 config_hash（真实服务端顺序：先算 hash 再签名） */
function signedBootstrap (overrides = {}) {
  const draft = bootstrapPayload(overrides)
  const { signature: _s, ...rest } = draft
  const withHash = { ...rest, config_hash: computeConfigHash(rest) }
  return signRuntimePayload(withHash)
}

function jsonResp (body, status = 200) {
  return { status, ok: status >= 200 && status < 300, arrayBuffer: async () => Buffer.from(JSON.stringify(body)) }
}

const MANAGERS = () => ({
  platformConfig: { applyRemote: vi.fn(() => 1) },
  templateManager: { applyRemote: vi.fn(() => 1) },
  keywordMonitor: { applyRemoteWatchlist: vi.fn(() => 1) },
  rewriteStrategyManager: { applyRemote: vi.fn(() => 1) },
  rewriteHardConstraintManager: { applyRemote: vi.fn(() => true) },
  rewriteAiTasteMapManager: { applyRemote: vi.fn(() => true) },
})

function wireManagers (sync, m) {
  sync.setPlatformConfig(m.platformConfig)
  sync.setTemplateManager(m.templateManager)
  sync.setKeywordMonitor(m.keywordMonitor)
  sync.setRewriteStrategyManager(m.rewriteStrategyManager)
  sync.setRewriteHardConstraintManager(m.rewriteHardConstraintManager)
  sync.setRewriteAiTasteMapManager(m.rewriteAiTasteMapManager)
}

describe('ops-center-sync 三层降级接线（design §4）', () => {
  let store
  let sync
  let fetchMock
  let managers

  beforeEach(() => {
    store = makeStore({ [SYNC_KEY]: { url: 'https://ops.example.com', apiKeyEnc: 'enc_k', autoSync: true, runtimePublicKey: DEV_PUBLIC_KEY } })
    managers = MANAGERS()
    sync = new OpsCenterSync({ store, modelProviderManager: { applyCatalog: () => ({ code: 0, updated: 0 }) }, log: LOG })
    fetchMock = vi.fn(async () => jsonResp(signedBootstrap()))
    vi.stubGlobal('fetch', fetchMock)
    wireManagers(sync, managers)
  })

  it('canonicalJson 仍从 ops-center-sync 导出（既有固定向量锚定点不移动）', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}')
  })

  it('成功同步后写 L2 快照（完整原始 payload），启动重放能把 6 类内存态喂回管理器', async () => {
    await sync.syncNow()
    expect(store._row(SNAPSHOT_SETTING_KEY)).toBeTruthy()
    expect(store._row(SNAPSHOT_SETTING_KEY).payload.platform_defs).toEqual([{ key: 'douyin' }])
    expect(store._row(RUNTIME_KEY).syncedAt).toBe('2026-10-07T10:00:00Z')

    // 模拟重启：全新实例（内存全空）+ 有 L2 快照 + 断网
    const restarted = new OpsCenterSync({ store, modelProviderManager: null, log: LOG })
    wireManagers(restarted, managers)
    const result = restarted.restoreRuntimeFromDisk()
    expect(result).toEqual({ tier: 'L2', replayed: true })
    expect(managers.platformConfig.applyRemote).toHaveBeenLastCalledWith([{ key: 'douyin' }])
    expect(managers.templateManager.applyRemote).toHaveBeenLastCalledWith([{ id: 't1' }])
    expect(managers.keywordMonitor.applyRemoteWatchlist).toHaveBeenLastCalledWith([{ word: '塌房' }])
    expect(managers.rewriteStrategyManager.applyRemote).toHaveBeenLastCalledWith([{ id: 's1' }])
    expect(managers.rewriteHardConstraintManager.applyRemote).toHaveBeenLastCalledWith({ items: [{ id: 'h1' }] })
    expect(managers.rewriteAiTasteMapManager.applyRemote).toHaveBeenLastCalledWith([{ id: 'm1' }])
    // 重放不推进 syncedAt（仍停在上次成功同步的服务端时间）
    expect(restarted.getRuntimeState().syncedAt).toBe('2026-10-07T10:00:00Z')
  })

  /**
   * 回归锁：注入器**晚于**水合到达时也必须能恢复（复现 phase1 的真实顺序）。
   *
   * 为什么必须单独锁：上一条用例把 6 个管理器都接在 restoreRuntimeFromDisk **之前**，
   * 那是**夹具顺序**，不是生产顺序。生产里 phase1-context.js 的实际次序是
   * `setTemplateManager...`(:217-235) → `autoSyncOnStart()`(:240，内含 L2/L3 水合)
   * → `setPlatformConfig()`(:457) —— platformConfig 落在**最后**。
   * 于是修复前 6 类数据里唯独 platform_defs 恢复不回来，而症状与「压根没做持久化」
   * 完全一样：平台字数/封面尺寸退回本地 yaml。夹具同构性缺这一条就查不出来。
   */
  it('注入器晚于水合到达时仍能补喂（复现 phase1 生产顺序：setPlatformConfig 在 autoSyncOnStart 之后）', async () => {
    await sync.syncNow() // 先产出 L2 快照

    // 独立夹具：beforeEach 里的 managers 已被首个实例用过，直接复用会数到上一轮的调用
    const late = MANAGERS()
    const restarted = new OpsCenterSync({ store, modelProviderManager: null, log: LOG })
    // 5 个「早到」管理器
    restarted.setTemplateManager(late.templateManager)
    restarted.setKeywordMonitor(late.keywordMonitor)
    restarted.setRewriteStrategyManager(late.rewriteStrategyManager)
    restarted.setRewriteHardConstraintManager(late.rewriteHardConstraintManager)
    restarted.setRewriteAiTasteMapManager(late.rewriteAiTasteMapManager)
    // 水合（此时 platformConfig 尚未注入）
    const result = restarted.restoreRuntimeFromDisk()
    expect(result).toEqual({ tier: 'L2', replayed: true })
    expect(late.platformConfig.applyRemote).not.toHaveBeenCalled()

    // 「晚到」的 platformConfig —— 必须在补喂之后被应用
    restarted.setPlatformConfig(late.platformConfig)
    expect(late.platformConfig.applyRemote).toHaveBeenCalledWith([{ key: 'douyin' }])
  })

  it('注入器晚到时补喂失败不得阻断启动（坏管理器只告警）', async () => {
    await sync.syncNow()
    const restarted = new OpsCenterSync({ store, modelProviderManager: null, log: LOG })
    restarted.restoreRuntimeFromDisk()
    expect(() => restarted.setPlatformConfig({
      applyRemote: () => { throw new Error('boom') },
    })).not.toThrow()
  })

  it('L2 缺失时降级到 L3 种子，且不把种子写回 L2', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-sync-seed-'))
    const seedDir = path.join(dir, 'ops-seed')
    fs.mkdirSync(seedDir, { recursive: true })
    const draft = bootstrapPayload()
    const { signature: _s, ...rest } = draft
    const seeded = { ...rest, config_hash: computeConfigHash(rest) }
    fs.writeFileSync(path.join(seedDir, 'runtime-bootstrap.json'), JSON.stringify({
      _meta: { config_version: 7, config_hash: seeded.config_hash, exported_at: new Date().toISOString(), source: 'baseline://local' },
      ...seeded,
    }), 'utf8')

    const fresh = new OpsCenterSync({ store: makeStore({}), modelProviderManager: null, log: LOG })
    fresh._snapshots._seedPaths = [path.join(seedDir, 'runtime-bootstrap.json')]
    wireManagers(fresh, managers)
    expect(fresh.restoreRuntimeFromDisk()).toEqual({ tier: 'L3', replayed: true })
    expect(managers.platformConfig.applyRemote).toHaveBeenCalled()
    // 重放不改写 syncedAt 到「现在」，而是保留快照里的服务端时间
    expect(fresh.getRuntimeState().syncedAt).toBe('2026-10-07T10:00:00Z')
    expect(store._row(SNAPSHOT_SETTING_KEY)).toBeUndefined()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('L2/L3 均不可用时退回代码内置默认值，层级标 default 且不崩', () => {
    const fresh = new OpsCenterSync({ store: makeStore({}), modelProviderManager: null, log: LOG })
    fresh._snapshots._seedPaths = [path.join(os.tmpdir(), 'definitely-missing-seed.json')]
    expect(fresh.restoreRuntimeFromDisk()).toEqual({ tier: 'default', replayed: false })
    expect(fresh.getServingTier()).toBe('default')
    expect(fresh.getRuntimeState().announcements).toEqual([])
  })

  it('restoreRuntimeFromDisk 幂等：重复调用不重复喂管理器', () => {
    const restarted = new OpsCenterSync({ store, modelProviderManager: null, log: LOG })
    wireManagers(restarted, managers)
    restarted.restoreRuntimeFromDisk()
    const callsAfterFirst = managers.platformConfig.applyRemote.mock.calls.length
    restarted.restoreRuntimeFromDisk()
    expect(managers.platformConfig.applyRemote.mock.calls.length).toBe(callsAfterFirst)
  })

  it('autoSyncOnStart 会先水合 L2/L3（6 个管理器注入完毕后才重放）', async () => {
    vi.useFakeTimers()
    try {
      // 先跑一次成功同步留下 L2 快照，再模拟「重启 + 断网」：新实例只有 L2 可用
      await sync.syncNow()
      const restarted = new OpsCenterSync({ store, modelProviderManager: { applyCatalog: () => ({ code: 0, updated: 0 }) }, log: LOG })
      restarted.setGetAccessToken(() => 'token')
      const replayManagers = MANAGERS()
      wireManagers(restarted, replayManagers)
      restarted.autoSyncOnStart()
      expect(replayManagers.platformConfig.applyRemote).toHaveBeenCalledWith([{ key: 'douyin' }])
      expect(replayManagers.rewriteAiTasteMapManager.applyRemote).toHaveBeenCalledWith([{ id: 'm1' }])
    } finally { vi.useRealTimers() }
  })
})

describe('ops-center-sync 失败语义（design §4.3 真值表）', () => {
  let store
  let sync
  let managers

  beforeEach(() => {
    store = makeStore({ [SYNC_KEY]: { url: 'https://ops.example.com', apiKeyEnc: 'enc_k', autoSync: true, runtimePublicKey: DEV_PUBLIC_KEY } })
    managers = MANAGERS()
    sync = new OpsCenterSync({ store, modelProviderManager: { applyCatalog: () => ({ code: 0, updated: 0 }) }, log: LOG })
    wireManagers(sync, managers)
  })

  it('连接失败：不推进 syncedAt、不写 L2、不覆盖既有策略，并记一次降级事件', async () => {
    await sync.syncNow()
    const snapshotBefore = store._row(SNAPSHOT_SETTING_KEY)
    const syncedAtBefore = sync.getRuntimeState().syncedAt
    const payloadBefore = sync.getRuntimeState().announcements

    const failing = vi.fn(async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }) })
    vi.stubGlobal('fetch', failing)
    const result = await sync.syncNow()
    expect(result.runtimeApplied).toBe(false)
    expect(sync.getRuntimeState().syncedAt).toBe(syncedAtBefore)
    expect(sync.getRuntimeState().announcements).toEqual(payloadBefore)
    expect(store._row(SNAPSHOT_SETTING_KEY)).toEqual(snapshotBefore)
    // 断连事件只进本地队列：断连期间不得有任何对外上报（遥测不能依赖被监控的同一通道）
    const state = sync._resilience.getState()
    expect(state).toMatchObject({ degraded: true, consecutiveFailures: 1, queued: 1, servingTier: 'L1' })
    expect(failing.mock.calls.some((c) => /telemetry|runtime\/ack/.test(String(c[0])))).toBe(false)
  })

  it('验签失败：拒绝应用、不推进 syncedAt、不写 L2（契约破坏 fail-closed）', async () => {
    const bad = { ...signedBootstrap(), signature: nodeCrypto.sign(null, Buffer.from('x'), DEV_PRIVATE_KEY).toString('base64') }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResp(bad)))
    const result = await sync.syncNow()
    expect(result.runtimeApplied).toBe(false)
    expect(store._row(SNAPSHOT_SETTING_KEY)).toBeUndefined()
    expect(sync.getRuntimeState().syncedAt).toBe('')
    expect(sync._resilience.getState()).toMatchObject({ degraded: true, servingTier: 'default' })
  })

  it('显式空配置：应用为空并落盘，syncedAt 前进（空是可信的真实状态）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResp(signedBootstrap({ announcements: [], keyword_watchlist: [] }))))
    const result = await sync.syncNow()
    expect(result.runtimeApplied).toBe(true)
    expect(sync.getRuntimeState().announcements).toEqual([])
    expect(sync.getRuntimeState().syncedAt).toBe('2026-10-07T10:00:00Z')
    expect(store._row(SNAPSHOT_SETTING_KEY).payload.keyword_watchlist).toEqual([])
  })
})