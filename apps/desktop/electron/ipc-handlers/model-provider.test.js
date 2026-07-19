// @ts-check
/**
 * model-provider.test.js — IPC handler 单元测试
 *
 * 覆盖 12 个 model-provider:* handler：
 *   - list / get / create / update / delete / set-default / get-default
 *   - test / presets / is-configured
 *   - logs / clean-logs（第 4 轮新增，含 store 缺失兜底）
 *
 * 参照 scheduler.test.js 的 createMockIpcMain 模式。
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'

// Mock logger 防止真实日志污染
vi.mock('../services/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

// 启用 electron mock，withSenderCheck 通过 require('electron').app 读取 isPackaged
__enableElectronMock()

let registerHandlers

beforeAll(async () => {
  const mod = await import('./model-provider')
  registerHandlers = mod.default || mod
})

function createMockIpcMain () {
  const handlers = {}
  return {
    handle: vi.fn((channel, fn) => { handlers[channel] = fn }),
    _callHandler: async (channel, ...args) => {
      if (!handlers[channel]) throw new Error(`No handler for ${channel}`)
      return handlers[channel]({ sender: { send: vi.fn() } }, ...args)
    },
    _get: (channel) => handlers[channel],
  }
}

function createMockManager () {
  return {
    init: vi.fn(),
    listProviders: vi.fn(() => [{ id: 'openai', name: 'OpenAI' }]),
    getProvider: vi.fn(() => ({ id: 'openai', name: 'OpenAI' })),
    createProvider: vi.fn(() => ({ code: 0, data: { id: 'openai' } })),
    updateProvider: vi.fn(() => ({ code: 0 })),
    deleteProvider: vi.fn(() => ({ code: 0 })),
    setDefault: vi.fn(() => ({ code: 0 })),
    getDefault: vi.fn(() => ({ id: 'openai' })),
    testConnection: vi.fn(async () => ({ code: 0, data: { ok: true } })),
    getAvailablePresets: vi.fn(() => [{ id: 'openai', name: 'OpenAI' }]),
    isConfigured: vi.fn(() => true),
  }
}

function createMockStore () {
  return {
    getProviderLogs: vi.fn(() => [{ id: 1, status: 'success' }]),
    cleanProviderLogs: vi.fn(() => 5),
  }
}

describe('model-provider IPC handlers', () => {
  let ipcMain, modelProviderManager, store

  beforeEach(() => {
    ipcMain = createMockIpcMain()
    modelProviderManager = createMockManager()
    store = createMockStore()
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    registerHandlers(ipcMain, { modelProviderManager, store, log })
  })

  // ─── 注册完整性 ────────────────────────────────
  it('registers all 12 model-provider handlers', () => {
    expect(ipcMain.handle).toHaveBeenCalledTimes(12)
    const channels = ipcMain.handle.mock.calls.map(c => c[0])
    expect(channels).toEqual([
      'model-provider:list',
      'model-provider:get',
      'model-provider:create',
      'model-provider:update',
      'model-provider:delete',
      'model-provider:set-default',
      'model-provider:get-default',
      'model-provider:test',
      'model-provider:presets',
      'model-provider:is-configured',
      'model-provider:logs',
      'model-provider:clean-logs',
    ])
  })

  // ─── model-provider:list ──────────────────────
  describe('model-provider:list', () => {
    it('lists all providers when no category', async () => {
      const result = await ipcMain._callHandler('model-provider:list')
      expect(result.code).toBe(0)
      expect(result.data).toHaveLength(1)
      expect(modelProviderManager.listProviders).toHaveBeenCalledWith(undefined)
    })

    it('passes category filter to manager', async () => {
      await ipcMain._callHandler('model-provider:list', 'llm')
      expect(modelProviderManager.listProviders).toHaveBeenCalledWith('llm')
    })

    it('returns empty array on error', async () => {
      modelProviderManager.listProviders.mockImplementation(() => { throw new Error('DB error') })
      const result = await ipcMain._callHandler('model-provider:list')
      expect(result.code).toBe(-1)
      expect(result.data).toEqual([])
    })
  })

  // ─── model-provider:get ───────────────────────
  describe('model-provider:get', () => {
    it('returns provider by id', async () => {
      const result = await ipcMain._callHandler('model-provider:get', 'openai')
      expect(result.code).toBe(0)
      expect(result.data.id).toBe('openai')
    })

    it('returns error when provider not found', async () => {
      modelProviderManager.getProvider.mockReturnValue(null)
      const result = await ipcMain._callHandler('model-provider:get', 'nope')
      expect(result.code).toBe(-1)
      expect(result.message).toMatch(/不存在/)
    })

    it('returns error on exception', async () => {
      modelProviderManager.getProvider.mockImplementation(() => { throw new Error('boom') })
      const result = await ipcMain._callHandler('model-provider:get', 'x')
      expect(result.code).toBe(-1)
      expect(result.message).toBe('boom')
    })
  })

  // ─── model-provider:create ────────────────────
  describe('model-provider:create', () => {
    it('delegates to manager.createProvider and returns its result', async () => {
      const data = { id: 'openai', name: 'OpenAI', api_key: 'sk-x' }
      const result = await ipcMain._callHandler('model-provider:create', data)
      expect(modelProviderManager.createProvider).toHaveBeenCalledWith(data)
      expect(result.code).toBe(0)
      expect(result.data.id).toBe('openai')
    })

    it('returns error when manager throws', async () => {
      modelProviderManager.createProvider.mockImplementation(() => { throw new Error('duplicate id') })
      const result = await ipcMain._callHandler('model-provider:create', {})
      expect(result.code).toBe(-1)
      expect(result.message).toBe('duplicate id')
    })
  })

  // ─── model-provider:update ────────────────────
  describe('model-provider:update', () => {
    it('delegates to manager.updateProvider', async () => {
      const result = await ipcMain._callHandler('model-provider:update', 'openai', { name: 'OpenAI 2' })
      expect(modelProviderManager.updateProvider).toHaveBeenCalledWith('openai', { name: 'OpenAI 2' })
      expect(result.code).toBe(0)
    })

    it('returns error when manager throws', async () => {
      modelProviderManager.updateProvider.mockImplementation(() => { throw new Error('not found') })
      const result = await ipcMain._callHandler('model-provider:update', 'x', {})
      expect(result.code).toBe(-1)
    })
  })

  // ─── model-provider:delete ────────────────────
  describe('model-provider:delete', () => {
    it('delegates to manager.deleteProvider', async () => {
      const result = await ipcMain._callHandler('model-provider:delete', 'openai')
      expect(modelProviderManager.deleteProvider).toHaveBeenCalledWith('openai')
      expect(result.code).toBe(0)
    })

    it('returns error when manager throws', async () => {
      modelProviderManager.deleteProvider.mockImplementation(() => { throw new Error('locked') })
      const result = await ipcMain._callHandler('model-provider:delete', 'x')
      expect(result.code).toBe(-1)
    })
  })

  // ─── model-provider:set-default ───────────────
  describe('model-provider:set-default', () => {
    it('delegates to manager.setDefault', async () => {
      const result = await ipcMain._callHandler('model-provider:set-default', 'llm', 'openai')
      expect(modelProviderManager.setDefault).toHaveBeenCalledWith('llm', 'openai')
      expect(result.code).toBe(0)
    })

    it('returns error when manager throws', async () => {
      modelProviderManager.setDefault.mockImplementation(() => { throw new Error('bad') })
      const result = await ipcMain._callHandler('model-provider:set-default', 'x', 'y')
      expect(result.code).toBe(-1)
    })
  })

  // ─── model-provider:get-default ───────────────
  describe('model-provider:get-default', () => {
    it('returns default provider for category', async () => {
      const result = await ipcMain._callHandler('model-provider:get-default', 'llm')
      expect(modelProviderManager.getDefault).toHaveBeenCalledWith('llm')
      expect(result.code).toBe(0)
      expect(result.data.id).toBe('openai')
    })

    it('returns error on exception', async () => {
      modelProviderManager.getDefault.mockImplementation(() => { throw new Error('no default') })
      const result = await ipcMain._callHandler('model-provider:get-default', 'x')
      expect(result.code).toBe(-1)
    })
  })

  // ─── model-provider:test ──────────────────────
  describe('model-provider:test', () => {
    it('delegates to manager.testConnection (async)', async () => {
      const result = await ipcMain._callHandler('model-provider:test', 'openai')
      expect(modelProviderManager.testConnection).toHaveBeenCalledWith('openai')
      expect(result.code).toBe(0)
      expect(result.data.ok).toBe(true)
    })

    it('returns error when testConnection throws', async () => {
      modelProviderManager.testConnection.mockRejectedValue(new Error('network'))
      const result = await ipcMain._callHandler('model-provider:test', 'x')
      expect(result.code).toBe(-1)
      expect(result.message).toBe('network')
    })
  })

  // ─── model-provider:presets ───────────────────
  describe('model-provider:presets', () => {
    it('returns available presets for category', async () => {
      const result = await ipcMain._callHandler('model-provider:presets', 'llm')
      expect(modelProviderManager.getAvailablePresets).toHaveBeenCalledWith('llm')
      expect(result.code).toBe(0)
      expect(result.data).toHaveLength(1)
    })

    it('returns empty array on error', async () => {
      modelProviderManager.getAvailablePresets.mockImplementation(() => { throw new Error('oops') })
      const result = await ipcMain._callHandler('model-provider:presets')
      expect(result.code).toBe(-1)
      expect(result.data).toEqual([])
    })
  })

  // ─── model-provider:is-configured ─────────────
  describe('model-provider:is-configured', () => {
    it('returns true when category is configured', async () => {
      const result = await ipcMain._callHandler('model-provider:is-configured', 'llm')
      expect(modelProviderManager.isConfigured).toHaveBeenCalledWith('llm')
      expect(result.code).toBe(0)
      expect(result.data).toBe(true)
    })

    it('returns false on error', async () => {
      modelProviderManager.isConfigured.mockImplementation(() => { throw new Error('db') })
      const result = await ipcMain._callHandler('model-provider:is-configured', 'x')
      expect(result.code).toBe(-1)
      expect(result.data).toBe(false)
    })
  })

  // ─── model-provider:logs ──────────────────────
  describe('model-provider:logs', () => {
    it('returns logs from store.getProviderLogs', async () => {
      const filter = { category: 'llm', status: 'success' }
      const result = await ipcMain._callHandler('model-provider:logs', filter)
      expect(store.getProviderLogs).toHaveBeenCalledWith(filter)
      expect(result.code).toBe(0)
      expect(result.data).toHaveLength(1)
      expect(result.data[0].status).toBe('success')
    })

    it('passes empty object when filter is undefined', async () => {
      await ipcMain._callHandler('model-provider:logs')
      expect(store.getProviderLogs).toHaveBeenCalledWith({})
    })

    it('returns empty array when store is missing', async () => {
      // 重新注册时不传 store
      const ipcMain2 = createMockIpcMain()
      const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
      registerHandlers(ipcMain2, { modelProviderManager, store: null, log })
      const result = await ipcMain2._callHandler('model-provider:logs', {})
      expect(result.code).toBe(0)
      expect(result.data).toEqual([])
    })

    it('returns empty array when store.getProviderLogs is not a function', async () => {
      const ipcMain2 = createMockIpcMain()
      const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
      registerHandlers(ipcMain2, { modelProviderManager, store: {}, log })
      const result = await ipcMain2._callHandler('model-provider:logs', {})
      expect(result.code).toBe(0)
      expect(result.data).toEqual([])
    })

    it('returns empty array on error', async () => {
      store.getProviderLogs.mockImplementation(() => { throw new Error('SQL error') })
      const result = await ipcMain._callHandler('model-provider:logs', {})
      expect(result.code).toBe(-1)
      expect(result.data).toEqual([])
    })
  })

  // ─── model-provider:clean-logs ────────────────
  describe('model-provider:clean-logs', () => {
    it('cleans logs via store.cleanProviderLogs', async () => {
      const result = await ipcMain._callHandler('model-provider:clean-logs', 7)
      expect(store.cleanProviderLogs).toHaveBeenCalledWith(7)
      expect(result.code).toBe(0)
      expect(result.data).toBe(5)
    })

    it('passes default 30 days when days is undefined', async () => {
      await ipcMain._callHandler('model-provider:clean-logs')
      expect(store.cleanProviderLogs).toHaveBeenCalledWith(30)
    })

    it('passes default 30 days when days is 0 (falsy)', async () => {
      await ipcMain._callHandler('model-provider:clean-logs', 0)
      expect(store.cleanProviderLogs).toHaveBeenCalledWith(30)
    })

    it('returns 0 when store is missing', async () => {
      const ipcMain2 = createMockIpcMain()
      const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
      registerHandlers(ipcMain2, { modelProviderManager, store: null, log })
      const result = await ipcMain2._callHandler('model-provider:clean-logs', 7)
      expect(result.code).toBe(0)
      expect(result.data).toBe(0)
    })

    it('returns 0 when store.cleanProviderLogs is not a function', async () => {
      const ipcMain2 = createMockIpcMain()
      const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
      registerHandlers(ipcMain2, { modelProviderManager, store: {}, log })
      const result = await ipcMain2._callHandler('model-provider:clean-logs', 7)
      expect(result.code).toBe(0)
      expect(result.data).toBe(0)
    })

    it('returns 0 on error', async () => {
      store.cleanProviderLogs.mockImplementation(() => { throw new Error('locked') })
      const result = await ipcMain._callHandler('model-provider:clean-logs', 7)
      expect(result.code).toBe(-1)
      expect(result.data).toBe(0)
    })
  })
})

// ─── sender 来源校验测试（withSenderCheck 迁移）──────────────
// 参考 account.test.js：5 个写操作拒绝外部来源，只读操作不校验
describe('model-provider IPC 写操作 sender 校验', () => {
  let ipcMain, modelProviderManager, store
  let originalNodeEnv
  let originalIsPackaged

  beforeEach(() => {
    // 信任 dev localhost:5174 — 模拟未打包开发模式
    originalNodeEnv = process.env.NODE_ENV
    originalIsPackaged = __electronMock.app.isPackaged
    delete process.env.NODE_ENV
    __electronMock.app.isPackaged = false

    ipcMain = createMockIpcMain()
    modelProviderManager = createMockManager()
    store = createMockStore()
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    registerHandlers(ipcMain, { modelProviderManager, store, log })
  })

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    __electronMock.app.isPackaged = originalIsPackaged
  })

  // 不可信来源（外部网页）
  const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }

  it('model-provider:create 拒绝外部网页调用', async () => {
    const handler = ipcMain._get('model-provider:create')
    const result = await handler(UNTRUSTED_EVENT, { id: 'openai', name: 'OpenAI' })
    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(modelProviderManager.createProvider).not.toHaveBeenCalled()
  })

  it('model-provider:update 拒绝外部网页调用', async () => {
    const handler = ipcMain._get('model-provider:update')
    const result = await handler(UNTRUSTED_EVENT, 'openai', { name: 'OpenAI 2' })
    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(modelProviderManager.updateProvider).not.toHaveBeenCalled()
  })

  it('model-provider:delete 拒绝外部网页调用', async () => {
    const handler = ipcMain._get('model-provider:delete')
    const result = await handler(UNTRUSTED_EVENT, 'openai')
    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(modelProviderManager.deleteProvider).not.toHaveBeenCalled()
  })

  it('model-provider:set-default 拒绝外部网页调用', async () => {
    const handler = ipcMain._get('model-provider:set-default')
    const result = await handler(UNTRUSTED_EVENT, 'llm', 'openai')
    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(modelProviderManager.setDefault).not.toHaveBeenCalled()
  })

  it('model-provider:clean-logs 拒绝外部网页调用', async () => {
    const handler = ipcMain._get('model-provider:clean-logs')
    const result = await handler(UNTRUSTED_EVENT, 7)
    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(store.cleanProviderLogs).not.toHaveBeenCalled()
  })
})

describe('model-provider IPC 只读操作不校验 sender', () => {
  let ipcMain, modelProviderManager, store

  beforeEach(() => {
    ipcMain = createMockIpcMain()
    modelProviderManager = createMockManager()
    store = createMockStore()
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    registerHandlers(ipcMain, { modelProviderManager, store, log })
  })

  // 外部来源 — 只读操作应放行
  const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }

  it('model-provider:list 外部来源可正常调用（只读不校验）', async () => {
    const handler = ipcMain._get('model-provider:list')
    const result = await handler(UNTRUSTED_EVENT, 'llm')
    expect(result.code).toBe(0)
    expect(result.data).toHaveLength(1)
    expect(modelProviderManager.listProviders).toHaveBeenCalledWith('llm')
  })

  it('model-provider:logs 外部来源可正常调用（只读不校验）', async () => {
    const handler = ipcMain._get('model-provider:logs')
    const result = await handler(UNTRUSTED_EVENT, { status: 'success' })
    expect(result.code).toBe(0)
    expect(result.data).toHaveLength(1)
    expect(store.getProviderLogs).toHaveBeenCalledWith({ status: 'success' })
  })

  it('model-provider:get-default 外部来源可正常调用（只读不校验）', async () => {
    const handler = ipcMain._get('model-provider:get-default')
    const result = await handler(UNTRUSTED_EVENT, 'llm')
    expect(result.code).toBe(0)
    expect(result.data.id).toBe('openai')
    expect(modelProviderManager.getDefault).toHaveBeenCalledWith('llm')
  })
})
