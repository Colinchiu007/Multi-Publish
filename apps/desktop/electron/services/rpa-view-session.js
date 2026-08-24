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
    let restored = 0
    // eslint-disable-next-line no-unused-vars
    for (let ci=0;ci<cookies.length;ci++) {
      const c = cookies[ci] || {}
      try {
        const setArgs = { name: c.name, value: c.value, path: c.path || '/' }
        if (typeof c.secure === 'boolean') setArgs.secure = c.secure
        if (typeof c.httpOnly === 'boolean') setArgs.httpOnly = c.httpOnly
        if (typeof c.expirationDate === 'number' && Number.isFinite(c.expirationDate)) setArgs.expirationDate = c.expirationDate
        if (typeof c.sameSite === 'string' && c.sameSite) setArgs.sameSite = c.sameSite
        if (typeof c.url === 'string' && c.url) {
          setArgs.url = c.url
        } else if (typeof c.domain === 'string' && c.domain) {
          // Electron cookies.set requires url (v40+); keep domain to preserve domain-scoped cookie
          setArgs.url = (c.secure ? 'https' : 'http') + '://' + c.domain.replace(/^\./, '') + '/'
          setArgs.domain = c.domain
        } else {
          continue
        }
        await win.webContents.session.cookies.set(setArgs)
        restored += 1
      } catch (e) { /* ignore invalid cookie */ }
    }
    log.info('RpaView','Restored '+restored+'/'+cookies.length+' cookies')
  },

  // 从最新登录分区补充完整 cookie（登录会话是最权威来源，可补回凭证过滤丢掉的父域 cookie 如 BDUSS）
  async _restoreAuthPartitionCookies(win, platform, accountId) {
    try {
      const fs = require('fs')
      const roots = [
        path.join(app.getPath('userData'), 'session', 'Partitions'),
        path.join(app.getPath('userData'), 'Partitions'),
      ]
      const prefix = 'auth-auth-' + platform + '-'
      let latestDir = null
      for (const root of roots) {
        if (!fs.existsSync(root)) continue
        let names = []
        try { names = fs.readdirSync(root) } catch (_) { continue }
        const candidates = names
          .filter(function (name) { return name.startsWith(prefix) })
          .filter(function (name) {
            try { return fs.statSync(path.join(root, name)).isDirectory() } catch (_) { return false }
          })
          .sort()
        if (candidates.length > 0) {
          latestDir = path.join(root, candidates[candidates.length - 1])
          break
        }
      }
      if (!latestDir) {
        log.info('RpaView', '[' + platform + '] no auth partition to supplement cookies')
        return 0
      }
      const partitionName = path.basename(latestDir)
      const authSession = session.fromPartition('persist:' + partitionName)
      const cookies = await authSession.cookies.get({})
      let restored = 0
      for (let ci = 0; ci < cookies.length; ci++) {
        const c = cookies[ci] || {}
        try {
          const setArgs = { name: c.name, value: c.value, path: c.path || '/' }
          if (typeof c.secure === 'boolean') setArgs.secure = c.secure
          if (typeof c.httpOnly === 'boolean') setArgs.httpOnly = c.httpOnly
          if (typeof c.expirationDate === 'number' && Number.isFinite(c.expirationDate)) setArgs.expirationDate = c.expirationDate
          if (typeof c.sameSite === 'string' && c.sameSite) setArgs.sameSite = c.sameSite
          setArgs.url = (c.secure ? 'https' : 'http') + '://' + c.domain.replace(/^\./, '') + '/'
          setArgs.domain = c.domain
          await win.webContents.session.cookies.set(setArgs)
          restored += 1
        } catch (e) { /* ignore invalid cookie */ }
      }
      log.info('RpaView', '[' + platform + '] supplemented ' + restored + '/' + cookies.length + ' cookies from auth partition ' + partitionName)
      return restored
    } catch (e) {
      log.warn('RpaView', '[' + platform + '] auth partition cookie supplement failed: ' + e.message)
      return 0
    }
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
