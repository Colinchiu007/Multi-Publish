// @ts-check
/**
 * Auto-updater — 自动更新
 * 使用 electron-updater 检查并安装 GitHub Release 更新
 * 网络失败（GFW 场景）静默处理，不弹错误提示
 */
const { autoUpdater } = require('electron-updater')
// eslint-disable-next-line no-unused-vars
const { app, BrowserWindow } = require('electron')
const logger = require('./logger')

let _mainWin = null
let _statusCallback = null
let _listenersRegistered = false
const _reportedUnavailableErrors = new WeakSet()

// 网络超时/阻断错误特征码（GFW 场景）
const NETWORK_ERROR_PATTERNS = [
  'ERR_INTERNET_DISCONNECTED',
  'ERR_CONNECTION_TIMED_OUT',
  'ERR_CONNECTION_RESET',
  'ERR_CONNECTION_REFUSED',
  'ERR_NAME_NOT_RESOLVED',
  'ERR_NETWORK_CHANGED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'request failed',
  'getaddrinfo',
  'connect ETIMEDOUT',
  'connect ENETUNREACH',
  'socket hang up'
]

function errorMessage (err) {
  if (!err) return ''
  if (typeof err.message === 'string') return err.message
  return String(err)
}

function isNetworkError (err) {
  const msg = errorMessage(err)
  return NETWORK_ERROR_PATTERNS.some(p => msg.includes(p))
}

function isLatestManifestMissing (err) {
  const msg = errorMessage(err)
  const statusCode = Number(err?.statusCode ?? err?.status ?? err?.response?.statusCode)
  const details = [
    msg,
    err?.url,
    err?.response?.url,
    err?.response?.config?.url,
    err?.request?.responseURL,
  ].filter(value => typeof value === 'string').join(' ')
  const hasManifestReference = /latest(?:-[a-z0-9_-]+)?\.ya?ml/i.test(details)
  const hasNotFoundMarker = /(?:cannot find|not found|request(?:ed)?[^\r\n]*\b404\b)/i.test(details)
  const isNotFound = statusCode === 404 || /\b404\b/.test(details)
  const isSignatureFailure = /(?:signature|signing|checksum|integrity|verification)/i.test(details)
  return isNotFound && hasManifestReference && !isSignatureFailure && (statusCode === 404 || hasNotFoundMarker || /\b404\b/.test(details))
}

function isUpdateCheckUnavailable (err) {
  return isLatestManifestMissing(err) || isNetworkError(err)
}

function createProductionLogger () {
  const write = (level, message) => {
    if (level === 'error' && isUpdateCheckUnavailable(message)) return
    logger[level](`auto-updater ${errorMessage(message)}`)
  }

  return {
    debug: message => write('debug', message),
    info: message => write('info', message),
    warn: message => write('warn', message),
    error: message => write('error', message)
  }
}

function sendUnavailableOnce (err) {
  if (err && (typeof err === 'object' || typeof err === 'function')) {
    if (_reportedUnavailableErrors.has(err)) return false
    _reportedUnavailableErrors.add(err)
  }
  _sendStatus('not-available', '当前已是最新版本')
  return true
}

/**
 * 初始化自动更新
 * @param {BrowserWindow} win - 主窗口
 * @param {Function} onStatus - (status: string, data?: any) => void
 */
function init (win, onStatus) {
  _mainWin = win
  _statusCallback = onStatus

  if (_listenersRegistered) return

  // 打包状态是权威来源，残留开发环境变量不能重新启用 console logger。
  const isUnpackagedDevelopment = app?.isPackaged === false && process.env.NODE_ENV === 'development'
  autoUpdater.logger = isUnpackagedDevelopment
    ? console
    : createProductionLogger()

  // 自动下载
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // ─── 事件 ───────────────────────
  autoUpdater.on('checking-for-update', () => {
    _sendStatus('checking', '正在检查更新...')
  })

  autoUpdater.on('update-available', (info) => {
    _sendStatus('available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    })
  })

  autoUpdater.on('update-not-available', () => {
    _sendStatus('not-available', '当前已是最新版本')
  })

  autoUpdater.on('download-progress', (progress) => {
    _sendStatus('downloading', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      total: progress.total,
      transferred: progress.transferred
    })
  })

  autoUpdater.on('update-downloaded', () => {
    _sendStatus('downloaded', '更新已下载，重启后生效')
  })

  autoUpdater.on('error', (err) => {
    if (isUpdateCheckUnavailable(err)) {
      sendUnavailableOnce(err)
      return
    }
    _sendStatus('error', errorMessage(err))
  })

  _listenersRegistered = true
}

/**
 * 检查更新
 */
function check () {
  autoUpdater.checkForUpdates().catch(err => {
    if (isUpdateCheckUnavailable(err)) {
      sendUnavailableOnce(err)
      return
    }
    _sendStatus('error', errorMessage(err))
  })
}

/**
 * 下载更新
 */
function download () {
  autoUpdater.downloadUpdate().catch(err => {
    if (isNetworkError(err)) {
      sendUnavailableOnce(err)
      return
    }
    _sendStatus('error', errorMessage(err))
  })
}

/**
 * 退出并安装
 */
function quitAndInstall () {
  autoUpdater.quitAndInstall()
}

/**
 * 发送状态给主窗口和回调
 */
function _sendStatus (type, data) {
  const payload = { type, data }
  if (_mainWin && !_mainWin.isDestroyed()) {
    _mainWin.webContents.send('update:status', payload)
  }
  if (_statusCallback) {
    _statusCallback(payload)
  }
}

module.exports = { init, check, download, quitAndInstall }
