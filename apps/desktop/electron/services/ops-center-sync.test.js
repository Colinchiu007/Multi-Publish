// @ts-check
/**
 * ops-center-sync.test.js — 运营后台 → 桌面端运行时同步服务
 *
 * 覆盖：URL 校验（https 强制/回环豁免）、API Key 加密存储（不落明文）、
 * 目录拉取错误映射（401/403/404/超时/大小/JSON/结构）、applyCatalog 编排、
 * lastSyncedAt 落盘、启动自动同步。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

__registerMock('./crypto', {
  isAvailable: () => true,
  encrypt: (key) => (key ? Buffer.from('enc_' + key) : null),
  decrypt: (value) => (value ? Buffer.from(value).toString('utf8').replace(/^enc_/, '') : ''),
  mask: (key) => (key ? key.slice(0, 4) + '****' + key.slice(-4) : '****'),
  setSafeStorage: () => {},
})

const { OpsCenterSync, normalizeUrl } = require('./ops-center-sync')

function makeStore (initial) {
  let data = initial || ''
  return {
    getSetting: vi.fn(() => data),
    setSetting: vi.fn((_k, v) => { data = v }),
    _getData: () => data,
  }
}

function makeManager () {
  return { applyCatalog: vi.fn((items) => ({ code: 0, updated: items.length, inserted: 0 })) }
}

function jsonResp ({ status = 200, body = null, ok = null, arrayBuffer }) {
  return {
    status,
    ok: ok !== null ? ok : status >= 200 && status < 300,
    arrayBuffer: arrayBuffer || (async () => Buffer.from(JSON.stringify(body))),
  }
}

const LOG = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('normalizeUrl', () => {
  it('接受 https URL 并去掉尾部斜杠', () => {
    expect(normalizeUrl('https://ops.example.com/')).toBe('https://ops.example.com')
    expect(normalizeUrl('  https://ops.example.com:8443/v1/  ')).toBe('https://ops.example.com:8443/v1')
  })

  it('本机回环地址允许 http', () => {
    expect(normalizeUrl('http://localhost:8000')).toBe('http://localhost:8000')
    expect(normalizeUrl('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000')
    expect(normalizeUrl('http://127.0.0.2:8000')).toBe('http://127.0.0.2:8000')
    expect(normalizeUrl('http://[::1]:8000')).toBe('http://[::1]:8000')
  })

  it('非本机地址强制 https，拒绝明文 http', () => {
    expect(normalizeUrl('http://ops.example.com')).toBe('')
  })

  it('拒绝携带用户名/密码、非 http(s) 协议与空值', () => {
    expect(normalizeUrl('https://user:pass@ops.example.com')).toBe('')
    expect(normalizeUrl('ftp://ops.example.com')).toBe('')
    expect(normalizeUrl('')).toBe('')
    expect(normalizeUrl(undefined)).toBe('')
    expect(normalizeUrl('not-a-url')).toBe('')
  })
})

describe('OpsCenterSync saveConfig/getConfig', () => {
  afterEach(() => { vi.useRealTimers() })

  it('保存时用 safeStorage 加密 Key，getConfig 不暴露明文', () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    const res = svc.saveConfig({ url: 'https://ops.example.com', apiKey: 'secret-key-123', autoSync: true })
    expect(res.code).toBe(0)
    expect(res.config.url).toBe('https://ops.example.com')
    expect(res.config.apiKeyConfigured).toBe(true)
    expect(res.config.autoSync).toBe(true)
    // 明文不出现在任何返回/存储中
    expect(JSON.stringify(res)).not.toContain('secret-key-123')
    expect(store._getData()).not.toContain('secret-key-123')
    expect(store._getData()).toContain('apiKeyEnc')
    expect(svc.getConfig().apiKey).toBeUndefined()
  })

  it('二次保存（apiKey 为空）不把明文写进 settings（密文透传）', () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    svc.saveConfig({ url: 'https://ops.example.com', apiKey: 'secret-key-123', autoSync: true })
    // 第二次保存：切换 autoSync，不填 Key —— 必须透传密文，绝不能解密后回写明文
    const res = svc.saveConfig({ url: 'https://ops.example.com', apiKey: '', autoSync: false })
    expect(res.code).toBe(0)
    expect(res.config.apiKeyConfigured).toBe(true)
    expect(store._getData()).not.toContain('secret-key-123')
    expect(store._getData()).not.toContain('secret')
  })

  it('apiKey 为空时保留已有 Key，不重复加密', () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    svc.saveConfig({ url: 'https://ops.example.com', apiKey: 'k1' })
    const res = svc.saveConfig({ url: 'https://ops.example.com', apiKey: '', autoSync: false })
    expect(res.code).toBe(0)
    expect(res.config.autoSync).toBe(false)
    expect(res.config.apiKeyConfigured).toBe(true)
    expect(store._getData()).toContain('apiKeyEnc')
  })

  it('非法 URL 拒绝保存', () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    const res = svc.saveConfig({ url: 'http://ops.example.com', apiKey: 'k' })
    expect(res.code).toBe(-1)
    expect(res.message).toContain('http(s)')
  })
})

describe('OpsCenterSync syncNow', () => {
  let originalFetch
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => {
    global.fetch = originalFetch
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('未配置 URL / Key / manager 时 fail-closed', async () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    expect((await svc.syncNow()).code).toBe(-1)
    expect((await svc.syncNow()).message).toContain('地址')

    // manager 未提供 applyCatalog → 模型服务未就绪（不发起网络请求）
    const svc2 = new OpsCenterSync({ store, modelProviderManager: {}, log: LOG })
    svc2.saveConfig({ url: 'https://ops.example.com', apiKey: 'k' })
    expect((await svc2.syncNow()).code).toBe(-1)
    expect((await svc2.syncNow()).message).toContain('模型服务未就绪')
  })

  it('401/403 → API Key 无效；404 → 未启用目录', async () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    svc.saveConfig({ url: 'https://ops.example.com', apiKey: 'k' })
    global.fetch = vi.fn(async () => jsonResp({ status: 401 }))
    expect((await svc.syncNow()).message).toContain('API Key 无效')
    global.fetch = vi.fn(async () => jsonResp({ status: 404 }))
    expect((await svc.syncNow()).message).toContain('未启用运营同步')
    global.fetch = vi.fn(async () => jsonResp({ status: 500 }))
    expect((await svc.syncNow()).message).toContain('HTTP 500')
  })

  it('超时（10 秒）→ 明确错误', async () => {
    vi.useFakeTimers()
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    svc.saveConfig({ url: 'https://ops.example.com', apiKey: 'k' })
    global.fetch = vi.fn((_url, opts) => new Promise((_resolve, reject) => {
      opts.signal && opts.signal.addEventListener('abort', () => {
        const e = new Error('The operation was aborted')
        e.name = 'AbortError'
        reject(e)
      })
    }))
    const pending = svc.syncNow()
    vi.advanceTimersByTime(10001)
    const res = await pending
    expect(res.code).toBe(-1)
    expect(res.message).toContain('超时')
  })

  it('响应超过 1MB / 非法 JSON / 缺 items → 拒绝', async () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    svc.saveConfig({ url: 'https://ops.example.com', apiKey: 'k' })
    const big = Buffer.alloc(1024 * 1024 + 1, 1)
    global.fetch = vi.fn(async () => jsonResp({ arrayBuffer: async () => big }))
    expect((await svc.syncNow()).message).toContain('1MB')

    global.fetch = vi.fn(async () => jsonResp({ arrayBuffer: async () => Buffer.from('not-json') }))
    expect((await svc.syncNow()).message).toContain('JSON')

    global.fetch = vi.fn(async () => jsonResp({ body: { foo: 1 } }))
    expect((await svc.syncNow()).message).toContain('items')
  })

  it('成功：拉取目录 → applyCatalog → lastSyncedAt 落盘', async () => {
    const store = makeStore()
    const manager = makeManager()
    const svc = new OpsCenterSync({ store, modelProviderManager: manager, log: LOG })
    svc.saveConfig({ url: 'https://ops.example.com', apiKey: 'k' })
    const items = [{ id: 'openai', name: 'OpenAI' }, { id: 'minimax-multimodal', name: 'MiniMax' }]
    global.fetch = vi.fn(async () => jsonResp({ body: { items } }))
    const res = await svc.syncNow()
    expect(res.code).toBe(0)
    expect(res.updated).toBe(2)
    expect(res.syncedAt).toBeTruthy()
    expect(manager.applyCatalog).toHaveBeenCalledWith(items)
    expect(store._getData()).toContain('lastSyncedAt')
    expect(svc.getConfig().lastSyncedAt).toBeTruthy()
  })

  it('连接失败 → 明确错误', async () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    svc.saveConfig({ url: 'https://ops.example.com', apiKey: 'k' })
    global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    expect((await svc.syncNow()).message).toContain('无法连接')
  })
})

describe('OpsCenterSync autoSyncOnStart', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('未配置自动同步时不调度', () => {
    vi.useFakeTimers()
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    const spy = vi.spyOn(svc, 'syncNow')
    svc.autoSyncOnStart()
    vi.advanceTimersByTime(10000)
    expect(spy).not.toHaveBeenCalled()
  })

  it('配置后启动 3 秒延迟执行同步，失败仅警告', () => {
    vi.useFakeTimers()
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    svc.saveConfig({ url: 'https://ops.example.com', apiKey: 'k' })
    const spy = vi.spyOn(svc, 'syncNow').mockResolvedValue({ code: -1, message: 'boom' })
    svc.autoSyncOnStart()
    expect(spy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3001)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('OpsCenterSync 运行时策略（公告/版本/内容安全）', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('applyRuntime 缓存公告/策略并重建敏感词过滤器（内置 + 远程词）', () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    svc.applyRuntime({
      announcements: [{ title: '维护', severity: 'maintenance', content: 'x' }],
      update_policy: { min_version: '2.3.50', force_version: '2.3.53', gray_ratio: 50, enabled: true },
      content_policy: { name: '默认', word_list: ['远程词甲', '远程词乙'], replacement: '***', enabled: true },
      synced_at: '2026-08-10T00:00:00Z',
    })
    const state = svc.getRuntimeState()
    expect(state.announcements).toHaveLength(1)
    expect(state.announcements[0].severity).toBe('maintenance')
    expect(state.updatePolicy.force_version).toBe('2.3.53')
    // 渲染端最小权限：词库/替换串不下发
    expect(state.contentPolicy).not.toHaveProperty('word_list')
    expect(state.contentPolicy).not.toHaveProperty('replacement')
    expect(state.contentPolicy.enabled).toBe(true)
    expect(svc.getReplacement()).toBe('***')
    expect(svc.getUpdatePolicy().gray_ratio).toBe(50)

    const filter = svc.getSensitiveFilter()
    expect(filter).toBeTruthy()
    expect(filter.check('这里有远程词甲').hasSensitive).toBe(true)
    expect(filter.replace('远程词乙')).toContain('***')
    // 持久化到 settings（值包含运行时状态 JSON）
    expect(store._getData()).toContain('"announcements"')
    expect(store.setSetting).toHaveBeenCalledWith('opsCenterRuntime', expect.stringContaining('远程词甲'))
  })

  it('内容安全策略未启用或词为空时，敏感词过滤器仅含内置词库', () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    svc.applyRuntime({ announcements: [], content_policy: { enabled: false, word_list: ['远程词'] }, synced_at: 't' })
    const filter = svc.getSensitiveFilter()
    expect(filter.check('远程词').hasSensitive).toBe(false)
  })

  it('setUpdatePolicyConsumer 在 applyRuntime 时收到策略', () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    const consumer = vi.fn()
    svc.setUpdatePolicyConsumer(consumer)
    svc.applyRuntime({ announcements: [], update_policy: { min_version: '2.3.50', enabled: true } })
    expect(consumer).toHaveBeenCalledWith(expect.objectContaining({ min_version: '2.3.50' }))
  })

  it('syncNow 目录成功时 best-effort 拉取 runtime（失败仅 warn，目录结果不受影响）', async () => {
    const store = makeStore()
    const manager = makeManager()
    const svc = new OpsCenterSync({ store, modelProviderManager: manager, log: LOG })
    svc.saveConfig({ url: 'https://ops.example.com', apiKey: 'k' })
    const originalFetch = global.fetch
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/runtime/bootstrap')) {
        return jsonResp({ body: { announcements: [{ title: '公告', severity: 'info', content: '' }], update_policy: null, content_policy: null, synced_at: 't' } })
      }
      return jsonResp({ body: { items: [{ id: 'openai' }] } })
    })
    try {
      const res = await svc.syncNow()
      expect(res.code).toBe(0)
      expect(res.runtimeApplied).toBe(true)
      expect(svc.getRuntimeState().announcements).toHaveLength(1)
    } finally {
      global.fetch = originalFetch
    }
  })
})


describe('OpsCenterSync featureFlags', () => {
  it('applyRuntime 存储并暴露功能开关（typed value）', () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    svc.applyRuntime({
      announcements: [],
      feature_flags: { 'videoCreation.maxOutputResolution': '4k', 'compose.maxSegments': 12, 'allow.flag': true },
      synced_at: 't',
    })
    const state = svc.getRuntimeState()
    expect(state.featureFlags['videoCreation.maxOutputResolution']).toBe('4k')
    expect(state.featureFlags['compose.maxSegments']).toBe(12)
    expect(state.featureFlags['allow.flag']).toBe(true)
    expect(svc.getFeatureFlag('videoCreation.maxOutputResolution')).toBe('4k')
    expect(svc.getFeatureFlag('missing')).toBeUndefined()
    // 持久化到 settings
    expect(store._getData()).toContain('videoCreation.maxOutputResolution')
  })

  it('feature_flags 结构非法（数组/对象嵌套/超限）→ fail-closed 空对象', () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    svc.applyRuntime({ announcements: [], feature_flags: [1, 2], synced_at: 't' })
    expect(svc.getRuntimeState().featureFlags).toEqual({})
    // 嵌套对象值被忽略（仅基本类型）
    svc.applyRuntime({ announcements: [], feature_flags: { a: { nested: 1 }, b: 'ok' }, synced_at: 't' })
    expect(svc.getRuntimeState().featureFlags).toEqual({ b: 'ok' })
    // 超 100 个 key 整批拒绝
    const huge = {}
    for (let i = 0; i < 101; i++) huge['k' + i] = i
    svc.applyRuntime({ announcements: [], feature_flags: huge, synced_at: 't' })
    expect(svc.getRuntimeState().featureFlags).toEqual({})
  })

  it('重启后从 settings 恢复 featureFlags', () => {
    const store = makeStore()
    const svc1 = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    svc1.applyRuntime({ announcements: [], feature_flags: { 'videoCreation.maxOutputResolution': '1080p' }, synced_at: 't' })
    const svc2 = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    expect(svc2.getFeatureFlag('videoCreation.maxOutputResolution')).toBe('1080p')
  })

  it('恢复路径同样归一化：settings 中的非法结构不进入运行时状态', () => {
    const store = makeStore()
    // 直接注入脏 settings（模拟旧版本/手工篡改持久化）
    store.setSetting('opsCenterRuntime', JSON.stringify({
      announcements: [], featureFlags: { a: { nested: 1 }, b: 'ok', c: true }, syncedAt: 't',
    }))
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    expect(svc.getRuntimeState().featureFlags).toEqual({ b: 'ok', c: true })
  })

  it('getFeatureFlag 拒绝原型键且仅返回自有属性', () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    svc.applyRuntime({ announcements: [], feature_flags: { normal: 'v', __proto__: 'x', constructor: 1 }, synced_at: 't' })
    expect(svc.getFeatureFlag('__proto__')).toBeUndefined()
    expect(svc.getFeatureFlag('constructor')).toBeUndefined()
    expect(svc.getFeatureFlag('toString')).toBeUndefined() // 不读原型链
    expect(svc.getFeatureFlag('normal')).toBe('v')
    expect(svc.getRuntimeState().featureFlags).toEqual({ normal: 'v' })
  })
})
describe('OpsCenterSync applyRuntime platform_defs', () => {
  it('注入 platformConfig 时应用 platform_defs', () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    const applyRemote = vi.fn(() => 2)
    svc.setPlatformConfig({ applyRemote })
    svc.applyRuntime({ announcements: [], platform_defs: [{ id: 'a' }, { id: 'b' }], synced_at: 't' })
    expect(applyRemote).toHaveBeenCalledWith([{ id: 'a' }, { id: 'b' }])
  })

  it('未注入 platformConfig 时跳过 platform_defs，不影响其他运行时策略', () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    svc.applyRuntime({ announcements: [{ title: 'x', severity: 'info', content: '' }], platform_defs: [{ id: 'a' }], synced_at: 't' })
    expect(svc.getRuntimeState().announcements).toHaveLength(1)
  })

  it('setPlatformConfig 拒绝无 applyRemote 的对象（视为未注入）', () => {
    const store = makeStore()
    const svc = new OpsCenterSync({ store, modelProviderManager: makeManager(), log: LOG })
    svc.setPlatformConfig({})
    svc.applyRuntime({ announcements: [], platform_defs: [{ id: 'a' }], synced_at: 't' })
    expect(svc.getRuntimeState().announcements).toEqual([])

  })
})
