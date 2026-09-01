import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

// Mock logger
vi.mock('../services/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  notify: vi.fn(),
}))

let registerHandlers
let isKnownMessageKey
let sanitizeParams
let checkRateLimit
const TRUSTED_EVENT = { senderFrame: { url: 'app://localhost/index.html' } }

beforeAll(async () => {
  const mod = await import('./notify')
  registerHandlers = mod.default || mod
  isKnownMessageKey = mod.isKnownMessageKey
  sanitizeParams = mod.sanitizeParams
  checkRateLimit = mod.checkRateLimit
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

const mockLog = { info: vi.fn(), notify: vi.fn() }

describe('notify IPC handlers — notify:log', () => {
  let ipcMain

  beforeEach(() => {
    ipcMain = createMockIpcMain()
    vi.clearAllMocks()
    registerHandlers(ipcMain, { log: mockLog })
  })

  it('注册 notify:log 通道', () => {
    expect(ipcMain.handle).toHaveBeenCalledWith('notify:log', expect.any(Function))
  })

  it('已知 messageKey → logger.notify 写结构化行', async () => {
    const result = await ipcMain._callHandler('notify:log', {
      messageKey: 'story2video.quota_exceeded',
      module: 'batchPublish',
      level: 'warn',
      params: { count: 2, max: 2 },
      errorCategory: 'quota_exceeded',
    })
    expect(result).toEqual({ code: 0, data: true })
    expect(mockLog.notify).toHaveBeenCalledWith('batchPublish', 'story2video.quota_exceeded', {
      errorCategory: 'quota_exceeded',
      level: 'warn',
      params: { count: 2, max: 2 },
      error: undefined,
    })
  })

  it('未知 messageKey → 静默 drop，不写日志', async () => {
    const result = await ipcMain._callHandler('notify:log', {
      messageKey: 'nonexistent.key',
      module: 'batchPublish',
      level: 'error',
      params: {},
    })
    expect(result).toEqual({ code: 0, data: { dropped: true } })
    expect(mockLog.notify).not.toHaveBeenCalled()
    expect(mockLog.info).toHaveBeenCalled()
  })

  it('level 白名单：非 {info,warn,error} 降级为 info', async () => {
    await ipcMain._callHandler('notify:log', {
      messageKey: 'story2video.quota_exceeded',
      module: 'm',
      level: 'success',
      params: {},
    })
    expect(mockLog.notify).toHaveBeenCalledWith('m', 'story2video.quota_exceeded', expect.objectContaining({ level: 'info' }))
  })

  it('params 值级 deny-list：拒绝嵌套 object/array，仅保留标量', async () => {
    await ipcMain._callHandler('notify:log', {
      messageKey: 'story2video.quota_exceeded',
      module: 'm',
      level: 'error',
      params: { count: 2, nested: { secret: 'x' }, arr: [1, 2], ok: true, str: 'hello' },
    })
    const call = mockLog.notify.mock.calls[0][2]
    expect(call.params).toEqual({ count: 2, ok: true, str: 'hello' })
  })

  it('速率限制：超限降级为聚合计数日志', async () => {
    // 直接调用 checkRateLimit 验证窗口逻辑
    const key = 'story2video.rate_limited'
    for (let i = 0; i < 20; i++) checkRateLimit(key)
    const over = checkRateLimit(key)
    expect(over.allowed).toBe(false)
  })
})

describe('notify — 纯函数校验', () => {
  it('isKnownMessageKey 识别已知命名空间', () => {
    expect(isKnownMessageKey('story2video.quota_exceeded')).toBe(true)
    expect(isKnownMessageKey('userErrors.AUTH_REQUIRED')).toBe(true)
    expect(isKnownMessageKey('operation_failed')).toBe(true)
    expect(isKnownMessageKey('renderer.uncaught_error')).toBe(true)
    expect(isKnownMessageKey('publish.wechat_failed')).toBe(true)
  })

  it('isKnownMessageKey 拒绝未知/空/非字符串', () => {
    expect(isKnownMessageKey('nonexistent.key')).toBe(false)
    expect(isKnownMessageKey('')).toBe(false)
    expect(isKnownMessageKey(undefined)).toBe(false)
    expect(isKnownMessageKey(123)).toBe(false)
  })

  it('sanitizeParams 仅保留标量并截断超长字符串', () => {
    expect(sanitizeParams({ a: 1, b: 'x', c: true, d: { nested: 1 }, e: [1] }))
      .toEqual({ a: 1, b: 'x', c: true })
    expect(sanitizeParams('not-object')).toEqual({})
    expect(sanitizeParams(null)).toEqual({})
    const long = sanitizeParams({ s: 'x'.repeat(5000) })
    expect(long.s.length).toBe(2000)
  })
})