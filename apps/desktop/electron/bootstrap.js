// @ts-check
/**
 * bootstrap.js — 应用启动模块（从 main.js 拆分，Bug-1 重构：拆分 phase4-events / phase5-ipc）
 *
 * 职责：
 *   - createAppContext()：同步初始化（DI 容器消费 + taskQueue 接线 + 基础设施构建）
 *   - runWhenReady(context, { createWindow })：注册 app.whenReady 回调
 *
 * 红线：保留原 main.js DI 容器消费代码，不碰 container.setup.js
 */
const { app, ipcMain } = require('electron')
const path = require('path')
const log = require('./services/logger')
const { getConfigPath } = require('./services/config-resolver')
const pythonBridge = require('./services/python-bridge')
const AccountManager = require('./publishers/account-manager')
const scheduler = require('./services/scheduler')
const history = require('./services/publish-history')
const autoUpdater = require('./services/auto-updater')
const firstRun = require('./services/first-run')
const BatchManager = require('./services/batch-manager')
// CJS/ESM interop：兼容真实模块（module.exports = CloudPublisher）与 vitest mock（{ default: fn }）
const _CloudPublisherModule = require('./services/cloud-publisher')
const CloudPublisher = _CloudPublisherModule.default || _CloudPublisherModule
const { createContainer } = require('./core/container.setup')
const { wireTaskQueueEvents } = require('./bootstrap/phase4-events')
const { registerAllIpcHandlers } = require('./bootstrap/phase5-ipc')

// ─── Helper ────────────────────────────────────────────────
// Bug-5: 优先从 DI 容器获取缓存的窗口引用，fallback 到 getAllWindows
let _container = null
function getMainWin() {
  if (_container && _container.has('mainWindow')) {
    try { return _container.get('mainWindow') } catch { /* fallthrough */ }
  }
  return require('electron').BrowserWindow.getAllWindows()[0]
}

/**
 * 创建应用上下文（同步初始化）
 * @returns {object} context 对象，包含所有基础设施实例
 */
function createAppContext() {
  const container = createContainer()
  _container = container // Bug-5: 缓存 container 供 getMainWin 使用

  const LicenseManager = require('./services/license-manager')

  // ─── 基础设施实例 ──────────────────────────
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

  // _PublishAlert has side effects on require
  const _PublishAlert = require('./services/publish-alert')
  const templateManager = container.get('templateManager')
  templateManager.seedDefaults()
  const licenseManager = LicenseManager.getInstance()
  const aiWriter = container.get('aiWriter')
  const offlineManager = require('./services/offline-manager')
  offlineManager.startMonitoring()
  const publishMonitor = require('./services/publish-monitor')
  const systemTray = require('./services/system-tray')
  const hotkeys = require('./services/hotkeys')

  // ─── 系统托盘 ──────────────────────────────
  systemTray.registerIpcHandlers()

  // ─── 任务队列 ──────────────────────────────
  const taskQueue = container.get('taskQueue')
  scheduler.setTaskQueue(taskQueue)
  BatchManager.setTaskQueue(taskQueue)
  offlineManager.setTaskQueue(taskQueue)

  // ─── Aggregator Bridge ────────────────────
  const _aggregatorBridge = container.get('aggregatorBridge')

  // ─── PublisherRouter ──────────────────────
  const publisherRouter = container.get('publisherRouter')

  // ─── 任务执行器 ────────────────────────────
  taskQueue.setExecutor(async (task) => {
    const platform = task.platform
    const emitProgress = (stage) => {
      const win = getMainWin()
      if (win && !win.isDestroyed()) {
        win.webContents.send('publish:progress', { platform, stage, taskId: task.id })
      }
    }
    emitProgress('准备发布...')
    const publisher = publisherRouter.createPublisher(platform, {
      rpaViewManager, store, pythonBridge,
    })
    rpaViewManager.onProgress(({ stage }) => { emitProgress(stage) })
    try {
      const result = await publisher.publish(task)
      emitProgress('✓ 发布成功')
      return result
    } catch (e) {
      log.error('Executor', 'Publish failed for ' + platform + ': ' + e.message)
      throw e
    }
  })

  // ─── 任务事件 ──────────────────────────────
  // 拆分到 bootstrap/phase4-events.js
  wireTaskQueueEvents({
    taskQueue, history, publishMonitor, publishImpactTracker, getMainWin,
  })

  // ─── 渲染引擎实例 ──────────────────────────
  const renderEngine = container.get('renderEngine')
  const compositionManager = container.get('compositionManager')
  const aiGenerator = container.get('aiGenerator')
  const videoEngine = container.get('videoEngine')
  const pipelineEngine = container.get('pipelineEngine')

  // ─── 模型服务商管理 ────────────────────────
  const { ModelProviderManager } = require('./services/model-provider-manager')
  const modelProviderManager = new ModelProviderManager(store)

  // 连接 aiGenerator 和 modelProviderManager
  if (aiGenerator && aiGenerator.setModelProviderManager) {
    aiGenerator.setModelProviderManager(modelProviderManager)
  }

  // ─── 平台、敏感词、数据同步等基础设施 ────────
  const PlatformConfig = require('@multi-publish/shared-utils/src/platform-config')
  const BACKEND_PLATFORMS = new Set(['youtube', 'tiktok', 'twitter'])
  const SensitiveFilter = require('@multi-publish/shared-utils/src/sensitive-filter')
  const _sensitiveFilter = SensitiveFilter.createWithBuiltin()
  const _dataSync = container.get('dataSync')
  const _platformConfig = (() => {
    try {
      const cfgPath = getConfigPath('platforms.yaml')
      return new PlatformConfig(cfgPath)
    } catch (e) {
      log.warn('App', 'Failed to load platform config:', e.message)
      return null
    }
  })()

  const _chunkedUploader = container.get('chunkedUploader')

  // ─── 基础设施 & 横切服务 ────────────────────
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
    // 额外暴露：runWhenReady 需要
    _aggregatorBridge, publisherRouter, _PublishAlert,
    // 基础设施 & 横切服务
    splitterBridge, promptBridge, serviceBus, pluginRegistry,
  }
}

/**
 * 注册 app.whenReady 回调
 * @param {object} context - createAppContext 返回的上下文
 * @param {object} deps - { createWindow } 窗口创建函数
 */
function runWhenReady(context, deps) {
  const createWindow = deps.createWindow
  const {
    container, store, taskQueue, callbackServer, scheduler,
    keywordMonitor, analyticsService, pythonBridge,
    renderEngine, history, autoUpdater, hotkeys, firstRun,
    AccountManager, _platformConfig, _sensitiveFilter, _dataSync,
    proxyPool, _chunkedUploader, BACKEND_PLATFORMS, templateManager,
    licenseManager, aiWriter, compositionManager, aiGenerator,
    videoEngine, pipelineEngine, modelProviderManager, authViewManager, rpaViewManager,
    webviewManager, qrCodeLogin, oauthManager, batchManager, urlCollector,
    providerManager, viralEngine, commentManager, contentIntelligence, publishImpactTracker,
    CloudPublisher,
    splitterBridge, promptBridge, serviceBus,
  } = context

  // mainWindow 在 createWindow 调用前为 null（与原 main.js 行为一致）
  let mainWindow = null

  // R49 修复：app.whenReady() 返回 Promise，必须 .catch() 否则 rejection 无人处理
  app.whenReady().then(async () => {
   try {
    try { await pythonBridge.startPythonBackend() }
    catch (e) { log.error('App', 'Failed to start Python backend:', e.message) }

    // ─── 启动 SplitterBridge / PromptBridge（并行） ───
    {
      const _bridgeResults = await Promise.allSettled([
        splitterBridge.start(),
        promptBridge.start(),
      ])
      const _names = ['SplitterBridge', 'PromptBridge']
      _bridgeResults.forEach((r, i) => {
        if (r.status === 'rejected') {
          log.warn('App', _names[i] + ' failed to start: ' + (r.reason instanceof Error ? r.reason.message : String(r.reason)))
        } else {
          log.info('App', _names[i] + ' started')
        }
      })
    }

    // ─── 退出清理：停止 SplitterBridge / PromptBridge ───
    app.on('before-quit', async () => {
      try { await splitterBridge.stop() } catch (e) { log.warn('App', 'SplitterBridge stop failed: ' + e.message) }
      try { await promptBridge.stop() } catch (e) { log.warn('App', 'PromptBridge stop failed: ' + e.message) }
    })

    // 启动使用量统计
    const usageTracker = container.get('usageTracker')
    usageTracker.trackSession()
    global.usageTracker = usageTracker

    store.init()

    // 发布频率控制（通过 DI 容器获取，使用 store 适配器）
    const _publishIntervalGuard = container.get('publishIntervalGuard')

    // 任务队列持久化
    taskQueue.setStateSaver((jsonStr) => {
      store.setSetting('task_queue_state', jsonStr)
    })

    // 回调服务器
    // R49 修复：callbackServer.start 返回 Promise，必须 await 否则 try/catch 无法捕获 rejection
    try {
      await callbackServer.start((data) => {
        const win = getMainWin()
        if (win && !win.isDestroyed()) {
          win.webContents.send('callback:received', data)
        }
        if (data) {
          store.addCallbackLog(data.type || 'unknown', data.source || data.platform, data)
        }
      })
    } catch (e) {
      log.warn('App', 'Callback server failed to start (port may be in use):', e.message)
    }

    const restored = scheduler.restore()
    if (restored > 0) log.info('Scheduler', 'Restored ' + restored + ' pending tasks')

    const savedState = store.getSetting('task_queue_state')
    if (savedState) {
      const recovered = taskQueue.deserialize(savedState)
      if (recovered > 0) {
        log.info('App', 'Recovered ' + recovered + ' tasks from queue state')
        store.setSetting('task_queue_state', null)
      }
    }

    // 关键词监测告警
    keywordMonitor.onAlert((keyword, current, previous, ratio) => {
      const win = getMainWin()
      if (win && !win.isDestroyed()) {
        win.webContents.send('notification', {
          type: 'keyword-spike',
          title: '[Spike] ' + keyword + ': ' + previous + ' -> ' + current + ' (' + ratio.toFixed(1) + 'x)',
          keyword, current, previous,
        })
      }
    })

    // R28 修复：保存 interval 句柄并 unref，允许进程正常退出
    const keywordPersistTimer = setInterval(() => {
      try {
        const state = keywordMonitor.getAllHistories()
        store.setSetting('keyword_monitor_state', JSON.stringify(state))
      } catch (e) {
        log.warn('App', 'Keyword monitor persist error: ' + e.message)
      }
    }, 5 * 60 * 1000)
    if (keywordPersistTimer.unref) keywordPersistTimer.unref()

    // PRD F1.3: 登录状态定期检测 — 每 30 分钟检测账号 Cookie 是否过期
    try {
      const { createLoginStatusMonitor } = require('./services/login-status-monitor')
      const accountManager = require('./publishers/account-manager')
      const loginMonitor = createLoginStatusMonitor({
        store: store,
        accountManager: accountManager,
        intervalMs: 30 * 60 * 1000,
        getMainWin: getMainWin,
      })
      loginMonitor.start()
      log.info('App', 'Login status monitor started (F1.3, 30min interval)')
    } catch (e) {
      log.warn('App', 'Login status monitor failed to start: ' + e.message)
    }

    // Analytics 提供者注册
    try {
      const { xiaohongshuProvider, douyinProvider } = require('./services/analytics-providers')
      analyticsService.registerProvider('xiaohongshu', xiaohongshuProvider)
      analyticsService.registerProvider('douyin', douyinProvider)
      log.info('App', 'Analytics providers registered: xiaohongshu, douyin')
    } catch (e) {
      log.warn('App', 'Failed to register analytics providers: ' + e.message)
    }

    // 云端发布
    const cloudPublisher = new CloudPublisher({
      orchestratorUrl: process.env.ORCHESTRATOR_URL || '',
      store,
    })
    cloudPublisher.registerIpcHandlers()

    // ─── 注册所有 IPC handlers ──────────────
    // 拆分到 bootstrap/phase5-ipc.js
    registerAllIpcHandlers({
      app,
      BrowserWindow: require('electron').BrowserWindow,
      context,
    })

    mainWindow = createWindow(context)
    // Bug-5: 注册 mainWindow 到 DI 容器供 getMainWin 缓存使用
    if (_container) _container.register('mainWindow', mainWindow, { forceValue: true })
   } catch (e) {
    log.error('App', 'Startup failed:', e.message, e.stack)
    try {
      const { dialog } = require('electron')
      dialog.showErrorBox('启动失败', e.message + '\n\n请查看日志并联系支持。')
    } catch { /* dialog 不可用时忽略 */ }
   }
  }).catch(function (e) {
    log.error('App', 'whenReady failed:', e.message)
  })
}

module.exports = { createAppContext, runWhenReady }
