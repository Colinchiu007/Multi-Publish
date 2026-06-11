/**
 * Auto-updater — 自动更新
 * 使用 electron-updater 检查并安装 GitHub Release 更新
 */
const { autoUpdater } = require('electron-updater')
const { BrowserWindow } = require('electron')

let _mainWin = null
let _statusCallback = null

/**
 * 初始化自动更新
 * @param {BrowserWindow} win - 主窗口
 * @param {Function} onStatus - (status: string, data?: any) => void
 */
function init (win, onStatus) {
  _mainWin = win
  _statusCallback = onStatus

  // 日志
  autoUpdater.logger = console
  autoUpdater.logger.transports = { file: { level: 'info' }, console: { level: 'info' } }

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
    _sendStatus('error', err.message)
  })
}

/**
 * 下载更新
 */
function download () {
  autoUpdater.downloadUpdate().catch(err => {
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

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// ─── 首次运行引导 (安装依赖、Playwright) ──────────────────────
async function firstRunSetup (mainWin) {
  const markerPath = path.join(app.getPath('userData'), 'first-run-done')
  if (fs.existsSync(markerPath)) {
    return // 已完成
  }

  try {
    mainWin.webContents.send('first-run:status', { type: 'checking' })
    // Python 依赖
    mainWin.webContents.send('first-run:status', { type: 'install', step: 'python' })
    execSync('pip install -r python/requirements-runtime.txt', { stdio: 'inherit' })
    // Playwright 浏览器
    mainWin.webContents.send('first-run:status', { type: 'install', step: 'playwright' })
    execSync('npx playwright install', { stdio: 'inherit' })
    // 标记完成
    fs.writeFileSync(markerPath, 'done')
    mainWin.webContents.send('first-run:status', { type: 'done' })
  } catch (e) {
    console.error('[firstRunSetup] error:', e)
    mainWin.webContents.send('first-run:status', { type: 'error', data: e.message })
  }
}

module.exports = { init, check, download, quitAndInstall }