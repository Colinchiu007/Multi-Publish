// @ts-check
/**
 * Update IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - update:download / update:install
 *
 * 只读操作不校验：update:check
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
  const mod = await import('./update')
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
    autoUpdater: {
      check: vi.fn(),
      download: vi.fn(),
      quitAndInstall: vi.fn(),
    },
    ...overrides,
  }
}

// 不可信来源（外部网页）
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }
// 可信来源（dev localhost）
const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' } }

describe('update IPC 写操作 sender 校验', () => {
  it('update:download 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('update:download')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('update:install 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('update:install')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })
})

describe('update IPC 只读操作正常工作', () => {
  it('update:check 只读操作不加 sender 校验，外部来源也可调用', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('update:check')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: true })
    expect(deps.autoUpdater.check).toHaveBeenCalled()
  })
})

describe('update IPC 可信来源正常工作', () => {
  it('update:download 可信来源正常调用 autoUpdater.download', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('update:download')

    const result = await handler(TRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: true })
    expect(deps.autoUpdater.download).toHaveBeenCalled()
  })

  it('update:install 可信来源正常调用 autoUpdater.quitAndInstall', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('update:install')

    const result = await handler(TRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: true })
    expect(deps.autoUpdater.quitAndInstall).toHaveBeenCalled()
  })
})
