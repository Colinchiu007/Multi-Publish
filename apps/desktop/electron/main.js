const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const log = require('./logger')
const { launchBrowser: playwrightLaunch, closeBrowser: playwrightClose, getPublisherClass } = require('@multi-publish/rpa-engine')
const { TaskQueue, AggregatorBridge } = require('@multi-publish/shared-utils')
const pythonBridge = require('./python-bridge')
const AccountManager = require('./publishers/account-manager')
const scheduler = require('./scheduler')
const history = require('./publish-history')
const autoUpdater = require('./auto-updater')
const firstRun = require('./first-run')
const AuthViewManager = require('./auth-view-manager')

// ─── AuthViewManager（内嵌浏览器登录）─────
const authViewManager = new AuthViewManager()
const PublishAlert = require('./publish-alert')
const publishMonitor = require('./publish-monitor')
const systemTray = require('./system-tray')

// ─── 系统托盘初始化 ──────────────────────────
systemTray.registerIpcHandlers()

// ─── 任务队列 ─────────────────────────────
const taskQueue = new TaskQueue({ maxConcurrent: 1 })
scheduler.setTaskQueue(taskQueue)

// ─── Aggregator Bridge ────────────────────
const aggregatorBridge = new AggregatorBridge(taskQueue)

// 注册执行器
taskQueue.setExecutor(async (task) => {
  const PublisherClass = getPublisherClass(task.platform)
  const publisher = new PublisherClass()
  const mainWindow = BrowserWindow.getAllWindows()[0]

  publisher.onProgress(({ platform, stage }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('publish:progress', { platform, stage, taskId: task.id })
    }
  })

  try {
    const result = await publisher.publishArticle(task.article)
    return result
  } catch (e) {
    log.error('Executor', 'Publish failed:', e.message);
    throw e;
  } finally {
    await publisher.cleanup()
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
  mainWindow.on('resize', () => { authViewManager._onWindowResize() })

  // 设置 AuthViewManager
  authViewManager.setMainWindow(mainWindow)

  // 初始化系统托盘
  systemTray.init(mainWindow)

  // 最小化到托盘
  mainWindow.on('minimize', (event) => {
    event.preventDefault()
    mainWindow.hide()
  })

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
  const taskIds = taskQueue.addBatch(platforms, article)
  return { code: 0, data: { taskIds }, message: `已添加 ${platforms.length} 个任务` }
})

// 队列 IPC
ipcMain.handle('queue:status', async () => taskQueue.getStatus())
ipcMain.handle('queue:history', async () => ({ code: 0, data: taskQueue.getHistory() }))

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
    const result = await authViewManager.openLogin(platform)
    // 通过 Python API 保存账号
    const saveResult = await pythonBridge.requestBackend('POST', '/api/accounts', {
      platform,
      name: result.name,
      cookies: result.cookies,
    })
    if (saveResult.code !== 0) {
      throw new Error(saveResult.message || '保存账号失败')
    }
    return { code: 0, data: { ...saveResult.data }, message: '账号添加成功' }
  } catch (e) {
    log.error('Auth', `Login failed for ${platform}: ${e.message}`)
    return { code: -1, message: e.message }
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
  try { await AccountManager.deleteAccount(accountId); return { code: 0, message: '账号已删除' } }
  catch (e) { return { code: -1, message: e.message } }
})
ipcMain.handle('account:check-login', async (event, { platform, accountId }) => {
  try {
    const status = await AccountManager.checkLoginStatus(platform, accountId)
    return { code: 0, data: status }
  } catch (e) { return { code: -1, message: e.message, data: { valid: false } } }
})
ipcMain.handle('account:list', async () => {
  try { const accounts = await AccountManager.listAccounts(); return { code: 0, data: accounts } }
  catch (e) { return { code: -1, message: e.message, data: [] } }
})

// ─── 应用生命周期 ─────────────────────

const userDataDir = app.getPath('userData')

app.whenReady().then(async () => {
  try { await playwrightLaunch(path.join(userDataDir, 'browser-data')) }
  catch (e) { log.error('App', 'Failed to launch Playwright:', e.message) }
  try { await pythonBridge.startPythonBackend() }
  catch (e) { log.error('App', 'Failed to start Python backend:', e.message) }
  const restored = scheduler.restore()
  if (restored > 0) console.log(`[Scheduler] Restored ${restored} pending tasks`)
  createWindow()
})

app.on('window-all-closed', async () => {
  try { await playwrightClose() } catch (e) { log.error('App', 'Error closing Playwright:', e.message) }
  try { await pythonBridge.stopPythonBackend() } catch (e) { log.error('App', 'Error stopping Python:', e.message) }
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})