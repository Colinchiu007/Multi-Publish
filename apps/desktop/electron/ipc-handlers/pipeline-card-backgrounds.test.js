// @ts-check
/**
 * pipeline-card:backgrounds IPC handler 合同测试
 *
 * 覆盖：通道注册、入参校验、无 provider/部分成功语义、服务异常映射。
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ERROR as EC } from '../core/error-codes'

vi.mock('../services/logger', () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))

__enableElectronMock()

let registerHandlers
let originalNodeEnv
let originalIsPackaged

beforeEach(async () => {
  vi.resetModules()
  originalNodeEnv = process.env.NODE_ENV
  originalIsPackaged = __electronMock.app.isPackaged
  delete process.env.NODE_ENV
  __electronMock.app.isPackaged = false
  const mod = await import('./pipeline-card-backgrounds')
  registerHandlers = mod.default || mod
})

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
  __electronMock.app.isPackaged = originalIsPackaged
})

function createMockIpcMain () {
  const handlers = {}
  return {
    handle: vi.fn((channel, fn) => { handlers[channel] = fn }),
    on: vi.fn(),
    _get: (channel) => handlers[channel],
  }
}

function makeServiceMock () {
  return {
    ensure: vi.fn(async () => ({ available: true, provider: 'minimax-image', backgrounds: { cinematic: { url: 'http://127.0.0.1:1/pipeline-card-bg/abc', status: 'generated' } }, generated: ['cinematic'], cached: [], failed: [], skipped: [] })),
  }
}

describe('pipeline-card:backgrounds IPC', () => {
  it('注册通道 pipeline-card:backgrounds', () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, {})
    expect(ipcMain.handle).toHaveBeenCalledWith('pipeline-card:backgrounds', expect.any(Function))
  })

  it('缺少 names 时返回 VALIDATION_ERROR', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, {})
    const handler = ipcMain._get('pipeline-card:backgrounds')
    const res = await handler({}, {})
    expect(res.code).toBe(EC.VALIDATION_ERROR)
    expect(res.message).toMatch(/名称/)
  })

  it('非法名称由服务层拒绝并映射为 VALIDATION_ERROR', async () => {
    const service = makeServiceMock()
    service.ensure = vi.fn(async () => { const e = new Error('流水线名称非法'); e.code = 'VALIDATION_ERROR'; throw e })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, { pipelineCardBackgrounds: service })
    const handler = ipcMain._get('pipeline-card:backgrounds')
    const res = await handler({}, { names: ['bad name'] })
    expect(res.code).toBe(EC.VALIDATION_ERROR)
    expect(res.message).toMatch(/非法/)
    expect(service.ensure).toHaveBeenCalledWith({ names: ['bad name'], force: false })
  })

  it('正常返回 code 0 + 生成结果', async () => {
    const service = makeServiceMock()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, { pipelineCardBackgrounds: service })
    const handler = ipcMain._get('pipeline-card:backgrounds')
    const res = await handler({}, { names: ['cinematic'], force: true })
    expect(res.code).toBe(0)
    expect(res.data.backgrounds.cinematic.status).toBe('generated')
    expect(service.ensure).toHaveBeenCalledWith({ names: ['cinematic'], force: true })
  })

  it('无 provider 时不视为错误：code 0 + available:false', async () => {
    const service = makeServiceMock()
    service.ensure = vi.fn(async () => ({ available: false, provider: null, backgrounds: {}, generated: [], cached: [], failed: [], skipped: [] }))
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, { pipelineCardBackgrounds: service })
    const res = await ipcMain._get('pipeline-card:backgrounds')({}, { names: ['cinematic'] })
    expect(res.code).toBe(0)
    expect(res.data.available).toBe(false)
  })

  it('服务异常映射为 REQUEST_ERROR', async () => {
    const service = makeServiceMock()
    service.ensure = vi.fn(async () => { throw new Error('boom') })
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, { pipelineCardBackgrounds: service, log: { error: vi.fn() } })
    const res = await ipcMain._get('pipeline-card:backgrounds')({}, { names: ['cinematic'] })
    expect(res.code).toBe(EC.REQUEST_ERROR)
    expect(res.message).toMatch(/boom/)
  })
})
