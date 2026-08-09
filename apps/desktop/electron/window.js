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
const { shouldHideToTrayOnClose } = require('./services/window-close-policy')
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

function registerIpcRegistrar(context, name) {
  // 显式构造 access-controlled ipcMain 并注入服务（与 phase5-ipc 中心注册一致），
  // 不再临时替换全局 ipcMain.handle，避免注册机制双轨与全局状态污染。
  const controlledIpcMain = createAccessControlledIpcMain(
    ipcMain,
    context.licenseManager,
    process.env,
    app,
    context.identityService,
  )
  return runIpcRegistrationTransaction(
    ipcMain,
    () => context[name].registerIpcHandlers(controlledIpcMain),
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 关闭窗口时是否应隐藏到托盘（方案A：运行中的编排流水线在后台继续）。
 *
 * 平台决策集中在 services/window-close-policy.js：
 * - Windows/Linux：托盘可用 且 有运行中编排任务 → 拦截 close 隐藏到托盘后台继续；
 *   二者缺一时照旧关闭/退出，避免无托盘环境下窗口关闭后进程无法恢复。
 * - macOS：关闭窗口不退出应用是系统约定（app 留在 Dock、window-all-closed 不退出、
 *   activate 重建窗口），因此不拦截 close，让窗口正常关闭、任务继续后台运行。
 *
 * @param {object} context
 * @param {string} [platform] 目标平台（默认 process.platform，测试可注入）
 * @returns {boolean}
 */
function shouldHideToTray(context, platform = process.platform) {
  if (!context || typeof context !== 'object') return false
  const pipelineEngine = context.pipelineEngine
  const systemTray = context.systemTray
  if (!pipelineEngine || typeof pipelineEngine.hasRunningOrchestration !== 'function') return false
  if (!systemTray || typeof systemTray.isAvailable !== 'function') return false
  let hasRunningPipeline = false
  try {
    hasRunningPipeline = pipelineEngine.hasRunningOrchestration()
  } catch (error) {
    log.warn('window', '检测运行中任务失败：' + errorMessage(error))
    return false
  }
  return shouldHideToTrayOnClose({
    platform,
    hasRunningPipeline,
    trayAvailable: systemTray.isAvailable(),
  })
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
  let shown = false
  const showMainWindow = () => {
    if (shown || (typeof mainWindow.isDestroyed === 'function' && mainWindow.isDestroyed())) return
    shown = true
    if (showFallbackTimer) clearTimeout(showFallbackTimer)
    log.info('window', '主窗口已显示')
    mainWindow.show()
  }
  const reportLoadFailure = (error) => {
    log.error('window', '加载主窗口失败：' + errorMessage(error))
    // Keep the native error page visible instead of leaving a hidden process behind.
    showMainWindow()
  }
  // 打包状态是窗口加载模式的唯一权威，生产包不能被残留开发信号降级到本地服务器。
  const isDev = app.isPackaged === false
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
    mainWindow.loadURL(getUrl(config.devServer)).catch(reportLoadFailure)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html')).catch(reportLoadFailure)
  }
  mainWindow.once('ready-to-show', showMainWindow)
  mainWindow.webContents.once('did-finish-load', showMainWindow)
  const showFallbackTimer = setTimeout(() => {
    log.warn('window', '主窗口未触发显示事件，使用可见性兜底')
    showMainWindow()
  }, 5000)
  if (typeof showFallbackTimer.unref === 'function') showFallbackTimer.unref()
  mainWindow.on('closed', () => {
    if (showFallbackTimer) clearTimeout(showFallbackTimer)
  })
  // 方案A：运行中的编排流水线在后台继续——关闭窗口时隐藏到托盘而非退出进程。
  // 托盘不可用或无运行任务时照旧关闭（window-all-closed → before-quit 清理链）。
  mainWindow.on('close', (event) => {
    if (shouldHideToTray(context)) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault()
      mainWindow.hide()
      log.info('window', '运行中有流水线任务，窗口隐藏到托盘继续后台执行')
    }
  })
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

module.exports = { createWindow, isAllowedMainWindowUrl, shouldHideToTray }
