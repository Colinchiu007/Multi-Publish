const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const log = require('./logger')

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

// ─── AuthViewManager（内嵌浏览器登录）─────
const authViewManager = new AuthViewManager()
// ─── RpaViewManager（隐藏浏览器 executeJavaScript RPA）
const rpaViewManager = new RpaViewManager()
// ─── WebviewManager（分屏监控）────────────
const webviewManager = new WebviewManager()
// ─── CallbackServer（实时回调）─────────────
const callbackServer = new CallbackServer()
// ─── QrCodeLogin（扫码登录）───────────────
const qrCodeLogin = new QrCodeLogin()
// ─── Store（统一 SQLite 持久化）────────────
const store = new Store()
// ─── ContentIntelligence（跨源情报引擎）─────
const contentIntelligence = new ContentIntelligence(store)
// ─── PublishImpactTracker（影响力追踪）───────
const publishImpactTracker = new PublishImpactTracker(contentIntelligence)
// ─── KeywordMonitor（关键词背景监测）─────────
const keywordMonitor = new KeywordMonitor(contentIntelligence, store)
const providerManager = new ProviderManager()
// ─── OAuthManager（OAuth 2.0 认证）─────────
const oauthManager = new OAuthManager(store)
// ─── BatchManager（批量发布）────────────────
const batchManager = new BatchManager(store)
// ─── UrlCollector（URL 内容采集）────────────
const urlCollector = new UrlCollector()
// ─── ViralEngine（爆款分析）─────────────────
const viralEngine = new ViralEngine()
// ─── ProxyPool（代理池轮换）────────────────
const proxyPool = new ProxyPool()
// ─── AnalyticsService（跨平台数据分析）────────
const analyticsService = new AnalyticsService()

const PublishAlert = require('./publish-alert')
const publishMonitor = require('./publish-monitor')
const systemTray = require('./system-tray')
const hotkeys = require('./hotkeys')

// ─── 系统托盘初始化 ──────────────────────────
systemTray.registerIpcHandlers()

// ─── 任务队列 ─────────────────────────────
const taskQueue = new TaskQueue({ maxConcurrent: 3, publishIntervalGuard })
scheduler.setTaskQueue(taskQueue)
BatchManager.setTaskQueue(taskQueue)

// ─── Aggregator Bridge ────────────────────
const aggregatorBridge = new AggregatorBridge(taskQueue)

// ─── PublisherRouter 统一发布路由 ────────────────
// 替代三段 if/else 路由，从 config/platforms.yaml 读取平台路由配置
const publisherRouter = new PublisherRouter()

// 注册执行器
taskQueue.setExecutor(async (task) => {
  const platform = task.platform

  // 进度发射器（通用）
  const emitProgress = (stage) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('publish:progress', { platform, stage, taskId: task.id })
    }
  }

  emitProgress('准备发布...')

  // ── 通过 PublisherRouter 创建发布器 ──────────
  const publisher = publisherRouter.createPublisher(platform, {
    rpaViewManager,
    store,
    pythonBridge,
  })

  // 注册进度转发
  rpaViewManager.onProgress(({ stage }) => { emitProgress(stage) })

  try {
    const result = await publisher.publish(task)
    emitProgress('✓ 发布成功')
    return result
  } catch (e) {
    log.error('Executor', `Publish failed for ${platform}: ${e.message}`)
    throw e
  }
})

taskQueue.on('task:success', (task) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('publish:progress', {
      platform: task.platform,
      stage: `✓ 发布成功`,
      taskId: task.id,
      result: task.result
    })
  }
  history.addRecord({
    platform: task.platform,
    title: task.article?.title || '',
    taskId: task.id,
    status: 'success',
    result: task.result
  })

  // 启动发布后状态监控（基于蚁小二逆向工程）
  try {
    const postId = task.result?.postId || task.result?.id
    if (postId) {
      publishMonitor.createMonitorTask({
        postId,
        platform: task.platform,
        cookies: task.article?.cookies || '',
        callback: (monitorResult) => {
          log.info('PublishMonitor', `Monitor result for ${task.platform}:${postId}: ${monitorResult.status}`)
          history.addRecord({
            platform: task.platform,
            title: task.article?.title || '',
            taskId: task.id,
            status: monitorResult.status,
            result: monitorResult,
          })
        },
      })
    }
  } catch (e) {
    log.warn('PublishMonitor', `Failed to start monitor: ${e.message}`)
  }

  // 启动影响力追踪（发布后自动跟踪社交提及）
  try {
    const title = task.article?.title
    const content = task.article?.content || title
    if (title && content) {
      publishImpactTracker.addTracking({
        articleId: task.id,
        title,
        keywords: task.article?.keywords || [title],
      })
      log.info('ImpactTracker', `Started tracking "${title}"`)
    }
  } catch (e) {
    log.warn('ImpactTracker', `Failed to start impact tracking: ${e.message}`)
  }
})

taskQueue.on('task:failed', (task) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('publish:progress', {
      platform: task.platform,
      stage: `✗ 发布失败: ${task.error}`,
      taskId: task.id,
      error: task.error
    })
  }
})

taskQueue.on('publish:blocked', ({ task, remainingWait }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    const minutes = Math.ceil(remainingWait / 60000)
    win.webContents.send('publish:progress', {
      platform: task.platform,
      stage: `⏳ 发布间隔限制，等待 ${minutes} 分钟后重试`,
      taskId: task.id,
      remainingWait,
    })
  }
})

taskQueue.on('task:retry', (task) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('publish:progress', {
      platform: task.platform,
      stage: `⟳ 重试中... (剩余 ${task.retriesLeft} 次)`,
      taskId: task.id
    })
  }
})

let mainWindow = null

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
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

  // 设置 AuthViewManager
  authViewManager.setMainWindow(mainWindow)

  // 设置 RpaViewManager（隐藏浏览器 executeJavaScript RPA）
  rpaViewManager.setMainWindow(mainWindow)

  // 设置 WebviewManager（分屏监控）
    webviewManager.setMainWindow(mainWindow)
    webviewManager.registerIpcHandlers()

    // 设置 QrCodeLogin（扫码登录）
        qrCodeLogin.setMainWindow(mainWindow)
        qrCodeLogin.registerIpcHandlers()

        // 设置 OAuthManager（OAuth 认证）
            oauthManager.setMainWindow(mainWindow)
            oauthManager.registerIpcHandlers()

            // 设置 BatchManager（批量发布）
            batchManager.registerIpcHandlers()

            // 设置 UrlCollector（URL 采集）
            urlCollector.registerIpcHandlers()
		providerManager.registerIpcHandlers()

            // 设置 ViralEngine（爆款分析）
            viralEngine.registerIpcHandlers()

            // 设置 ContentIntelligence（内容情报引擎）
            contentIntelligence.registerIpcHandlers()

            // 设置 PublishImpactTracker（影响力追踪）
            publishImpactTracker.registerIpcHandlers()
  // 初始化系统托盘
  systemTray.init(mainWindow)

  // 注册全局快捷键
  hotkeys.register()

  // 最小化到托盘 — 由 system-tray.js 管理，此处不重复绑定
  // mainWindow.on('minimize', (...) => ...) 已由 systemTray.init() 注册

  // 初始化自动更新
    autoUpdater.init(mainWindow, (status) => {
      log.info('auto-updater', JSON.stringify(status))
    })

    // 首次运行引导
    firstRun.runSetup(mainWindow)
  }

// ─── IPC handlers ─────────────────────

ipcMain.handle('app:get-version', () => app.getVersion())
ipcMain.handle('app:get-platform', () => process.platform)

// 发布相关 IPC
ipcMain.handle('publish:wechat', async (event, articleData) => {
  try {
    const taskId = taskQueue.add({
    platform: 'wechat_mp',
    article: articleData,
    retry: 2,
    timeout: 180000
  })
    return { code: 0, data: { taskId }, message: '任务已加入队列' }
  } catch (e) { return { code: -1, message: e.message } }
})

ipcMain.handle('publish:batch', async (event, { platforms, article }) => {
  // 支持两种格式：
  //   旧: { platforms: ['wechat_mp'], article: {...} }
  //   新: { platforms: [{platform:'wechat_mp', accountId:'xxx'}], article: {...} }
  const isObj = platforms && platforms.length > 0 && typeof platforms[0] === 'object'
  const taskIds = platforms.map(p => {
    const platform = isObj ? p.platform : p
    const accountId = isObj ? p.accountId : null
    return taskQueue.add({
      platform,
      article: { ...(article || {}), accountId },
      accountId,
    })
  })
  return { code: 0, data: { taskIds }, message: `已添加 ${taskIds.length} 个任务` }
})

// 队列 IPC
ipcMain.handle('queue:status', async () => taskQueue.getStatus())
ipcMain.handle('queue:history', async () => ({ code: 0, data: taskQueue.getHistory() }))
ipcMain.handle('queue:cancel', async (event, taskId) => {
  const ok = taskQueue.cancel(taskId)
  return { code: ok ? 0 : -1, message: ok ? '任务已取消' : '任务不存在或已完成' }
})
// 发布历史 IPC
ipcMain.handle('history:list', async (event, opts) => {
  try {
    const result = history.listRecords(opts)
    return { code: 0, data: result }
  } catch (e) {
    return { code: -1, message: e.message, data: { total: 0, records: [] } }
  }
})
ipcMain.handle('history:get', async (event, id) => {
  const record = history.getRecord(id)
  if (!record) return { code: -1, message: '记录不存在' }
  return { code: 0, data: record }
})
// ─── 发布统计 IPC ───────────
ipcMain.handle('dashboard:stats', async () => {
  return { code: 0, data: history.getStats() }
})

// 定时发布 IPC
ipcMain.handle('scheduler:create', async (event, { platform, article, publishTime }) => {
  try {
    const entry = scheduler.create({ platform, article, publishTime })
    return { code: 0, data: entry, message: '定时任务已创建' }
  } catch (e) { return { code: -1, message: e.message } }
})
ipcMain.handle('scheduler:list', async () => {
  try { return { code: 0, data: scheduler.list() } } catch (e) { return { code: -1, message: e.message, data: [] } }
})
ipcMain.handle('scheduler:cancel', async (event, id) => {
  scheduler.cancel(id)
  return { code: 0, message: '定时任务已取消' }
})

// ─── 自动更新 IPC ────────────────────────
ipcMain.handle('update:check', async () => {
  autoUpdater.check()
  return { code: 0 }
})
ipcMain.handle('update:download', async () => {
  autoUpdater.download()
  return { code: 0 }
})
ipcMain.handle('update:install', async () => {
  autoUpdater.quitAndInstall()
  return { code: 0 }
})

// ─── 快捷键 IPC ───────────────────────────
ipcMain.handle('hotkeys:list', async () => {
  return { code: 0, data: hotkeys.getShortcuts() }
})

// ─── 平台配置 IPC ─────────────────────────
const PlatformConfig = require('@multi-publish/shared-utils/src/platform-config')

// Python 后端平台列表（用于 auth router 判断）
const BACKEND_PLATFORMS = new Set(['youtube', 'tiktok', 'twitter'])

// ─── 敏感词预检 + 数据同步 IPC ──────────────
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

ipcMain.handle('platform:list', async () => {
  if (!_platformConfig) return { code: -1, message: '配置未加载', data: [] }
  return { code: 0, data: _platformConfig.listPlatforms() }
})
ipcMain.handle('platform:get', async (_, id) => {
  if (!_platformConfig) return { code: -1, message: '配置未加载' }
  const p = _platformConfig.getPlatform(id)
  return { code: p ? 0 : -1, data: p }
})

// ─── 敏感词预检 IPC ───────────────────────
ipcMain.handle('sensitive:check', async (_, { text }) => {
  try {
    const result = _sensitiveFilter.check(text || '')
    return { code: 0, data: result }
  } catch (e) {
    return { code: -1, message: e.message }
  }
})
ipcMain.handle('sensitive:replace', async (_, { text }) => {
  try {
    const result = _sensitiveFilter.replace(text || '')
    return { code: 0, data: result }
  } catch (e) {
    return { code: -1, message: e.message }
  }
})

// ─── 数据同步 IPC ───────────────────────────
ipcMain.handle('sync:all', async () => {
  try {
    const results = await _dataSync.syncAll()
    return { code: 0, data: results }
  } catch (e) {
    return { code: -1, message: e.message }
  }
})
ipcMain.handle('sync:platform', async (_, platform) => {
  try {
    const result = await _dataSync.syncPlatform(platform)
    return { code: 0, data: result }
  } catch (e) {
    return { code: -1, message: e.message }
  }
})
ipcMain.handle('sync:cached', async () => {
  try {
    const data = _dataSync.getAllCachedData()
    return { code: 0, data }
  } catch (e) {
    return { code: -1, message: e.message }
  }
})

// ─── Analytics IPC handlers ──────────────────
ipcMain.handle('analytics:overview', async () => {
  try {
    const platforms = analyticsService.getRegisteredPlatforms()
    if (platforms.length === 0) return { code: 0, data: [] }
    const credentialsMap = {}
    for (const p of platforms) {
      const account = store.listAccounts(p)[0]
      if (account?.cookies) {
        try { credentialsMap[p] = { cookies: JSON.parse(account.cookies) } }
        catch (e) { credentialsMap[p] = {} }
      }
    }
    const data = await analyticsService.fetchOverview(platforms, credentialsMap)
    return { code: 0, data }
  } catch (e) {
    return { code: -1, message: e.message }
  }
})
ipcMain.handle('analytics:platform', async (_, { platform }) => {
  try {
    const account = store.listAccounts(platform)[0]
    const credentials = account?.cookies ? { cookies: JSON.parse(account.cookies) } : {}
    const data = await analyticsService.fetchPlatformData(platform, credentials)
    return { code: 0, data }
  } catch (e) {
    return { code: -1, message: e.message }
  }
})
ipcMain.handle('analytics:platforms', async () => {
  try {
    return { code: 0, data: analyticsService.getRegisteredPlatforms() }
  } catch (e) {
    return { code: -1, message: e.message, data: [] }
  }
})

// ─── Proxy Pool IPC handlers ─────────────────
ipcMain.handle('proxy:add', async (_, { host, port, type }) => {
  try { const id = proxyPool.addProxy(host, port, type || 'http'); return { code: 0, data: { id } } }
  catch (e) { return { code: -1, message: e.message } }
})
ipcMain.handle('proxy:add-batch', async (_, { proxies }) => {
  try { proxyPool.addProxies(proxies); return { code: 0, data: { total: proxyPool.size() } } }
  catch (e) { return { code: -1, message: e.message } }
})
ipcMain.handle('proxy:list', async () => {
  try { return { code: 0, data: proxyPool.getProxies() } }
  catch (e) { return { code: -1, message: e.message, data: [] } }
})
ipcMain.handle('proxy:remove', async (_, { id }) => {
  try { const ok = proxyPool.remove(id); return { code: ok ? 0 : -1, message: ok ? '已移除' : '代理不存在' } }
  catch (e) { return { code: -1, message: e.message } }
})
ipcMain.handle('proxy:test', async (_, { id, timeout }) => {
  try { const result = await proxyPool.testProxy(id, { timeout }); return { code: 0, data: result } }
  catch (e) { return { code: -1, message: e.message } }
})
ipcMain.handle('proxy:test-all', async (_, { timeout }) => {
  try { const results = await proxyPool.testAll({ timeout }); return { code: 0, data: results } }
  catch (e) { return { code: -1, message: e.message } }
})
ipcMain.handle('proxy:status', async () => {
  try { return { code: 0, data: proxyPool.getStatus() } }
  catch (e) { return { code: -1, message: e.message, data: { total: 0, alive: 0, dead: 0 } } }
})
ipcMain.handle('proxy:get-next', async () => {
  try { const proxy = proxyPool.getNextProxy(); return { code: 0, data: proxy } }
  catch (e) { return { code: -1, message: e.message } }
})
ipcMain.handle('proxy:reset', async () => {
  try { proxyPool.reset(); return { code: 0 } }
  catch (e) { return { code: -1, message: e.message } }
})
ipcMain.handle('proxy:remove-dead', async () => {
  try { const removed = proxyPool.removeDead(); return { code: 0, data: { removed } } }
  catch (e) { return { code: -1, message: e.message } }
})

// ─── ChunkedUploader IPC handlers ────────────
const _chunkedUploader = new ChunkedUploader()
ipcMain.handle('upload:chunked', async (_, { filePath, uploadChunkFn }) => {
  try {
    const result = await _chunkedUploader.upload(filePath, uploadChunkFn)
    return { code: result.success ? 0 : -1, data: result }
  } catch (e) {
    return { code: -1, message: e.message }
  }
})
ipcMain.handle('upload:cancel', async () => {
  _chunkedUploader.cancel()
  return { code: 0 }
})


// ─── 首次运行引导 IPC ─────────────────────
ipcMain.handle('first-run:check', async () => {
  return { code: 0, data: firstRun.checkDeps() }
})

// 账号 IPC
ipcMain.handle('show-notification', async (_, data) => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('notification', data)
    }
  } catch (e) { /* ignore */ }
})

ipcMain.handle('accounts:list', async () => {
  try { return await pythonBridge.requestBackend('GET', '/api/accounts') }
  catch (e) { return { code: -1, message: e.message, data: [] } }
})

// 内嵌浏览器登录（替代 Playwright 弹出窗口）
ipcMain.handle('auth:open-login', async (event, platform) => {
  try {
    // Python 后端平台走 /api/login（打开系统浏览器，用户扫码）
    if (BACKEND_PLATFORMS.has(platform)) {
      const result = await pythonBridge.requestBackend('POST', '/api/login', { platform }, 180000)
      if (result.code === 0) {
        // 通知前端刷新账号列表
        const win = BrowserWindow.getAllWindows()[0]
        if (win && !win.isDestroyed()) {
          win.webContents.send('auth:completed', { platform, accountId: result.data?.account_id })
        }
        return { code: 0, data: result.data, message: '登录成功' }
      }
      return { code: -1, message: result.message || '登录失败' }
    }

    const result = await authViewManager.openLogin(platform)
    // 通过 Python API 保存账号
    const saveResult = await pythonBridge.requestBackend('POST', '/api/accounts', {
      platform,
      name: result.name,
      cookies: result.cookies,
      auth_data: {
        cookies: result.cookies,
        localStorage: result.localStorage || {},
        indexedDB: result.indexedDB || {},
      },
    })
    if (saveResult.code !== 0) {
      throw new Error(saveResult.message || '保存账号失败')
    }

    // B站/抖音登录后，推送 cookie 到 orchestrator 供 Story2Video 发布使用
    if (platform === 'bilibili' || platform === 'douyin') {
      try {
        const http = require('http')
        const orchestratorUrl = process.env.ORCHESTRATOR_URL || 'http://39.105.42.85'
        const token = process.env.ORCHESTRATOR_API_KEY || ''
        const postData = JSON.stringify({
          cookies: result.cookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain || '.bilibili.com',
            path: c.path || '/',
          })),
          username: result.name || '',
        })
        const url = new URL(`${orchestratorUrl}/api/jobs/cookies/${platform}`)
        const req = http.request({
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            ...(token ? { 'X-API-Key': token } : {}),
          },
        })
        req.on('error', (e) => log.warn('Auth', `Orchestrator cookie push failed: ${e.message}`))
        req.write(postData)
        req.end()
        log.info('Auth', `Pushed ${platform} cookies to orchestrator`)
      } catch (e) {
        log.warn('Auth', `Orchestrator cookie push failed: ${e.message}`)
      }
    }
    return { code: 0, data: { ...saveResult.data }, message: '账号添加成功' }
  } catch (e) {
    log.error('Auth', `Login failed for ${platform}: ${e.message}`)
    return { code: -1, message: e.message }
  }
})

// 静默登录验证（隐藏浏览器窗口，用于发布前账号检查）
ipcMain.handle('auth:login-silent', async (event, { platform, cookies, localStorage }) => {
  try {
    const result = await authViewManager.loginSilent(platform, cookies, localStorage)
    return { code: 0, data: result }
  } catch (e) {
    return { code: -1, message: e.message, data: { valid: false, accountName: null } }
  }
})

ipcMain.handle('auth:close', async () => {
  authViewManager.close()
  return { code: 0 }
})

ipcMain.handle('auth:save-credentials', async (event, { accountId, cookies, localStorage }) => {
  try {
    const result = await pythonBridge.requestBackend('POST', '/api/auth', {
      accountId,
      cookies,
      localStorage,
    })
    return result
  } catch (e) {
    return { code: -1, message: e.message }
  }
})

// 向下兼容：account:add 仍然走旧的 Playwright 方式
ipcMain.handle('account:add', async (event, platform) => {
  try {
    const account = await AccountManager.addAccount(platform)
    return { code: 0, data: account, message: '账号添加成功' }
  } catch (e) { return { code: -1, message: e.message } }
})
ipcMain.handle('account:delete', async (event, accountId) => {
  // Python 后端平台从 Python 删除（跨平台兼容：尝试两种方式）
  try {
    const result = await pythonBridge.requestBackend('DELETE', `/api/accounts/${accountId}`)
    if (result.code === 0) return { code: 0, message: '账号已删除' }
  } catch (e) { /* 可能不是 Python 后端管理的账号，fallthrough */ }
  try { await AccountManager.deleteAccount(accountId); return { code: 0, message: '账号已删除' } }
  catch (e) { return { code: -1, message: e.message } }
})
ipcMain.handle('account:check-login', async (event, { platform, accountId }) => {
  try {
    // Python 后端平台走 /api/auth-status
    if (BACKEND_PLATFORMS.has(platform)) {
      const result = await pythonBridge.requestBackend('GET', `/api/auth-status/${platform}`)
      return { code: 0, data: { valid: result.data?.valid === true } }
    }
    const status = await AccountManager.checkLoginStatus(platform, accountId)
    return { code: 0, data: status }
  } catch (e) { return { code: -1, message: e.message, data: { valid: false } } }
})
ipcMain.handle('account:list', async () => {
  try { const accounts = await AccountManager.listAccounts(); return { code: 0, data: accounts } }
  catch (e) { return { code: -1, message: e.message, data: [] } }
})

// ─── 应用生命周期 ─────────────────────

app.whenReady().then(async () => {
  try { await pythonBridge.startPythonBackend() }
  catch (e) { log.error('App', 'Failed to start Python backend:', e.message) }

  // 初始化 SQLite 数据库
  store.init()

  // ── 发布频率控制（跨会话持久化） ──────────
  const publishGuardStore = {
    get: (key) => store.getPublishTimeline(key),
    set: (key, value) => store.setPublishTimeline(key, value),
  }
  const publishIntervalGuard = new PublishIntervalGuard({ store: publishGuardStore })

  // 任务队列持久化 — 状态变更自动写入 Store
  taskQueue.setStateSaver((jsonStr) => {
    store.setSetting('task_queue_state', jsonStr)
  })

  // 注册 Store IPC handlers
  ipcMain.handle('store:add-account', (_, account) => {
    const ok = store.addAccount(account)
    return { code: ok ? 0 : -1 }
  })
  ipcMain.handle('store:get-account', (_, id) => {
    const account = store.getAccount(id)
    return { code: account ? 0 : -1, data: account }
  })
  ipcMain.handle('store:list-accounts', (_, platform) => {
    return { code: 0, data: store.listAccounts(platform) }
  })
  ipcMain.handle('store:delete-account', (_, id) => {
    store.deleteAccount(id)
    return { code: 0 }
  })
  ipcMain.handle('store:set-default-account', (_, { platform, accountId }) => {
    store.setDefaultAccount(platform, accountId)
    return { code: 0 }
  })
  ipcMain.handle('store:get-default-account', (_, platform) => {
    const account = store.getDefaultAccount(platform)
    return { code: account ? 0 : -1, data: account }
  })
  ipcMain.handle('store:update-account', (_, { id, fields }) => {
    store.updateAccount(id, fields)
    return { code: 0 }
  })
  ipcMain.handle('store:add-publish-record', (_, record) => {
    const id = store.addPublishRecord(record)
    return { code: id ? 0 : -1, data: { id } }
  })
  ipcMain.handle('store:list-publish-history', (_, opts) => {
    return { code: 0, data: store.listPublishHistory(opts) }
  })
  ipcMain.handle('store:get-publish-stats', () => {
    return { code: 0, data: store.getPublishStats() }
  })
  ipcMain.handle('store:add-scheduled-task', (_, task) => {
    const id = store.addScheduledTask(task)
    return { code: id ? 0 : -1, data: { id } }
  })
  ipcMain.handle('store:list-scheduled-tasks', () => {
    return { code: 0, data: store.listScheduledTasks() }
  })
  ipcMain.handle('store:delete-task', (_, id) => {
    store.deleteTask(id)
    return { code: 0 }
  })
  ipcMain.handle('store:get-setting', (_, key) => {
    return { code: 0, data: store.getSetting(key) }
  })
  ipcMain.handle('store:set-setting', (_, key, value) => {
    store.setSetting(key, value)
    return { code: 0 }
  })
  ipcMain.handle('store:list-callback-logs', (_, limit) => {
    return { code: 0, data: store.listCallbackLogs(limit) }
  })

  // 启动回调服务器（接收外部回调并转发到渲染进程）
  try {
    callbackServer.start((data) => {
          const win = BrowserWindow.getAllWindows()[0]
          if (win && !win.isDestroyed()) {
            win.webContents.send('callback:received', data)
          }
          // 记录回调到 SQLite
          if (data) {
            store.addCallbackLog(data.type || 'unknown', data.source || data.platform, data)
          }
        })
  } catch (e) {
    log.warn('App', 'Callback server failed to start (port may be in use):', e.message)
  }

  const restored = scheduler.restore()
  if (restored > 0) console.log(`[Scheduler] Restored ${restored} pending tasks`)

  // 任务队列崩溃恢复
  const savedState = store.getSetting('task_queue_state')
  if (savedState) {
    const recovered = taskQueue.deserialize(savedState)
    if (recovered > 0) {
      log.info('App', `Recovered ${recovered} tasks from queue state`)
      store.setSetting('task_queue_state', null)
    }
  }

  // 关键词背景监测 IPC handlers
  ipcMain.handle('keyword:start', async (_, { keyword, opts }) => {
    const ok = keywordMonitor.startMonitoring(keyword, opts)
    return { code: ok ? 0 : -1, data: { keyword } }
  })
  ipcMain.handle('keyword:stop', async (_, { keyword }) => {
    const ok = keywordMonitor.stopMonitoring(keyword)
    return { code: ok ? 0 : -1 }
  })
  ipcMain.handle('keyword:status', async () => {
    return { code: 0, data: keywordMonitor.getStatus() }
  })
  ipcMain.handle('keyword:history', async (_, { keyword }) => {
    return { code: 0, data: keywordMonitor.getHistory(keyword) }
  })
  ipcMain.handle('keyword:stop-all', async () => {
    keywordMonitor.stopAll()
    return { code: 0 }
  })

  keywordMonitor.onAlert((keyword, current, previous, ratio) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('notification', {
        type: 'keyword-spike',
        title: '[Spike] ' + keyword + ': ' + previous + ' -> ' + current + ' (' + ratio.toFixed(1) + 'x)',
        keyword,
        current,
        previous,
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

  // ─── Analytics Service 提供者注册 ────────────
  try {
    const { xiaohongshuProvider, douyinProvider } = require('./analytics-providers')
    analyticsService.registerProvider('xiaohongshu', xiaohongshuProvider)
    analyticsService.registerProvider('douyin', douyinProvider)
    log.info('App', 'Analytics providers registered: xiaohongshu, douyin')
  } catch (e) {
    log.warn('App', 'Failed to register analytics providers: ' + e.message)
  }

  // 云端发布模块 IPC handlers
  const cloudPublisher = new CloudPublisher({
    orchestratorUrl: process.env.ORCHESTRATOR_URL || 'http://39.105.42.85',
    store,
  })
  cloudPublisher.registerIpcHandlers()

  createWindow()
})

app.on('window-all-closed', async () => {
  hotkeys.unregister()
  try { await pythonBridge.stopPythonBackend() } catch (e) { log.error('App', 'Error stopping Python:', e.message) }
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
