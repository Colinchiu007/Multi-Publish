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
/** @typedef {new (options: {orchestratorUrl: string, store: object}) => {registerIpcHandlers(): void}} CloudPublisherConstructor */
// CJS/ESM interop：兼容真实模块与 vitest mock
/** @type {CloudPublisherConstructor | {default: CloudPublisherConstructor}} */
const _CloudPublisherModule = require('../services/cloud-publisher')
const CloudPublisher = 'default' in _CloudPublisherModule
  ? _CloudPublisherModule.default
  : _CloudPublisherModule
const CONTEXT_GROUP_KEYS = ['infra', 'services', 'windows', 'pipelines']

/**
 * @param {unknown} value
 * @returns {string}
 */
function errorMessage(value) {
  return value instanceof Error ? value.message : String(value)
}

function getContextGroups(target) {
  return CONTEXT_GROUP_KEYS.map((key) => target[key])
}

/**
 * 为分组 context 对象包装过渡期兼容 Proxy。
 *
 * 旧代码：context.store 仍可用（Proxy 转发到 context.infra.store）
 * 新代码：context.infra.store / context.services.scheduler / context.windows.webviewManager / context.pipelines.viralEngine
 *
 * 行为：
 * - get：先查顶层（组名/松散属性），再查各子组（向后兼容 context.store → context.infra.store）
 * - set：若属性已是某子组自有属性则更新该子组，否则落到顶层（如 keywordPersistTimer）
 * - has：顶层或任一子组含该属性即 true
 * - ownKeys / getOwnPropertyDescriptor：返回 4 个组名 + 全部字段名（兼容 Object.keys 遍历与 hasOwnProperty 检查）
 *
 * @param {object} grouped - { infra, services, windows, pipelines }
 * @returns {object} Proxy 包装后的 context
 */
function createGroupedContextProxy(grouped) {
  return new Proxy(grouped, {
    get(target, prop) {
      if (prop in target) return target[prop]
      for (const g of getContextGroups(target)) {
        if (prop in g) return g[prop]
      }
      return undefined
    },
    set(target, prop, value) {
      for (const g of getContextGroups(target)) {
        if (Object.prototype.hasOwnProperty.call(g, prop)) { g[prop] = value; return true }
      }
      target[prop] = value
      return true
    },
    has(target, prop) {
      if (prop in target) return true
      for (const g of getContextGroups(target)) {
        if (prop in g) return true
      }
      return false
    },
    ownKeys(target) {
      const keys = new Set(Object.keys(target))
      for (const g of getContextGroups(target)) {
        Object.keys(g).forEach((k) => keys.add(k))
      }
      return Array.from(keys)
    },
    getOwnPropertyDescriptor(target, prop) {
      if (Object.prototype.hasOwnProperty.call(target, prop)) {
        return Object.getOwnPropertyDescriptor(target, prop)
      }
      for (const g of getContextGroups(target)) {
        if (Object.prototype.hasOwnProperty.call(g, prop)) {
          return { configurable: true, enumerable: true, writable: true, value: g[prop] }
        }
      }
      return undefined
    },
  })
}

/**
 * 从 DI 容器提取所有实例 + 运行模块单例副作用
 * @param {object} container - DI 容器实例
 * @returns {object} context 对象（含 52 字段，按 infra/services/windows/pipelines 分组 + Proxy 兼容层）
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
  const usageTracker = container.get('usageTracker')

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
  const projectService = container.get('projectService')
  const boardService = container.get('boardService')
  const contactSheetService = container.get('contactSheetService')
  const approvalGateService = container.get('approvalGateService')
  const executionRecorder = container.get('executionRecorder')

  // ─── ModelProviderManager + ProviderRouter 接线 ───
  const { ModelProviderManager } = require('../services/model-provider-manager')
  const { ProviderRouter } = require('../services/adapters/_base/router')
  const modelProviderManager = new ModelProviderManager(store)
  // 创建 ProviderRouter（不注入 logHandler，避免与 callAdapter 内部日志双写）
  // callAdapter 内部已通过 _writeLog 统一记录到 model_provider_logs 表
  // router 的 logHandler 功能保留为可选扩展（测试中可单独验证）
  const providerRouter = new ProviderRouter(modelProviderManager)
  if (aiGenerator && aiGenerator.setModelProviderManager) {
    aiGenerator.setModelProviderManager(modelProviderManager)
  }
  if (aiGenerator && aiGenerator.setRouter) {
    aiGenerator.setRouter(providerRouter)
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
      log.warn('App', 'Failed to load platform config: ' + errorMessage(e))
      return null
    }
  })()
  const _chunkedUploader = container.get('chunkedUploader')
  const splitterBridge = container.get('splitterBridge')
  const promptBridge = container.get('promptBridge')
  const serviceBus = container.get('serviceBus')
  const pluginRegistry = container.get('pluginRegistry')

  // ─── 分组返回 + 过渡期 Proxy 兼容层 ───
  // 旧消费者 context.store 仍可用（Proxy 转发到 context.infra.store）
  // 新代码可用 context.infra.store / context.services.scheduler / context.windows.webviewManager / context.pipelines.viralEngine
  return createGroupedContextProxy({
    infra: {
      container, store, taskQueue, pythonBridge,
      _platformConfig, _sensitiveFilter, _dataSync,
      BACKEND_PLATFORMS, _chunkedUploader,
    },
    services: {
      scheduler, callbackServer, keywordMonitor, analyticsService, usageTracker,
      AccountManager, history, autoUpdater, hotkeys, firstRun,
      systemTray, offlineManager, publishMonitor,
      templateManager, licenseManager, aiWriter,
      renderEngine, compositionManager, aiGenerator, videoEngine, pipelineEngine,
      modelProviderManager, providerRouter, providerManager,
      _aggregatorBridge, publisherRouter, _PublishAlert,
      splitterBridge, promptBridge, serviceBus, pluginRegistry,
      projectService, boardService, contactSheetService, approvalGateService,
      executionRecorder,
    },
    windows: {
      authViewManager, rpaViewManager, webviewManager, qrCodeLogin,
      oauthManager, batchManager, urlCollector, proxyPool,
    },
    pipelines: {
      viralEngine, commentManager, contentIntelligence,
      publishImpactTracker, CloudPublisher,
    },
  })
}

module.exports = { extractContext }
