// @ts-check
/**
 * settings-roundtrip-contract.test.js — 「应用设置」真源的读写往返契约
 *
 * 被测的是**类型语义**：`setSetting` 写进去的语义值，换一个全新 Store 实例（关闭并重新
 * 打开同一份库文件，即真实重启）后必须等价读回。
 *
 * 接缝只有两个，且都不是被测逻辑：
 *   1) `app.getPath('userData')` → 指向 `os.tmpdir()` 下带 pid+随机后缀的独立目录
 *      （禁止仓库内共享路径：并发会话会同时执行本文件）；
 *   2) `./crypto` → safeStorage 在测试环境不可用，用保类型的假实现替代（ encrypt/decrypt
 *      往返仍成立），被测的存储往返一律走真实 `Store` + 真实 `sqlite-wrapper`(sql.js)。
 *
 * 背景：见 openspec change fix-settings-roundtrip-contract。此前该缺陷由
 * `ops-center-sync.test.js` 的 `makeStore`（存的类型原样回吐）结构性免疫掉，
 * 本文件以真实存储为绝对下界。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

__enableElectronMock()
__registerMock('./crypto', {
  isAvailable: () => true,
  encrypt: (key) => (key ? Buffer.from('enc_' + key) : null),
  // 必须与真实 `crypto.decrypt` 同形：真实实现经 `_toBuffer` 对字符串按 **base64** 解码，
  // 再交给 safeStorage。少了 base64 这个 fake 就只在自己身上往返，测不到落盘形态。
  decrypt: (value) => (value ? Buffer.from(String(value), 'base64').toString('utf8').replace(/^enc_/, '') : ''),
  mask: (key) => (key ? key.slice(0, 4) + '****' + key.slice(-4) : '****'),
  setSafeStorage: () => {},
})

const Store = require('./store')
const SqliteDatabase = require('./sqlite-wrapper')
const { OpsCenterSync } = require('./ops-center-sync')
const { DiagnosticsReporter } = require('./diagnostics-reporter')
const { PublishReporter } = require('./publish-reporter')
const { UsageReporter } = require('./usage-reporter')

const RUNTIME_PUBLIC_KEY = [
  '-----BEGIN PUBLIC KEY-----',
  'MCowBQYDK2VwAyEAr6a4g942N23o31XNIcwFGX9VhSu2jlGA9dT1bfJIDpg=',
  '-----END PUBLIC KEY-----',
].join('\n')

/** @type {string} */
let userDataDir
/** @type {any} */
let store

/** 打开一份真实库文件；失败必须响亮报错，不允许静默降级成"什么都没测" */
function openStore () {
  const s = new Store()
  const ok = s.init()
  if (!ok || s._ready !== true) {
    throw new Error('真实 Store 未能就绪（init 返回 ' + ok + '，_ready=' + s._ready + '）——探针自身失效，本文件不得产出任何结论')
  }
  return s
}

/** 模拟应用重启：关闭当前句柄（内部会 persist），再以同一路径重开 */
function restartStore () {
  if (store) { try { store.close() } catch { /* 已关闭 */ } }
  store = openStore()
  return store
}

beforeAll(async () => {
  await SqliteDatabase.ready
})

beforeEach(() => {
  userDataDir = path.join(os.tmpdir(), 'mp-settings-roundtrip-' + process.pid + '-' + Math.random().toString(36).slice(2, 10))
  fs.mkdirSync(userDataDir, { recursive: true })
  __electronMock.app.getPath = () => userDataDir
  store = openStore()
})

afterEach(() => {
  if (store) { try { store.close() } catch { /* ignore */ } }
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

describe('Settings 真源：存储侧读回归一化（真实 Store）', () => {
  it('写入对象后，重开库的实例按 getSettingObject 等价读回', () => {
    const payload = { url: 'http://127.0.0.1:8010', nested: { a: 1 }, list: ['x', 'y'] }
    store.setSetting('roundtripStoreProbe', payload)

    const reopened = restartStore()
    expect(typeof reopened.getSettingObject).toBe('function')
    expect(reopened.getSettingObject('roundtripStoreProbe', {})).toEqual(payload)
  })

  it('存量行（修复前 JSON.stringify 写法）无需迁移即可读回', () => {
    store.setSetting('roundtripLegacyRow', JSON.stringify({ lastId: 42 }))
    const reopened = restartStore()
    expect(reopened.getSettingObject('roundtripLegacyRow', {})).toEqual({ lastId: 42 })
  })

  it('损坏行返回调用方声明的默认值，不抛且不把垃圾当配置', () => {
    store.setSetting('roundtripCorrupt', 'not-json{')
    const reopened = restartStore()
    expect(reopened.getSettingObject('roundtripCorrupt', { fallback: true })).toEqual({ fallback: true })
  })

  it('键不存在时返回默认值（缺席不等于错误）', () => {
    const reopened = restartStore()
    expect(reopened.getSettingObject('roundtripAbsent', { d: 1 })).toEqual({ d: 1 })
  })
})

describe('Settings 真源：OpsCenterSync 配置与运营菜单重启后必须恢复（Bug 探针）', () => {
  it('saveConfig 写入的手动地址与 Key，重启后仍读得到', () => {
    const svc = new OpsCenterSync({ store, log: { info () {}, warn () {}, error () {} } })
    const saved = svc.saveConfig({ url: 'http://127.0.0.1:8010', apiKey: 'catalog-key-abc', autoSync: true, runtimePublicKey: RUNTIME_PUBLIC_KEY })
    expect(saved.code).toBe(0)

    // 落盘侧必须先自证写进去了，否则"读不到"可能只是没写
    const rawRow = store.db.prepare('SELECT value FROM settings WHERE key = ?').get('opsCenterSync')
    expect(rawRow).toBeTruthy()
    expect(JSON.parse(rawRow.value).url).toBe('http://127.0.0.1:8010')

    const reopened = restartStore()
    const afterRestart = new OpsCenterSync({ store: reopened, log: { info () {}, warn () {}, error () {} } })
    const cfg = afterRestart.getConfig()
    expect(cfg.url).toBe('http://127.0.0.1:8010')
    expect(cfg.apiKeyConfigured).toBe(true)
    expect(cfg.runtimePublicKey).toBe(RUNTIME_PUBLIC_KEY)
    expect(afterRestart.getCatalogApiKey()).toBe('catalog-key-abc')
  })

  it('applyRuntime 落盘的应用菜单，重启后无需再同步即可恢复', () => {
    const svc = new OpsCenterSync({ store, log: { info () {}, warn () {}, error () {} } })
    const menu = { items: [{ key: 'copy-library', visible: true, sort_order: 1, group: 'more' }] }
    svc.applyRuntime({ announcements: [], appMenu: menu, synced_at: '2026-10-01T00:00:00Z' })
    expect(svc.getAppMenu()).toBeTruthy()

    const reopened = restartStore()
    const afterRestart = new OpsCenterSync({ store: reopened, log: { info () {}, warn () {}, error () {} } })
    const restored = afterRestart.getAppMenu()
    expect(restored).toBeTruthy()
    expect(restored.items.map((i) => i.key)).toEqual(['copy-library'])
  })

  it('从未成功同步过时空库读取不抛，且如实呈现"无配置"（fail-open 语义）', () => {
    const reopened = restartStore()
    const svc = new OpsCenterSync({ store: reopened, log: { info () {}, warn () {}, error () {} } })
    expect(() => svc.getConfig()).not.toThrow()
    expect(svc.getConfig().apiKeyConfigured).toBe(false)
    expect(svc.getAppMenu()).toBeNull()
  })
})

describe('Settings 真源：三个上报水位线重启后不得归零（Bug 探针）', () => {
  const cases = [
    { name: 'DiagnosticsReporter', make: (s) => new DiagnosticsReporter({ store: s }), write: (r) => r._saveWatermark(7), read: (r) => r._getWatermark(), expectValue: 7 },
    { name: 'UsageReporter', make: (s) => new UsageReporter({ store: s }), write: (r) => r._saveWatermark(9), read: (r) => r._getWatermark(), expectValue: 9 },
    { name: 'PublishReporter', make: (s) => new PublishReporter({ store: s }), write: (r) => r._saveWatermark('2026-10-01T00:00:00Z'), read: (r) => r._getWatermark(), expectTs: '2026-10-01T00:00:00Z' },
  ]

  for (const c of cases) {
    it(c.name + ' 的水位线在重启后读回上一份值', () => {
      const writer = c.make(store)
      c.write(writer)

      const reopened = restartStore()
      const afterRestart = c.make(reopened)
      const value = c.read(afterRestart)
      if (c.expectTs) expect(value.lastTs).toBe(c.expectTs)
      else expect(value).toBe(c.expectValue)
    })
  }
})

describe('Settings 真源：禁止第二份归一化实现重新长出来', () => {
  const files = [
    'ops-center-sync.js',
    'diagnostics-reporter.js',
    'publish-reporter.js',
    'usage-reporter.js',
  ]

  for (const f of files) {
    it(f + ' 不得再用 String(getSetting(...)) 的误判口径读配置', () => {
      const src = fs.readFileSync(path.join(__dirname, f), 'utf8')
      expect(src).not.toMatch(/String\(\s*[\w.?!]*getSetting/)
    })
  }
})
