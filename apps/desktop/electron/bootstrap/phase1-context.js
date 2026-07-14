// @ts-check
/**
 * Phase 1: DI 容器实例提取 + 模块单例初始化
 *
 * 从 bootstrap.js createAppContext 拆出：
 * - 所有 container.get(...) 调用
 * - 模块单例 + 副作用（seedDefaults / startMonitoring / registerIpcHandlers）
 * - scheduler / BatchManager / offlineManager 的 setTaskQueue 接线
 * - ModelProviderManager 接线
 * - 平台配置 / 敏感词 / 横切服务加载
 *
 * 红线：不包含 taskQueue.setExecutor 闭包（依赖 getMainWin + publisherRouter，高风险，保留在 createAppContext）
 * 红线：不包含 wireTaskQueueEvents 调用（依赖 getMainWin，保留在 createAppContext）
 *
 * 验收标准 BUGFIX-PLAN Bug-1: phase 文件 <= 80 行（注释/空行不计）
 */
const log = require('../services/logger')
const { getConfigPath } = require('../services/config-resolver')
const pythonBridge = require('../services/python-bridge')
const AccountManager = require('../publishers/account-manager')
const scheduler = require('../services/scheduler')
const history = require('../services/publish-history')
const autoUpdater = require('../services/auto-updater')
const firstRun = require('../services/first-run')
const BatchManager = require('../services/batch-manager')
// CJS/ESM interop：兼容真实模块与 vitest mock
const _CloudPublisherModule = require('../services/cloud-publisher')
const CloudPublisher = _CloudPublisherModule.default || _CloudPublisherModule

/**
 * 从 DI 容器提取所有实例 + 运行模块单例副作用
 * @param {object} container - DI 容器实例
 * @returns {object} context 对象（含 40+ 字段，供 createAppContext / runWhenReady 使用）
 */
function extractContext(container) {
  const LicenseManager = require('../services/license-manager')

  // ─── 基础设施实例（DI 容器获取）───
  const authViewManager = container.get('authViewManager')
  const rpaViewManager = container.get('rpaViewManager')
  const webviewManager = container.get('webviewManager')
  const callbackServer = container.get('callbackServer')
  const qrCodeLogin = container.get('qrCodeLogin')
  const store = container.get('store')
  const contentIntelligence = container.get('contentIntelligence')
  const publishImpactTracker = container.get('publishImpactTracker')
  const keywordMonitor = container.get('keywordMonitor')
  const providerManager = container.get('providerManager')
  const oauthManager = container.get('oauthManager')
  const batchManager = container.get('batchManager')
  const urlCollector = container.get('urlCollector')
  const viralEngine = container.get('viralEngine')
  const commentManager = container.get('commentManager')
  const proxyPool = container.get('proxyPool')
  const analyticsService = container.get('analyticsService')

  // ─── 模块单例 + 副作用 ───
  const _PublishAlert = require('../services/publish-alert') // side effects on require
  const templateManager = container.get('templateManager')
  templateManager.seedDefaults()
  const licenseManager = LicenseManager.getInstance()
  const aiWriter = container.get('aiWriter')
  const offlineManager = require('../services/offline-manager')
  offlineManager.startMonitoring()
  const publishMonitor = require('../services/publish-monitor')
  const systemTray = require('../services/system-tray')
  const hotkeys = require('../services/hotkeys')
  systemTray.registerIpcHandlers()

  // ─── 任务队列接线（不含 setExecutor，保留在 createAppContext）───
  const taskQueue = container.get('taskQueue')
  scheduler.setTaskQueue(taskQueue)
  BatchManager.setTaskQueue(taskQueue)
  offlineManager.setTaskQueue(taskQueue)

  // ─── 其他 DI 实例 ───
  const _aggregatorBridge = container.get('aggregatorBridge')
  const publisherRouter = container.get('publisherRouter')
  const renderEngine = container.get('renderEngine')
  const compositionManager = container.get('compositionManager')
  const aiGenerator = container.get('aiGenerator')
  const videoEngine = container.get('videoEngine')
  const pipelineEngine = container.get('pipelineEngine')

  // ─── ModelProviderManager 接线 ───
  const { ModelProviderManager } = require('../services/model-provider-manager')
  const modelProviderManager = new ModelProviderManager(store)
  if (aiGenerator && aiGenerator.setModelProviderManager) {
    aiGenerator.setModelProviderManager(modelProviderManager)
  }

  // ─── 平台配置 + 敏感词 + 横切服务 ───
  const PlatformConfig = require('@multi-publish/shared-utils/src/platform-config')
  const BACKEND_PLATFORMS = new Set(['youtube', 'tiktok', 'twitter'])
  const SensitiveFilter = require('@multi-publish/shared-utils/src/sensitive-filter')
  const _sensitiveFilter = SensitiveFilter.createWithBuiltin()
  const _dataSync = container.get('dataSync')
  const _platformConfig = (() => {
    try {
      return new PlatformConfig(getConfigPath('platforms.yaml'))
    } catch (e) {
      log.warn('App', 'Failed to load platform config:', e.message)
      return null
    }
  })()
  const _chunkedUploader = container.get('chunkedUploader')
  const splitterBridge = container.get('splitterBridge')
  const promptBridge = container.get('promptBridge')
  const serviceBus = container.get('serviceBus')
  const pluginRegistry = container.get('pluginRegistry')

  return {
    container, store, taskQueue, scheduler, callbackServer,
    keywordMonitor, analyticsService, pythonBridge,
    AccountManager, history, autoUpdater, hotkeys, firstRun,
    systemTray, offlineManager, publishMonitor,
    authViewManager, rpaViewManager, webviewManager, qrCodeLogin,
    oauthManager, batchManager, urlCollector, providerManager,
    viralEngine, commentManager, contentIntelligence, publishImpactTracker,
    proxyPool, templateManager, licenseManager, aiWriter,
    renderEngine, compositionManager, aiGenerator, videoEngine,
    pipelineEngine, modelProviderManager, _chunkedUploader, _platformConfig,
    _sensitiveFilter, _dataSync, BACKEND_PLATFORMS,
    CloudPublisher,
    _aggregatorBridge, publisherRouter, _PublishAlert,
    splitterBridge, promptBridge, serviceBus, pluginRegistry,
  }
}

module.exports = { extractContext }
