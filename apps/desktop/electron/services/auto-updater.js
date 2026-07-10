// @ts-check
/**
 * Auto-updater — 自动更新
 * 使用 electron-updater 检查并安装 GitHub Release 更新
 * 网络失败（GFW 场景）静默处理，不弹错误提示
 */
const { autoUpdater } = require('electron-updater')
// eslint-disable-next-line no-unused-vars
const { BrowserWindow } = require('electron')

let _mainWin = null
let _statusCallback = null

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

function isNetworkError (err) {
  const msg = (err && (err.message || err.toString() || ''))
  return NETWORK_ERROR_PATTERNS.some(p => msg.includes(p))
}

/**
 * 初始化自动更新
 * @param {BrowserWindow} win - 主窗口
 * @param {Function} onStatus - (status: string, data?: any) => void
 */
function init (win, onStatus) {
  // 防止重复 init 导致 autoUpdater 监听器累积（每次 init 都会 .on 注册新监听器）
  if (_mainWin === win) return
  _mainWin = win
  _statusCallback = onStatus

  // 日志（仅开发环境打印）
  if (process.env.NODE_ENV === 'development') {
    autoUpdater.logger = console
  }

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
    // GFW 阻断：静默忽略，不弹错误
    if (isNetworkError(err)) {
      _sendStatus('not-available', '当前已是最新版本')
      return
    }
    _sendStatus('error', err.message || err.toString())
  })
}

/**
 * 检查更新
 */
function check () {
  autoUpdater.checkForUpdates().catch(err => {
    // 404 = 暂无最新版本（非错误）
    if (err.message && err.message.includes('404')) {
      _sendStatus('not-available', '当前已是最新版本')
      return
    }
    // GFW 阻断：静默忽略
    if (isNetworkError(err)) {
      _sendStatus('not-available', '当前已是最新版本')
      return
    }
    _sendStatus('error', err.message)
  })
}

/**
 * 下载更新
 */
function download () {
  autoUpdater.downloadUpdate().catch(err => {
    if (isNetworkError(err)) {
      _sendStatus('not-available', '当前已是最新版本')
      return
    }
    _sendStatus('error', err.message)
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