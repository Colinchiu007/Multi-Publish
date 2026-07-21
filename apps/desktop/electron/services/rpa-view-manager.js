// @ts-check
/**
 * RpaViewManager -- executeJavaScript RPA engine
 *
 * P2-B: Generic publish engine with config-driven platform support.
 *
 * 架构重构（2026-07-16）：按职责拆分为 3 个 mixin，通过 Object.assign 注入 prototype。
 *   - rpa-view-helpers.js   — DOM 操作与等待工具（14 个 helper + _guessMimeType）
 *   - rpa-view-session.js   — 窗口/会话管理（_createWindow / _windowKey / cookies / localStorage）
 *   - rpa-view-platforms.js — 平台发布逻辑（_publish_* / _getPlatformConfig / _execHook / _verifyPublishSuccess）
 *
 * 主文件保留 6 个核心方法：constructor / setMainWindow / onProgress / _emitProgress / publish / cleanup
 *
 * 与 store/index.js 的 mixin 模式一致，保证 require('./rpa-view-manager') 接口不变。
 */
const log = require('./logger')
const { supportsApi, publishViaApi, apiRouter } = require('@multi-publish/api-publish-engine')
const { ProgressThrottle } = require('./rpa-progress-throttle')
const { FieldRetryState } = require('./rpa-field-retry')

const helpersMixin = require('./rpa-view-helpers')
const sessionMixin = require('./rpa-view-session')
const platformsMixin = require('./rpa-view-platforms')

class RpaViewManager {
  constructor() {
    this.mainWindow = null; this.windows = {}; this._nextId = 1
    this._progressCallback = null; this._responseListeners = {}
  }
  setMainWindow(win) { this.mainWindow = win }
  onProgress(cb) { this._progressCallback = cb }

  _emitProgress(platform, stage, percent) {
    const data = { platform: platform, stage: stage, percent: percent || 0 }
    // eslint-disable-next-line no-unused-vars
    if (this._progressCallback) { try { this._progressCallback(data) } catch (e) { /* ignore */ } }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      // eslint-disable-next-line no-unused-vars
      try { this.mainWindow.webContents.send('rpa:progress', data) } catch (e) { /* ignore */ } }
    log.info('RpaView', '[' + platform + '] ' + stage)
  }

  // ========== Main publish entry ==========
  async publish(platform, article, authData, timeout) {
    timeout = timeout||120000
    // API-first: if we have an API adapter for this platform, use it (no browser needed)
    const apiEnabled = apiRouter && typeof apiRouter.shouldUseApi === 'function'
      ? apiRouter.shouldUseApi(platform)
      : false
    if (apiEnabled && supportsApi(platform)) {
      this._emitProgress(platform,'using API publish engine...',5)
      try {
        const cookie = authData?.cookies
          ? (Array.isArray(authData.cookies)
            ? authData.cookies.map(c => c.name + '=' + c.value).join('; ')
            : authData.cookies)
          : '';
        const apiResult = await Promise.race([
          publishViaApi(platform, article, cookie, {
            onProgress: (pct, msg) => this._emitProgress(platform, msg, pct)
          }),
          new Promise(function(_, rj) { const _t = setTimeout(function() { rj(new Error('API timeout (' + (timeout/1000) + 's)')) }, timeout); if (_t && _t.unref) _t.unref() })
        ]);
        return apiResult;
      } catch(e) {
        log.error('RpaView', 'API publish ' + platform + ': ' + e.message);
        // Fall back to RPA if API fails
        log.warn('RpaView', 'API failed, falling back to RPA for ' + platform);
      }
    }
    // RPA path (existing)
    const key = this._windowKey(platform, article&&article.accountId)
    const partition = 'persist:rpa-'+key
    this._emitProgress(platform,'starting browser...',0)
    const win = this._createWindow(partition)
    this.windows[key] = win
    try {
      if (authData&&authData.cookies) { await this._restoreCookies(win,authData.cookies); this._emitProgress(platform,'cookies restored',2) }
      const mn = '_publish_'+platform
      if (typeof this[mn]==='function') return await Promise.race([this[mn](win,article),new Promise(function(_,rj){const _t=setTimeout(function(){rj(new Error('timeout ('+(timeout/1000)+'s)'))},timeout);if(_t&&_t.unref)_t.unref()})])
      const cfg = this._getPlatformConfig(platform)
      return await Promise.race([this._publish_generic(win,article,platform,cfg),new Promise(function(_,rj){const _t=setTimeout(function(){rj(new Error('timeout ('+(timeout/1000)+'s)'))},timeout);if(_t&&_t.unref)_t.unref()})])
    } catch(e) { log.error('RpaView','publish '+platform+': '+e.message); return { success:false, error:e.message, platform:platform } }
    // eslint-disable-next-line no-unused-vars
    finally { try { win.destroy() } catch (e) { /* ignore */ }; delete this.windows[key] }
  }

  cancel(platform, accountId) {
    const key = this._windowKey(platform, accountId)
    const win = this.windows[key]
    if (!win) return false
    try { win.destroy() } catch (e) { /* ignore */ }
    delete this.windows[key]
    return true
  }

  cleanup() {
    const ks = Object.keys(this.windows)
    // eslint-disable-next-line no-unused-vars
    for (let ki=0;ki<ks.length;ki++) { try { this.windows[ks[ki]].destroy() } catch (e) { /* ignore */ } }
    this.windows = {}; log.info('RpaView','cleaned up')
  }
}

// 把 3 个 mixin 方法注入 RpaViewManager.prototype
Object.assign(RpaViewManager.prototype, helpersMixin, sessionMixin, platformsMixin)

module.exports = RpaViewManager
module.exports.ProgressThrottle = ProgressThrottle
module.exports.FieldRetryState = FieldRetryState
