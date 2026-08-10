// @ts-check
/**
 * WebviewManager — 分屏监控管理器 + 浏览器标签页管理
 *
 * 蚁小二逆向工程 P0 功能：多平台同时监控
 * 每个 tab 独立 WebContentsView，独立 session分区，Cookie 互不干扰
 *
 * 浏览器标签页功能：
 *   创建/关闭/切换标签页，前进后退刷新，URL 导航，搜索跳转
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
const { EventEmitter } = require('events')
const { WebContentsView, session, ipcMain } = require('electron')
const path = require('path')
const log = require('./logger')
const { PLATFORM_DASHBOARD_URLS } = require('@multi-publish/shared-utils/src/platform-definitions')
const EC = require('../core/error-codes').ERROR
const { withSenderCheck } = require('../ipc-handlers/helpers')

// 各平台创作者中心/后台 URL → @multi-publish/shared-utils/src/platform-definitions

class WebviewManager extends EventEmitter {
  constructor () {
    super()
    this.mainWindow = null
    /** @type {Array<{id: string, platform: string, accountId: string|null, view: WebContentsView, label: string}>} */
    this.tabs = []
    this.layout = 1  // 当前布局数（1/2/3/4/6）
    this._nextTabId = 1

    // ─── 浏览器标签页系统 ──────────────────────
    /** @type {Map<string, WebContentsView>} */
    this._tabViews = new Map()
    /** @type {Map<string, {url: string, title: string, loading: boolean, canGoBack: boolean, canGoForward: boolean}>} */
    this._tabStates = new Map()
    this._activeTabId = null
    this._homeTabId = null
    this._tabIdCounter = 0
    /** @type {Set<string>} */
    this._subscribers = new Set()
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
    log.info('WebviewManager', 'Layout set to ' + count)
  }

  // ─── 浏览器标签页管理 ──────────────────────────

  /**
   * 检测新标签页系统是否有活动窗口
   * @returns {boolean}
   */
  _mainWindowAvailable () {
    return !!(this.mainWindow && this._tabViews && this._tabViews.size > 0)
  }

  // ─── Tab 管理（分屏监控）─────────────────────────

  /**
   * 打开一个平台监控 tab
   * @param {string} platform - 平台标识
   * @param {string|null} [accountId] - 账号 ID（用于隔离 session）
   * @param {Array} [cookies] - 已保存的 Cookie 数组
   * @param {Object} [localStorage] - 已保存的 localStorage 数据
   * @param {string} [customUrl] - 自定义 URL（覆盖默认仪表盘 URL）
   * @returns {string|null} tabId
   */
  openTab (platform, accountId, cookies, localStorage, customUrl) {
    if (!this.mainWindow) return null

    const url = customUrl || PLATFORM_DASHBOARD_URLS[platform]
    if (!url) {
      log.warn('WebviewManager', 'No dashboard URL for platform: ' + platform)
      return null
    }

    // 安全：校验 URL 协议（防止 file:// / data:// 等 SSRF/信息泄露）
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        log.warn('WebviewManager', 'Blocked non-http(s) URL: ' + parsed.protocol)
        return null
      }
    } catch (e) {
      log.warn('WebviewManager', 'Invalid URL: ' + url)
      return null
    }

    const tabId = 'tab-' + this._nextTabId++
    const partition = 'persist:monitor-' + (accountId || (platform + '-' + tabId))
    const viewSession = session.fromPartition(partition, { cache: true })

    // 恢复已保存 Cookie（必须在 loadURL 之前）
    if (cookies && cookies.length > 0) {
      for (var i = 0; i < cookies.length; i++) {
        // eslint-disable-next-line no-unused-vars
        try { viewSession.cookies.set(cookies[i]).catch(function () {}) } catch (e) { /* skip invalid */ }
      }
    }

    // 创建 WebContentsView
    const view = new WebContentsView({
      webPreferences: {
        session: viewSession,
        preload: path.join(__dirname, '..', 'monitor-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      }
    })
    view.setVisible(true)
    this.mainWindow.contentView.addChildView(view)

    // 导航到平台页面
    // R49 修复：loadURL 返回 Promise，必须 .catch()
    view.webContents.loadURL(url).catch(function () { /* ignore nav errors */ })

    // 页面加载后恢复 localStorage
    if (localStorage && Object.keys(localStorage).length > 0) {
      var lsData = JSON.stringify(localStorage)
      view.webContents.on('did-finish-load', function () {
        view.webContents.executeJavaScript(
          '(function() {\n' +
          '  var data = ' + lsData + ';\n' +
          '  Object.keys(data).forEach(function(k) {\n' +
          '    try { localStorage.setItem(k, data[k]); } catch (e) { /* ignore */ }\n' +
          '  });\n' +
          '})()'
        ).catch(function () {})
      })
    }

    // 监听导航事件（检测登录状态变化）
    var self = this
    view.webContents.on('did-navigate', function (event, navUrl) {
      self._emit('webview:navigated', { tabId: tabId, platform: platform, url: navUrl })
    })

    var tab = { id: tabId, platform: platform, accountId: accountId, view: view, label: platform }
    this.tabs.push(tab)
    this._repositionAll()
    this._emit('webview:tab-opened', { tabId: tabId, platform: platform, accountId: accountId, tabCount: this.tabs.length })
    log.info('WebviewManager', 'Opened tab: ' + tabId + ' (' + platform + ')')
    return tabId
  }

  // ─── 新标签页（浏览器式）──────────────────────

  /**
   * 创建新的浏览器标签页
   * @param {Object} [opts]
   * @param {string} [opts.url] - 初始 URL（默认 about:blank）
   * @param {Array} [opts.cookies] - 需要恢复的 Cookie 数组
   * @returns {string|null} tabId
   */
  createNewTabPage (opts) {
    if (!this.mainWindow) return null

    var self = this
    var tabId = 'btab-' + (++this._tabIdCounter)
    var partition = 'persist:browse-' + tabId
    var viewSession = session.fromPartition(partition, { cache: true })

    // 恢复 Cookie
    if (opts && opts.cookies && opts.cookies.length > 0) {
      var cookies = opts.cookies
      for (var i = 0; i < cookies.length; i++) {
        try { viewSession.cookies.set(cookies[i]).catch(function () {}) } catch (e) { /* skip invalid */ }
      }
    }

    var view = new WebContentsView({
      webPreferences: {
        session: viewSession,
        preload: path.join(__dirname, '..', 'monitor-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    })

    // 隐藏其他标签页，显示当前
    self._hideAllTabs()
    view.setVisible(true)
    self.mainWindow.contentView.addChildView(view)

    // 设置初始状态
    var initialUrl = (opts && opts.url) || 'about:blank'
    self._tabViews.set(tabId, view)
    self._tabStates.set(tabId, {
      url: initialUrl,
      title: 'New Tab',
      loading: false,
      canGoBack: false,
      canGoForward: false
    })
    self._activeTabId = tabId

    // 如果是第一个标签页，设为 home
    if (!self._homeTabId) {
      self._homeTabId = tabId
    }

    // 设置导航监听
    self._setupNav(tabId, view)

    // 加载初始 URL
    if (initialUrl && initialUrl !== 'about:blank') {
      view.webContents.loadURL(initialUrl).catch(function () { /* ignore nav errors */ })
    }

    // 调整位置
    self._repositionAll()
    self._broadcast('tab-created', { tabId: tabId, url: initialUrl })

    log.info('WebviewManager', 'Created new tab: ' + tabId)
    return tabId
  }

  /**
   * 关闭指定标签页
   * @param {string} tabId
   * @returns {boolean}
   */
  closeTab (tabId) {
    var self = this

    // Home tab 不可关闭
    if (tabId === self._homeTabId) return false

    // 处理新浏览器标签
    if (self._tabViews.has(tabId)) {
      var view = self._tabViews.get(tabId)
      self._tabViews.delete(tabId)
      self._tabStates.delete(tabId)

      try {
        if (self.mainWindow && self.mainWindow.contentView) {
          self.mainWindow.contentView.removeChildView(view)
        }
        view.webContents.close()
      } catch (e) { /* ignore */ }

      // 切换到下一个标签
      if (self._activeTabId === tabId) {
        self._activeTabId = null
        var tabIds = Array.from(self._tabViews.keys())
        if (tabIds.length > 0) {
          self.switchToTab(tabIds[0])
        } else {
          self._broadcast('all-tabs-closed', {})
        }
      }

      self._broadcast('tab-closed', { tabId: tabId })
      log.info('WebviewManager', 'Closed tab: ' + tabId)
      return true
    }

    // 处理旧分屏标签
    var idx = -1
    for (var i = 0; i < self.tabs.length; i++) {
      if (self.tabs[i].id === tabId) { idx = i; break }
    }
    if (idx === -1) return false

    var closedTab = self.tabs[idx]
    try {
      if (self.mainWindow && self.mainWindow.contentView) {
        self.mainWindow.contentView.removeChildView(closedTab.view)
      }
      closedTab.view.webContents.close()
    } catch (e) { /* ignore */ }
    self.tabs.splice(idx, 1)
    self._repositionAll()
    self._emit('webview:tab-closed', { tabId: tabId, tabCount: self.tabs.length })
    log.info('WebviewManager', 'Closed monitor tab: ' + tabId)
    return true
  }

  /**
   * 切换到指定标签页
   * @param {string} tabId
   * @returns {boolean}
   */
  switchToTab (tabId) {
    var self = this

    // Home tab：隐藏所有 WebContentsView，显示 router-view
    if (tabId === self._homeTabId) {
      self._hideAllTabs()
      self._activeTabId = tabId
      self._broadcast('tab-switched', {
        tabId: tabId,
        url: '',
        title: '首页'
      })
      return true
    }

    if (!self._tabViews.has(tabId)) return false

    // 隐藏当前活动标签
    if (self._activeTabId && self._tabViews.has(self._activeTabId)) {
      self._tabViews.get(self._activeTabId).setVisible(false)
    }

    // 显示目标标签
    var targetView = self._tabViews.get(tabId)
    targetView.setVisible(true)
    self._activeTabId = tabId

    // 调整位置
    self._repositionAll()

    var state = self._tabStates.get(tabId)
    self._broadcast('tab-switched', {
      tabId: tabId,
      url: state ? state.url : '',
      title: state ? state.title : ''
    })

    return true
  }

  /**
   * 关闭所有浏览器标签页（保留 home tab）
   */
  closeAll () {
    var self = this
    var tabIds = Array.from(self._tabViews.keys())

    for (var i = 0; i < tabIds.length; i++) {
      var id = tabIds[i]
      if (id === self._homeTabId) continue

      var view = self._tabViews.get(id)
      self._tabViews.delete(id)
      self._tabStates.delete(id)

      try {
        if (self.mainWindow && self.mainWindow.contentView) {
          self.mainWindow.contentView.removeChildView(view)
        }
        view.webContents.close()
      } catch (e) { /* ignore */ }
    }

    self._activeTabId = self._homeTabId
    self._repositionAll()
    self._broadcast('all-tabs-closed', {})
    log.info('WebviewManager', 'All browser tabs closed')
  }

  /**
   * 获取所有标签页信息
   * @returns {Array}
   */
  getAllTabs () {
    var self = this
    var result = []
    self._tabStates.forEach(function (state, tabId) {
      result.push({
        tabId: tabId,
        url: state.url,
        title: state.title,
        loading: state.loading,
        canGoBack: state.canGoBack,
        canGoForward: state.canGoForward,
        isActive: tabId === self._activeTabId,
        isHome: tabId === self._homeTabId
      })
    })
    return result
  }

  /**
   * 获取当前活动标签页
   * @returns {Object|null}
   */
  getActiveTab () {
    if (!this._activeTabId || !this._tabStates.has(this._activeTabId)) return null
    var state = this._tabStates.get(this._activeTabId)
    return {
      tabId: this._activeTabId,
      url: state.url,
      title: state.title,
      loading: state.loading,
      canGoBack: state.canGoBack,
      canGoForward: state.canGoForward,
      isHome: this._activeTabId === this._homeTabId
    }
  }

  /**
   * 获取 home 标签页信息
   * @returns {Object|null}
   */
  getHomeTab () {
    if (!this._homeTabId || !this._tabStates.has(this._homeTabId)) return null
    var state = this._tabStates.get(this._homeTabId)
    return {
      tabId: this._homeTabId,
      url: state.url,
      title: state.title,
      loading: state.loading,
      canGoBack: state.canGoBack,
      canGoForward: state.canGoForward
    }
  }

  /**
   * 后退
   * @param {string} tabId
   * @returns {boolean}
   */
  goBack (tabId) {
    var self = this
    var view = self._tabViews.get(tabId)
    if (!view) return false
    if (view.webContents.canGoBack()) {
      view.webContents.goBack()
      return true
    }
    return false
  }

  /**
   * 前进
   * @param {string} tabId
   * @returns {boolean}
   */
  goForward (tabId) {
    var self = this
    var view = self._tabViews.get(tabId)
    if (!view) return false
    if (view.webContents.canGoForward()) {
      view.webContents.goForward()
      return true
    }
    return false
  }

  /**
   * 刷新
   * @param {string} tabId
   * @param {boolean} [ignoreCache]
   */
  reload (tabId, ignoreCache) {
    var view = this._tabViews.get(tabId)
    if (!view) return
    if (ignoreCache) {
      view.webContents.reloadIgnoringCache()
    } else {
      view.webContents.reload()
    }
  }

  /**
   * 导航到指定 URL
   * @param {string} tabId
   * @param {string} url
   * @returns {boolean}
   */
  navigateTab (tabId, url) {
    var self = this
    var view = self._tabViews.get(tabId)
    if (!view) return false

    // URL 协议校验
    try {
      var parsed = new URL(url)
      if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) {
        log.warn('WebviewManager', 'Blocked non-http(s/file) URL: ' + parsed.protocol)
        return false
      }
    } catch (e) {
      log.warn('WebviewManager', 'Invalid URL: ' + url)
      return false
    }

    view.webContents.loadURL(url).catch(function () { /* ignore nav errors */ })
    return true
  }

  /**
   * 搜索或导航（输入是 URL 则直接打开，否则 Bing 搜索）
   * @param {string} query
   * @param {string} tabId
   * @returns {boolean}
   */
  searchOrNavigate (query, tabId) {
    var self = this
    var targetTabId = tabId || self._activeTabId
    if (!targetTabId) return false

    // 判断是否为 URL
    var isUrl = false
    try {
      var parsed = new URL(query)
      if (['http:', 'https:', 'file:'].includes(parsed.protocol)) {
        isUrl = true
      }
    } catch (e) { /* not a URL */ }

    if (!isUrl) {
      // 检测不带协议的域名（如 example.com）
      if (/^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(query)) {
        isUrl = true
        query = 'https://' + query
      }
    }

    if (isUrl) {
      return self.navigateTab(targetTabId, query)
    } else {
      return self.navigateTab(targetTabId, 'https://www.bing.com/search?q=' + encodeURIComponent(query))
    }
  }

  /**
   * 保存当前标签页 Cookie
   * @param {string} tabId
   */
  saveCookies (tabId) {
    var self = this
    var view = self._tabViews.get(tabId)
    if (!view) return

    view.webContents.session.cookies.getAll({}).then(function (cookies) {
      self.emit('tab-cookies-changed', { tabId: tabId, cookies: cookies })
    }).catch(function () { /* ignore */ })
  }

  // ─── 关闭分屏监控标签 ──────────────────────────

  /**
   * 关闭指定分屏监控标签
   * @param {string} tabId
   */
  closeMonitorTab (tabId) {
    var idx = -1
    for (var i = 0; i < this.tabs.length; i++) {
      if (this.tabs[i].id === tabId) { idx = i; break }
    }
    if (idx === -1) return

    var closedTab = this.tabs[idx]
    try {
      if (this.mainWindow && this.mainWindow.contentView) {
        this.mainWindow.contentView.removeChildView(closedTab.view)
      }
      closedTab.view.webContents.close()
    } catch (e) { /* ignore */ }
    this.tabs.splice(idx, 1)
    this._repositionAll()
    this._emit('webview:tab-closed', { tabId: tabId, tabCount: this.tabs.length })
    log.info('WebviewManager', 'Closed monitor tab: ' + tabId)
  }

  /**
   * 关闭所有分屏监控标签
   */
  closeAllMonitorTabs () {
    var self = this
    for (var i = self.tabs.length - 1; i >= 0; i--) {
      var tab = self.tabs[i]
      try {
        if (self.mainWindow && self.mainWindow.contentView) {
          self.mainWindow.contentView.removeChildView(tab.view)
        }
        tab.view.webContents.close()
      } catch (e) { /* ignore */ }
    }
    self.tabs = []
    self._repositionAll()
    self._emit('webview:all-tabs-closed', {})
    log.info('WebviewManager', 'All monitor tabs closed')
  }

  // ─── 窗口事件 ──────────────────────────────────

  /** 窗口大小变化时重新排列 */
  resize () {
    this._repositionAll()
  }

  // ─── 内部方法 ──────────────────────────────────

  /**
   * 隐藏所有浏览器标签页的视图
   */
  _hideAllTabs () {
    var self = this
    self._tabViews.forEach(function (view) {
      view.setVisible(false)
    })
  }

  /**
   * 设置浏览器标签页导航监听
   * @param {string} tabId
   * @param {WebContentsView} view
   */
  _setupNav (tabId, view) {
    var self = this

    view.webContents.on('did-start-loading', function () {
      if (!self._tabStates.has(tabId)) return
      var state = self._tabStates.get(tabId)
      state.loading = true
      state.canGoBack = view.webContents.canGoBack()
      state.canGoForward = view.webContents.canGoForward()
      self._broadcast('tab-loading', { tabId: tabId, url: state.url, loading: true })
    })

    view.webContents.on('did-finish-load', function () {
      if (!self._tabStates.has(tabId)) return
      var state = self._tabStates.get(tabId)
      state.loading = false
      state.canGoBack = view.webContents.canGoBack()
      state.canGoForward = view.webContents.canGoForward()
      self._broadcast('tab-finished-loading', { tabId: tabId, url: state.url, loading: false })
    })

    view.webContents.on('page-title-updated', function (event, title) {
      if (!self._tabStates.has(tabId)) return
      var state = self._tabStates.get(tabId)
      state.title = title
      self._broadcast('tab-title-updated', { tabId: tabId, title: title })
    })

    view.webContents.on('did-navigate', function (event, url) {
      if (!self._tabStates.has(tabId)) return
      var state = self._tabStates.get(tabId)
      state.url = url
      state.canGoBack = view.webContents.canGoBack()
      state.canGoForward = view.webContents.canGoForward()
      self._broadcastNav(tabId)
    })

    view.webContents.on('did-navigate-in-page', function (event, url) {
      if (!self._tabStates.has(tabId)) return
      var state = self._tabStates.get(tabId)
      state.url = url
      self._broadcastNav(tabId)
    })
  }

  /**
   * 重新调整所有视图位置
   * 浏览器标签页填满 TOP=76px 以下区域，分屏标签使用原布局
   */
  _repositionAll () {
    if (!this.mainWindow) return
    var bounds = this.mainWindow.getBounds()

    // 处理浏览器标签页（新系统）
    if (this._tabViews.size > 0) {
      var activeView = this._tabViews.get(this._activeTabId)
      if (activeView) {
        activeView.setBounds({ x: 0, y: 76, width: bounds.width, height: bounds.height - 76 })
        activeView.setVisible(true)
      }
    }

    // 处理分屏监控标签（旧系统）
    if (this.tabs.length > 0) {
      var positions = this._calculatePositions(bounds)
      for (var i = 0; i < this.tabs.length; i++) {
        if (i < positions.length) {
          var pos = positions[i]
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
  }

  /**
   * 根据当前布局和窗口大小计算各 view 的位置
   */
  _calculatePositions (bounds) {
    var NAV_HEIGHT = 56
    var GAP = 2
    var W = bounds.width
    var H = bounds.height - NAV_HEIGHT
    var positions = []

    switch (this.layout) {
      case 1:
        positions.push({ x: 0, y: NAV_HEIGHT, width: W, height: H })
        break
      case 2: {
        var hw = Math.floor((W - GAP) / 2)
        positions.push({ x: 0, y: NAV_HEIGHT, width: hw, height: H })
        positions.push({ x: hw + GAP, y: NAV_HEIGHT, width: W - hw - GAP, height: H })
        break
      }
      case 3: {
        var hw = Math.floor((W - GAP) / 2)
        var hh = Math.floor((H - GAP) / 2)
        positions.push({ x: 0, y: NAV_HEIGHT, width: hw, height: hh })
        positions.push({ x: hw + GAP, y: NAV_HEIGHT, width: W - hw - GAP, height: hh })
        positions.push({ x: 0, y: NAV_HEIGHT + hh + GAP, width: W, height: H - hh - GAP })
        break
      }
      case 4: {
        var hw = Math.floor((W - GAP) / 2)
        var hh = Math.floor((H - GAP) / 2)
        var y1 = NAV_HEIGHT
        var y2 = NAV_HEIGHT + hh + GAP
        positions.push({ x: 0, y: y1, width: hw, height: hh })
        positions.push({ x: hw + GAP, y: y1, width: W - hw - GAP, height: hh })
        positions.push({ x: 0, y: y2, width: hw, height: H - hh - GAP })
        positions.push({ x: hw + GAP, y: y2, width: W - hw - GAP, height: H - hh - GAP })
        break
      }
      case 6: {
        var tw = Math.floor((W - 2 * GAP) / 3)
        var hh = Math.floor((H - GAP) / 2)
        for (var r = 0; r < 2; r++) {
          for (var c = 0; c < 3; c++) {
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

  /**
   * 获取 URL 域名
   * @param {string} url
   * @returns {string}
   */
  _getDomain (url) {
    try { return new URL(url).hostname } catch (e) { return '' }
  }

  /**
   * 广播事件给所有订阅者
   * @param {string} event
   * @param {Object} data
   */
  _broadcast (event, data) {
    var self = this
    self._subscribers.forEach(function (subscriberId) {
      try {
        if (self.mainWindow && !self.mainWindow.isDestroyed()) {
          self.mainWindow.webContents.send('page-manager:' + event, {
            subscriberId: subscriberId,
            data: data
          })
        }
      } catch (e) { /* ignore */ }
    })
  }

  /**
   * 广播导航事件
   * @param {string} tabId
   */
  _broadcastNav (tabId) {
    var self = this
    var state = self._tabStates.get(tabId)
    if (!state) return
    self._broadcast('navigation-changed', {
      tabId: tabId,
      url: state.url,
      title: state.title,
      canGoBack: state.canGoBack,
      canGoForward: state.canGoForward
    })
  }

  // ─── IPC 桥接 ──────────────────────────────────

  /**
   * 注册 IPC handlers（供 main.js 调用）
   */
  registerIpcHandlers (injectedIpcMain) {
    var ipcMain = injectedIpcMain || require('electron').ipcMain;
    var self = this;

    // ─── page-manager: IPC handlers（新标签页系统）──

    ipcMain.handle('page-manager:create-new-tab-page', withSenderCheck(function (_, arg) {
      try {
        var tabId = self.createNewTabPage(arg || {})
        return tabId ? { code: 0, data: { tabId: tabId } } : { code: EC.REQUEST_ERROR, message: 'Failed to create tab' }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('page-manager:close-tab', withSenderCheck(function (_, tabId) {
      try {
        self.closeTab(tabId)
        return { code: 0 }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('page-manager:switch-tab', withSenderCheck(function (_, tabId) {
      try {
        self.switchToTab(tabId)
        return { code: 0 }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('page-manager:navigate', withSenderCheck(function (_, arg) {
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: 'Missing args' }
      try {
        self.navigateTab(arg.tabId, arg.url)
        return { code: 0 }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('page-manager:go-back', withSenderCheck(function (_, tabId) {
      try {
        self.goBack(tabId)
        return { code: 0 }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('page-manager:go-forward', withSenderCheck(function (_, tabId) {
      try {
        self.goForward(tabId)
        return { code: 0 }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('page-manager:reload', withSenderCheck(function (_, arg) {
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: 'Missing args' }
      try {
        self.reload(arg.tabId, arg.ignoreCache)
        return { code: 0 }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('page-manager:get-all-tabs', withSenderCheck(function () {
      try {
        return { code: 0, data: self.getAllTabs() }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
    }))

    ipcMain.handle('page-manager:get-active-tab', withSenderCheck(function () {
      try {
        return { code: 0, data: self.getActiveTab() }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: null } }
    }))

    ipcMain.handle('page-manager:get-home-tab', withSenderCheck(function () {
      try {
        return { code: 0, data: self.getHomeTab() }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: null } }
    }))

    ipcMain.handle('page-manager:search-or-navigate', withSenderCheck(function (_, arg) {
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: 'Missing args' }
      try {
        self.searchOrNavigate(arg.query, arg.tabId)
        return { code: 0 }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('page-manager:subscribe-events', withSenderCheck(function (_, arg) {
      try {
        var subscriberId = (arg && arg.subscriberId) || 'default-' + Date.now()
        self._subscribers.add(subscriberId)
        return { code: 0, data: { subscriberId: subscriberId } }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('page-manager:unsubscribe-events', withSenderCheck(function (_, arg) {
      try {
        var subscriberId = (arg && arg.subscriberId) || ''
        if (subscriberId) { self._subscribers.delete(subscriberId) } else { self._subscribers.clear() }
        return { code: 0 }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('page-manager:save-cookies', withSenderCheck(function (_, tabId) {
      try {
        self.saveCookies(tabId)
        return { code: 0 }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    // ─── webview: IPC handlers（旧分屏系统，保持向后兼容）──

    ipcMain.handle('webview:set-layout', withSenderCheck(function (_, count) {
      try {
        self.setLayout(count)
        return { code: 0, data: { layout: count, tabCount: self.tabs.length } }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('webview:open-tab', withSenderCheck(function (_, arg) {
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: 'Missing args object' }
      var platform = arg.platform, accountId = arg.accountId, cookies = arg.cookies, localStorage = arg.localStorage, url = arg.url
      try {
        var tabId = self.openTab(platform, accountId, cookies, localStorage, url)
        return tabId ? { code: 0, data: { tabId: tabId } } : { code: EC.REQUEST_ERROR, message: 'Cannot open ' + platform }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('webview:close-tab', withSenderCheck(function (_, tabId) {
      try {
        self.closeTab(tabId)
        return { code: 0 }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('webview:close-all', withSenderCheck(function () {
      try {
        self.closeAllMonitorTabs()
        return { code: 0 }
      } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
    }))

    ipcMain.handle('webview:list-tabs', function () {
      try { return { code: 0, data: self.getTabsInfo() } }
      catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
    })
  }

  getTabsInfo () {
    return this.tabs.map(function (t) {
      return {
        id: t.id,
        platform: t.platform,
        accountId: t.accountId,
        label: t.label,
      }
    })
  }

  /** 安全发射 IPC 事件 */
  _emit (channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }
}

module.exports = WebviewManager