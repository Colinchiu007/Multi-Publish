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
const { BrowserWindow, session } = require('electron')
const path = require('path')
const log = require('./logger')

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

  // ========== Cookie / localStorage restore ==========
  async _restoreCookies(win, cookies) {
    if (!cookies||!cookies.length) return
    // eslint-disable-next-line no-unused-vars
    for (let ci=0;ci<cookies.length;ci++) { try { await win.webContents.session.cookies.set(cookies[ci]) } catch (e) { /* ignore */ } }
    log.info('RpaView','Restored '+cookies.length+' cookies')
  },
  async _restoreLocalStorage(win, ls) {
    if (!ls||!Object.keys(ls).length) return
    const j = JSON.stringify(ls)
    try { await win.webContents.executeJavaScript('(function(){let d='+j+';Object.keys(d).forEach(function(k){try{localStorage.setItem(k,d[k])}catch (e) { /* ignore */ }});return Object.keys(d).length})()'); log.info('RpaView','localStorage restored') } catch(e) { log.warn('RpaView','localStorage restore: '+e.message) }
  },
}

module.exports = sessionMixin
