/**
 * AuthViewManager — WebContentsView 内嵌浏览器登录管理器
 *
 * 架构：
 *   Login:   WebContentsView (内嵌，体验好)
 *   Publish: Playwright (保留，RPA 自动化)
 *   Cookie 桥接: WebContentsView 提取 → Python API 保存 → Playwright 加载
 */
// eslint-disable-next-line no-unused-vars
const { BrowserWindow, WebContentsView, session, ipcMain } = require('electron')
const path = require('path')
const log = require('./logger')
const { PLATFORM_LOGIN_URLS, PLATFORM_LOGIN_SUCCESS_PATTERNS } = require('@multi-publish/shared-utils/src/platform-definitions')
const { attachCdpDetection } = require('./auth-view-cdp')
const { createSession, setCookies, restoreLocalStorage, createAuthView } = require('./auth-view-session')

const SIDEBAR_WIDTH = 280

class AuthViewManager {
  constructor() {
    this.mainWindow = null
    this.currentView = null
    this.currentPlatform = null
    this.currentAccountId = null
    this._resolveLogin = null
    this._rejectLogin = null
  }

  setMainWindow(win) { this.mainWindow = win }

  _getPreloadPath() {
    return path.join(__dirname, '..', 'auth-preload.js')
  }

  _positionView(bounds) {
    if (!this.currentView) return
    this.currentView.setBounds({
      x: SIDEBAR_WIDTH,
      y: 56,
      width: bounds.width - SIDEBAR_WIDTH,
      height: bounds.height - 56,
    })
  }

  _getNavHeight() { return 56 }

  openLogin(platform, timeout = 300000) {
    return new Promise((resolve, reject) => {
      if (!this.mainWindow) { reject(new Error("主窗口未初始化")); return }

      const loginUrl = PLATFORM_LOGIN_URLS[platform]
      if (!loginUrl) { reject(new Error(`不支持的平台: ${platform}`)); return }

      const accountId = `auth-${platform}-${Date.now()}`
      this.currentPlatform = platform
      this.currentAccountId = accountId
      this._resolveLogin = resolve
      this._rejectLogin = reject

      const authSession = createSession(accountId, session)
      const view = createAuthView(accountId, this._getPreloadPath(), authSession)
      this.currentView = view

      this._positionView(this.mainWindow.getBounds())
      this.mainWindow.contentView.addChildView(view)
      view.setVisible(true)
      view.webContents.loadURL(loginUrl)

      // Escape 键关闭
      const escHandler = (event, input) => {
        if (input && input.type === 'keyDown' && input.key === 'Escape') {
          this.close()
          this._resolveLogin?.({ cancelled: true })
          this._resolveLogin = null
        }
      }
      view.webContents.on("before-input-event", escHandler)
      this._escHandler = escHandler
      this._escView = view

      // URL 检测（备用）
      view.webContents.on('did-navigate', (_, url) => this._checkLoginCompleted(url))

      // CDP 检测（主检测方式）
      attachCdpDetection(view, () => {
        log.info('AuthView', 'CDP detected login success')
        setTimeout(async () => {
          try {
            const authData = await this._extractAuthData(view)
            this._resolveLogin?.(authData)
            this._resolveLogin = null
            this.close()
          } catch (e) {
            log.warn('AuthView', 'Failed to extract auth data: ' + e.message)
          }
        }, 3000)
      })

      // 超时
      if (timeout > 0) {
        setTimeout(() => {
          if (this._resolveLogin) {
            this._resolveLogin({ timeout: true })
            this._resolveLogin = null
            this.close()
          }
        }, timeout)
      }
    })
  }

  async _extractAuthData(view) {
    const cookies = await view.webContents.session.cookies.get({})
    let name = ''
    // eslint-disable-next-line no-unused-vars
    try { name = await view.webContents.executeJavaScript('document.title || ""') } catch (e) { /* ignore */ }
    return { cookies, name }
  }

  _checkLoginCompleted(url) {
    if (!this.currentPlatform || !this._resolveLogin) return
    const patterns = PLATFORM_LOGIN_SUCCESS_PATTERNS[this.currentPlatform]
    if (!patterns) return
    if (patterns.some(p => url.includes(p))) {
      log.info('AuthView', 'URL pattern detected login success: ' + this.currentPlatform)
      setTimeout(async () => {
        try {
          const authData = await this._extractAuthData(this.currentView)
          this._resolveLogin(authData)
          this._resolveLogin = null
          this.close()
        } catch (e) {
          log.warn('AuthView', 'Extract error: ' + e.message)
        }
      }, 3000)
    }
  }

  close() {
    if (this.currentView) {
      try {
        if (this._escHandler && this._escView) {
          this._escView.webContents.removeListener("before-input-event", this._escHandler)
        }
        this.mainWindow.contentView.removeChildView(this.currentView)
        this.currentView.webContents.close()
        this.currentView = null
      // eslint-disable-next-line no-unused-vars
      } catch (e) { /* ignore */ }
    }
    this.currentPlatform = null
    this.currentAccountId = null
    this._resolveLogin = null
    this._rejectLogin = null
  }

  async openSavedAccount(platform, cookies, localStorage) {
    const loginUrl = PLATFORM_LOGIN_URLS[platform]
    if (!loginUrl) return
    if (!this.mainWindow) return

    const accountId = `auth-saved-${platform}-${Date.now()}`
    this.currentPlatform = platform
    this.currentAccountId = accountId

    const authSession = createSession(accountId, session)
    await setCookies(authSession, cookies)

    const view = createAuthView(accountId, this._getPreloadPath(), authSession)
    this.currentView = view

    this._positionView(this.mainWindow.getBounds())
    this.mainWindow.contentView.addChildView(view)
    view.setVisible(true)
    view.webContents.loadURL(loginUrl)

    const escHandler = (event, input) => {
      if (input && input.type === 'keyDown' && input.key === 'Escape') {
        this.close()
        this._resolveLogin?.({ cancelled: true })
        this._resolveLogin = null
      }
    }
    view.webContents.on("before-input-event", escHandler)
    this._escHandler = escHandler
    this._escView = view

    if (localStorage && Object.keys(localStorage).length > 0) {
      restoreLocalStorage(view, localStorage)
    }

    this.mainWindow.webContents.send('auth:view-opened', { platform, accountId })
    log.info('AuthView', `Opened saved account ${accountId}`)
  }

  async loginSilent(platform, cookies, localStorage) {
    const loginUrl = PLATFORM_LOGIN_URLS[platform]
    if (!loginUrl) return { valid: false, accountName: null }

    const win = new BrowserWindow({
      show: false,
      width: 1024, height: 768,
      webPreferences: {
        session: session.fromPartition(`persist:silent-auth-${platform}-${Date.now()}`, { cache: true }),
        contextIsolation: true, nodeIntegration: false,
      },
    })

    try {
      if (cookies && cookies.length > 0) {
        for (const c of cookies) {
          // eslint-disable-next-line no-unused-vars
          try { await win.webContents.session.cookies.set(c) } catch (e) { /* skip */ }
        }
      }

      await win.webContents.loadURL(loginUrl)
      await new Promise(r => setTimeout(r, 3000))

      if (localStorage && Object.keys(localStorage).length > 0) {
        try {
          await win.webContents.executeJavaScript(`
            (function() {
              let data = ${JSON.stringify(localStorage)};
              Object.keys(data).forEach(function(k) {
                try { localStorage.setItem(k, data[k]); } catch (e) { /* ignore */ }
              });
            })()
          `)
        // eslint-disable-next-line no-unused-vars
        } catch (e) { /* ignore */ }
      }

      await new Promise(r => setTimeout(r, 2000))

      const currentUrl = win.webContents.getURL()
      const patterns = PLATFORM_LOGIN_SUCCESS_PATTERNS[platform]
      const isValid = patterns
        ? patterns.some(p => currentUrl.includes(p))
        : !currentUrl.includes('login') && !currentUrl.includes('passport') && !currentUrl.includes('signin')

      let accountName = null
      // eslint-disable-next-line no-unused-vars
      try { accountName = await win.webContents.getTitle() } catch (e) { /* ignore */ }

      return { valid: isValid, accountName }
    } catch (e) {
      log.warn('AuthView', `Silent login failed for ${platform}: ${e.message}`)
      return { valid: false, accountName: null }
    } finally {
      // eslint-disable-next-line no-unused-vars
      try { win.destroy() } catch (e) { /* ignore */ }
    }
  }
}

module.exports = AuthViewManager