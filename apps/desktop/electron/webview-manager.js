/**
 * WebviewManager — 分屏监控管理器
 *
 * 蚁小二逆向工程 P0 功能：多平台同时监控
 * 每个 tab 独立 WebContentsView，独立 session分区，Cookie 互不干扰
 *
 * 布局方案:
 *   1: ████████████████  (全屏，默认)
 *   2: ███████│████████  (左右 50/50)
 *   3: ███████│████████  (2+1 布局)
 *      ████████████████
 *   4: ███████│████████  (2×2 网格)
 *      ███████│████████
 *   6: ███│████│██████  (3×2 网格)
 *      ███│████│██████
 */
const { WebContentsView, session, ipcMain } = require('electron')
const path = require('path')
const log = require('./logger')

// 各平台创作者中心/后台 URL
const PLATFORM_DASHBOARD_URLS = {
  wechat_mp: 'https://mp.weixin.qq.com/',
  zhihu: 'https://www.zhihu.com/',
  weibo: 'https://weibo.com/',
  douyin: 'https://creator.douyin.com/',
  xiaohongshu: 'https://creator.xiaohongshu.com/',
  tencent_video: 'https://channels.weixin.qq.com/',
  kuaishou: 'https://cp.kuaishou.com/',
  toutiao: 'https://mp.toutiao.com/',
  youtube: 'https://studio.youtube.com/',
  tiktok: 'https://www.tiktok.com/',
}

class WebviewManager {
  constructor () {
    this.mainWindow = null
    /** @type {Array<{id: string, platform: string, accountId: string|null, view: WebContentsView, label: string}>} */
    this.tabs = []
    this.layout = 1  // 当前布局数（1/2/3/4/6）
    this._nextTabId = 1
  }

  setMainWindow (win) {
    this.mainWindow = win
  }

  // ─── 布局控制 ──────────────────────────────────

  /**
   * 设置分屏布局
   * @param {number} count - 1/2/3/4/6
   */
  setLayout (count) {
    if (![1, 2, 3, 4, 6].includes(count)) return
    this.layout = count
    this._repositionAll()
    this._emit('webview:layout-changed', { layout: count, tabCount: this.tabs.length })
    log.info('WebviewManager', `Layout set to ${count}`)
  }

  // ─── Tab 管理 ──────────────────────────────────

  /**
   * 打开一个平台监控 tab
   * @param {string} platform - 平台标识
   * @param {string|null} [accountId] - 账号 ID（用于隔离 session）
   * @param {Array} [cookies] - 已保存的 Cookie 数组
   * @param {Object} [localStorage] - 已保存的 localStorage 数据
   * @returns {string|null} tabId
   */
  openTab (platform, accountId, cookies, localStorage) {
    if (!this.mainWindow) return null

    const url = PLATFORM_DASHBOARD_URLS[platform]
    if (!url) {
      log.warn('WebviewManager', `No dashboard URL for platform: ${platform}`)
      return null
    }

    const tabId = `tab-${this._nextTabId++}`
    const partition = `persist:monitor-${accountId || `${platform}-${tabId}`}`
    const viewSession = session.fromPartition(partition, { cache: true })

    // 恢复已保存 Cookie（必须在 loadURL 之前）
    if (cookies && cookies.length > 0) {
      for (const c of cookies) {
        try { viewSession.cookies.set(c).catch(() => {}) } catch (e) { /* skip invalid */ }
      }
    }

    // 创建 WebContentsView
    const view = new WebContentsView({
      webPreferences: {
        session: viewSession,
        preload: path.join(__dirname, 'monitor-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      }
    })
    view.setVisible(true)
    this.mainWindow.contentView.addChildView(view)

    // 导航到平台页面
    view.webContents.loadURL(url)

    // 页面加载后恢复 localStorage
    if (localStorage && Object.keys(localStorage).length > 0) {
      const lsData = JSON.stringify(localStorage)
      view.webContents.on('did-finish-load', () => {
        view.webContents.executeJavaScript(`
          (function() {
            var data = ${lsData};
            Object.keys(data).forEach(function(k) {
              try { localStorage.setItem(k, data[k]); } catch(e) {}
            });
          })()
        `).catch(() => {})
      })
    }

    // 监听导航事件（检测登录状态变化）
    view.webContents.on('did-navigate', (event, url) => {
      this._emit('webview:navigated', { tabId, platform, url })
    })

    const tab = { id: tabId, platform, accountId, view, label: platform }
    this.tabs.push(tab)
    this._repositionAll()
    this._emit('webview:tab-opened', { tabId, platform, accountId, tabCount: this.tabs.length })

    log.info('WebviewManager', `Tab ${tabId} opened for ${platform} (${this.tabs.length} total)`)
    return tabId
  }

  /**
   * 关闭指定 tab
   * @param {string} tabId
   */
  closeTab (tabId) {
    const idx = this.tabs.findIndex(t => t.id === tabId)
    if (idx === -1) return

    const tab = this.tabs[idx]
    try {
      this.mainWindow.contentView.removeChildView(tab.view)
      tab.view.webContents.destroy()
    } catch (e) { /* already detached */ }

    this.tabs.splice(idx, 1)
    this._repositionAll()
    this._emit('webview:tab-closed', { tabId, tabCount: this.tabs.length })
    log.info('WebviewManager', `Tab ${tabId} closed (${this.tabs.length} remaining)`)
  }

  /**
   * 关闭所有 tab
   */
  closeAll () {
    for (const tab of this.tabs) {
      try {
        this.mainWindow.contentView.removeChildView(tab.view)
        tab.view.webContents.destroy()
      } catch (e) { /* ignore */ }
    }
    this.tabs = []
    this._emit('webview:all-closed')
    log.info('WebviewManager', 'All tabs closed')
  }

  // ─── 窗口事件 ──────────────────────────────────

  /** 窗口大小变化时重新排列 */
  resize () {
    this._repositionAll()
  }

  // ─── 内部方法 ──────────────────────────────────

  _repositionAll () {
    if (!this.mainWindow || this.tabs.length === 0) return
    const bounds = this.mainWindow.getBounds()
    const positions = this._calculatePositions(bounds)

    for (let i = 0; i < this.tabs.length; i++) {
      if (i < positions.length) {
        const pos = positions[i]
        this.tabs[i].view.setBounds({
          x: pos.x, y: pos.y,
          width: pos.width, height: pos.height,
        })
        this.tabs[i].view.setVisible(true)
      } else {
        // 超出当前布局容量 → 隐藏
        this.tabs[i].view.setVisible(false)
      }
    }
  }

  /**
   * 根据当前布局和窗口大小计算各 view 的位置
   */
  _calculatePositions (bounds) {
    const NAV_HEIGHT = 56
    const GAP = 2
    const W = bounds.width
    const H = bounds.height - NAV_HEIGHT
    const positions = []

    switch (this.layout) {
      case 1:
        positions.push({ x: 0, y: NAV_HEIGHT, width: W, height: H })
        break
      case 2: {
        const hw = Math.floor((W - GAP) / 2)
        positions.push({ x: 0, y: NAV_HEIGHT, width: hw, height: H })
        positions.push({ x: hw + GAP, y: NAV_HEIGHT, width: W - hw - GAP, height: H })
        break
      }
      case 3: {
        const hw = Math.floor((W - GAP) / 2)
        const hh = Math.floor((H - GAP) / 2)
        positions.push({ x: 0, y: NAV_HEIGHT, width: hw, height: hh })
        positions.push({ x: hw + GAP, y: NAV_HEIGHT, width: W - hw - GAP, height: hh })
        positions.push({ x: 0, y: NAV_HEIGHT + hh + GAP, width: W, height: H - hh - GAP })
        break
      }
      case 4: {
        const hw = Math.floor((W - GAP) / 2)
        const hh = Math.floor((H - GAP) / 2)
        const y1 = NAV_HEIGHT
        const y2 = NAV_HEIGHT + hh + GAP
        positions.push({ x: 0, y: y1, width: hw, height: hh })
        positions.push({ x: hw + GAP, y: y1, width: W - hw - GAP, height: hh })
        positions.push({ x: 0, y: y2, width: hw, height: H - hh - GAP })
        positions.push({ x: hw + GAP, y: y2, width: W - hw - GAP, height: H - hh - GAP })
        break
      }
      case 6: {
        const tw = Math.floor((W - 2 * GAP) / 3)
        const hh = Math.floor((H - GAP) / 2)
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 3; c++) {
            positions.push({
              x: c * (tw + GAP),
              y: NAV_HEIGHT + r * (hh + GAP),
              width: tw,
              height: hh,
            })
          }
        }
        break
      }
    }
    return positions
  }

  // ─── IPC 桥接 ──────────────────────────────────

  /**
   * 注册 IPC handlers（供 main.js 调用）
   */
  registerIpcHandlers () {
    ipcMain.handle('webview:set-layout', (_, count) => {
      this.setLayout(count)
      return { code: 0, data: { layout: count, tabCount: this.tabs.length } }
    })

    ipcMain.handle('webview:open-tab', (_, { platform, accountId, cookies, localStorage }) => {
      const tabId = this.openTab(platform, accountId, cookies, localStorage)
      return tabId ? { code: 0, data: { tabId } } : { code: -1, message: `无法打开 ${platform}` }
    })

    ipcMain.handle('webview:close-tab', (_, tabId) => {
      this.closeTab(tabId)
      return { code: 0 }
    })

    ipcMain.handle('webview:close-all', () => {
      this.closeAll()
      return { code: 0 }
    })

    ipcMain.handle('webview:list-tabs', () => {
      return { code: 0, data: this.getTabsInfo() }
    })
  }

  getTabsInfo () {
    return this.tabs.map(t => ({
      id: t.id,
      platform: t.platform,
      accountId: t.accountId,
      label: t.label,
    }))
  }

  /** 安全发射 IPC 事件 */
  _emit (channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }
}

module.exports = WebviewManager
