// @ts-check
/**
 * Onboarding IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - onboarding:complete
 *
 * 只读操作不校验：onboarding:status / onboarding:get-steps
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock logger 防止真实日志污染（vi.mock 对 CJS 不生效，仅保留兼容写法）
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

// onboarding.js 内部 require('../services/onboarding')，需通过 __registerMock 拦截 CJS require
const onboardingMock = {
  completeOnboarding: vi.fn(() => true),
  isOnboardingDone: vi.fn(() => false),
  getSteps: vi.fn(() => [{ id: 'welcome', title: '欢迎使用' }]),
  resetOnboarding: vi.fn(),
  startOnboarding: vi.fn(),
}

beforeEach(async () => {
  vi.resetModules()
  // 信任 dev localhost:5174 — 模拟未打包开发模式
  originalNodeEnv = process.env.NODE_ENV
  originalIsPackaged = __electronMock.app.isPackaged
  delete process.env.NODE_ENV
  __electronMock.app.isPackaged = false
  // 注册 CJS 模块 mock — onboarding.js 直接 require 此模块
  __registerMock('../services/onboarding', onboardingMock)
  const mod = await import('./onboarding')
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

// 不可信来源（外部网页）
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }
// 可信来源（dev localhost）
const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' } }

describe('onboarding IPC 写操作 sender 校验', () => {
  it('onboarding:complete 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, {})
    const handler = ipcMain._get('onboarding:complete')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })
})

describe('onboarding IPC 只读操作不加 sender 校验', () => {
  it('onboarding:status 外部来源也可调用（只读）', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, {})
    const handler = ipcMain._get('onboarding:status')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: { done: false } })
  })

  it('onboarding:get-steps 外部来源也可调用（只读）', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, {})
    const handler = ipcMain._get('onboarding:get-steps')

    const result = await handler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: [{ id: 'welcome', title: '欢迎使用' }] })
  })
})

describe('onboarding IPC 可信来源正常工作', () => {
  it('onboarding:complete 可信来源正常调用 completeOnboarding', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, {})
    const handler = ipcMain._get('onboarding:complete')

    const result = await handler(TRUSTED_EVENT)

    expect(result).toEqual({ code: 0, data: { completed: true } })
  })
})
