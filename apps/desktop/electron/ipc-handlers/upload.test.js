// @ts-check
/**
 * Upload IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - upload:chunked / upload:cancel
 *
 * 注：本文件仅包含 2 个 handler，均为写操作，无只读 handler（如 upload:status）。
 * 「正常工作」用例通过可信来源调用 upload:cancel 验证迁移未破坏合法流程。
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
  const mod = await import('./upload')
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
    _chunkedUploader: {
      upload: vi.fn(),
      cancel: vi.fn(),
    },
    defaultUploadChunkFn: null,
    ...overrides,
  }
}

// 不可信来源（外部网页）
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }
// 可信来源（dev localhost）
const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' } }

describe('upload IPC 写操作 sender 校验', () => {
  it('upload:chunked 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('upload:chunked')

    const result = await handler(UNTRUSTED_EVENT, { filePath: '/tmp/test-electron-path/media/foo.png' })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('upload:cancel 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('upload:cancel')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })
})

describe('upload IPC 可信来源正常工作', () => {
  it('upload:cancel 可信来源正常调用 _chunkedUploader.cancel', async () => {
    const deps = createMockDeps({
      _chunkedUploader: {
        upload: vi.fn(),
        cancel: vi.fn(),
      },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('upload:cancel')

    const result = await handler(TRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: true })
    expect(deps._chunkedUploader.cancel).toHaveBeenCalled()
  })
})
