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
const { PLATFORM_LOGIN_URLS, PLATFORM_LOGIN_SUCCESS_PATTERNS } = require('@multi-publish/shared-utils/src/platform-definitions')
const { attachCdpDetection } = require('./auth-view-cdp')
const { createSession, setCookies, restoreLocalStorage, createAuthView } = require('./auth-view-session')

const SIDEBAR_WIDTH = 280

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
    this.currentView.setBounds({
      x: SIDEBAR_WIDTH,
      y: 56,
      width: bounds.width - SIDEBAR_WIDTH,
      height: bounds.height - 56,
    })
  }

  _getNavHeight() { return 56 }

  /**
   * @param {string} platform
   * @param {number} [timeout]
   */
  openLogin(platform, timeout = 300000) {
    return new Promise((resolve, reject) => {
      if (!this.mainWindow) { reject(new Error("主窗口未初始化")); return }

      const loginUrl = /** @type {Record<string, string>} */ (PLATFORM_LOGIN_URLS)[platform]
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
      // R49 修复：loadURL 返回 Promise，必须 .catch()
      view.webContents.loadURL(loginUrl).catch(function () { /* ignore nav errors */ })

      // Escape 键关闭
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

      // URL 检测（备用）
      view.webContents.on('did-navigate', (/** @type {any} */ _, /** @type {string} */ url) => this._checkLoginCompleted(url))

      // CDP 检测（主检测方式）
      attachCdpDetection(view, () => {
        log.info('AuthView', 'CDP detected login success')
        // 安全修复：保存 timer 句柄，close() 中清理（R15 对齐 oauth-manager/qrcode-login）
        this._cdpExtractTimer = setTimeout(async () => {
          try {
            const authData = await this._extractAuthData(view)
            if (this._resolveLogin) {
              this._resolveLogin(authData)
              this._resolveLogin = null
            }
            this.close()
          } catch (e) {
            log.warn('AuthView', 'Failed to extract auth data: ' + (e instanceof Error ? e.message : String(e)))
          }
        }, 3000)
        // R28 修复：unref 让定时器不阻止进程退出
        if (this._cdpExtractTimer && this._cdpExtractTimer.unref) this._cdpExtractTimer.unref()
      })

      // 超时
      if (timeout > 0) {
        // 安全修复：保存 timer 句柄，close() 中清理（R15 对齐 oauth-manager/qrcode-login）
        this._loginTimeout = setTimeout(() => {
          if (this._resolveLogin) {
            this._resolveLogin({ timeout: true })
            this._resolveLogin = null
            this.close()
          }
        }, timeout)
        // R28 修复：unref 让定时器不阻止进程退出
        if (this._loginTimeout && this._loginTimeout.unref) this._loginTimeout.unref()
      }
    })
  }

  /**
   * @param {import('electron').WebContentsView} view
   */
  async _extractAuthData(view) {
    const cookies = await view.webContents.session.cookies.get({})
    let name = ''
    try { name = await view.webContents.executeJavaScript('document.title || ""') } catch (_e) { /* ignore */ }
    return { cookies, name }
  }

  /**
   * @param {string} url
   */
  _checkLoginCompleted(url) {
    if (!this.currentPlatform || !this._resolveLogin) return
    const patterns = /** @type {Record<string, string[]>} */ (PLATFORM_LOGIN_SUCCESS_PATTERNS)[this.currentPlatform]
    if (!patterns) return
    if (patterns.some(p => url.includes(p))) {
      log.info('AuthView', 'URL pattern detected login success: ' + this.currentPlatform)
      // 安全修复：保存 timer 句柄，close() 中清理
      this._urlExtractTimer = setTimeout(async () => {
        try {
          const authData = this.currentView ? await this._extractAuthData(this.currentView) : { cookies: [], name: "" }
          if (this._resolveLogin) {
            this._resolveLogin(authData)
            this._resolveLogin = null
          }
          this.close()
        } catch (e) {
          log.warn('AuthView', 'Extract error: ' + (e instanceof Error ? e.message : String(e)))
        }
      }, 3000)
      // R28 修复：unref 让定时器不阻止进程退出
      if (this._urlExtractTimer && this._urlExtractTimer.unref) this._urlExtractTimer.unref()
    }
  }

  close() {
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
    this.currentPlatform = null
    this.currentAccountId = null
    this._resolveLogin = null
    this._rejectLogin = null
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
    await setCookies(authSession, cookies)

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
        for (const c of cookies) {
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
      const patterns = /** @type {Record<string, string[]>} */ (PLATFORM_LOGIN_SUCCESS_PATTERNS)[platform]
      const isValid = patterns
        ? patterns.some(p => currentUrl.includes(p))
        : !currentUrl.includes('login') && !currentUrl.includes('passport') && !currentUrl.includes('signin')

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


