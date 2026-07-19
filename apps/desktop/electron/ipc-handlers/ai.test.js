// @ts-check
/**
 * AI IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - ai:generate / ai:save-config / ai:generate-titles / ai:generate-summary
 *
 * 只读操作不校验：list-providers / get-config / list-models /
 * test-connection / is-configured / enhance-content
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock logger 防止真实日志污染
vi.mock('../services/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

// 启用 electron mock，withSenderCheck 通过 require('electron').app 读取 isPackaged
__enableElectronMock()

let registerHandlers
let originalNodeEnv
let originalIsPackaged

beforeEach(async () => {
  vi.resetModules()
  // 信任 dev localhost:5174 — 模拟未打包开发模式
  originalNodeEnv = process.env.NODE_ENV
  originalIsPackaged = __electronMock.app.isPackaged
  delete process.env.NODE_ENV
  __electronMock.app.isPackaged = false
  const mod = await import('./ai')
  registerHandlers = mod.default || mod
})

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
  __electronMock.app.isPackaged = originalIsPackaged
})

function createMockIpcMain() {
  const handlers = {}
  return {
    handle: vi.fn((channel, fn) => { handlers[channel] = fn }),
    on: vi.fn(),
    _get: (channel) => handlers[channel],
  }
}

function createMockDeps(overrides = {}) {
  return {
    aiGenerator: {
      listProviders: vi.fn(() => []),
      getProviderConfig: vi.fn(),
      listModels: vi.fn(() => []),
      generate: vi.fn(),
      testConnection: vi.fn(),
      updateProviderConfig: vi.fn(),
    },
    aiWriter: {
      isConfigured: vi.fn(() => true),
      generateTitles: vi.fn(),
      enhanceContent: vi.fn(),
      generateSummary: vi.fn(),
    },
    BrowserWindow: { fromWebContents: vi.fn(() => null), getAllWindows: vi.fn(() => []) },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  }
}

// 不可信来源（外部网页）
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }
// 可信来源（dev localhost）
const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' } }

describe('ai IPC 写操作 sender 校验', () => {
  it('ai:generate 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('ai:generate')

    const result = await handler(UNTRUSTED_EVENT, { type: 'text', provider: 'openai', params: {} })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('ai:save-config 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('ai:save-config')

    const result = await handler(UNTRUSTED_EVENT, 'openai', { apiKey: 'k' })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('ai:generate-titles 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('ai:generate-titles')

    const result = await handler(UNTRUSTED_EVENT, 'topic')

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('ai:generate-summary 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('ai:generate-summary')

    const result = await handler(UNTRUSTED_EVENT, 'content')

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })
})

describe('ai IPC 可信来源与只读操作', () => {
  it('ai:generate-titles 可信来源正常调用 aiWriter', async () => {
    const deps = createMockDeps({
      aiWriter: {
        isConfigured: vi.fn(() => true),
        generateTitles: vi.fn().mockResolvedValue(['标题一', '标题二']),
        enhanceContent: vi.fn(),
        generateSummary: vi.fn(),
      },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('ai:generate-titles')

    const result = await handler(TRUSTED_EVENT, 'topic')

    expect(result).toEqual({ code: 0, data: ['标题一', '标题二'] })
    expect(deps.aiWriter.generateTitles).toHaveBeenCalledWith('topic')
  })

  it('ai:list-providers 只读操作不加 sender 校验，外部来源也可调用', async () => {
    const deps = createMockDeps({
      aiGenerator: {
        listProviders: vi.fn(() => ['openai', 'anthropic']),
        getProviderConfig: vi.fn(),
        listModels: vi.fn(() => []),
        generate: vi.fn(),
        testConnection: vi.fn(),
        updateProviderConfig: vi.fn(),
      },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('ai:list-providers')

    const result = await handler(UNTRUSTED_EVENT, null)

    expect(result).toEqual({ code: 0, data: ['openai', 'anthropic'] })
  })
})
