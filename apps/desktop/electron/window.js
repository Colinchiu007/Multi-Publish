// @ts-check
/**
 * window.js — 窗口创建模块（从 main.js 拆分）
 *
 * 职责：
 *   - createWindow(context)：创建 BrowserWindow + 绑定事件 + 注册 IPC
 */
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const log = require('./services/logger')
const { config, getUrl } = require('./config/app-config')
const { isTrustedSender } = require('./core/ipc-security')
const { createAccessControlledIpcMain } = require('./ipc-handlers/license-access-control')
const {
  isThenable,
  runOnce,
  runIpcRegistrationTransaction,
} = require('./bootstrap/phase5-ipc')

// R28 修复：防止 macOS app.on('activate') 重复调用 createWindow 时
// 重复注册 ipcMain.handle 导致 "Attempted to register a second handler" 崩溃
const _ipcRegistrationState = { completed: false, pending: null }
const _completedIpcRegistrars = new Set()
let _pendingWindowCreation = null
const IPC_REGISTRAR_NAMES = [
  'webviewManager',
  'qrCodeLogin',
  'oauthManager',
  'batchManager',
  'urlCollector',
  'providerManager',
  'viralEngine',
  'commentManager',
  'contentIntelligence',
  'publishImpactTracker',
]

function registerWithAccessControl(context, register) {
  const transactionalHandle = ipcMain.handle
  const controlledHandle = createAccessControlledIpcMain(
    ipcMain,
    context.licenseManager,
    process.env,
    app,
    context.identityService,
  ).handle
  ipcMain.handle = controlledHandle

  const restore = () => {
    if (ipcMain.handle === controlledHandle) ipcMain.handle = transactionalHandle
  }

  try {
    const result = register()
    if (!isThenable(result)) {
      restore()
      return result
    }
    return Promise.resolve(result).then(
      (value) => {
        restore()
        return value
      },
      (error) => {
        restore()
        throw error
      },
    )
  } catch (error) {
    restore()
    throw error
  }
}

function registerIpcRegistrar(context, name) {
  return runIpcRegistrationTransaction(
    ipcMain,
    () => registerWithAccessControl(
      context,
      () => context[name].registerIpcHandlers(),
    ),
  )
}

function registerRemainingIpcHandlers(context, startIndex = 0) {
  for (let index = startIndex; index < IPC_REGISTRAR_NAMES.length; index += 1) {
    const name = IPC_REGISTRAR_NAMES[index]
    if (_completedIpcRegistrars.has(name)) continue
    const result = registerIpcRegistrar(context, name)
    if (isThenable(result)) {
      return Promise.resolve(result).then(() => {
        _completedIpcRegistrars.add(name)
        return registerRemainingIpcHandlers(context, index + 1)
      })
    }
    _completedIpcRegistrars.add(name)
  }
  return undefined
}

function registerIpcHandlersOnce(context) {
  return runOnce(
    _ipcRegistrationState,
    () => registerRemainingIpcHandlers(context),
  )
}

function isAllowedMainWindowUrl(url) {
  return isTrustedSender({ senderFrame: { url } }, app)
}

function isAllowedExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return false
  try {
    const url = new URL(rawUrl)
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username && !url.password
  } catch (_) {
    return false
  }
}

function reportExternalOpenFailure(error) {
  log.warn('window', '打开外部链接失败：' + (error instanceof Error ? error.message : String(error)))
}

function openExternalUrl(rawUrl) {
  if (!isAllowedExternalUrl(rawUrl)) return
  try {
    Promise.resolve(shell.openExternal(rawUrl)).catch(reportExternalOpenFailure)
  } catch (error) {
    reportExternalOpenFailure(error)
  }
}

function destroyFailedWindow(mainWindow) {
  try {
    if (typeof mainWindow.isDestroyed === 'function' && mainWindow.isDestroyed()) return
    if (typeof mainWindow.destroy === 'function') mainWindow.destroy()
    else if (typeof mainWindow.close === 'function') mainWindow.close()
  } catch (error) {
    log.warn('window', '清理失败窗口时出错：' + (error instanceof Error ? error.message : String(error)))
  }
}

function clearMainWindowBindings(context) {
  for (const name of [
    'authViewManager', 'rpaViewManager', 'webviewManager', 'qrCodeLogin', 'oauthManager',
  ]) {
    const manager = context[name]
    if (!manager || typeof manager.setMainWindow !== 'function') continue
    try {
      manager.setMainWindow(null)
    } catch (error) {
      log.warn('window', `清理 ${name} 窗口引用时出错：` +
        (error instanceof Error ? error.message : String(error)))
    }
  }
}

function finishWindowInitialization(context, mainWindow) {
  const {
    authViewManager, rpaViewManager, webviewManager, qrCodeLogin,
    oauthManager, commentManager, systemTray, hotkeys, autoUpdater, firstRun,
  } = context

  authViewManager.setMainWindow(mainWindow)
  rpaViewManager.setMainWindow(mainWindow)
  webviewManager.setMainWindow(mainWindow)
  qrCodeLogin.setMainWindow(mainWindow)
  oauthManager.setMainWindow(mainWindow)
  commentManager.setGetMainWin(() => BrowserWindow.getAllWindows()[0])
  systemTray.init(mainWindow)
  hotkeys.register()
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

function finishWindowSafely(context, mainWindow) {
  try {
    return finishWindowInitialization(context, mainWindow)
  } catch (error) {
    clearMainWindowBindings(context)
    destroyFailedWindow(mainWindow)
    throw error
  }
}

/**
 * 创建主窗口
 * @param {object} context - bootstrap 创建的上下文
 * @returns {BrowserWindow | Promise<BrowserWindow>} mainWindow
 */
function createWindow(context) {
  if (_pendingWindowCreation) return _pendingWindowCreation

  const { authViewManager, webviewManager, qrCodeLogin } = context

  const mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload', 'index.bundle.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  })
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev') || !app.isPackaged
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedMainWindowUrl(url)) {
      event.preventDefault()
      log.warn('window', 'Blocked untrusted main-window navigation: ' + url)
    }
  })
  if (typeof mainWindow.webContents.setWindowOpenHandler === 'function') {
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      openExternalUrl(url)
      return { action: 'deny' }
    })
  }
  if (isDev) {
    // R49 修复：loadURL 返回 Promise，必须 .catch() 否则导航失败产生 unhandledRejection
    mainWindow.loadURL(getUrl(config.devServer)).catch(function () { /* dev 模式忽略 */ })
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
  // R28 修复：IPC handler 只注册一次，防止 macOS activate 重复注册崩溃
  let registration
  try {
    registration = registerIpcHandlersOnce(context)
  } catch (error) {
    destroyFailedWindow(mainWindow)
    throw error
  }
  if (isThenable(registration)) {
    const creation = Promise.resolve(registration).then(
      () => finishWindowSafely(context, mainWindow),
      (error) => {
        destroyFailedWindow(mainWindow)
        throw error
      },
    )
    const trackedCreation = creation.finally(() => {
      if (_pendingWindowCreation === trackedCreation) _pendingWindowCreation = null
    })
    _pendingWindowCreation = trackedCreation
    return trackedCreation
  }
  return finishWindowSafely(context, mainWindow)
}

module.exports = { createWindow, isAllowedMainWindowUrl }
