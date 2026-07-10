// @ts-nocheck
/**
 * window.js — 窗口创建模块（从 main.js 拆分）
 *
 * 职责：
 *   - createWindow(context)：创建 BrowserWindow + 绑定事件 + 注册 IPC
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const log = require('./services/logger')

// R28 修复：防止 macOS app.on('activate') 重复调用 createWindow 时
// 重复注册 ipcMain.handle 导致 "Attempted to register a second handler" 崩溃
let _ipcRegistered = false

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
    // R49 修复：loadURL 返回 Promise，必须 .catch() 否则导航失败产生 unhandledRejection
    mainWindow.loadURL('http://localhost:5174').catch(function () { /* dev 模式忽略 */ })
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html')).catch(function () { /* ignore */ })
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
  // R28 修复：IPC handler 只注册一次，防止 macOS activate 重复注册崩溃
  if (!_ipcRegistered) {
    _ipcRegistered = true
    webviewManager.registerIpcHandlers()
    qrCodeLogin.registerIpcHandlers()
    oauthManager.registerIpcHandlers()
    batchManager.registerIpcHandlers()
    urlCollector.registerIpcHandlers()
    providerManager.registerIpcHandlers()
    viralEngine.registerIpcHandlers()
    commentManager.registerIpcHandlers()
    contentIntelligence.registerIpcHandlers()
    publishImpactTracker.registerIpcHandlers()
  }
  qrCodeLogin.setMainWindow(mainWindow)
  oauthManager.setMainWindow(mainWindow)
  commentManager.setGetMainWin(() => BrowserWindow.getAllWindows()[0])
  systemTray.init(mainWindow)
  hotkeys.register()
  // R66：autoUpdater 属可选组件，失败时仅日志不阻断启动
  try {
    autoUpdater.init(mainWindow, (status) => {
      log.info('auto-updater', JSON.stringify(status))
    })
  } catch (e) {
    log.warn('window', 'autoUpdater init failed, running without auto-update: ' + (e && e.message))
  }
  firstRun.runSetup(mainWindow)

  return mainWindow
}

module.exports = { createWindow }
