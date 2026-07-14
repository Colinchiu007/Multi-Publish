// phase1-context.test.js — 不 require('vitest')，使用 test-setup.js 注入的全局 describe/it/expect/vi
// Mock logger 以避免副作用
__registerMock('../services/logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})
const log = require('../services/logger')

// Mock 所有 require 的模块单例（避免触发真实 side effects）
__registerMock('../services/config-resolver', { getConfigPath: vi.fn(() => '/fake/path/platforms.yaml') })
__registerMock('../services/python-bridge', { startPythonBackend: vi.fn() })
__registerMock('../publishers/account-manager', { getInstance: vi.fn() })
__registerMock('../services/scheduler', { setTaskQueue: vi.fn(), restore: vi.fn() })
__registerMock('../services/publish-history', { addRecord: vi.fn() })
__registerMock('../services/auto-updater', {})
__registerMock('../services/first-run', {})
__registerMock('../services/batch-manager', { setTaskQueue: vi.fn() })
__registerMock('../services/cloud-publisher', function CloudPublisher() {})

// Mock 模块单例 with side effects
__registerMock('../services/license-manager', { getInstance: vi.fn(() => ({ isPro: () => false })) })
__registerMock('../services/publish-alert', {})
__registerMock('../services/offline-manager', { startMonitoring: vi.fn(), setTaskQueue: vi.fn() })
__registerMock('../services/publish-monitor', {})
__registerMock('../services/system-tray', { registerIpcHandlers: vi.fn() })
__registerMock('../services/hotkeys', {})
__registerMock('../services/model-provider-manager', { ModelProviderManager: class { constructor() {} } })

// Mock platform-config / sensitive-filter（外部包）
__registerMock('@multi-publish/shared-utils/src/platform-config', class PlatformConfig { constructor() {} })
__registerMock('@multi-publish/shared-utils/src/sensitive-filter', { createWithBuiltin: vi.fn(() => ({})) })

const { extractContext } = require('./phase1-context')

// 构建 mock container，container.get(key) 返回带 key 标记的对象
function makeMockContainer() {
  const calls = []
  return {
    calls,
    get: vi.fn((key) => {
      calls.push(key)
      // 特殊处理：templateManager 需要 seedDefaults 方法
      if (key === 'templateManager') return { seedDefaults: vi.fn() }
      // aiGenerator 需要 setModelProviderManager 方法（用于测试条件调用）
      if (key === 'aiGenerator') return { setModelProviderManager: vi.fn() }
      // store 需要是 truthy
      if (key === 'store') return { getSetting: vi.fn(), setSetting: vi.fn() }
      // taskQueue 需要 setExecutor 方法（虽然 extractContext 不调用，但 createAppContext 会用）
      if (key === 'taskQueue') return { setExecutor: vi.fn(), on: vi.fn() }
      // 默认返回一个标记对象
      return { __mockKey: key }
    }),
    has: vi.fn(() => false),
    register: vi.fn(),
  }
}

describe('phase1-context.extractContext', () => {
  it('返回对象包含所有预期字段（40+ 字段）', () => {
    const container = makeMockContainer()
    const ctx = extractContext(container)
    expect(ctx).toBeDefined()
    expect(typeof ctx).toBe('object')
    // 核心字段
    const expectedFields = [
      'container', 'store', 'taskQueue', 'scheduler', 'callbackServer',
      'keywordMonitor', 'analyticsService', 'pythonBridge',
      'AccountManager', 'history', 'autoUpdater', 'hotkeys', 'firstRun',
      'systemTray', 'offlineManager', 'publishMonitor',
      'authViewManager', 'rpaViewManager', 'webviewManager', 'qrCodeLogin',
      'oauthManager', 'batchManager', 'urlCollector', 'providerManager',
      'viralEngine', 'commentManager', 'contentIntelligence', 'publishImpactTracker',
      'proxyPool', 'templateManager', 'licenseManager', 'aiWriter',
      'renderEngine', 'compositionManager', 'aiGenerator', 'videoEngine',
      'pipelineEngine', 'modelProviderManager', '_chunkedUploader', '_platformConfig',
      '_sensitiveFilter', '_dataSync', 'BACKEND_PLATFORMS',
      'CloudPublisher',
      '_aggregatorBridge', 'publisherRouter', '_PublishAlert',
      'splitterBridge', 'promptBridge', 'serviceBus', 'pluginRegistry',
    ]
    expectedFields.forEach((f) => {
      expect(ctx).toHaveProperty(f)
    })
  })

  it('templateManager.seedDefaults 被调用', () => {
    const container = makeMockContainer()
    const ctx = extractContext(container)
    expect(ctx.templateManager.seedDefaults).toHaveBeenCalled()
  })

  it('offlineManager.startMonitoring 被调用', () => {
    const container = makeMockContainer()
    extractContext(container)
    // offlineManager 是 require 的，mock 模块记录的调用
    const offlineManager = require('../services/offline-manager')
    expect(offlineManager.startMonitoring).toHaveBeenCalled()
  })

  it('systemTray.registerIpcHandlers 被调用', () => {
    const container = makeMockContainer()
    extractContext(container)
    const systemTray = require('../services/system-tray')
    expect(systemTray.registerIpcHandlers).toHaveBeenCalled()
  })

  it('scheduler / BatchManager / offlineManager 的 setTaskQueue 被调用', () => {
    const container = makeMockContainer()
    extractContext(container)
    const scheduler = require('../services/scheduler')
    const BatchManager = require('../services/batch-manager')
    const offlineManager = require('../services/offline-manager')
    expect(scheduler.setTaskQueue).toHaveBeenCalled()
    expect(BatchManager.setTaskQueue).toHaveBeenCalled()
    expect(offlineManager.setTaskQueue).toHaveBeenCalled()
  })

  it('_platformConfig 加载失败时返回 null 不抛错', () => {
    // 重新 mock platform-config 抛错
    __registerMock('@multi-publish/shared-utils/src/platform-config', class { constructor() { throw new Error('load failed') } })
    const container = makeMockContainer()
    expect(() => extractContext(container)).not.toThrow()
    const ctx = extractContext(container)
    expect(ctx._platformConfig).toBeNull()
    expect(log.warn).toHaveBeenCalledWith('App', 'Failed to load platform config:', 'load failed')
  })

  it('aiGenerator.setModelProviderManager 被调用（方法存在时）', () => {
    const container = makeMockContainer()
    const ctx = extractContext(container)
    expect(ctx.aiGenerator.setModelProviderManager).toHaveBeenCalled()
  })

  it('aiGenerator.setModelProviderManager 不被调用（方法不存在时，不抛错）', () => {
    const container = makeMockContainer()
    // 覆盖 aiGenerator 返回值，无 setModelProviderManager 方法
    container.get.mockImplementation((key) => {
      if (key === 'aiGenerator') return {} // 无 setModelProviderManager
      if (key === 'templateManager') return { seedDefaults: vi.fn() }
      if (key === 'store') return { getSetting: vi.fn(), setSetting: vi.fn() }
      if (key === 'taskQueue') return { setExecutor: vi.fn(), on: vi.fn() }
      return { __mockKey: key }
    })
    expect(() => extractContext(container)).not.toThrow()
  })

  it('BACKEND_PLATFORMS 是 Set 且包含 youtube/tiktok/twitter', () => {
    const container = makeMockContainer()
    const ctx = extractContext(container)
    expect(ctx.BACKEND_PLATFORMS).toBeInstanceOf(Set)
    expect(ctx.BACKEND_PLATFORMS.has('youtube')).toBe(true)
    expect(ctx.BACKEND_PLATFORMS.has('tiktok')).toBe(true)
    expect(ctx.BACKEND_PLATFORMS.has('twitter')).toBe(true)
  })
})
