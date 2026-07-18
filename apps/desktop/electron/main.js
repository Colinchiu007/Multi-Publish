// @ts-check
/**
 * main.js — 应用入口（已拆分为 bootstrap/window/shutdown 三件套）
 *
 * 职责：编排启动流程，自身不持有业务逻辑
 *   1. requestSingleInstanceLock()  确保只有一个应用实例
 *   2. createAppContext()           同步初始化基础设施（DI 容器消费 + taskQueue 接线）
 *   3. registerShutdownHandlers()   注册异步退出协调器
 *   4. runWhenReady()               注册 app.whenReady 回调（内含 createWindow）
 *   5. second-instance / activate   聚焦或重建主窗口
 */
const { app, BrowserWindow } = require('electron')
const { createAppContext, runWhenReady } = require('./bootstrap')
const { createWindow } = require('./window')
const { registerShutdownHandlers } = require('./shutdown')
const log = require('./services/logger')

const PROCESS_ERROR_HANDLER_MARKER = Symbol.for('@multi-publish/desktop/process-error-handler')

/**
 * @param {unknown} value
 * @returns {string}
 */
function errorDetails(value) {
  return value instanceof Error ? (value.stack || value.message) : String(value)
}

function registerProcessErrorHandler(eventName, handler) {
  const alreadyRegistered = process.listeners(eventName).some((listener) => (
    Reflect.get(listener, PROCESS_ERROR_HANDLER_MARKER) === eventName
  ))
  if (alreadyRegistered) return

  Object.defineProperty(handler, PROCESS_ERROR_HANDLER_MARKER, { value: eventName })
  process.on(eventName, handler)
}

// 全局未捕获异常处理器（防止静默 unhandledRejection 导致错误不可诊断）
// 第九轮 CRITICAL：全库无 process.on('unhandledRejection')，任何漏网的 Promise rejection 都会静默丢失
registerProcessErrorHandler('unhandledRejection', (reason) => {
  log.error('Process', 'Unhandled rejection: ' + errorDetails(reason))
})
registerProcessErrorHandler('uncaughtException', (err) => {
  log.error('Process', 'Uncaught exception: ' + errorDetails(err))
  // 不主动 exit，让 Electron 继续运行（用户可保存数据后重启）
})

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  // 同步初始化基础设施（DI 容器消费 + taskQueue 接线 + 基础设施构建）
  const context = createAppContext()

  async function createAndRegisterWindow() {
    const mainWindow = await createWindow(context)
    if (!isUsableWindow(mainWindow)) {
      throw new Error('Window creation did not return a usable window')
    }
    if (context.container && typeof context.container.register === 'function') {
      context.container.register('mainWindow', mainWindow, { forceValue: true })
    }
    return mainWindow
  }

  function isUsableWindow(window) {
    return Boolean(window) && typeof window.then !== 'function' && (
      typeof window.isDestroyed !== 'function' || !window.isDestroyed()
    )
  }

  function findMainWindow() {
    try {
      if (context.container &&
          typeof context.container.has === 'function' &&
          context.container.has('mainWindow')) {
        const registeredWindow = context.container.get('mainWindow')
        if (isUsableWindow(registeredWindow)) return registeredWindow
      }
    } catch { /* 容器引用不可用时回退到 Electron 窗口列表 */ }
    return BrowserWindow.getAllWindows().find(isUsableWindow) || null
  }

  // 注册退出协调器，再启动异步资源，确保启动失败也能完整清理。
  registerShutdownHandlers(context)

  let startupPromise
  try {
    startupPromise = Promise.resolve(runWhenReady(context, { createWindow })).then(
      () => true,
      () => {
        app.quit()
        return false
      },
    )
  } catch (e) {
    log.error('App', 'Startup orchestration failed: ' + errorDetails(e))
    app.quit()
    startupPromise = Promise.resolve(false)
  }

  let pendingWindowRecovery = null

  function ensureMainWindowAfterStartup() {
    if (pendingWindowRecovery) return pendingWindowRecovery

    const recovery = (async () => {
      const startupSucceeded = await startupPromise
      if (!startupSucceeded) return null
      return findMainWindow() || createAndRegisterWindow()
    })()
    const trackedRecovery = recovery.finally(() => {
      if (pendingWindowRecovery === trackedRecovery) pendingWindowRecovery = null
    })
    pendingWindowRecovery = trackedRecovery
    return trackedRecovery
  }

  function focusMainWindow(mainWindow) {
    if (!isUsableWindow(mainWindow)) return
    if (mainWindow.isMinimized && mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }

  function handleWindowTaskFailure(error) {
    log.error('App', 'Failed to restore main window: ' + errorDetails(error))
  }

  app.on('second-instance', () => {
    try {
      const mainWindow = findMainWindow()
      if (!mainWindow) {
        ensureMainWindowAfterStartup().then(focusMainWindow).catch(handleWindowTaskFailure)
        return
      }
      focusMainWindow(mainWindow)
    } catch (error) {
      handleWindowTaskFailure(error)
    }
  })

  // macOS：点击 Dock 图标时若窗口已全部关闭则重建主窗口。
  app.on('activate', () => {
    try {
      if (!findMainWindow()) {
        ensureMainWindowAfterStartup().catch(handleWindowTaskFailure)
      }
    } catch (error) {
      handleWindowTaskFailure(error)
    }
  })
}
