// @ts-check
/**
 * SystemTray — 系统托盘管理
 * 
 * 基于蚁小二逆向工程的系统托盘：
 * - 应用最小化到托盘
 * - 托盘菜单（设置、发布、退出）
 * - 托盘闪烁告警（发布失败时）
 * 
 * 文件位置: apps/desktop/electron/system-tray.js
 */
// eslint-disable-next-line no-unused-vars
const { Tray, Menu, ipcMain, nativeImage, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const log = require('./logger')

let tray = null
// eslint-disable-next-line no-unused-vars
let mainWindowRef = null

/**
 * 初始化系统托盘
 */
function init (mainWindow) {
  // 防止重复 init 导致 Tray 泄漏（销毁旧 Tray 再创建新的）
  if (tray) { try { tray.destroy() } catch (_) { /* ignore */ } }
  mainWindowRef = mainWindow
  
  // 创建托盘图标（使用应用图标），dev 模式 dist/ 可能不存在，try/catch 优雅降级
  const iconPath = path.join(__dirname, '..', '..', 'dist', 'assets', 'icon.png')
  // 托盘为非必要功能：图标缺失（dev 模式未构建）或无系统托盘环境（headless/xvfb）时优雅降级，不阻断启动
  try {
    tray = new Tray(iconPath)
  } catch (e) {
    tray = null
    log.warn('SystemTray', `Tray unavailable, skipping (icon=${fs.existsSync(iconPath) ? 'present' : 'missing'}): ${e.message}`)
    return
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        if (mainWindow) mainWindow.show()
      },
    },
    { type: 'separator' },
    {
      label: '发布设置',
      click: () => {
        if (mainWindow) mainWindow.webContents.send('app:show-settings')
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        tray.destroy()
        if (mainWindow) mainWindow.destroy()
      },
    },
  ])
  
  tray.setToolTip('Multi-Publish — 多平台内容发布')
  tray.setContextMenu(contextMenu)
  
  // 双击托盘图标显示窗口
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
    }
  })
  
  // 监听窗口最小化到托盘
  mainWindow.on('minimize', (event) => {
    event.preventDefault()
    mainWindow.hide()
    log.info('SystemTray', 'Window minimized to tray')
  })
  
  log.info('SystemTray', 'System tray initialized')
}

/**
 * 托盘闪烁告警（用于发布失败通知）
 * 
 * @param {number} times - 闪烁次数
 */
function flashTray (times = 3) {
  if (!tray) return
  
  let count = 0
  const interval = setInterval(() => {
    if (count >= times * 2) {
      clearInterval(interval)
      tray.setImage('')
      return
    }
    
    // 交替显示/隐藏图标
    const iconPath = count % 2 === 0 
      ? path.join(__dirname, '..', '..', 'dist', 'assets', 'icon.png')
      : path.join(__dirname, '..', '..', 'dist', 'assets', 'icon-tray.png')
    
    if (fs.existsSync(iconPath)) {
      tray.setImage(iconPath)
    }
    count++
  }, 500)
  // R28 修复：unref 让定时器不阻止进程退出
  if (interval && interval.unref) interval.unref()
}

// 需要 fs 模块
// (已移至文件顶部)

/**
 * 设置托盘提示文字
 */
function setTooltip (text) {
  if (tray) {
    tray.setToolTip(text)
  }
}

/**
 * 销毁托盘
 */
function destroy () {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

/**
 * 注册托盘相关 IPC 处理
 */
function registerIpcHandlers () {
  ipcMain.on('tray:flash', (event, { times = 3 } = {}) => {
    flashTray(times)
  })
  
  ipcMain.on('tray:set-tooltip', (event, text) => {
    setTooltip(text)
  })
}

module.exports = {
  init,
  flashTray,
  setTooltip,
  destroy,
  registerIpcHandlers,
}
