// @ts-check
/**
 * Contact Sheet IPC handlers 合同测试
 *
 * 验证写操作的 sender 来源校验（withSenderCheck）：
 * - contact-sheet:approve — 调用 contactSheetService.approveScene() 批准场景
 * - contact-sheet:reject  — 调用 contactSheetService.rejectScene() 驳回场景
 *
 * 只读操作不校验：contact-sheet:list
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
  const mod = await import('./contact-sheet')
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
    contactSheetService: {
      getContactSheet: vi.fn(() => []),
      approveScene: vi.fn(() => ({ approved: true })),
      rejectScene: vi.fn(() => ({ rejected: true })),
    },
    ...overrides,
  }
}

// 不可信来源（外部网页）
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }
// 可信来源（dev localhost）
const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' } }

describe('contact-sheet IPC 写操作 sender 校验', () => {
  it('contact-sheet:approve 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    const deps = createMockDeps({
      contactSheetService: { approveScene: vi.fn(() => ({ approved: true })) },
    })
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('contact-sheet:approve')

    const result = await handler(UNTRUSTED_EVENT, { sceneId: 'scene-1', selectedTakeId: 'take-1' })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(deps.contactSheetService.approveScene).not.toHaveBeenCalled()
  })

  it('contact-sheet:reject 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    const deps = createMockDeps({
      contactSheetService: { rejectScene: vi.fn(() => ({ rejected: true })) },
    })
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('contact-sheet:reject')

    const result = await handler(UNTRUSTED_EVENT, { sceneId: 'scene-1', feedback: '重新生成' })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(deps.contactSheetService.rejectScene).not.toHaveBeenCalled()
  })
})

describe('contact-sheet IPC 可信来源正常工作', () => {
  it('contact-sheet:approve 可信来源正常调用 approveScene', async () => {
    const approved = { approved: true, sceneId: 'scene-1' }
    const deps = createMockDeps({
      contactSheetService: { approveScene: vi.fn(() => approved) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('contact-sheet:approve')

    const result = await handler(TRUSTED_EVENT, { sceneId: 'scene-1', selectedTakeId: 'take-1' })

    expect(result).toEqual({ code: 0, data: approved })
    expect(deps.contactSheetService.approveScene).toHaveBeenCalledWith('scene-1', 'take-1')
  })

  it('contact-sheet:reject 可信来源正常调用 rejectScene', async () => {
    const rejected = { rejected: true, sceneId: 'scene-1' }
    const deps = createMockDeps({
      contactSheetService: { rejectScene: vi.fn(() => rejected) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('contact-sheet:reject')

    const result = await handler(TRUSTED_EVENT, { sceneId: 'scene-1', feedback: '重新生成' })

    expect(result).toEqual({ code: 0, data: rejected })
    expect(deps.contactSheetService.rejectScene).toHaveBeenCalledWith('scene-1', '重新生成')
  })

  it('contact-sheet:approve 可信来源缺参返回校验错误', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('contact-sheet:approve')

    const result = await handler(TRUSTED_EVENT, {})

    expect(result.code).toBe(-2)
    expect(result.message).toMatch(/sceneId/)
  })
})

describe('contact-sheet IPC 只读操作不加 sender 校验', () => {
  it('contact-sheet:list 外部来源也可调用（只读）', async () => {
    const deps = createMockDeps({
      contactSheetService: { getContactSheet: vi.fn(() => [{ sceneId: 'scene-1' }]) },
    })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('contact-sheet:list')

    const result = await handler(UNTRUSTED_EVENT, { projectId: 'proj-1' })

    expect(result).toEqual({ code: 0, data: [{ sceneId: 'scene-1' }] })
    expect(deps.contactSheetService.getContactSheet).toHaveBeenCalledWith('proj-1')
  })
})
