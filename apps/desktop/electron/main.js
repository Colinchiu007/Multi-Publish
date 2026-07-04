const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const log = require('./logger')
const RenderEngine = require('./render-engine')

const { TaskQueue, AggregatorBridge, ChunkedUploader, ProxyPool, AnalyticsService } = require('@multi-publish/shared-utils')
const PublishIntervalGuard = require('@multi-publish/shared-utils/src/publish-interval-guard')
const pythonBridge = require('./python-bridge')
const AccountManager = require('./publishers/account-manager')
const scheduler = require('./scheduler')
const history = require('./publish-history')
const autoUpdater = require('./auto-updater')
const firstRun = require('./first-run')
const AuthViewManager = require('./auth-view-manager')
const WebviewManager = require('./webview-manager')
const RpaViewManager = require('./rpa-view-manager')
const { PublisherRouter } = require('./publisher-router')
const CallbackServer = require('./callback-server')
const QrCodeLogin = require('./qrcode-login')
const Store = require('./store')
const OAuthManager = require('./oauth-manager')
const BatchManager = require('./batch-manager')
const UrlCollector = require('./url-collector')
const ViralEngine = require('./viral-engine')
const ContentIntelligence = require('./content-intelligence')
const PublishImpactTracker = require('./publish-impact-tracker')
const KeywordMonitor = require('./keyword-monitor')
const ProviderManager = require('./provider-manager')
const CloudPublisher = require('./cloud-publisher')
const flutterSkillBridge = require('./flutter-skill-bridge')
const UsageTracker = require('./usage-tracker')
const TemplateManager = require('./template-manager')
const LicenseManager = require('./license-manager')
const AiWriter = require('./ai-writer')

// ─── 基础设施实例 ──────────────────────────
const authViewManager = new AuthViewManager()
const rpaViewManager = new RpaViewManager()
const webviewManager = new WebviewManager()
const callbackServer = new CallbackServer()
const qrCodeLogin = new QrCodeLogin()
const store = new Store()
const contentIntelligence = new ContentIntelligence(store)
const publishImpactTracker = new PublishImpactTracker(contentIntelligence)
const keywordMonitor = new KeywordMonitor(contentIntelligence, store)
const providerManager = new ProviderManager()
const oauthManager = new OAuthManager(store)
const batchManager = new BatchManager(store)
const urlCollector = new UrlCollector()
const viralEngine = new ViralEngine()
const proxyPool = new ProxyPool()
const analyticsService = new AnalyticsService()

const PublishAlert = require('./publish-alert')
const templateManager = new TemplateManager()
templateManager.seedDefaults()
const licenseManager = LicenseManager.getInstance()
const aiWriter = new AiWriter()
const publishMonitor = require('./publish-monitor')
const systemTray = require('./system-tray')
const hotkeys = require('./hotkeys')

// ─── 系统托盘 ──────────────────────────────
systemTray.registerIpcHandlers()

// ─── 任务队列 ──────────────────────────────
const taskQueue = new TaskQueue({ maxConcurrent: 3 })
scheduler.setTaskQueue(taskQueue)
BatchManager.setTaskQueue(taskQueue)

// ─── Aggregator Bridge ────────────────────
const aggregatorBridge = new AggregatorBridge(taskQueue)

// ─── PublisherRouter ──────────────────────
const publisherRouter = new PublisherRouter()

// ─── 任务执行器 ────────────────────────────
taskQueue.setExecutor(async (task) => {
  const platform = task.platform
  const emitProgress = (stage) => {
    const win = BrowserWindow.getAllWindows()[0]
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
  // 记录发布事件
  if (typeof global.usageTracker !== 'undefined' && global.usageTracker) {
    global.usageTracker.trackFeatureUsage('publish', 'success')
    global.usageTracker.trackDaily('articles_published', 1)
  }

taskQueue.on('task:success', (task) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('publish:progress', {
      platform: task.platform, stage: '✓ 发布成功', taskId: task.id, result: task.result,
    })
  }
  history.addRecord({
    platform: task.platform, title: task.article?.title || '', taskId: task.id,
    status: 'success', result: task.result,
  })
  try {
    const postId = task.result?.postId || task.result?.id
    if (postId) {
      publishMonitor.createMonitorTask({
        postId, platform: task.platform, cookies: task.article?.cookies || '',
        callback: (monitorResult) => {
          log.info('PublishMonitor', 'Monitor result for ' + task.platform + ':' + postId + ': ' + monitorResult.status)
          history.addRecord({
            platform: task.platform, title: task.article?.title || '',
            taskId: task.id, status: monitorResult.status, result: monitorResult,
          })
        },
      })
    }
  } catch (e) { log.warn('PublishMonitor', 'Failed to start monitor: ' + e.message) }
  try {
    const title = task.article?.title
    const content = task.article?.content || title
    if (title && content) {
      publishImpactTracker.addTracking({
        articleId: task.id, title, keywords: task.article?.keywords || [title],
      })
      log.info('ImpactTracker', 'Started tracking "' + title + '"')
    }
  } catch (e) { log.warn('ImpactTracker', 'Failed to start impact tracking: ' + e.message) }
})

taskQueue.on('task:failed', (task) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('publish:progress', {
      platform: task.platform, stage: '✗ 发布失败: ' + task.error, taskId: task.id, error: task.error,
    })
  }
})

taskQueue.on('publish:blocked', ({ task, remainingWait }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    const minutes = Math.ceil(remainingWait / 60000)
    win.webContents.send('publish:progress', {
      platform: task.platform, stage: '⏳ 发布间隔限制，等待 ' + minutes + ' 分钟后重试',
      taskId: task.id, remainingWait,
    })
  }
})

taskQueue.on('task:retry', (task) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('publish:progress', {
      platform: task.platform, stage: '⟳ 重试中... (剩余 ' + task.retriesLeft + ' 次)', taskId: task.id,
    })
  }
})

// ─── 渲染引擎实例 ──────────────────────────
const renderEngine = new RenderEngine()

// ─── 平台、敏感词、数据同步等基础设施 ────────
const PlatformConfig = require('@multi-publish/shared-utils/src/platform-config')
const BACKEND_PLATFORMS = new Set(['youtube', 'tiktok', 'twitter'])
const SensitiveFilter = require('@multi-publish/shared-utils/src/sensitive-filter')
const DataSyncService = require('@multi-publish/shared-utils/src/data-sync')
const _sensitiveFilter = SensitiveFilter.createWithBuiltin()
const _dataSync = new DataSyncService(store)
const _platformConfig = (() => {
  try {
    const cfgPath = path.join(__dirname, '..', '..', '..', 'config', 'platforms.yaml')
    return new PlatformConfig(cfgPath)
  } catch (e) {
    log.warn('App', 'Failed to load platform config:', e.message)
    return null
  }
})()

const _chunkedUploader = new ChunkedUploader()

// ─── 窗口实例 ──────────────────────────────
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
    show: false,
  })
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev') || !app.isPackaged
  if (isDev) {
    mainWindow.loadURL('http://localhost:5174')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
  mainWindow.once('ready-to-show', () => { mainWindow.show() })
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.on('resize', () => {
    authViewManager._onWindowResize()
    webviewManager.resize()
    qrCodeLogin._onWindowResize()
  })
  authViewManager.setMainWindow(mainWindow)
  rpaViewManager.setMainWindow(mainWindow)
  webviewManager.setMainWindow(mainWindow)
  webviewManager.registerIpcHandlers()
  qrCodeLogin.setMainWindow(mainWindow)
  qrCodeLogin.registerIpcHandlers()
  oauthManager.setMainWindow(mainWindow)
  oauthManager.registerIpcHandlers()
  batchManager.registerIpcHandlers()
  urlCollector.registerIpcHandlers()
  providerManager.registerIpcHandlers()
  viralEngine.registerIpcHandlers()
  contentIntelligence.registerIpcHandlers()
  publishImpactTracker.registerIpcHandlers()
  systemTray.init(mainWindow)
  hotkeys.register()
  autoUpdater.init(mainWindow, (status) => {
    log.info('auto-updater', JSON.stringify(status))
  })
  firstRun.runSetup(mainWindow)
}

// ─── 应用生命周期 ──────────────────────────
app.whenReady().then(async () => {
  try { await pythonBridge.startPythonBackend() }
  catch (e) { log.error('App', 'Failed to start Python backend:', e.message) }

  flutterSkillBridge.start(mainWindow)

  // 启动使用量统计
  const usageTracker = new UsageTracker()
  usageTracker.load()
  usageTracker.trackSession()
  global.usageTracker = usageTracker

  store.init()

  // 发布频率控制
  const publishGuardStore = {
    get: (key) => store.getPublishTimeline(key),
    set: (key, value) => store.setPublishTimeline(key, value),
  }
  const publishIntervalGuard = new PublishIntervalGuard({ store: publishGuardStore })

  // 任务队列持久化
  taskQueue.setStateSaver((jsonStr) => {
    store.setSetting('task_queue_state', jsonStr)
  })

  // 回调服务器
  try {
    callbackServer.start((data) => {
      const win = BrowserWindow.getAllWindows()[0]
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
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('notification', {
        type: 'keyword-spike',
        title: '[Spike] ' + keyword + ': ' + previous + ' -> ' + current + ' (' + ratio.toFixed(1) + 'x)',
        keyword, current, previous,
      })
    }
  })

  setInterval(() => {
    try {
      const state = keywordMonitor.getAllHistories()
      store.setSetting('keyword_monitor_state', JSON.stringify(state))
    } catch (e) {
      log.warn('App', 'Keyword monitor persist error: ' + e.message)
    }
  }, 5 * 60 * 1000)

  // Analytics 提供者注册
  try {
    const { xiaohongshuProvider, douyinProvider } = require('./analytics-providers')
    analyticsService.registerProvider('xiaohongshu', xiaohongshuProvider)
    analyticsService.registerProvider('douyin', douyinProvider)
    log.info('App', 'Analytics providers registered: xiaohongshu, douyin')
  } catch (e) {
    log.warn('App', 'Failed to register analytics providers: ' + e.message)
  }

  // 云端发布
  const cloudPublisher = new CloudPublisher({
    orchestratorUrl: process.env.ORCHESTRATOR_URL || 'http://39.105.42.85',
    store,
  })
  cloudPublisher.registerIpcHandlers()

  // ─── 注册所有 IPC handlers ──────────────
  const registerAllHandlers = require('./ipc-handlers')
  registerAllHandlers(ipcMain, {
    app,
    BrowserWindow,
    log,
    renderEngine,
    taskQueue,
    history,
    scheduler,
    autoUpdater,
    hotkeys,
    firstRun,
    authViewManager,
    pythonBridge,
    AccountManager,
    store,
    _platformConfig,
    _sensitiveFilter,
    _dataSync,
    analyticsService,
    proxyPool,
    _chunkedUploader,
    keywordMonitor,
    BACKEND_PLATFORMS,
    templateManager,
    licenseManager,
    aiWriter,
  })

  // 使用量统计 IPC
  ipcMain.handle('usage:stats', () => {
    if (global.usageTracker) return global.usageTracker.getStats()
    return { features: {}, events: [], sessions: 0 }
  })
  ipcMain.handle('usage:daily', () => {
    if (global.usageTracker) return global.usageTracker.getDailyStats()
    return {}
  })
  ipcMain.handle('usage:track', (event, args) => {
    if (global.usageTracker) global.usageTracker.trackEvent(args.feature, args.action, args.detail)
    return true
  })
    createWindow()
})

// ─── 窗口关闭 ──────────────────────────────
app.on('window-all-closed', async () => {
  hotkeys.unregister()
  try { await pythonBridge.stopPythonBackend() } catch (e) { log.error('App', 'Error stopping Python:', e.message) }
  flutterSkillBridge.stop()
  if (global.usageTracker) { global.usageTracker.save() }
  webviewManager.closeAll()
  rpaViewManager.cleanup()
  keywordMonitor.stopAll()
  callbackServer.stop()
  store.close()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
