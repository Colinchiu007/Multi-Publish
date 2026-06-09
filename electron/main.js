const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const playwright = require('./playwright-manager')
const pythonBridge = require('./python-bridge')
const { getPublisherClass } = require('./publishers/registry')
const TaskQueue = require('./task-queue')
const AccountManager = require('./publishers/account-manager')
const history = require('./publish-history')
const AggregatorBridge = require('./aggregator-bridge')
const scheduler = require('./scheduler')
const autoUpdater = require('./auto-updater')

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

  // 初始化自动更新
  autoUpdater.init(mainWindow, (status) => {
    console.log('[auto-updater]', JSON.stringify(status))
  })
}

// ─── IPC handlers ─────────────────────

ipcMain.handle('app:get-version', () => app.getVersion())
ipcMain.handle('app:get-platform', () => process.platform)

// 发布相关 IPC
ipcMain.handle('publish:wechat', async (event, articleData) => {
  const taskId = taskQueue.add({
    platform: 'wechat_mp',
    article: articleData,
    retry: 2,
    timeout: 180000
  })
  return { code: 0, data: { taskId }, message: '任务已加入队列' }
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
  const entry = scheduler.create({ platform, article, publishTime })
  return { code: 0, data: entry, message: '定时任务已创建' }
})
ipcMain.handle('scheduler:list', async () => {
  return { code: 0, data: scheduler.list() }
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

// 账号 IPC
ipcMain.handle('accounts:list', async () => {
  try { return await pythonBridge.requestBackend('GET', '/api/accounts') }
  catch (e) { return { code: -1, message: e.message, data: [] } }
})
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

app.whenReady().then(async () => {
  try { await playwright.launchBrowser() }
  catch (e) { console.error('[App] Failed to launch Playwright:', e.message) }
  try { await pythonBridge.startPythonBackend() }
  catch (e) { console.error('[App] Failed to start Python backend:', e.message) }
  const restored = scheduler.restore()
  if (restored > 0) console.log(`[Scheduler] Restored ${restored} pending tasks`)
  createWindow()
})

app.on('window-all-closed', async () => {
  await playwright.closeBrowser()
  await pythonBridge.stopPythonBackend()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})