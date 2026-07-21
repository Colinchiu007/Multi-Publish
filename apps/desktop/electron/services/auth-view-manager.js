// @ts-check
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
const {
  PLATFORM_LOGIN_URLS,
  isPlatformCookieDomain,
  isPlatformLoginSuccessUrl,
} = require('@multi-publish/shared-utils/src/platform-definitions')
const { attachCdpDetection } = require('./auth-view-cdp')
const { createSession, setCookies, restoreLocalStorage, createAuthView } = require('./auth-view-session')

const SIDEBAR_WIDTH = 280
const SIDEBAR_BREAKPOINT = 1360
const AUTH_STATUS_HEIGHT = 44

class AuthViewManager {
  constructor() {
    /** @type {import('electron').BrowserWindow | null} */
    this.mainWindow = null
    /** @type {import('electron').WebContentsView | null} */
    this.currentView = null
    /** @type {string | null} */
    this.currentPlatform = null
    /** @type {string | null} */
    this.currentAccountId = null
    /** @type {((data: any) => void) | null} */
    this._resolveLogin = null
    /** @type {((err: Error) => void) | null} */
    this._rejectLogin = null
    /** @type {Function | null} */
    this._escHandler = null
    /** @type {import('electron').WebContentsView | null} */
    this._escView = null
    /** @type {{ id: number, view: import('electron').WebContentsView, platform: string, resolveLogin: (data: any) => void } | null} */
    this._activeLoginAttempt = null
    /** @type {number} */
    this._loginAttemptSequence = 0
    /** @type {number | null} */
    this._autoCompletionAttemptId = null
  }

  /**
   * @param {import('electron').BrowserWindow} win
   */
  setMainWindow(win) { this.mainWindow = win }

  _getPreloadPath() {
    return path.join(__dirname, '..', 'auth-preload.js')
  }

  /**
   * @param {{ width: number, height: number }} bounds
   */
  _positionView(bounds) {
    if (!this.currentView) return
    const sidebarWidth = bounds.width <= SIDEBAR_BREAKPOINT ? 0 : SIDEBAR_WIDTH
    const top = this._getNavHeight() + AUTH_STATUS_HEIGHT
    this.currentView.setBounds({
      x: sidebarWidth,
      y: top,
      width: bounds.width - sidebarWidth,
      height: Math.max(0, bounds.height - top),
    })
  }

  _getNavHeight() { return 56 }

  _createLoginAttempt() {
    if (!this.currentView || !this.currentPlatform || !this._resolveLogin) return null
    this._activeLoginAttempt = {
      id: ++this._loginAttemptSequence,
      view: this.currentView,
      platform: this.currentPlatform,
      resolveLogin: this._resolveLogin,
    }
    this._autoCompletionAttemptId = null
    return this._activeLoginAttempt
  }

  _getLoginAttempt() {
    const attempt = this._activeLoginAttempt
    if (
      attempt &&
      attempt.view === this.currentView &&
      attempt.platform === this.currentPlatform &&
      attempt.resolveLogin === this._resolveLogin
    ) return attempt
    return this._createLoginAttempt()
  }

  _isCurrentLoginAttempt(attempt) {
    return Boolean(
      attempt &&
      this._activeLoginAttempt === attempt &&
      this.currentView === attempt.view &&
      this.currentPlatform === attempt.platform &&
      this._resolveLogin === attempt.resolveLogin
    )
  }

  _settleLogin(attempt, result) {
    if (!this._isCurrentLoginAttempt(attempt)) return false
    this._activeLoginAttempt = null
    this._autoCompletionAttemptId = null
    this._resolveLogin = null
    attempt.resolveLogin(result)
    this.close()
    return true
  }

  _scheduleAutoCompletion(source, attempt = this._getLoginAttempt()) {
    if (!attempt || !this._isCurrentLoginAttempt(attempt) || this._autoCompletionAttemptId === attempt.id) return
    this._autoCompletionAttemptId = attempt.id

    const timerKey = source === 'cdp' ? '_cdpExtractTimer' : '_urlExtractTimer'
    const timer = setTimeout(async () => {
      try {
        if (!this._isCurrentLoginAttempt(attempt)) return
        const authData = await this._extractAuthData(attempt.view, attempt.platform)
        this._settleLogin(attempt, authData)
      } catch (e) {
        log.warn('AuthView', 'Failed to extract auth data: ' + (e instanceof Error ? e.message : String(e)))
        if (this._isCurrentLoginAttempt(attempt)) this._autoCompletionAttemptId = null
      } finally {
        if (this[timerKey] === timer) this[timerKey] = null
      }
    }, 3000)
    this[timerKey] = timer
    if (this[timerKey] && this[timerKey].unref) this[timerKey].unref()
  }

  /**
   * @param {string} platform
   * @param {number} [timeout]
   */
  openLogin(platform, timeout = 300000) {
    return new Promise((resolve, reject) => {
      if (!this.mainWindow) { reject(new Error("主窗口未初始化")); return }

      const loginUrl = /** @type {Record<string, string>} */ (PLATFORM_LOGIN_URLS)[platform]
      if (!loginUrl) { reject(new Error(`不支持的平台: ${platform}`)); return }

      if (this.currentView || this._resolveLogin) this.close()

      const accountId = `auth-${platform}-${Date.now()}`
      this.currentPlatform = platform
      this.currentAccountId = accountId
      this._resolveLogin = resolve
      this._rejectLogin = reject

      const authSession = createSession(accountId, session)
      const view = createAuthView(accountId, this._getPreloadPath(), authSession)
      this.currentView = view
      const attempt = this._createLoginAttempt()

      this._positionView(this.mainWindow.getBounds())
      this.mainWindow.contentView.addChildView(view)
      view.setVisible(true)
      // R49 修复：loadURL 返回 Promise，必须 .catch()
      view.webContents.loadURL(loginUrl).catch(function () { /* ignore nav errors */ })

      // 通知渲染进程：登录视图已打开（触发关闭按钮显示）
      this.mainWindow.webContents.send('auth:view-opened', { platform, accountId })

      // Escape 键关闭
      /**
       * @param {import('electron').Event} event
       * @param {{ type: string, key: string }} input
       */
      const escHandler = (event, input) => {
        if (input && input.type === 'keyDown' && input.key === 'Escape') {
          if (attempt) this._settleLogin(attempt, { cancelled: true })
        }
      }
      view.webContents.on("before-input-event", escHandler)
      this._escHandler = escHandler
      this._escView = view

      // URL 检测（备用）
      view.webContents.on('did-navigate', (/** @type {any} */ _, /** @type {string} */ url) => this._checkLoginCompleted(url, attempt))

      // CDP 检测（主检测方式）
      attachCdpDetection(view, () => {
        log.info('AuthView', 'CDP detected login success')
        this._scheduleAutoCompletion('cdp', attempt)
      })

      // 超时
      if (timeout > 0) {
        // 安全修复：保存 timer 句柄，close() 中清理（R15 对齐 oauth-manager/qrcode-login）
        this._loginTimeout = setTimeout(() => {
          if (attempt) this._settleLogin(attempt, { timeout: true })
        }, timeout)
        // R28 修复：unref 让定时器不阻止进程退出
        if (this._loginTimeout && this._loginTimeout.unref) this._loginTimeout.unref()
      }
    })
  }

  /**
   * @param {import('electron').WebContentsView} view
   */
  async _extractAuthData(view, platform = this.currentPlatform) {
    const allCookies = await view.webContents.session.cookies.get({})
    const cookies = allCookies.filter(cookie => isPlatformCookieDomain(platform, cookie?.domain))
    let localStorage = {}
    try {
      const extracted = await view.webContents.executeJavaScript(
        'window.__auth_helper__ && typeof window.__auth_helper__.getLocalStorage === "function" ? window.__auth_helper__.getLocalStorage() : {}',
      )
      if (extracted && typeof extracted === 'object' && !Array.isArray(extracted)) {
        localStorage = Object.fromEntries(
          Object.entries(extracted).filter(([key, value]) => typeof key === 'string' && typeof value === 'string'),
        )
      }
    } catch (_e) { /* 页面未加载完成时没有 localStorage 也可继续检查 Cookie */ }
    let name = ''
    try { name = await view.webContents.executeJavaScript('document.title || ""') } catch (_e) { /* ignore */ }
    return { cookies, name, localStorage }
  }

  /**
   * 用户确认平台登录完成后，立即由主进程提取当前隔离视图的凭证。
   * 渲染进程只触发动作，不接触 Cookie/localStorage。
   */
  async completeLogin() {
    const attempt = this._getLoginAttempt()
    if (!attempt) throw new Error('没有正在进行的网页登录')

    const authData = await this._extractAuthData(attempt.view, attempt.platform)
    const hasCookies = Array.isArray(authData.cookies) && authData.cookies.length > 0
    const hasLocalStorage = Boolean(
      authData.localStorage &&
      typeof authData.localStorage === 'object' &&
      Object.keys(authData.localStorage).length > 0,
    )
    if (!hasCookies && !hasLocalStorage) {
      throw new Error('未检测到登录凭证，请先在平台页面完成登录')
    }
    if (!this._settleLogin(attempt, authData)) {
      throw new Error('登录会话已结束，请重新添加账号')
    }
    return true
  }

  /**
   * @param {string} url
   */
  _checkLoginCompleted(url, attempt = this._getLoginAttempt()) {
    if (!attempt || !this._isCurrentLoginAttempt(attempt)) return
    if (isPlatformLoginSuccessUrl(attempt.platform, url)) {
      log.info('AuthView', 'URL pattern detected login success: ' + attempt.platform)
      this._scheduleAutoCompletion('url', attempt)
    }
  }

  close() {
    this._activeLoginAttempt = null
    this._autoCompletionAttemptId = null
    // 安全修复：清理所有 timer（R15 对齐 oauth-manager/qrcode-login）
    if (this._loginTimeout) { clearTimeout(this._loginTimeout); this._loginTimeout = null }
    if (this._cdpExtractTimer) { clearTimeout(this._cdpExtractTimer); this._cdpExtractTimer = null }
    if (this._urlExtractTimer) { clearTimeout(this._urlExtractTimer); this._urlExtractTimer = null }
    if (this.currentView) {
      try {
        if (this._escHandler && this._escView) {
          // @ts-expect-error Electron types missing before-input-event
          this._escView.webContents.removeListener("before-input-event", this._escHandler)
        }
        if (this.mainWindow && this.currentView) {
          this.mainWindow.contentView.removeChildView(this.currentView)
        }
        this.currentView.webContents.close()
        this.currentView = null
      } catch (_e) { /* ignore */ }
    }
    if (this._resolveLogin) {
      const resolveLogin = this._resolveLogin
      this._resolveLogin = null
      resolveLogin({ cancelled: true })
    }
    const hadActiveView = Boolean(this.currentView || this.currentPlatform)
    this.currentPlatform = null
    this.currentAccountId = null
    this._rejectLogin = null
    if (
      hadActiveView &&
      this.mainWindow &&
      !this.mainWindow.isDestroyed?.() &&
      typeof this.mainWindow.webContents?.send === 'function'
    ) {
      this.mainWindow.webContents.send('auth:view-closed')
    }
  }

  /**
   * @param {string} platform
   * @param {any[]} cookies
   * @param {Record<string, string>} [localStorage]
   */
  async openSavedAccount(platform, cookies, localStorage) {
    const loginUrl = /** @type {Record<string, string>} */ (PLATFORM_LOGIN_URLS)[platform]
    if (!loginUrl) return
    if (!this.mainWindow) return

    const accountId = `auth-saved-${platform}-${Date.now()}`
    this.currentPlatform = platform
    this.currentAccountId = accountId

    const authSession = createSession(accountId, session)
    await setCookies(authSession, (cookies || []).filter(cookie => isPlatformCookieDomain(platform, cookie?.domain)))

    const view = createAuthView(accountId, this._getPreloadPath(), authSession)
    this.currentView = view

    this._positionView(this.mainWindow.getBounds())
    this.mainWindow.contentView.addChildView(view)
    view.setVisible(true)
    // R49 修复：loadURL 返回 Promise，必须 .catch()
    view.webContents.loadURL(loginUrl).catch(function () { /* ignore nav errors */ })

    /**
     * @param {import('electron').Event} event
     * @param {{ type: string, key: string }} input
     */
    const escHandler = (event, input) => {
      if (input && input.type === 'keyDown' && input.key === 'Escape') {
        // 先 resolve 再 close（close 会置空 _resolveLogin，导致 Promise 永久泄漏）
        if (this._resolveLogin) {
          this._resolveLogin({ cancelled: true })
          this._resolveLogin = null
        }
        this.close()
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

  /**
   * @param {string} platform
   * @param {any[]} [cookies]
   * @param {Record<string, string>} [localStorage]
   */
  async loginSilent(platform, cookies, localStorage) {
    const loginUrl = /** @type {Record<string, string>} */ (PLATFORM_LOGIN_URLS)[platform]
    if (!loginUrl) return { valid: false, accountName: null }

    const win = new BrowserWindow({
      show: false,
      width: 1024, height: 768,
      webPreferences: {
        session: session.fromPartition(`persist:silent-auth-${platform}-${Date.now()}`, { cache: true }),
        contextIsolation: true, nodeIntegration: false, sandbox: true,
      },
    })

    try {
      if (cookies && cookies.length > 0) {
        for (const c of cookies.filter(cookie => isPlatformCookieDomain(platform, cookie?.domain))) {
          try { await win.webContents.session.cookies.set(c) } catch (_e) { /* skip */ }
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
                try { localStorage.setItem(k, data[k]); } catch (_e) { /* ignore */ }
              });
            })()
          `)
        } catch (_e) { /* ignore */ }
      }

      await new Promise(r => setTimeout(r, 2000))

      const currentUrl = win.webContents.getURL()
      const isValid = isPlatformLoginSuccessUrl(platform, currentUrl)

      let accountName = null
      try { accountName = await win.webContents.getTitle() } catch (_e) { /* ignore */ }

      return { valid: isValid, accountName }
    } catch (e) {
      log.warn('AuthView', `Silent login failed for ${platform}: ${e instanceof Error ? e.message : String(e)}`)
      return { valid: false, accountName: null }
    } finally {
      try { win.destroy() } catch (_e) { /* ignore */ }
    }
  }
}

module.exports = AuthViewManager


