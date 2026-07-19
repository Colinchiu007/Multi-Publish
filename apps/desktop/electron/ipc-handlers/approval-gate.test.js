// @ts-check
/**
 * Approval Gate IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - approval-gate:approve — 调用 approvalGateService.approveGate() 修改审批门状态
 *
 * 只读操作不校验：approval-gate:get
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
  const mod = await import('./approval-gate')
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
    approvalGateService: {
      getCurrentGate: vi.fn(() => null),
      approveGate: vi.fn(() => ({ resolved: true })),
    },
    ...overrides,
  }
}

// 不可信来源（外部网页）
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }
// 可信来源（dev localhost）
const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' } }

describe('approval-gate IPC 写操作 sender 校验', () => {
  it('approval-gate:approve 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    const deps = createMockDeps({
      approvalGateService: { approveGate: vi.fn(() => ({ resolved: true })) },
    })
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('approval-gate:approve')

    const result = await handler(UNTRUSTED_EVENT, { gateId: 'gate-1', decision: 'approve' })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(deps.approvalGateService.approveGate).not.toHaveBeenCalled()
  })
})

describe('approval-gate IPC 可信来源正常工作', () => {
  it('approval-gate:approve 可信来源正常调用 approveGate', async () => {
    const resolved = { resolved: true, gateId: 'gate-1' }
    const deps = createMockDeps({
      approvalGateService: { approveGate: vi.fn(() => resolved) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('approval-gate:approve')

    const result = await handler(TRUSTED_EVENT, { gateId: 'gate-1', decision: 'approve' })

    expect(result).toEqual({ code: 0, data: resolved })
    expect(deps.approvalGateService.approveGate).toHaveBeenCalledWith('gate-1', 'approve', undefined)
  })

  it('approval-gate:approve 可信来源缺参返回校验错误', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('approval-gate:approve')

    const result = await handler(TRUSTED_EVENT, {})

    expect(result.code).toBe(-2)
    expect(result.message).toMatch(/gateId/)
  })
})

describe('approval-gate IPC 只读操作不加 sender 校验', () => {
  it('approval-gate:get 外部来源也可调用（只读）', async () => {
    const deps = createMockDeps({
      approvalGateService: { getCurrentGate: vi.fn(() => ({ id: 'gate-1' })) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('approval-gate:get')

    const result = await handler(UNTRUSTED_EVENT, { projectId: 'proj-1' })

    expect(result).toEqual({ code: 0, data: { id: 'gate-1' } })
    expect(deps.approvalGateService.getCurrentGate).toHaveBeenCalledWith('proj-1')
  })
})
