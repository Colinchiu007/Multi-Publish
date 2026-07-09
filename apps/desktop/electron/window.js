// @ts-nocheck
/**
 * window.js — 窗口创建模块（从 main.js 拆分）
 *
 * 职责：
 *   - createWindow(context)：创建 BrowserWindow + 绑定事件 + 注册 IPC
 */
const { app, BrowserWindow } = require('electron')
const path = require('path')
const log = require('./services/logger')

/**
 * 创建主窗口
 * @param {object} context - bootstrap 创建的上下文
 * @returns {BrowserWindow} mainWindow
 */
function createWindow(context) {
  const {
    authViewManager, rpaViewManager, webviewManager, qrCodeLogin,
    oauthManager, batchManager, urlCollector, providerManager,
    viralEngine, commentManager, contentIntelligence, publishImpactTracker,
    systemTray, hotkeys, autoUpdater, firstRun,
  } = context

  const mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
  mainWindow.on('closed', () => { /* mainWindow 已通过返回值管理 */ })
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
  commentManager.setGetMainWin(() => BrowserWindow.getAllWindows()[0])
  commentManager.registerIpcHandlers()
  contentIntelligence.registerIpcHandlers()
  publishImpactTracker.registerIpcHandlers()
  systemTray.init(mainWindow)
  hotkeys.register()
  autoUpdater.init(mainWindow, (status) => {
    log.info('auto-updater', JSON.stringify(status))
  })
  firstRun.runSetup(mainWindow)

  return mainWindow
}

module.exports = { createWindow }
