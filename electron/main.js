const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const playwright = require('./playwright-manager')
const pythonBridge = require('./python-bridge')
const WeChatMPPublisher = require('./publishers/wechat-mp-rpa')

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

  // 开发环境加载 Vite 开发服务器
  const isDev = process.env.NODE_ENV !== 'production' || !app.isPackaged
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
  const publisher = new WeChatMPPublisher()
  const mainWindow = BrowserWindow.getAllWindows()[0]

  publisher.onProgress(({ platform, stage }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('publish:progress', { platform, stage })
    }
  })

  try {
    const result = await publisher.publishArticle(articleData)
    return { code: 0, data: result }
  } catch (e) {
    return { code: -1, message: e.message }
  } finally {
    await publisher.cleanup()
  }
})

ipcMain.handle('accounts:list', async () => {
  try {
    return await pythonBridge.requestBackend('GET', '/api/accounts')
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