// @ts-check
/**
 * RpaViewManager session mixin — 窗口/会话管理
 *
 * 拆分自 rpa-view-manager.js (2026-07-16 架构重构)
 * 通过 Object.assign 注入 RpaViewManager.prototype，方法内通过 this.* 访问
 * 其他 mixin 提供的方法。
 *
 * 依赖：BrowserWindow / session / path / log
 */
const { BrowserWindow, session, app } = require('electron')
const path = require('path')
const log = require('./logger')
const { normalizeProxyConfig, toElectronProxyRules } = require('./proxy-config')
const { PLATFORM_LOGIN_URLS } = require('@multi-publish/shared-utils/src/platform-definitions')
const { restoreLocalStorage, restoreIndexedDB } = require('./auth-view-session')

const sessionMixin = {
  // ========== Window management ==========
  _createWindow(partition) {
    const win = new BrowserWindow({ show:false, width:1280, height:800, webPreferences:{ session:session.fromPartition(partition,{cache:true}), contextIsolation:true, nodeIntegration:false, sandbox:true, backgroundThrottling:false,preload:path.join(__dirname,'../stealth-preload.js') } })
    win.webContents.on('did-fail-load',function(e,code,desc){log.warn('RpaView','load fail: '+desc+' ('+code+')')})
    win.webContents.on('console-message',function(){})
    // anti-detection: inject stealth on every navigation
     
    // stealth injected via preload script
    return win
  },
  _windowKey(platform, accountId) { return 'rpa-'+platform+'-'+(accountId||'default')+'-'+(this._nextId++) },

  async _configureProxy(win, proxy) {
    const config = normalizeProxyConfig(proxy)
    if (!config) return function () {}
    const proxySession = win?.webContents?.session
    if (!proxySession || typeof proxySession.setProxy !== 'function') {
      throw new Error('浏览器会话不支持代理配置')
    }

    await proxySession.setProxy({ proxyRules: toElectronProxyRules(config) })
    log.info('RpaView', `Proxy configured (${config.type})`)

    if (!config.username) return function () {}
    if (!app || typeof app.on !== 'function' || typeof app.removeListener !== 'function') {
      throw new Error('当前运行环境不支持代理认证')
    }

    const loginHandler = (event, webContents, _details, authInfo, callback) => {
      if (webContents !== win.webContents || !authInfo?.isProxy || typeof callback !== 'function') return
      event.preventDefault()
      callback(config.username, config.password)
    }
    app.on('login', loginHandler)
    return () => app.removeListener('login', loginHandler)
  },

  // ========== Cookie / browser storage restore ==========
  async _restoreCookies(win, cookies) {
    if (!cookies||!cookies.length) return
    // eslint-disable-next-line no-unused-vars
    for (let ci=0;ci<cookies.length;ci++) { try { await win.webContents.session.cookies.set(cookies[ci]) } catch (e) { /* ignore */ } }
    log.info('RpaView','Restored '+cookies.length+' cookies')
  },
  async _restoreBrowserStorage(win, platform, authData) {
    const localStorage = authData?.localStorage
    const indexedDB = authData?.indexedDB
    const hasLocalStorage = Boolean(localStorage && typeof localStorage === 'object' && !Array.isArray(localStorage) && Object.keys(localStorage).length > 0)
    const hasIndexedDB = Boolean(indexedDB && typeof indexedDB === 'object' && !Array.isArray(indexedDB) && Object.keys(indexedDB).length > 0)
    if (!hasLocalStorage && !hasIndexedDB) return

    const restoreUrl = PLATFORM_LOGIN_URLS[platform]
    if (!restoreUrl || !win?.webContents || typeof win.webContents.loadURL !== 'function') {
      log.warn('RpaView', 'browser storage restore skipped: missing platform auth URL')
      return
    }

    const view = { webContents: win.webContents }
    const restorations = []
    if (hasLocalStorage) restorations.push(restoreLocalStorage(view, localStorage))
    if (hasIndexedDB) restorations.push(restoreIndexedDB(view, indexedDB))
    try {
      await win.webContents.loadURL(restoreUrl)
      await Promise.all(restorations)
      log.info('RpaView', 'browser storage restored')
    } catch (e) {
      log.warn('RpaView', 'browser storage restore: ' + e.message)
    }
  },
}

module.exports = sessionMixin
