// @ts-check
/**
 * Video IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - video:process / video:generate-subtitle
 *
 * 只读操作不校验：video:status
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
  const mod = await import('./video')
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
    videoEngine: {
      getStatus: vi.fn(() => ({ state: 'idle' })),
      listProcessTypes: vi.fn(() => []),
      listAnalyzeTypes: vi.fn(() => []),
      listStockSources: vi.fn(() => []),
      process: vi.fn(async () => ({ ok: true })),
      analyze: vi.fn(async () => ({})),
      mixAudio: vi.fn(async () => ({})),
      searchStock: vi.fn(async () => []),
      generateSubtitle: vi.fn(async () => ({ text: 'subtitle' })),
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

describe('video IPC 写操作 sender 校验', () => {
  it('video:process 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('video:process')

    const result = await handler(UNTRUSTED_EVENT, { type: 'clip', params: {} })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('video:generate-subtitle 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('video:generate-subtitle')

    const result = await handler(UNTRUSTED_EVENT, '/tmp/audio.mp3', 'zh')

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })
})

describe('video IPC 只读操作不校验来源', () => {
  it('video:status 外部来源也可正常调用', async () => {
    const mockStatus = { state: 'idle' }
    const deps = createMockDeps({
      videoEngine: { getStatus: vi.fn(() => mockStatus) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('video:status')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: mockStatus })
  })
})

describe('video IPC 可信来源正常工作', () => {
  it('video:process 可信来源正常调用 videoEngine.process', async () => {
    const mockResult = { ok: true, output: '/tmp/out.mp4' }
    const deps = createMockDeps({
      videoEngine: { process: vi.fn(async () => mockResult) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('video:process')

    const result = await handler(TRUSTED_EVENT, { type: 'clip', params: { src: '/tmp/in.mp4' } })

    expect(result).toEqual({ code: 0, data: mockResult })
    expect(deps.videoEngine.process).toHaveBeenCalledWith('clip', { src: '/tmp/in.mp4' }, expect.any(Function))
  })

  it('video:generate-subtitle 可信来源正常调用 videoEngine.generateSubtitle', async () => {
    const mockSub = { text: '你好' }
    const deps = createMockDeps({
      videoEngine: { generateSubtitle: vi.fn(async () => mockSub) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('video:generate-subtitle')

    const result = await handler(TRUSTED_EVENT, '/tmp/audio.mp3', 'zh')

    expect(result).toEqual({ code: 0, data: mockSub })
    expect(deps.videoEngine.generateSubtitle).toHaveBeenCalledWith('/tmp/audio.mp3', 'zh')
  })
})
