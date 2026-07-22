const { IdentityError } = require('./identity-errors')

const DEFAULT_PARTITION = 'persist:logto-identity'

function parseUrl(value, code = 'IDENTITY_AUTH_WINDOW_URL_INVALID') {
  try {
    return new URL(value)
  } catch (error) {
    throw new IdentityError(code, '认证窗口地址无效', error)
  }
}

class IdentityAuthWindow {
  constructor(options = {}) {
    this._endpoint = parseUrl(options.endpoint, 'IDENTITY_CONFIG_INVALID')
    this._redirectUri = parseUrl(options.redirectUri, 'IDENTITY_CONFIG_INVALID')
    const electron = options.BrowserWindow && options.session
      ? null
      : require('electron')
    this._BrowserWindow = options.BrowserWindow || electron.BrowserWindow
    this._session = options.session || electron.session
    this._shell = options.shell || (electron && electron.shell) || require('electron').shell
    this._getParentWindow = options.getParentWindow || (() => null)
    this._partition = options.partition || DEFAULT_PARTITION
    this._window = null
    this._authorizationUrl = null
    this._closedPromise = Promise.resolve()
  }

  _isAllowedNavigation(value) {
    let target
    try {
      target = new URL(value)
    } catch {
      return false
    }
    if (target.origin === this._endpoint.origin) return true
    return target.origin === this._redirectUri.origin &&
      target.pathname === this._redirectUri.pathname
  }

  _fallbackToSystemBrowser() {
    const authorizationUrl = this._authorizationUrl
    if (!authorizationUrl) return
    Promise.resolve(this._shell.openExternal(authorizationUrl)).catch(() => {})
  }

  _handleClosed(window, resolveClosed) {
    if (this._window === window) this._window = null
    resolveClosed()
  }

  async open(url) {
    if (!this._isAllowedNavigation(url)) {
      throw new IdentityError('IDENTITY_AUTH_WINDOW_NAVIGATION_BLOCKED', '认证地址不属于已配置的 Logto 服务')
    }
    const previousClosed = this._closedPromise
    this.close()
    await previousClosed
    this._authorizationUrl = new URL(url).toString()

    const parent = this._getParentWindow()
    const authSession = this._session.fromPartition(this._partition, { cache: true })
    const denyDownload = (event) => event.preventDefault()
    authSession.on('will-download', denyDownload)
    authSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    const window = new this._BrowserWindow({
      width: 520,
      height: 720,
      minWidth: 420,
      minHeight: 620,
      show: false,
      modal: Boolean(parent),
      parent: parent || undefined,
      resizable: true,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      title: '登录 Multi-Publish',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: authSession,
      },
    })
    this._window = window
    let resolveClosed
    const closedPromise = new Promise((resolve) => { resolveClosed = resolve })
    this._closedPromise = closedPromise

    window.once('ready-to-show', () => {
      if (this._window === window && !window.isDestroyed?.()) window.show()
    })
    window.once('closed', () => {
      authSession.removeListener('will-download', denyDownload)
      authSession.setPermissionRequestHandler(null)
      this._handleClosed(window, resolveClosed)
    })

    const guardNavigation = (event, targetUrl) => {
      if (this._isAllowedNavigation(targetUrl)) return
      event.preventDefault()
      this._fallbackToSystemBrowser()
    }
    window.webContents.on('will-navigate', guardNavigation)
    window.webContents.on('will-redirect', guardNavigation)
    window.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
      if (!this._isAllowedNavigation(targetUrl)) this._fallbackToSystemBrowser()
      return { action: 'deny' }
    })

    const loadResult = await Promise.race([
      window.webContents.loadURL(url).then(
        () => ({ type: 'loaded' }),
        (error) => ({ type: 'failed', error }),
      ),
      closedPromise.then(() => ({ type: 'closed' })),
    ])
    if (loadResult.type === 'failed') {
      if (this._window === window && !window.isDestroyed?.()) window.close()
      throw new IdentityError('IDENTITY_AUTH_WINDOW_LOAD_FAILED', '登录页面加载失败', loadResult.error)
    }
  }

  waitForClosed() {
    return this._closedPromise
  }

  close() {
    const window = this._window
    if (!window) return
    if (typeof window.isDestroyed !== 'function' || !window.isDestroyed()) window.close()
  }
}

module.exports = { IdentityAuthWindow, DEFAULT_PARTITION }
