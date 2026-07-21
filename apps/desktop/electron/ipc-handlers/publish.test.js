// @ts-check
/**
 * Publish IPC handlers 合同测试
 *
 * 验证所有发布、队列和历史入口的 sender 来源校验（withSenderCheck）。
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAccessControlledIpcMain } from './license-access-control'

// Mock logger 防止真实日志污染
vi.mock('../services/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

// Mock offline-manager 避免 publish:wechat 拉起额外依赖
vi.mock('../services/offline-manager', () => ({
  isOffline: vi.fn(() => false),
  addToCache: vi.fn(),
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
  const mod = await import('./publish')
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
    taskQueue: {
      add: vi.fn(() => 'task-1'),
      cancel: vi.fn(() => true),
      retry: vi.fn(() => 'task-retry-1'),
      getStatus: vi.fn(() => ({})),
      getHistory: vi.fn(() => []),
    },
    history: {
      listRecords: vi.fn(() => ({ total: 0, records: [] })),
      getRecord: vi.fn(() => null),
      getStats: vi.fn(() => ({})),
    },
    BrowserWindow: { getAllWindows: vi.fn(() => []) },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  }
}

// 不可信来源（外部网页）
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }
// 可信来源（dev localhost）
const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' } }

describe('publish IPC 写操作 sender 校验', () => {
  it('publish:wechat 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('publish:wechat')

    const result = await handler(UNTRUSTED_EVENT, { title: 'test' })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('publish:batch 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('publish:batch')

    const result = await handler(UNTRUSTED_EVENT, { platforms: ['wechat'], article: {} })

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('queue:cancel 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('queue:cancel')

    const result = await handler(UNTRUSTED_EVENT, 'task-1')

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it('queue:retry 拒绝外部网页调用', async () => {
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, createMockDeps())
    const handler = ipcMain._get('queue:retry')

    const result = await handler(UNTRUSTED_EVENT, 'task-1')

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })

  it.each([
    ['queue:status', undefined],
    ['queue:history', undefined],
    ['history:list', {}],
    ['history:get', 'history-1'],
    ['dashboard:stats', undefined],
  ])('%s 拒绝外部网页读取私有发布数据', async (channel, arg) => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)

    const result = await ipcMain._get(channel)(UNTRUSTED_EVENT, arg)

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
  })
})

describe('publish IPC 可信来源正常工作', () => {
  it('publish:wechat 可信来源正常入队', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('publish:wechat')

    const result = await handler(TRUSTED_EVENT, { title: 'hello' })

    expect(result.code).toBe(0)
    expect(result.data).toEqual({ taskId: 'task-1' })
    expect(deps.taskQueue.add).toHaveBeenCalled()
  })

  it('publish:batch 可信来源正常批量入队', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('publish:batch')

    const result = await handler(TRUSTED_EVENT, { platforms: ['wechat', 'douyin'], article: { title: 'x' } })

    expect(result.code).toBe(0)
    expect(deps.taskQueue.add).toHaveBeenCalledTimes(2)
  })

  it('publish:batch 将对象目标的账号写入任务和文章', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('publish:batch')

    const result = await handler(TRUSTED_EVENT, {
      platforms: [{ platform: 'douyin', accountId: 'dy-1' }],
      article: { title: '视频标题' },
    })

    expect(result.code).toBe(0)
    expect(deps.taskQueue.add).toHaveBeenCalledWith({
      platform: 'douyin',
      article: { title: '视频标题', accountId: 'dy-1' },
      accountId: 'dy-1',
    })
  })

  it('publish:batch 拒绝缺少平台或账号的对象目标', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('publish:batch')

    expect(await handler(TRUSTED_EVENT, {
      platforms: [{ platform: '', accountId: 'a' }],
      article: {},
    })).toMatchObject({ code: -2 })
    expect(await handler(TRUSTED_EVENT, {
      platforms: [{ platform: 'wechat_mp', accountId: null }],
      article: {},
    })).toMatchObject({ code: -2 })
    expect(deps.taskQueue.add).not.toHaveBeenCalled()
  })

  it('publish:batch 拒绝可能操纵路径的平台和账号标识', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('publish:batch')

    expect(await handler(TRUSTED_EVENT, {
      platforms: ['../wechat_mp'],
      article: {},
    })).toMatchObject({ code: -2 })
    expect(await handler(TRUSTED_EVENT, {
      platforms: [{ platform: 'wechat_mp', accountId: 'acc/1' }],
      article: {},
    })).toMatchObject({ code: -2 })
    expect(deps.taskQueue.add).not.toHaveBeenCalled()
  })

  it('queue:cancel 可信来源正常取消', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('queue:cancel')

    const result = await handler(TRUSTED_EVENT, 'task-1')

    expect(result).toEqual({ code: 0, data: true, message: '任务已取消' })
    expect(deps.taskQueue.cancel).toHaveBeenCalledWith('task-1')
  })

  it('queue:retry 可信来源返回新任务 ID', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('queue:retry')

    const result = await handler(TRUSTED_EVENT, 'task-1')

    expect(result).toEqual({
      code: 0,
      data: { taskId: 'task-retry-1', retryOf: 'task-1' },
      message: '任务已重新加入队列',
    })
    expect(deps.taskQueue.retry).toHaveBeenCalledWith('task-1')
  })

  it('queue:status 可信来源可读取队列状态', async () => {
    const deps = createMockDeps()
    const ipcMain = createMockIpcMain()
    registerHandlers(ipcMain, deps)
    const handler = ipcMain._get('queue:status')

    const result = await handler(TRUSTED_EVENT)

    expect(result.code).toBe(0)
  })
})

describe('publish IPC Logto 权益门禁', () => {
  it.each([
    ['publish:wechat', { title: '无权益' }],
    ['publish:batch', { platforms: ['wechat', 'douyin'], article: { title: '无权益' } }],
  ])('%s 无权益时不向队列写入任何任务', async (channel, payload) => {
    const deps = createMockDeps()
    const rawIpcMain = createMockIpcMain()
    const identityService = {
      getState: () => ({ status: 'authenticated' }),
      requireEntitlement: vi.fn(async () => { throw new Error('ENTITLEMENT_REQUIRED') }),
    }
    const controlledIpcMain = createAccessControlledIpcMain(
      rawIpcMain,
      { isPro: () => true },
      { NODE_ENV: 'production' },
      __electronMock.app,
      identityService,
    )
    registerHandlers(controlledIpcMain, deps)

    const result = await rawIpcMain._get(channel)(TRUSTED_EVENT, payload)

    expect(result).toMatchObject({ code: -3 })
    expect(deps.taskQueue.add).not.toHaveBeenCalled()
  })
})
