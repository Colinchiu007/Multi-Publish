// @ts-check
/**
 * Auto-Pipeline IPC handler 测试
 */
__enableElectronMock()

__registerMock('../services/logger', {
  info: () => {},
  warn: () => {},
  error: () => {},
})

const { ipcMain } = require('electron')
const registerHandlers = require('./auto-pipeline')

describe('auto-pipeline IPC handlers', () => {
  let fullAutoPipeline

  beforeEach(() => {
    vi.clearAllMocks()
    __resetElectronMock()
    fullAutoPipeline = {
      startRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      cancelRun: vi.fn(),
      listRuns: vi.fn(),
    }
    registerHandlers(ipcMain, { fullAutoPipeline, log: { info() {}, warn() {}, error() {} } })
  })

  it('注册 auto-pipeline:start handler', () => {
    expect(ipcMain._handlers['auto-pipeline:start']).toBeDefined()
  })

  it('auto-pipeline:start 调用 fullAutoPipeline.startRun', async () => {
    fullAutoPipeline.startRun.mockResolvedValue({ success: true, runId: 'test-1' })
    const config = { contentType: 'video', sourceType: 'url', urls: ['https://example.com'] }
    const result = await ipcMain._handlers['auto-pipeline:start']({}, config)
    expect(result.success).toBe(true)
    expect(result.runId).toBe('test-1')
    expect(fullAutoPipeline.startRun).toHaveBeenCalledWith(config)
  })

  it('auto-pipeline:start 错误时返回 error', async () => {
    fullAutoPipeline.startRun.mockRejectedValue(new Error('启动失败'))
    const result = await ipcMain._handlers['auto-pipeline:start']({}, { contentType: 'video' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('启动失败')
  })

  it('auto-pipeline:get-run 调用 getRunSnapshot', async () => {
    fullAutoPipeline.getRunSnapshot.mockReturnValue({ runId: 'test-1', status: 'running' })
    const result = await ipcMain._handlers['auto-pipeline:get-run']({}, 'test-1')
    expect(result.runId).toBe('test-1')
  })

  it('auto-pipeline:get-run 不存在时返回 null', async () => {
    fullAutoPipeline.getRunSnapshot.mockReturnValue(null)
    const result = await ipcMain._handlers['auto-pipeline:get-run']({}, 'nonexistent')
    expect(result).toEqual({ code: -1, message: '运行不存在' })
  })

  it('auto-pipeline:cancel 调用 cancelRun', async () => {
    fullAutoPipeline.cancelRun.mockReturnValue({ success: true })
    const result = await ipcMain._handlers['auto-pipeline:cancel']({}, 'test-1')
    expect(result.success).toBe(true)
  })

  it('auto-pipeline:list-runs 返回运行列表', async () => {
    fullAutoPipeline.listRuns.mockReturnValue([{ runId: 'test-1' }])
    const result = await ipcMain._handlers['auto-pipeline:list-runs']()
    expect(result.code).toBe(0)
    expect(result.data).toHaveLength(1)
  })

  it('fullAutoPipeline 未注入时跳过注册', () => {
    __resetElectronMock()
    const freshIpc = { handle: vi.fn() }
    registerHandlers(freshIpc, { fullAutoPipeline: null, log: { error() {} } })
    expect(freshIpc.handle).not.toHaveBeenCalled()
  })
})
