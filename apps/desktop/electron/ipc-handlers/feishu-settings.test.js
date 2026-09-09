// @ts-check
/**
 * feishu-settings.test.js — 飞书配置 IPC handlers 单测
 *
 * mock safeStorage（注入 crypto）+ mock store + mock FeishuClient（__registerMock）。
 * 覆盖：get-config 不返回 Secret、save-config 加密存储、test-connection（明文/存储/未配置/失败）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../services/logger', () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))

// CJS mock：test-setup 的 __registerMock 拦截 Module._load（vi.mock 只对 ESM import 生效）
let mockFeishuClient
function installFeishuMock() {
  mockFeishuClient = { FeishuClient: vi.fn(), testConnection: vi.fn() }
  mockFeishuClient.FeishuClient.mockImplementation(function () {
    return { testConnection: mockFeishuClient.testConnection }
  })
  __registerMock('./services/feishu-client', mockFeishuClient)
}

function createMockSafeStorage() {
  const store = new Map()
  let counter = 0
  return {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((str) => {
      const key = `enc_${counter++}_${str}`
      store.set(key, str)
      return Buffer.from(key, 'utf-8')
    }),
    decryptString: vi.fn((buf) => store.get(buf.toString('utf-8')) || ''),
  }
}

let registerHandlers
let crypto
const TRUSTED_EVENT = { senderFrame: { url: 'app://localhost/index.html' } }

beforeEach(async () => {
  __enableElectronMock()
  installFeishuMock()
  crypto = require('../services/crypto')
  const mod = require('./feishu-settings')
  registerHandlers = mod.default || mod
})

afterEach(() => {
  vi.clearAllMocks()
  crypto.setSafeStorage(null)
})

function createMockIpcMain() {
  const handlers = {}
  return {
    handle: vi.fn((channel, fn) => { handlers[channel] = fn }),
    _getHandler: (channel) => handlers[channel],
    _call: async (channel, ...args) => handlers[channel](TRUSTED_EVENT, ...args),
  }
}

function createMockStore() {
  let settings = {}
  return {
    getSetting: vi.fn((k) => settings[k]),
    setSetting: vi.fn((k, v) => { settings[k] = v }),
    _settings: () => settings,
  }
}

describe('feishu-settings IPC handlers', () => {
  it('未配置时 get-config 返回空 appId/enabled=false', async () => {
    const ipcMain = createMockIpcMain()
    const store = createMockStore()
    registerHandlers(ipcMain, { store })
    const r = await ipcMain._call('feishu:get-config')
    expect(r.code).toBe(0)
    expect(r.data).toEqual({ appId: '', enabled: false })
  })

  it('save-config 加密存储，get-config 不返回 Secret', async () => {
    crypto.setSafeStorage(createMockSafeStorage())
    const ipcMain = createMockIpcMain()
    const store = createMockStore()
    registerHandlers(ipcMain, { store })
    const saved = await ipcMain._call('feishu:save-config', 'cli_app', 'my_secret_123')
    expect(saved.code).toBe(0)
    expect(saved.data).toEqual({ appId: 'cli_app', enabled: true })

    const cfg = store._settings().feishu_api_config
    expect(cfg.appId).toBe('cli_app')
    expect(cfg.appSecret).not.toContain('my_secret_123')
    expect(typeof cfg.appSecret).toBe('string')
    expect(cfg.enabled).toBe(true)
    expect(cfg.verifiedAt).toBeNull()

    const r = await ipcMain._call('feishu:get-config')
    expect(r.code).toBe(0)
    expect(r.data).toEqual({ appId: 'cli_app', enabled: true })
    expect(JSON.stringify(r.data)).not.toContain('my_secret_123')
  })

  it('save-config 参数校验：appId/appSecret 不能为空', async () => {
    const ipcMain = createMockIpcMain()
    const store = createMockStore()
    registerHandlers(ipcMain, { store })
    expect((await ipcMain._call('feishu:save-config', '', 's')).code).not.toBe(0)
    expect((await ipcMain._call('feishu:save-config', 'a', '')).code).not.toBe(0)
  })

  it('save-config 在 safeStorage 不可用时拒绝存储', async () => {
    crypto.setSafeStorage({ isEncryptionAvailable: () => false, encryptString: vi.fn(), decryptString: vi.fn() })
    const ipcMain = createMockIpcMain()
    const store = createMockStore()
    registerHandlers(ipcMain, { store })
    const r = await ipcMain._call('feishu:save-config', 'app', 'secret')
    expect(r.code).not.toBe(0)
    expect(store.setSetting).not.toHaveBeenCalled()
  })

  it('test-connection 用传入明文参数构造客户端并成功', async () => {
    mockFeishuClient.testConnection.mockResolvedValue(true)
    const ipcMain = createMockIpcMain()
    const store = createMockStore()
    registerHandlers(ipcMain, { store })
    const r = await ipcMain._call('feishu:test-connection', 'app1', 'sec1')
    expect(r.code).toBe(0)
    expect(r.data).toEqual({ ok: true })
    expect(mockFeishuClient.FeishuClient).toHaveBeenCalledWith({ appId: 'app1', appSecret: 'sec1' })
  })

  it('test-connection 用已存配置（解密 Secret）构造客户端', async () => {
    crypto.setSafeStorage(createMockSafeStorage())
    const ipcMain = createMockIpcMain()
    const store = createMockStore()
    registerHandlers(ipcMain, { store })
    await ipcMain._call('feishu:save-config', 'app2', 'stored_secret')
    mockFeishuClient.testConnection.mockResolvedValue(true)
    const r = await ipcMain._call('feishu:test-connection')
    expect(r.code).toBe(0)
    expect(r.data).toEqual({ ok: true })
    expect(mockFeishuClient.FeishuClient).toHaveBeenCalledWith({ appId: 'app2', appSecret: 'stored_secret' })
  })

  it('test-connection 未配置时返回错误', async () => {
    const ipcMain = createMockIpcMain()
    const store = createMockStore()
    registerHandlers(ipcMain, { store })
    const r = await ipcMain._call('feishu:test-connection')
    expect(r.code).not.toBe(0)
    expect(r.data).toEqual({ ok: false })
  })

  it('test-connection 失败返回 ok:false', async () => {
    mockFeishuClient.testConnection.mockRejectedValue(new Error('network down'))
    const ipcMain = createMockIpcMain()
    const store = createMockStore()
    registerHandlers(ipcMain, { store })
    const r = await ipcMain._call('feishu:test-connection', 'app', 'sec')
    expect(r.code).not.toBe(0)
    expect(r.data).toEqual({ ok: false })
    expect(r.message).toMatch(/network down/)
  })
})
