// @ts-check
/**
 * bootstrap.test.js — 测试 createAppContext / runWhenReady
 *
 * 策略：使用 test-setup.js 提供的 global.__electronMock 单例 + __registerMock 注册表，
 * 替代 vi.mock（vi.mock 仅在 vitest SSR 转换层生效，不适用于 CJS require 加载的模块）。
 * 所有深层依赖通过 __registerMock 在顶层注册，beforeAll 中 require('./bootstrap.js') 时生效。
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// ─── mock 服务对象定义（顶层，在 __registerMock 之前） ───

// 通用默认 mock（带 registerIpcHandlers/setMainWindow 等方法）
function defaultMock() {
  return {
    registerIpcHandlers: vi.fn(),
    setMainWindow: vi.fn(),
    onProgress: vi.fn(),
    init: vi.fn(),
    seedDefaults: vi.fn(),
    on: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    closeAll: vi.fn(),
    cleanup: vi.fn(),
    stopAll: vi.fn(),
    setExecutor: vi.fn(),
    setStateSaver: vi.fn(),
    deserialize: vi.fn(function () { return 0 }),
    onAlert: vi.fn(),
    getAllHistories: vi.fn(function () { return {} }),
    registerProvider: vi.fn(),
    trackSession: vi.fn(),
    getStats: vi.fn(function () { return {} }),
    getDailyStats: vi.fn(function () { return {} }),
    trackEvent: vi.fn(),
    save: vi.fn(),
  }
}

const mockTaskQueue = {
  setExecutor: vi.fn(),
  on: vi.fn(),
  setStateSaver: vi.fn(),
  deserialize: vi.fn(function () { return 0 }),
}
const mockStore = {
  init: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  getPublishTimeline: vi.fn(),
  setPublishTimeline: vi.fn(),
  addCallbackLog: vi.fn(),
  close: vi.fn(),
}
const mockCallbackServer = { start: vi.fn(), stop: vi.fn() }
const mockScheduler = { setTaskQueue: vi.fn(), restore: vi.fn(function () { return 0 }) }
const mockKeywordMonitor = {
  onAlert: vi.fn(),
  getAllHistories: vi.fn(function () { return {} }),
  stopAll: vi.fn(),
}
const mockAnalyticsService = { registerProvider: vi.fn() }
const mockPythonBridge = { startPythonBackend: vi.fn(), stopPythonBackend: vi.fn() }
const mockSystemTray = { registerIpcHandlers: vi.fn(), init: vi.fn() }
const mockHotkeys = { register: vi.fn(), unregister: vi.fn() }
const mockAutoUpdater = { init: vi.fn() }
const mockFirstRun = { runSetup: vi.fn() }
const mockHistory = { addRecord: vi.fn() }
const mockOfflineManager = { startMonitoring: vi.fn(), setTaskQueue: vi.fn() }
const mockPublishMonitor = { createMonitorTask: vi.fn() }
const mockTemplateManager = { seedDefaults: vi.fn() }
const mockLicenseManagerInstance = {}
const mockLicenseManager = { getInstance: vi.fn(function () { return mockLicenseManagerInstance }) }
const mockBatchManager = Object.assign(vi.fn(), {
  setTaskQueue: vi.fn(),
  registerIpcHandlers: vi.fn(),
})
const mockCloudPublisher = vi.fn(function () { return { registerIpcHandlers: vi.fn() } })
const mockUsageTracker = {
  trackSession: vi.fn(),
  trackFeatureUsage: vi.fn(),
  trackDaily: vi.fn(),
  getStats: vi.fn(function () { return {} }),
  getDailyStats: vi.fn(function () { return {} }),
  trackEvent: vi.fn(),
  save: vi.fn(),
}
const mockRenderEngine = {}
const mockCompositionManager = {}
const mockAiGenerator = {}
const mockVideoEngine = {}
const mockPipelineEngine = {}
const mockChunkedUploader = {}
const mockPublisherRouter = { createPublisher: vi.fn() }

// container.get 返回的 mock 服务映射
const services = {
  taskQueue: mockTaskQueue,
  store: mockStore,
  callbackServer: mockCallbackServer,
  keywordMonitor: mockKeywordMonitor,
  analyticsService: mockAnalyticsService,
  usageTracker: mockUsageTracker,
  renderEngine: mockRenderEngine,
  compositionManager: mockCompositionManager,
  aiGenerator: mockAiGenerator,
  videoEngine: mockVideoEngine,
  pipelineEngine: mockPipelineEngine,
  chunkedUploader: mockChunkedUploader,
  publisherRouter: mockPublisherRouter,
  authViewManager: defaultMock(),
  rpaViewManager: defaultMock(),
  webviewManager: defaultMock(),
  qrCodeLogin: defaultMock(),
  contentIntelligence: defaultMock(),
  publishImpactTracker: defaultMock(),
  providerManager: defaultMock(),
  oauthManager: defaultMock(),
  batchManager: mockBatchManager,
  urlCollector: defaultMock(),
  viralEngine: defaultMock(),
  proxyPool: defaultMock(),
  templateManager: mockTemplateManager,
  aiWriter: defaultMock(),
  aggregatorBridge: defaultMock(),
}

// ─── 注册所有深层依赖 mock（替代 vi.mock） ───
__registerMock('./services/logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
__registerMock('./services/python-bridge', mockPythonBridge)
__registerMock('./publishers/account-manager', { create: vi.fn() })
__registerMock('./services/scheduler', mockScheduler)
__registerMock('./services/publish-history', mockHistory)
__registerMock('./services/auto-updater', mockAutoUpdater)
__registerMock('./services/first-run', mockFirstRun)
__registerMock('./services/batch-manager', mockBatchManager)
__registerMock('./services/cloud-publisher', { default: mockCloudPublisher, __esModule: true })
__registerMock('./services/license-manager', mockLicenseManager)
__registerMock('./services/publish-alert', {})
__registerMock('./services/offline-manager', mockOfflineManager)
__registerMock('./services/publish-monitor', mockPublishMonitor)
__registerMock('./services/system-tray', mockSystemTray)
__registerMock('./services/hotkeys', mockHotkeys)
__registerMock('@multi-publish/shared-utils/src/publish-interval-guard', vi.fn())
__registerMock('@multi-publish/shared-utils/src/platform-config', vi.fn())
__registerMock('@multi-publish/shared-utils/src/sensitive-filter', { createWithBuiltin: vi.fn(function () { return {} }) })
__registerMock('@multi-publish/shared-utils/src/data-sync', vi.fn(function () { return {} }))
__registerMock('./ipc-handlers', vi.fn())
__registerMock('./services/analytics-providers', {
  xiaohongshuProvider: {},
  douyinProvider: {},
})
__registerMock('./core/container.setup', {
  createContainer: function () {
    return {
      get: function (key) {
        if (services[key]) return services[key]
        return defaultMock()
      },
    }
  },
})

// 通过 require 加载被测模块（在 mock 注册后）
let createAppContext, runWhenReady
beforeAll(() => {
  // 启用 electron mock（opt-in）：bootstrap.js 顶层 require('electron') 需要 mock
  __enableElectronMock()
  const mod = require('./bootstrap.js')
  createAppContext = mod.createAppContext
  runWhenReady = mod.runWhenReady
})

describe('bootstrap — createAppContext', () => {
  let context
  beforeEach(() => {
    vi.clearAllMocks()
    __resetElectronMock()
    context = createAppContext()
  })

  it('返回对象', () => {
    expect(typeof context).toBe('object')
    expect(context).not.toBeNull()
  })

  it('context 包含 container', () => {
    expect(context.container).toBeDefined()
    expect(typeof context.container.get).toBe('function')
  })

  it('context 包含 taskQueue（有 setExecutor/on 方法）', () => {
    expect(context.taskQueue).toBe(mockTaskQueue)
    expect(typeof context.taskQueue.setExecutor).toBe('function')
    expect(typeof context.taskQueue.on).toBe('function')
  })

  it('context 包含 store（有 init/getSetting 方法）', () => {
    expect(context.store).toBe(mockStore)
    expect(typeof context.store.init).toBe('function')
    expect(typeof context.store.getSetting).toBe('function')
  })

  it('context 包含 callbackServer', () => {
    expect(context.callbackServer).toBe(mockCallbackServer)
  })

  it('context 包含 keywordMonitor', () => {
    expect(context.keywordMonitor).toBe(mockKeywordMonitor)
  })

  it('context 包含 analyticsService', () => {
    expect(context.analyticsService).toBe(mockAnalyticsService)
  })

  it('context 包含 pythonBridge', () => {
    expect(context.pythonBridge).toBe(mockPythonBridge)
  })

  it('context 包含 scheduler', () => {
    expect(context.scheduler).toBeDefined()
  })

  it('context 包含 history', () => {
    expect(context.history).toBe(mockHistory)
  })

  it('context 包含 autoUpdater', () => {
    expect(context.autoUpdater).toBe(mockAutoUpdater)
  })

  it('context 包含 hotkeys', () => {
    expect(context.hotkeys).toBe(mockHotkeys)
  })

  it('context 包含 firstRun', () => {
    expect(context.firstRun).toBe(mockFirstRun)
  })

  it('context 包含 systemTray', () => {
    expect(context.systemTray).toBe(mockSystemTray)
  })

  it('context 包含 offlineManager', () => {
    expect(context.offlineManager).toBe(mockOfflineManager)
  })

  it('context 包含 publishMonitor', () => {
    expect(context.publishMonitor).toBe(mockPublishMonitor)
  })

  it('context 包含 renderEngine', () => {
    expect(context.renderEngine).toBe(mockRenderEngine)
  })

  it('context 包含 compositionManager', () => {
    expect(context.compositionManager).toBe(mockCompositionManager)
  })

  it('context 包含 aiGenerator / videoEngine / pipelineEngine', () => {
    expect(context.aiGenerator).toBe(mockAiGenerator)
    expect(context.videoEngine).toBe(mockVideoEngine)
    expect(context.pipelineEngine).toBe(mockPipelineEngine)
  })

  it('context 包含 BACKEND_PLATFORMS（Set，含 youtube/tiktok/twitter）', () => {
    expect(context.BACKEND_PLATFORMS).toBeInstanceOf(Set)
    expect(context.BACKEND_PLATFORMS.has('youtube')).toBe(true)
    expect(context.BACKEND_PLATFORMS.has('tiktok')).toBe(true)
    expect(context.BACKEND_PLATFORMS.has('twitter')).toBe(true)
  })

  it('context 包含 _platformConfig / _sensitiveFilter / _dataSync / _chunkedUploader', () => {
    expect(context._platformConfig).toBeDefined()
    expect(context._sensitiveFilter).toBeDefined()
    expect(context._dataSync).toBeDefined()
    expect(context._chunkedUploader).toBe(mockChunkedUploader)
  })

  it('context 包含 licenseManager / templateManager / aiWriter', () => {
    expect(context.licenseManager).toBeDefined()
    expect(context.templateManager).toBe(mockTemplateManager)
    expect(context.aiWriter).toBeDefined()
  })

  it('context 包含各 viewManager（authViewManager / rpaViewManager / webviewManager / qrCodeLogin）', () => {
    expect(context.authViewManager).toBeDefined()
    expect(context.rpaViewManager).toBeDefined()
    expect(context.webviewManager).toBeDefined()
    expect(context.qrCodeLogin).toBeDefined()
  })

  it('context 包含 oauthManager / batchManager / urlCollector / providerManager / viralEngine', () => {
    expect(context.oauthManager).toBeDefined()
    expect(context.batchManager).toBe(mockBatchManager)
    expect(context.urlCollector).toBeDefined()
    expect(context.providerManager).toBeDefined()
    expect(context.viralEngine).toBeDefined()
  })

  it('taskQueue.setExecutor 被调用（执行器注入）', () => {
    expect(mockTaskQueue.setExecutor).toHaveBeenCalledTimes(1)
    expect(mockTaskQueue.setExecutor).toHaveBeenCalledWith(expect.any(Function))
  })

  it('taskQueue.on 注册 4 个事件（task:success/failed/blocked/retry）', () => {
    const events = mockTaskQueue.on.mock.calls.map(function (c) { return c[0] })
    expect(events).toContain('task:success')
    expect(events).toContain('task:failed')
    expect(events).toContain('publish:blocked')
    expect(events).toContain('task:retry')
    expect(mockTaskQueue.on).toHaveBeenCalledTimes(4)
  })

  it('systemTray.registerIpcHandlers 被调用', () => {
    expect(mockSystemTray.registerIpcHandlers).toHaveBeenCalledTimes(1)
  })

  it('scheduler.setTaskQueue 被调用（taskQueue 接线）', () => {
    expect(mockScheduler.setTaskQueue).toHaveBeenCalledWith(mockTaskQueue)
  })

  it('offlineManager.setTaskQueue 被调用', () => {
    expect(mockOfflineManager.setTaskQueue).toHaveBeenCalledWith(mockTaskQueue)
  })

  it('BatchManager.setTaskQueue 被调用', () => {
    expect(mockBatchManager.setTaskQueue).toHaveBeenCalledWith(mockTaskQueue)
  })

  it('templateManager.seedDefaults 被调用', () => {
    expect(mockTemplateManager.seedDefaults).toHaveBeenCalledTimes(1)
  })

  it('offlineManager.startMonitoring 被调用', () => {
    expect(mockOfflineManager.startMonitoring).toHaveBeenCalledTimes(1)
  })

  it('licenseManager.getInstance 被调用', () => {
    expect(mockLicenseManager.getInstance).toHaveBeenCalledTimes(1)
  })
})

describe('bootstrap — runWhenReady', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetElectronMock()
    // 清除上一个测试 runWhenReady 设置的 global.usageTracker（防止泄漏到 createAppContext）
    delete global.usageTracker
  })

  it('runWhenReady 是函数', () => {
    expect(typeof runWhenReady).toBe('function')
  })

  it('runWhenReady 调用 app.whenReady 并注册回调（不抛错）', () => {
    const context = createAppContext()
    const createWindow = vi.fn()
    expect(function () { runWhenReady(context, { createWindow: createWindow }) }).not.toThrow()
  })

  it('runWhenReady 调用 createWindow（whenReady 立即 resolve）', async () => {
    const context = createAppContext()
    const createWindow = vi.fn()
    await runWhenReady(context, { createWindow: createWindow })
    await new Promise(function (r) { setTimeout(r, 50) })
    expect(createWindow).toHaveBeenCalledTimes(1)
  })

  it('runWhenReady 调用 pythonBridge.startPythonBackend', async () => {
    const context = createAppContext()
    await runWhenReady(context, { createWindow: vi.fn() })
    await new Promise(function (r) { setTimeout(r, 50) })
    expect(mockPythonBridge.startPythonBackend).toHaveBeenCalledTimes(1)
  })

  it('runWhenReady 调用 store.init', async () => {
    const context = createAppContext()
    await runWhenReady(context, { createWindow: vi.fn() })
    await new Promise(function (r) { setTimeout(r, 50) })
    expect(mockStore.init).toHaveBeenCalledTimes(1)
  })

  it('runWhenReady 调用 taskQueue.setStateSaver', async () => {
    const context = createAppContext()
    await runWhenReady(context, { createWindow: vi.fn() })
    await new Promise(function (r) { setTimeout(r, 50) })
    expect(mockTaskQueue.setStateSaver).toHaveBeenCalledTimes(1)
    expect(mockTaskQueue.setStateSaver).toHaveBeenCalledWith(expect.any(Function))
  })

  it('runWhenReady 调用 callbackServer.start', async () => {
    const context = createAppContext()
    await runWhenReady(context, { createWindow: vi.fn() })
    await new Promise(function (r) { setTimeout(r, 50) })
    expect(mockCallbackServer.start).toHaveBeenCalledTimes(1)
  })

  it('runWhenReady 调用 scheduler.restore', async () => {
    const context = createAppContext()
    await runWhenReady(context, { createWindow: vi.fn() })
    await new Promise(function (r) { setTimeout(r, 50) })
    expect(mockScheduler.restore).toHaveBeenCalledTimes(1)
  })

  it('runWhenReady 调用 keywordMonitor.onAlert', async () => {
    const context = createAppContext()
    await runWhenReady(context, { createWindow: vi.fn() })
    await new Promise(function (r) { setTimeout(r, 50) })
    expect(mockKeywordMonitor.onAlert).toHaveBeenCalledTimes(1)
  })

  it('runWhenReady 注册 analytics providers（xiaohongshu / douyin）', async () => {
    const context = createAppContext()
    await runWhenReady(context, { createWindow: vi.fn() })
    await new Promise(function (r) { setTimeout(r, 50) })
    expect(mockAnalyticsService.registerProvider).toHaveBeenCalledWith('xiaohongshu', expect.anything())
    expect(mockAnalyticsService.registerProvider).toHaveBeenCalledWith('douyin', expect.anything())
  })

  it('runWhenReady 设置 global.usageTracker', async () => {
    const context = createAppContext()
    await runWhenReady(context, { createWindow: vi.fn() })
    await new Promise(function (r) { setTimeout(r, 50) })
    expect(global.usageTracker).toBe(mockUsageTracker)
  })
})
