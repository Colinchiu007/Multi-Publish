// @ts-check
/**
 * Aggregation IPC handlers 合同测试
 *
 * 验证 aggregation 相关 IPC 通道：
 * - aggregation:collect — 调用 pythonBridge.requestBackend POST /aggregation/collect
 * - aggregation:sources — 调用 pythonBridge.requestBackend GET /aggregation/sources
 * - aggregation:rewrite — 调用 pythonBridge.requestBackend POST /aggregation/rewrite
 * - aggregation:task-status — 调用 pythonBridge.requestBackend GET /aggregation/tasks/{id}
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../services/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

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
  const mod = await import('./aggregation')
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

function createMockDeps (overrides = {}) {
  return {
    pythonBridge: { requestBackend: vi.fn() },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  }
}

describe('aggregation IPC handlers', () => {
  it('registers aggregation:collect channel', () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    expect(ipcMain.handle).toHaveBeenCalledWith('aggregation:collect', expect.any(Function))
  })

  it('registers aggregation:sources channel', () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    expect(ipcMain.handle).toHaveBeenCalledWith('aggregation:sources', expect.any(Function))
  })

  it('registers aggregation:rewrite channel', () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    expect(ipcMain.handle).toHaveBeenCalledWith('aggregation:rewrite', expect.any(Function))
  })

  it('registers aggregation:task-status channel', () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    expect(ipcMain.handle).toHaveBeenCalledWith('aggregation:task-status', expect.any(Function))
  })

  it('aggregation:collect calls pythonBridge.requestBackend with POST /aggregation/collect', async () => {
    const ipcMain = createMockIpcMain()
    const pythonBridge = { requestBackend: vi.fn().mockResolvedValue({ title: '测试', content: '正文' }) }
    registerHandlers(ipcMain, createMockDeps({ pythonBridge }))

    const handler = ipcMain._get('aggregation:collect')
    const result = await handler({}, { url: 'https://example.com', source_type: 'url' })

    expect(pythonBridge.requestBackend).toHaveBeenCalledWith(
      'POST', '/aggregation/collect',
      { url: 'https://example.com', source_type: 'url' }
    )
    expect(result.title).toBe('测试')
  })

  it('aggregation:sources calls pythonBridge.requestBackend with GET /aggregation/sources', async () => {
    const ipcMain = createMockIpcMain()
    const pythonBridge = { requestBackend: vi.fn().mockResolvedValue([{ type: 'rss', name: 'RSS' }]) }
    registerHandlers(ipcMain, createMockDeps({ pythonBridge }))

    const handler = ipcMain._get('aggregation:sources')
    const result = await handler({})

    expect(pythonBridge.requestBackend).toHaveBeenCalledWith('GET', '/aggregation/sources', null)
    expect(result).toHaveLength(1)
  })

  it('aggregation:rewrite calls pythonBridge.requestBackend with POST /aggregation/rewrite', async () => {
    const ipcMain = createMockIpcMain()
    const pythonBridge = { requestBackend: vi.fn().mockResolvedValue({ result_content: '改写后', word_count: 3 }) }
    registerHandlers(ipcMain, createMockDeps({ pythonBridge }))

    const handler = ipcMain._get('aggregation:rewrite')
    const result = await handler({}, { content: '原文', style: '轻松易懂' })

    expect(pythonBridge.requestBackend).toHaveBeenCalledWith(
      'POST', '/aggregation/rewrite',
      { content: '原文', style: '轻松易懂' }
    )
    expect(result.result_content).toBe('改写后')
  })

  it('aggregation:task-status calls pythonBridge.requestBackend with GET /aggregation/tasks/{id}', async () => {
    const ipcMain = createMockIpcMain()
    const pythonBridge = { requestBackend: vi.fn().mockResolvedValue({ task_id: 'abc', status: 'completed' }) }
    registerHandlers(ipcMain, createMockDeps({ pythonBridge }))

    const handler = ipcMain._get('aggregation:task-status')
    const result = await handler({}, 'abc')

    expect(pythonBridge.requestBackend).toHaveBeenCalledWith('GET', '/aggregation/tasks/abc', null)
    expect(result.status).toBe('completed')
  })

  it('aggregation:collect propagates backend errors', async () => {
    const ipcMain = createMockIpcMain()
    const pythonBridge = { requestBackend: vi.fn().mockResolvedValue({ code: 400, message: '采集失败' }) }
    registerHandlers(ipcMain, createMockDeps({ pythonBridge }))

    const handler = ipcMain._get('aggregation:collect')
    const result = await handler({}, { url: 'https://example.com', source_type: 'url' })

    expect(result.code).toBe(400)
    expect(result.message).toBe('采集失败')
  })

  it('registers aggregation:collect-video channel', () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    expect(ipcMain.handle).toHaveBeenCalledWith('aggregation:collect-video', expect.any(Function))
  })

  it('aggregation:collect-video calls pythonBridge with POST /aggregation/collect-video and 600s timeout', async () => {
    const ipcMain = createMockIpcMain()
    const pythonBridge = { requestBackend: vi.fn().mockResolvedValue({ media_type: 'video', transcript: '文案' }) }
    registerHandlers(ipcMain, createMockDeps({ pythonBridge }))

    const handler = ipcMain._get('aggregation:collect-video')
    const result = await handler({}, { url: 'https://v.douyin.com/abc/' })

    expect(pythonBridge.requestBackend).toHaveBeenCalledWith(
      'POST', '/aggregation/collect-video',
      { url: 'https://v.douyin.com/abc/' }, 600000
    )
    expect(result.media_type).toBe('video')
  })

  it('aggregation:collect-video classifies ASR engine unavailable as -6', async () => {
    const ipcMain = createMockIpcMain()
    const pythonBridge = { requestBackend: vi.fn().mockRejectedValue(new Error('ASR_ENGINE_UNAVAILABLE: 语音转写引擎不可用，请安装 faster-whisper')) }
    registerHandlers(ipcMain, createMockDeps({ pythonBridge }))

    const handler = ipcMain._get('aggregation:collect-video')
    const result = await handler({}, { url: 'https://v.douyin.com/abc/' })

    expect(result.code).toBe(-6)
    expect(result.message).toContain('faster-whisper')
  })

  it('aggregation:collect-video classifies transcribe timeout as -7', async () => {
    const ipcMain = createMockIpcMain()
    const pythonBridge = { requestBackend: vi.fn().mockRejectedValue(new Error('TRANSCRIBE_TIMEOUT: 转写超时')) }
    registerHandlers(ipcMain, createMockDeps({ pythonBridge }))

    const handler = ipcMain._get('aggregation:collect-video')
    const result = await handler({}, { url: 'https://v.douyin.com/abc/' })

    expect(result.code).toBe(-7)
    expect(result.message).toContain('超时')
  })

  it('aggregation:collect-video classifies no audio track as -8', async () => {
    const ipcMain = createMockIpcMain()
    const pythonBridge = { requestBackend: vi.fn().mockRejectedValue(new Error('NO_AUDIO_TRACK: 该视频无音轨')) }
    registerHandlers(ipcMain, createMockDeps({ pythonBridge }))

    const handler = ipcMain._get('aggregation:collect-video')
    const result = await handler({}, { url: 'https://v.douyin.com/abc/' })

    expect(result.code).toBe(-8)
    expect(result.message).toContain('无音轨')
  })
})
