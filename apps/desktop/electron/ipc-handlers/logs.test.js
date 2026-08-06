import { describe, it, expect, vi, beforeAll } from 'vitest'

// Mock logger
vi.mock('../services/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  getLogsInfo: vi.fn(),
  clearLogs: vi.fn(),
}))

let registerHandlers
const TRUSTED_EVENT = { senderFrame: { url: 'app://localhost/index.html' } }

beforeAll(async () => {
  const mod = await import('./logs')
  registerHandlers = mod.default || mod
})

function createMockIpcMain() {
  const handlers = {}
  return {
    handle: vi.fn((channel, fn) => { handlers[channel] = fn }),
    _getHandler: (channel) => handlers[channel],
    _callHandler: async (channel, ...args) => {
      if (!handlers[channel]) throw new Error(`No handler for ${channel}`)
      return handlers[channel](TRUSTED_EVENT, ...args)
    },
  }
}

const mockLog = { info: vi.fn(), error: vi.fn(), clearLogs: vi.fn(), getLogsInfo: vi.fn() }

describe('logs IPC handlers', () => {
  let ipcMain

  beforeEach(() => {
    ipcMain = createMockIpcMain()
    vi.clearAllMocks()
    registerHandlers(ipcMain, { log: mockLog })
  })

  it('注册 logs:info / logs:clear / logs:error 三个通道', () => {
    expect(ipcMain.handle).toHaveBeenCalledWith('logs:info', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('logs:clear', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('logs:error', expect.any(Function))
  })

  it('logs:info 返回 getLogsInfo() 结果', async () => {
    const data = { dir: '/tmp/logs', totalBytes: 100, fileCount: 1, maxFileBytes: 524288000, files: [] }
    mockLog.getLogsInfo.mockReturnValue(data)
    const result = await ipcMain._callHandler('logs:info')
    expect(result).toEqual({ code: 0, data })
  })

  it('logs:clear 调用 clearLogs 并记录日志', async () => {
    mockLog.clearLogs.mockReturnValue(2)
    const result = await ipcMain._callHandler('logs:clear')
    expect(result).toEqual({ code: 0, data: { removed: 2 } })
    expect(mockLog.clearLogs).toHaveBeenCalledTimes(1)
    expect(mockLog.info).toHaveBeenCalledWith('Logs', '用户手动清理日志文件', { removed: 2 })
  })

  it('logs:error 将渲染进程错误写入 ERROR 级', async () => {
    const result = await ipcMain._callHandler('logs:error', { message: 'vue render boom' })
    expect(result).toEqual({ code: 0, data: true })
    expect(mockLog.error).toHaveBeenCalledWith('Renderer', 'vue render boom')
  })

  it('logs:error 无消息时使用默认文案', async () => {
    const result = await ipcMain._callHandler('logs:error', {})
    expect(result).toEqual({ code: 0, data: true })
    expect(mockLog.error).toHaveBeenCalledWith('Renderer', '未知渲染进程错误')
  })
})
