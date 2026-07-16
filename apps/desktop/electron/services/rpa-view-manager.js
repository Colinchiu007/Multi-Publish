// @ts-check
/**
 * RpaViewManager -- executeJavaScript RPA engine
 *
 * P2-B: Generic publish engine with config-driven platform support.
 */
// eslint-disable-next-line no-unused-vars
const { BrowserWindow, session, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const log = require('./logger')
const { getConfigPath } = require('./config-resolver')
const PlatformConfig = require('@multi-publish/shared-utils/src/platform-config')
const { platformSelectors } = require('@multi-publish/rpa-engine')
const { supportsApi, publishViaApi } = require('@multi-publish/api-publish-engine')
const { STEALTH_SOURCE: _STEALTH_SOURCE } = require('./stealth-helper')

const { ProgressThrottle } = require('./rpa-progress-throttle')
const { FieldRetryState } = require('./rpa-field-retry')

let _platformConfigInstance
const PLATFORM_SUCCESS_PATTERNS = {}
const mediaId = null

// PRD F10.8: 文件 MIME 类型推断（JS File API 回退用）
function _guessMimeType (fileName) {
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
    pdf: 'application/pdf', txt: 'text/plain', json: 'application/json',
  }
  return map[ext] || 'application/octet-stream'
}

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
      try { this.mainWindow.webContents.send('rpa:progress', data) } catch (e) { /* ignore */ }
    }
    log.info('RpaView', '[' + platform + '] ' + stage)
  }

  // ========== P2-B: Config loading ==========
  _getPlatformConfig(platform) {
    if (!_platformConfigInstance) {
      _platformConfigInstance = new PlatformConfig(getConfigPath('platforms.yaml'))
    }
    const cfg = _platformConfigInstance.getPlatform(platform)
    if (!cfg) throw new Error('platform config not found: ' + platform)
    const sel = (platformSelectors.PLATFORM_PUBLISH_SELECTORS && platformSelectors.PLATFORM_PUBLISH_SELECTORS[platform]) || {}
    const rpa = cfg.rpa_config || {}
    const patterns = (rpa.success_patterns && rpa.success_patterns.length > 0) ? rpa.success_patterns : (PLATFORM_SUCCESS_PATTERNS[platform]||[])
    return { publish_url: cfg.publish_url||'', type: cfg.type||'article', has_api: cfg.has_api||false, selectors: sel, success_patterns: patterns, preFill: rpa.preFill||null, prePublishHook: rpa.prePublishHook||null, hookContext: rpa.hookContext||null, success_mode: rpa.success_mode||'url', success_selector: rpa.success_selector||null }
  }

  // ========== P2-B: Platform hooks ==========
  async _execHook(win, hookName, context) {
    switch (hookName) {
      case 'switchIframe':
        await this._waitForElement(win, (context&&context.iframeSelector)||'iframe', 10000); break
      case 'clickCreate':
        if (await this._click(win, (context&&context.createSelector)||'#create-icon')) {
          await this._sleep(2000)
          await this._click(win, (context&&context.uploadSelector)||'tp-yt-paper-item')
        }; break
      case 'clickWrite':
        await this._click(win, (context&&context.writeSelector)||'button:has-text("写文章")')
        await this._sleep(2000); break
      default: log.warn('RpaView', 'Unknown hook: ' + hookName)
    }
  }

  // ========== P2-D: Execute JavaScript in iframe context ==========
  async _execInFrame(win, frameSelector, jsCode) {
    const fs = JSON.stringify(frameSelector)
    return await win.webContents.executeJavaScript([
      '(function() {',
      '  let frame = document.querySelector(' + fs + ');',
      '  if (!frame) throw new Error("iframe not found");',
      '  let doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);',
      '  if (!doc) throw new Error("iframe cross-origin");',
      '  return (function() { ' + jsCode + ' }).call(doc);',
      '})()',
    ].join('\n'))
  }

  // ========== P2-D: Fill content inside iframe ==========
  async _fillInFrame(win, frameSelector, innerSelector, content) {
    // eslint-disable-next-line no-unused-vars
    const fs = JSON.stringify(frameSelector)
    const is_ = JSON.stringify(innerSelector)
    const sc = JSON.stringify(content)
    // 安全修复（2026-07-16）：iframe 内 innerHTML 也需净化，移除 script/on*= 事件
    return await this._execInFrame(win, frameSelector, [
      'let el = document.querySelector(' + is_ + ');',
      'if (!el) throw new Error("element not found in iframe");',
      'if (el.getAttribute("contenteditable") === "true") {',
      '  let tmp = document.createElement("div");',
      '  tmp.innerHTML = ' + sc + ';',
      '  tmp.querySelectorAll("script, iframe, object, embed").forEach(function(n){n.remove()});',
      '  tmp.querySelectorAll("*").forEach(function(n){[].forEach.call(n.attributes, function(a){if(a.name.toLowerCase().indexOf("on")===0)n.removeAttribute(a.name)})});',
      '  el.innerHTML = tmp.innerHTML;',
      '} else {',
      '  el.value = ' + sc + ';',
      '}',
      'el.dispatchEvent(new Event("input", { bubbles: true }));',
      'el.dispatchEvent(new Event("change", { bubbles: true }));',
      'return true;',
    ].join(' '))
  }

  // ========== 安全 DOM 操作 helper ==========
  /**
   * 安全设置元素 innerHTML 或 value — 统一用 JSON.stringify 转义参数
   * 避免 3 处重复的字符串拼接模式，确保内容中的引号/特殊字符被正确转义
   * 安全修复（2026-07-16）：innerHTML 模式下添加 HTML 净化，移除 <script>/<iframe>/on*= 事件处理器
   * @param {BrowserWindow} win
   * @param {string} selector - CSS 选择器
   * @param {string} content - 要设置的内容
   * @param {object} [opts] - { useInnerHTML: true 默认, dispatchEvents: true 默认 }
   */
  async _setElementContentSafe(win, selector, content, opts) {
    const useInnerHTML = !opts || opts.useInnerHTML !== false
    const dispatchEvents = !opts || opts.dispatchEvents !== false
    const sel = JSON.stringify(selector)
    const ct = JSON.stringify(content)
    const lines = [
      'let el = document.querySelector(' + sel + ');',
      'if (!el) return false;',
    ]
    if (useInnerHTML) {
      // 净化 HTML：移除 script/iframe/object/embed，移除所有 on*= 事件属性
      lines.push(
        'let tmp = document.createElement("div");',
        'tmp.innerHTML = ' + ct + ';',
        'tmp.querySelectorAll("script, iframe, object, embed, link[rel=import]").forEach(function(n){n.remove()});',
        'tmp.querySelectorAll("*").forEach(function(n){' +
          '[].forEach.call(n.attributes, function(a){ if(a.name.toLowerCase().indexOf("on")===0) n.removeAttribute(a.name) });' +
        '});',
        'el.innerHTML = tmp.innerHTML;'
      )
    } else {
      lines.push('el.value = ' + ct + ';')
    }
    if (dispatchEvents) {
      lines.push('el.dispatchEvent(new Event("input", { bubbles: true }));')
      lines.push('el.dispatchEvent(new Event("change", { bubbles: true }));')
    }
    lines.push('return true;')
    return await win.webContents.executeJavaScript('(function(){' + lines.join(' ') + '})()')
  }

  // ========== P2-B: Generic publish engine ==========
  async _publish_generic(win, article, platform, publishConfig) {
    const config = publishConfig || this._getPlatformConfig(platform)
    const sel = config.selectors
    const throttle = new ProgressThrottle(5000, 10)
    const retry = new FieldRetryState(3)

    if (!config.publish_url) return { success: false, error: platform+' no publish_url', platform: platform }

    this._emitProgress(platform, 'navigating...', 5)
    await this._navigateAndWait(win, config.publish_url, 3000)

    const curUrl = win.webContents.getURL()
    if (curUrl.includes('login')||curUrl.includes('passport')||curUrl.includes('signin'))
      return { success: false, error: platform+' not logged in', platform: platform }

    if (config.preFill) await this._execHook(win, config.preFill, config.hookContext)

    // title
    if (article.title && sel.title_input && sel.title_input.length > 0) {
      retry.addField('title')
      while (!retry.isDone('title')) {
        try {
          this._emitProgress(platform, 'filling title...', 20)
          if (await this._waitForElement(win, sel.title_input[0], 10000)) {
            await this._fillInput(win, sel.title_input[0], article.title); retry.markDone('title')
          }
        } catch(e) {
          log.warn('RpaView', '['+platform+'] title: '+e.message)
          if (!retry.retry('title')) break; await this._sleep(1000)
        }
      }
    }

    // content
    const cs = sel.editor || sel.content_textarea || sel.textarea
    if (article.content && cs && cs.length > 0) {
      retry.addField('content')
      while (!retry.isDone('content')) {
        try {
          this._emitProgress(platform, 'filling content...', 35)
          if (await this._waitForElement(win, cs[0], 10000)) {
            await this._fillInput(win, cs[0], article.content); retry.markDone('content')
          }
        } catch(e) {
          log.warn('RpaView', '['+platform+'] content: '+e.message)
          if (!retry.retry('content')) break; await this._sleep(1000)
        }
      }
    }

    // file upload
    if (article.video_path && sel.file_input && sel.file_input.length > 0) {
      retry.addField('file_upload')
      while (!retry.isDone('file_upload')) {
        try {
          this._emitProgress(platform, 'uploading file...', 50)
          if (await this._waitForElement(win, sel.file_input[0], 15000)) {
            await this._setFileInput(win, article.video_path)
            const done = await this._waitForCondition(win, 'function(){let p=document.querySelector(\'[class*="progress"],[class*="uploading"]\');let s=document.querySelector(\'[class*="success"],[class*="complete"]\');return !p||s!==null}', 300000)
            if (!done) log.warn('RpaView', '['+platform+'] upload timeout')
            retry.markDone('file_upload'); this._emitProgress(platform, 'file uploaded', 60)
          }
        } catch(e) {
          log.warn('RpaView', '['+platform+'] upload: '+e.message)
          if (!retry.retry('file_upload')) break; await this._sleep(2000)
        }
      }
    }

    // cover
    if (article.cover_path && sel.cover_input) {
      try { this._emitProgress(platform,'uploading cover...',65); await this._setFileInput(win,article.cover_path); await this._sleep(2000) } catch(e) { log.warn('RpaView','['+platform+'] cover: '+e.message) }
    }

    // tags
    if (article.tags && article.tags.length>0 && sel.tag_input && sel.tag_input.length>0) {
      for (let ti=0;ti<Math.min(article.tags.length,5);ti++) {
        try {
          this._emitProgress(platform,'adding tags...',72)
          await this._waitForElement(win,sel.tag_input[0],5000)
          await this._fillInput(win,sel.tag_input[0],article.tags[ti])
          await win.webContents.executeJavaScript('(function(){var s='+JSON.stringify(sel.tag_input[0])+';let el=document.querySelector(s);if(el)el.dispatchEvent(new KeyboardEvent(\'keydown\',{key:\'Enter\',code:\'Enter\',keyCode:13}))})()')
          await this._sleep(800)
        } catch(e) { log.warn('RpaView','['+platform+'] tag: '+e.message) }
      }
    }

    if (config.prePublishHook) await this._execHook(win, config.prePublishHook, config.hookContext)

    // publish button
    if (sel.publish_btn && sel.publish_btn.length>0) {
      retry.addField('publish')
      while (!retry.isDone('publish')) {
        try {
          this._emitProgress(platform,'publishing...',85)
          const rp = (config.has_api && config.success_patterns.length>0) ? this._waitForResponse(win,config.success_patterns,60000) : null
          if (!(await this._waitForElement(win,sel.publish_btn[0],10000))) throw new Error('publish btn not found')
          await this._click(win,sel.publish_btn[0])
          if (article.draft && sel.draft_btn) await this._click(win,sel.draft_btn)
          retry.markDone('publish')
          if (throttle.shouldReport(95)) this._emitProgress(platform,'verifying...',95)
          return await this._verifyPublishSuccess(win,platform,config,rp)
        } catch(e) {
          log.warn('RpaView','['+platform+'] publish btn: '+e.message)
          if (!retry.retry('publish')) return {success:false,error:e.message,platform:platform}
          await this._sleep(1500)
        }
      }
    }
    return {success:false,error:platform+' no publish_btn selector',platform:platform}
  }

  // ========== Verify publish success ==========
  async _verifyPublishSuccess(win, platform, config, responsePromise) {
    const mode = config.success_mode || 'url'
    // Mode: api — wait for matching API response
    if (mode === 'api' && responsePromise) {
      const r = await responsePromise
      if (r) { this._emitProgress(platform,'API success',100); return { success:true, url:win.webContents.getURL()||'', platform:platform } }
    }
    // Mode: url — wait for URL to leave publish page
    if (mode === 'url') {
      try {
        await this._sleep(5000)
        const url = win.webContents.getURL(), pubUrl = config.publish_url||''
        if (url && pubUrl && !url.includes(pubUrl) && !url.includes('login') && !url.includes('passport')) {
          this._emitProgress(platform,'URL changed',100); return { success:true, url:url, platform:platform }
        }
      } catch(e) { log.warn('RpaView','['+platform+'] URL check: '+e.message) }
    }
    // Mode: dom — wait for success DOM selector
    if (mode === 'dom') {
      const sel = config.success_selector || (config.selectors && config.selectors.success_selector)
      if (sel) {
        try {
          if (await this._waitForElement(win,sel,15000)) {
            this._emitProgress(platform,'DOM success',100); return { success:true, url:win.webContents.getURL()||'', platform:platform }
          }
        } catch(e) { log.warn('RpaView','['+platform+'] DOM check: '+e.message) }
      }
    }
    // Fallback: try all modes in order
    if (responsePromise) {
      const r = await responsePromise
      if (r) { this._emitProgress(platform,'API success',100); return { success:true, url:win.webContents.getURL()||'', platform:platform } }
    }
    try {
      await this._sleep(5000)
      const url2 = win.webContents.getURL(), pubUrl2 = config.publish_url||''
      if (url2 && pubUrl2 && !url2.includes(pubUrl2) && !url2.includes('login') && !url2.includes('passport')) {
        this._emitProgress(platform,'URL fallback',100); return { success:true, url:url2, platform:platform }
      }
    } catch(e) { log.warn('RpaView','['+platform+'] URL fallback: '+e.message) }
    return { success:false, error:'publish verification timeout', platform:platform }
  }

  // ========== Window management ==========
  _createWindow(partition) {
    const win = new BrowserWindow({ show:false, width:1280, height:800, webPreferences:{ session:session.fromPartition(partition,{cache:true}), contextIsolation:true, nodeIntegration:false, sandbox:true, backgroundThrottling:false,preload:path.join(__dirname,'../stealth-preload.js') } })
    win.webContents.on('did-fail-load',function(e,code,desc){log.warn('RpaView','load fail: '+desc+' ('+code+')')})
    win.webContents.on('console-message',function(){})
    // anti-detection: inject stealth on every navigation
     
    // stealth injected via preload script
    return win
  }
  _windowKey(platform, accountId) { return 'rpa-'+platform+'-'+(accountId||'default')+'-'+(this._nextId++) }

  // ========== Cookie / localStorage restore ==========
  async _restoreCookies(win, cookies) {
    if (!cookies||!cookies.length) return
    // eslint-disable-next-line no-unused-vars
    for (let ci=0;ci<cookies.length;ci++) { try { await win.webContents.session.cookies.set(cookies[ci]) } catch (e) { /* ignore */ } }
    log.info('RpaView','Restored '+cookies.length+' cookies')
  }
  async _restoreLocalStorage(win, ls) {
    if (!ls||!Object.keys(ls).length) return
    const j = JSON.stringify(ls)
    try { await win.webContents.executeJavaScript('(function(){let d='+j+';Object.keys(d).forEach(function(k){try{localStorage.setItem(k,d[k])}catch (e) { /* ignore */ }});return Object.keys(d).length})()'); log.info('RpaView','localStorage restored') } catch(e) { log.warn('RpaView','localStorage restore: '+e.message) }
  }

  // ========== executeJavaScript utilities ==========
  async _waitForElement(win, sel, timeout) {
    timeout = timeout||30000
    // eslint-disable-next-line no-unused-vars
    try { return await win.webContents.executeJavaScript('(function(){var s='+JSON.stringify(sel)+';return new Promise(function(r){let e=document.querySelector(s);if(e){r(true);return}let o=new MutationObserver(function(){let f=document.querySelector(s);if(f){o.disconnect();r(true)}});o.observe(document.body,{childList:true,subtree:true});setTimeout(function(){o.disconnect();r(false)},'+timeout+')})})()') } catch(e) { return false }
  }
  async _waitForCondition(win, fn, timeout, interval) {
    // R75 防护：fn 必须是硬编码函数字面量字符串，禁止拼接用户输入
    if (typeof fn !== 'string' || fn.length === 0) return false
    timeout=timeout||30000; interval=interval||500
    // eslint-disable-next-line no-unused-vars
    try { return await win.webContents.executeJavaScript('(function(){let c='+fn+';return new Promise(function(r){if(c()){r(true);return}let ch=setInterval(function(){if(c()){clearInterval(ch);clearTimeout(t);r(true)}},'+interval+');let t=setTimeout(function(){clearInterval(ch);r(false)},'+timeout+')})})()') } catch(e) { return false }
  }
  // 安全修复（2026-07-16）：condition-based-waiting helper，替代硬编码 setTimeout 纯等待
  // 轮询条件函数直到满足或超时，避免 waitForTimeout 反模式
  async _waitForFn(win, fn, timeout, interval) {
    if (typeof fn !== 'string' || fn.length === 0) return false
    timeout = timeout || 3000; interval = interval || 300
    return await this._waitForCondition(win, fn, timeout, interval)
  }
  // 统一的 sleep helper（标记需要后续改为 condition-based-waiting 的点）
  _sleep(ms) {
    return new Promise(function(r){const t=setTimeout(r,ms);if(t&&t.unref)t.unref()})
  }
  async _fillInput(win, sel, val) {
    const sv=JSON.stringify(val)
    // 安全修复（2026-07-16）：contenteditable 元素 innerHTML 净化，移除 script/on*= 事件
    return await win.webContents.executeJavaScript('(function(){var s='+JSON.stringify(sel)+';let el=document.querySelector(s);if(!el)throw new Error("input not found");if(el.getAttribute("contenteditable")==="true"){let tmp=document.createElement("div");tmp.innerHTML='+sv+';tmp.querySelectorAll("script, iframe, object, embed").forEach(function(n){n.remove()});tmp.querySelectorAll("*").forEach(function(n){[].forEach.call(n.attributes,function(a){if(a.name.toLowerCase().indexOf("on")===0)n.removeAttribute(a.name)})});el.innerHTML=tmp.innerHTML;el.dispatchEvent(new Event("input",{bubbles:true}));return}let ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value")?.set||Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value")?.set;if(ns)ns.call(el,'+sv+');else el.value='+sv+';el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));return true})()')
  }
  async _click(win, sel) {
    return await win.webContents.executeJavaScript('(function(){var s='+JSON.stringify(sel)+';let el=document.querySelector(s);if(!el)throw new Error("not found: "+s);el.click();return true})()')
  }

  // ========== CDP file upload ==========
  async _setFileInput(win, filePath) {
    if (!fs.existsSync(filePath)) throw new Error('File not found: '+filePath)
    const dbg = win.webContents.debugger
    // eslint-disable-next-line no-unused-vars
    try { await dbg.attach('1.3') } catch (e) { /* ignore */ }
    try {
      const fr = await dbg.sendCommand('Runtime.evaluate',{expression:'(function(){return document.querySelectorAll(\'input[type="file"]\').length>0?1:0})()',returnByValue:true})
      if (fr.result.value!==1) throw new Error('No file input found')
      const re = await dbg.sendCommand('Runtime.evaluate',{expression:'document.querySelector(\'input[type="file"]\')'})
      const nd = await dbg.sendCommand('DOM.requestNode',{objectId:re.result.objectId})
      await dbg.sendCommand('DOM.setFileInputFiles',{files:[path.resolve(filePath)],nodeId:nd.nodeId||nd})
      log.info('RpaView','CDP file: '+path.basename(filePath)); return true
    // eslint-disable-next-line no-unused-vars
    } catch (cdpErr) {
      // PRD F10.8: CDP 失败时回退到 JS File API / DataTransfer
      log.warn('RpaView', 'CDP upload failed, fallback to JS File API: ' + cdpErr.message)
      try { await dbg.detach() } catch (e) { /* ignore */ }
      return await this._setFileInputViaJs(win, filePath)
    } finally { try { await dbg.detach() } catch (e) { /* ignore */ } }
  }

  // PRD F10.8: JS File API 回退 — 读取文件为 Buffer，通过 DataTransfer 构造 File 并 dispatch change
  async _setFileInputViaJs(win, filePath) {
    const fsSync = require('fs')
    const buf = fsSync.readFileSync(filePath)
    const base64 = buf.toString('base64')
    const fileName = path.basename(filePath)
    const mimeType = _guessMimeType(fileName)
    // 在渲染进程内构造 File 并触发 input.change
    const js = '(function(){' +
      'var b64=' + JSON.stringify(base64) + ';' +
      'var name=' + JSON.stringify(fileName) + ';' +
      'var mime=' + JSON.stringify(mimeType) + ';' +
      'var bin=atob(b64);var n=bin.length;var bytes=new Uint8Array(n);' +
      'for(var i=0;i<n;i++)bytes[i]=bin.charCodeAt(i);' +
      'var file=new File([bytes],name,{type:mime});' +
      'var input=document.querySelector(\'input[type="file"]\');' +
      'if(!input)throw new Error("No file input found (JS fallback)");' +
      'var dt=new DataTransfer();dt.items.add(file);input.files=dt.files;' +
      'input.dispatchEvent(new Event("change",{bubbles:true}));' +
      'input.dispatchEvent(new Event("input",{bubbles:true}));' +
      'return true})()'
    await win.webContents.executeJavaScript(js)
    log.info('RpaView', 'JS File API fallback: ' + fileName)
    return true
  }

  // ========== Network response monitor ==========
  async _waitForResponse(win, patterns, timeout) {
    timeout = timeout||60000
    const session = win.webContents.session
    return new Promise(function(resolve) {
      let settled = false
      const t = setTimeout(function(){ cleanup(); resolve(null) }, timeout)
      if (t && t.unref) t.unref()
      const matched = []
      function cleanup() {
        try { session.webRequest.onCompleted({urls:['<all_urls>']}, null) } catch(e) { /* session may be destroyed */ }
      }
      session.webRequest.onCompleted({urls:['<all_urls>']}, function(d) {
        if (settled) return
        const url = d.url||''
        let hit = false
        for (let pi=0;pi<patterns.length;pi++){if(url.includes(patterns[pi])){hit=true;break}}
        if (!hit) return
        matched.push({url:url,statusCode:d.statusCode})
        if (d.statusCode===200) { settled=true; clearTimeout(t); cleanup(); resolve({url:url,statusCode:d.statusCode,matchedUrls:matched}) }
      })
      const fallbackTimer = setTimeout(function(){ if(!settled && matched.length>0){ settled=true; cleanup(); resolve({url:matched[0].url,statusCode:matched[0].statusCode,matchedUrls:matched}) } }, timeout+1000)
      if (fallbackTimer && fallbackTimer.unref) fallbackTimer.unref()
    })
  }

  // ========== Navigation ==========
  async _navigateAndWait(win, url, stabilizeMs) {
    stabilizeMs = stabilizeMs||3000
    return new Promise(function(resolve,reject) {
      const t = setTimeout(function(){reject(new Error('nav timeout: '+url))},45000)
      if (t && t.unref) t.unref()
      win.webContents.once('did-finish-load',function(){clearTimeout(t);setTimeout(function(){win.webContents.executeJavaScript('void(0)').then(resolve).catch(reject)},stabilizeMs)})
      win.webContents.once('did-fail-load',function(e,code,desc){clearTimeout(t);log.warn('RpaView','nav warn: '+desc);setTimeout(resolve,stabilizeMs)})
      // R49 修复：loadURL 返回 Promise，必须 .catch() 否则导航失败产生 unhandledRejection
      win.webContents.loadURL(url).catch(function (e) { clearTimeout(t); reject(e) })
    })
  }

  // ========== Platform-specific: douyin ==========
  async _publish_douyin(win, article) {
    // eslint-disable-next-line no-unused-vars
    const self = this
    this._emitProgress('douyin','navigating...',5)
    await this._navigateAndWait(win,'https://creator.douyin.com/creator-micro/content/upload')
    if (win.webContents.getURL().includes('login')) return {success:false,error:'douyin not logged in',platform:'douyin'}

    if (article.video_path) {
      this._emitProgress('douyin','uploading video...',20)
      if (!(await this._waitForElement(win,'input[type="file"]',15000))) return {success:false,error:'no file input',platform:'douyin'}
      await this._setFileInput(win,article.video_path)
      this._emitProgress('douyin','waiting upload...',30)
      const done = await this._waitForCondition(win,'function(){let p=document.querySelector(\'[class*="progress"]\');let s=document.querySelector(\'[class*="upload-success"],[class*="success"]\');return !p||s!==null}',300000)
      if (!done) log.warn('RpaView','douyin: upload timeout')
      this._emitProgress('douyin','video uploaded',50)
    }

    if (article.title) {
      this._emitProgress('douyin','filling title...',55)
      if (await this._waitForElement(win,'[class*="input"], [class*="title"]',10000)) {
        try {
          await this._fillInput(win,'[class*="input"]',article.title)
          await win.webContents.executeJavaScript('(function(){let inputs=document.querySelectorAll(\'[class*="input"],input,[contenteditable]\');for (let i=0;i<inputs.length;i++){let el=inputs[i];if(el.placeholder&&el.placeholder.indexOf("标题")!==-1){el.focus();let ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value")?.set;if(ns)ns.call(el,'+JSON.stringify(article.title)+');else el.value='+JSON.stringify(article.title)+';el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));break}}})()')
        } catch(e) { log.warn('RpaView','douyin title: '+e.message) }
      }
    }

    if (article.content) {
      this._emitProgress('douyin','filling desc...',65)
      try {
        const dj=JSON.stringify(article.content)
        // 安全修复（2026-07-16）：contenteditable 元素 innerHTML 净化
        await win.webContents.executeJavaScript('(function(){let els=document.querySelectorAll(\'textarea,[contenteditable="true"],[class*="description"],[class*="desc"]\');for (let i=0;i<els.length;i++){let el=els[i];if(el.tagName==="TEXTAREA"){el.value='+dj+';el.dispatchEvent(new Event("input",{bubbles:true}));break}else if(el.getAttribute("contenteditable")==="true"){let tmp=document.createElement("div");tmp.innerHTML='+dj+';tmp.querySelectorAll("script, iframe, object, embed").forEach(function(n){n.remove()});tmp.querySelectorAll("*").forEach(function(n){[].forEach.call(n.attributes,function(a){if(a.name.toLowerCase().indexOf("on")===0)n.removeAttribute(a.name)})});el.innerHTML=tmp.innerHTML;el.dispatchEvent(new Event("input",{bubbles:true}));break}}})()')
      } catch(e) { log.warn('RpaView','douyin desc: '+e.message) }
    }

    if (article.cover_path) {
      this._emitProgress('douyin','uploading cover...',75)
      try { if(await this._click(win,'[class*="cover"]')){await this._sleep(1000);await this._setFileInput(win,article.cover_path);await this._sleep(2000)} } catch(e) { log.warn('RpaView','douyin cover: '+e.message) }
    }

    if (article.tags && article.tags.length>0) {
      this._emitProgress('douyin','adding tags...',80)
      for (let ti=0;ti<article.tags.length;ti++) {
        try {
          await win.webContents.executeJavaScript('(function(){let ti=document.querySelectorAll(\'[class*="tag"] input,input[placeholder*="tag"],input[placeholder*="标签"]\');if(ti.length>0){let inp=ti[0];inp.value='+JSON.stringify(article.tags[ti])+';inp.dispatchEvent(new Event("input",{bubbles:true}));inp.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13}))}})()')
          await this._sleep(1000)
        } catch(e) { log.warn('RpaView','douyin tag: '+e.message) }
      }
    }

    this._emitProgress('douyin','publishing...',90)
    try {
      const rp = this._waitForResponse(win,['aweme/create','aweme/post'],60000)
      if (article.draft) await this._click(win,'button:has-text("草稿"), [class*="draft"]')
      else await this._click(win,'button:has-text("发布"), [class*="publish"]')
      const resp = await rp
      if (resp) { this._emitProgress('douyin','API success',100); return { success:true, url:win.webContents.getURL()||'', platform:'douyin' } }
      await this._sleep(5000)
      const fu=win.webContents.getURL()
      if (fu.includes('success')||fu.includes('publish/success')) return { success:true, url:fu||'', platform:'douyin' }
      return { success:false, error:'publish timeout', platform:'douyin' }
    } catch(e) { log.error('RpaView','douyin publish: '+e.message); return { success:false, error:e.message, platform:'douyin' } }
  }

  // eslint-disable-next-line no-unused-vars
  async _publish_wechat_mp(win, article) { return {success:false,error:'wechat_mp RPA pending',platform:'wechat_mp'} }
  // ========== P2-D: wechat_mp — iframe save-draft + mass-send ==========
  // eslint-disable-next-line no-dupe-class-members
  async _publish_wechat_mp(win, article) {
    this._emitProgress('wechat_mp','navigating to draft...',5)
    // Direct draft edit URL
    await this._navigateAndWait(win,'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=10&create=1',3000)

    const curUrl = win.webContents.getURL()
    if (curUrl.includes('login')||curUrl.includes('passport')||curUrl.includes('connect'))
      return { success:false, error:'wechat_mp not logged in', platform:'wechat_mp' }

    // Fill title
    if (article.title) {
      this._emitProgress('wechat_mp','filling title...',20)
      if (await this._waitForElement(win,'#title, input.weui-desktop-input',10000)) {
        await this._fillInput(win,'#title',article.title)
      }
    }

    // Fill content inside editor iframe
    if (article.content) {
      this._emitProgress('wechat_mp','filling content in iframe...',40)
      const iframeSel = 'iframe#ueditor_0, iframe[src*="ueditor"]'
      const contentSel = '#js_editor_content, .rich_media_area_primary_inner, [contenteditable="true"]'
      try {
        await this._waitForElement(win,iframeSel,15000)
        await this._fillInFrame(win,iframeSel,contentSel,article.content)
      } catch(e) {
        log.warn('RpaView','wechat_mp iframe content failed: '+e.message)
        // Fallback: try main frame editor
        // eslint-disable-next-line no-unused-vars
        try { await this._fillInput(win,contentSel,article.content) } catch (e) { /* ignore */ }
      }
    }

    // Fill author
    if (article.author) {
      // eslint-disable-next-line no-unused-vars
      try { await this._fillInput(win,'#author, input[name="author"]',article.author) } catch (e) { /* ignore */ }
    }

    // Check agreement
    this._emitProgress('wechat_mp','checking agreement...',60)
    try {
      await win.webContents.executeJavaScript("(function(){let cb=document.querySelector('.weui-desktop-btn_wrp .weui-desktop-checkbox input, input#js_agree');if(cb&&!cb.checked){cb.click()}})()")
    } catch(e) { log.warn('RpaView','wechat_mp agree: '+e.message) }

    // Save draft
    this._emitProgress('wechat_mp','saving draft...',70)
    try {
      await this._click(win,'a[data-action="save"], a#js_sync_save')
      await this._sleep(3000)
      const finalUrl = win.webContents.getURL()
      let mediaId = null
      const match = finalUrl.match(/appmsgid=(\d+)/)
      // eslint-disable-next-line no-unused-vars
      if (match) mediaId = match[1]
    } catch(e) {
      log.warn('RpaView','wechat_mp save: '+e.message)
    }

    // Mass send (群发)
    if (article.massSend && mediaId) {
      this._emitProgress('wechat_mp','mass sending...',85)
      try {
        await this._navigateAndWait(win,'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_list&type=10&action=list',2000)
        await win.webContents.executeJavaScript('(function(){var s='+JSON.stringify('[appmsgid="'+mediaId+'"]')+';let row=document.querySelector(s);if(row)row.click();})()')
        await this._sleep(1000)
        await this._click(win,'a.btn_masssend, a[data-action="masssend"]')
        await this._sleep(2000)
        await this._click(win,'.dialog_bd_btn a:has-text("确定"), .weui-desktop-btn:has-text("确定")')
        await this._sleep(3000)
      } catch(e) { log.warn('RpaView','wechat_mp mass send: '+e.message) }
    }

    this._emitProgress('wechat_mp','done',100)
    return { success:true, url:win.webContents.getURL()||'', platform:'wechat_mp' }
  }

  // ========== P2-D: youtube — multi-step wizard ==========
  async _publish_youtube(win, article) {
    this._emitProgress('youtube','navigating to Studio...',5)
    await this._navigateAndWait(win,'https://studio.youtube.com/',3000)

    const curUrl = win.webContents.getURL()
    if (curUrl.includes('signin')||curUrl.includes('login')||curUrl.includes('ServiceLogin'))
      return { success:false, error:'youtube not logged in', platform:'youtube' }

    if (!article.video_path)
      return { success:false, error:'youtube needs video file', platform:'youtube' }

    // Click Create → Upload video
    this._emitProgress('youtube','clicking Create...',10)
    const created = await this._click(win,'#create-icon, ytcp-button#create-icon')
    await this._sleep(2000)
    if (created) {
      await this._click(win,'tp-yt-paper-item:has-text("上传视频"), .ytcp-menu-item:has-text("上传视频")')
      await this._sleep(2000)
    }

    // Upload file
    this._emitProgress('youtube','uploading video...',25)
    if (await this._waitForElement(win,'input[type="file"]',15000)) {
      await this._setFileInput(win,article.video_path)
    }

    // Wait for upload to complete
    this._emitProgress('youtube','waiting for upload...',35)
    const uploaded = await this._waitForCondition(win, 'function(){let progress=document.querySelector(\'#progress-bar, [class*="progress"]\');let done=document.querySelector(\'#done-button, ytcp-button:has-text("下一步")\');return !progress||(done&&!done.disabled)}', 300000)
    if (!uploaded) log.warn('RpaView','youtube: upload wait timeout')
    this._emitProgress('youtube','upload complete',50)

    // Fill title
    if (article.title) {
      this._emitProgress('youtube','filling title...',55)
      if (await this._waitForElement(win,'#title-textarea, [class*="title"] input',10000)) {
        await this._fillInput(win,'#title-textarea, [class*="title"] input',article.title)
      }
    }

    // Fill description
    if (article.content) {
      this._emitProgress('youtube','filling description...',65)
      if (await this._waitForElement(win,'#description-textarea, [class*="description"] textarea',10000)) {
        await this._fillInput(win,'#description-textarea, [class*="description"] textarea',article.content)
      }
    }

    // Click Next (video elements)
    this._emitProgress('youtube','next step (elements)...',75)
    try {
      await this._click(win,'ytcp-button:has-text("下一步"), #next-button')
      await this._sleep(3000)
    } catch(e) { log.warn('RpaView','youtube: next1: '+e.message) }

    // Click Next (visibility/schedule)
    try {
      await this._click(win,'ytcp-button:has-text("下一步"), #next-button')
      await this._sleep(3000)
    } catch(e) { log.warn('RpaView','youtube: next2: '+e.message) }

    // Set visibility to Public
    try {
      await this._click(win,'tp-yt-paper-radio-button[name="PUBLIC"], #public-radio-button')
      await this._sleep(1000)
    } catch(e) { log.warn('RpaView','youtube: visibility: '+e.message) }

    // Click Publish
    this._emitProgress('youtube','publishing...',90)
    try {
      await this._click(win,'ytcp-button:has-text("发布"), #done-button')
      await this._sleep(5000)
    } catch(e) { log.warn('RpaView','youtube: publish btn: '+e.message) }

    this._emitProgress('youtube','done',100)
    return { success:true, url:win.webContents.getURL()||'', platform:'youtube' }
  }

  // eslint-disable-next-line no-unused-vars
  async _publish_xiaohongshu(win, article) { return {success:false,error:'xiaohongshu RPA pending',platform:'xiaohongshu'} }

  async _publish_zhihu(win, article) {
    this._emitProgress('zhihu','navigating to write page...',5)
    await this._navigateAndWait(win,'https://www.zhihu.com/creator/write')
    if (win.webContents.getURL().includes('signin')||win.webContents.getURL().includes('login'))
      return {success:false,error:'zhihu not logged in',platform:'zhihu'}
    this._emitProgress('zhihu','waiting for editor...',15)
    if (!(await this._waitForElement(win,'.WriteIndex-titleInput, .DraftEditor-title, .title-input, .Editable-title',15000)))
      return {success:false,error:'zhihu: editor not loaded',platform:'zhihu'}
    if (article.title) {
      this._emitProgress('zhihu','filling title...',30)
      try {
        const tj = JSON.stringify(article.title)
        await win.webContents.executeJavaScript("(function(){let ti=document.querySelector('.WriteIndex-titleInput, .DraftEditor-title, .title-input, .Editable-title');if(!ti)return false;ti.focus();ti.textContent="+tj+";ti.dispatchEvent(new Event('input',{bubbles:true}));ti.dispatchEvent(new Event('change',{bubbles:true}));return true;})()")
      } catch(e) { log.warn('RpaView','zhihu title: '+e.message) }
    }
    if (article.content) {
      this._emitProgress('zhihu','filling content...',50)
      try {
        await this._setElementContentSafe(win, '.DraftEditor-root, .Editable-editor, .ql-editor, [contenteditable="true"]', article.content)
      } catch(e) { log.warn('RpaView','zhihu content: '+e.message) }
    }
    this._emitProgress('zhihu','publishing...',80)
    try {
      const pubBtn = "button:has-text('\u53d1\u5e03'), .PublishPanel-publish"
      if (!(await this._waitForElement(win,pubBtn,10000)))
        return {success:false,error:'zhihu: publish button not found',platform:'zhihu'}
      if (article.draft) {
        const saveBtn = "button:has-text('\u4fdd\u5b58\u8349\u7a3f'), .WriteIndex-saveDraft"
        if (!(await this._waitForElement(win,saveBtn,5000)))
          return {success:false,error:'zhihu: save draft btn not found',platform:'zhihu'}
        await this._click(win,saveBtn)
        await this._sleep(2000)
        this._emitProgress('zhihu','draft saved',100)
        return {success:true,url:win.webContents.getURL()||'',platform:'zhihu',draft:true}
      }
      await this._click(win,pubBtn)
      this._emitProgress('zhihu','verifying...',95)
      await this._sleep(3000)
      const curUrl = win.webContents.getURL()
      if (curUrl.includes('success')||curUrl.includes('publish')||curUrl.includes('article')) {
        this._emitProgress('zhihu','published!',100)
        return {success:true,url:curUrl,platform:'zhihu'}
      }
      const panelGone = await win.webContents.executeJavaScript("(function(){let pb=document.querySelector('button:has-text(\u005c\u0022\\u53d1\\u5e03\u005c\u0022), .PublishPanel-publish');return !pb||getComputedStyle(pb).display==='none';})()")
      if (panelGone) {
        this._emitProgress('zhihu','published!',100)
        return {success:true,url:curUrl,platform:'zhihu'}
      }
      return {success:false,error:'zhihu: publish verification failed',platform:'zhihu'}
    } catch(e) {
      log.error('RpaView','zhihu publish: '+e.message)
      return {success:false,error:e.message,platform:'zhihu'}
    }
  }

  // ========== Main publish entry ==========
  async publish(platform, article, authData, timeout) {
    timeout = timeout||120000
    // API-first: if we have an API adapter for this platform, use it (no browser needed)
    if (supportsApi(platform)) {
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

  cleanup() {
    const ks = Object.keys(this.windows)
    // eslint-disable-next-line no-unused-vars
    for (let ki=0;ki<ks.length;ki++) { try { this.windows[ks[ki]].destroy() } catch (e) { /* ignore */ } }
    this.windows = {}; log.info('RpaView','cleaned up')
  }
}

module.exports = RpaViewManager
module.exports.ProgressThrottle = ProgressThrottle
module.exports.FieldRetryState = FieldRetryState
