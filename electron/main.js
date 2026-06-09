const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const playwright = require('./playwright-manager')
const pythonBridge = require('./python-bridge')
const { getPublisherClass } = require('./publishers/registry')
const TaskQueue = require('./task-queue')
const AccountManager = require('./publishers/account-manager')

// ─── 任务队列 ─────────────────────────────
const taskQueue = new TaskQueue({ maxConcurrent: 1 })

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
  // 开发环境加载 Vite 开发服务器，生产加载打包文件
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev') || !app.isPackaged
  if (isDev) {
    mainWindow.loadURL('http://localhost:5174')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// IPC handlers
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

ipcMain.handle('queue:status', async () => {
  return taskQueue.getStatus()
})

ipcMain.handle('queue:history', async () => {
  return { code: 0, data: taskQueue.getHistory() }
})

ipcMain.handle('accounts:list', async () => {
  try {
    return await pythonBridge.requestBackend('GET', '/api/accounts')
  } catch (e) {
    return { code: -1, message: e.message, data: [] }
  }
})

// ─── 账号管理 IPC ─────────────────────────────
ipcMain.handle('account:add', async (event, platform) => {
  try {
    const account = await AccountManager.addAccount(platform)
    return { code: 0, data: account, message: '账号添加成功' }
  } catch (e) {
    return { code: -1, message: e.message }
  }
})

ipcMain.handle('account:delete', async (event, accountId) => {
  try {
    await AccountManager.deleteAccount(accountId)
    return { code: 0, message: '账号已删除' }
  } catch (e) {
    return { code: -1, message: e.message }
  }
})

ipcMain.handle('account:check-login', async (event, { platform, accountId }) => {
  try {
    const status = await AccountManager.checkLoginStatus(platform, accountId)
    return { code: 0, data: status }
  } catch (e) {
    return { code: -1, message: e.message, data: { valid: false, message: e.message } }
  }
})

ipcMain.handle('account:list', async () => {
  try {
    const accounts = await AccountManager.listAccounts()
    return { code: 0, data: accounts }
  } catch (e) {
    return { code: -1, message: e.message, data: [] }
  }
})

app.whenReady().then(async () => {
  try {
    await playwright.launchBrowser()
  } catch (e) {
    console.error('[App] Failed to launch Playwright:', e.message)
  }
  try {
    await pythonBridge.startPythonBackend()
  } catch (e) {
    console.error('[App] Failed to start Python backend:', e.message)
  }
  createWindow()
})

app.on('window-all-closed', async () => {
  await playwright.closeBrowser()
  await pythonBridge.stopPythonBackend()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})