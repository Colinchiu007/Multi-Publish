/**
 * RpaViewManager -- executeJavaScript RPA engine
 *
 * P2-B: Generic publish engine with config-driven platform support.
 */
const { BrowserWindow, session, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const log = require('./logger')
const PlatformConfig = require('@multi-publish/shared-utils/src/platform-config')
const { platformSelectors } = require('@multi-publish/rpa-engine')
const { STEALTH_SOURCE } = require('./stealth-helper')

// ---- ProgressThrottle (Python base.py port) ----
class ProgressThrottle {
  constructor(minInterval, minPercentDelta) {
    this._lastTime = 0; this._lastPercent = 0
    this._minInterval = minInterval || 5000
    this._minPercentDelta = minPercentDelta || 10
  }
  shouldReport(percent) {
    if (percent === 100) return true
    if (percent - this._lastPercent < this._minPercentDelta && Date.now() - this._lastTime < this._minInterval) return false
    this._lastTime = Date.now(); this._lastPercent = percent; return true
  }
  reset() { this._lastTime = 0; this._lastPercent = 0 }
}

// ---- FieldRetryState (Python FieldRetryMap port) ----
class FieldRetryState {
  constructor(retryCount) { this._retryCount = retryCount || 3; this._map = {} }
  addField(name) { if (!(name in this._map)) this._map[name] = 0 }
  markDone(name) { this._map[name] = this._retryCount }
  retry(name) { if (!(name in this._map)) return false; this._map[name]++; return this._map[name] < this._retryCount }
  isDone(name) { return (this._map[name] || this._retryCount) >= this._retryCount }
  get unfinishedFields() { var t=this; return Object.keys(this._map).filter(function(n){return t._map[n]<t._retryCount}) }
  get hasUnfinished() { var t=this; return Object.values(this._map).some(function(c){return c<t._retryCount}) }
  get allDone() { return !this.hasUnfinished }
  get exhaustedFields() { var t=this; return Object.keys(this._map).filter(function(n){return t._map[n]===t._retryCount-1}) }
}

var PLATFORM_SUCCESS_PATTERNS = {
  douyin: ['aweme/create', 'aweme/post', 'upload/auth'],
  weibo: ['publish/mblog', 'statuses/share'],
  bilibili: ['video/recommend', 'archive/publish'],
  youtube: ['/upload', 'youtubei/v1/upload'],
  tiktok: ['/upload/', 'post/publish'],
}
var _platformConfigInstance = null

class RpaViewManager {
  constructor() {
    this.mainWindow = null; this.windows = {}; this._nextId = 1
    this._progressCallback = null; this._responseListeners = {}
  }
  setMainWindow(win) { this.mainWindow = win }
  onProgress(cb) { this._progressCallback = cb }

  _emitProgress(platform, stage, percent) {
    var data = { platform: platform, stage: stage, percent: percent || 0 }
    if (this._progressCallback) { try { this._progressCallback(data) } catch(e) {} }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try { this.mainWindow.webContents.send('rpa:progress', data) } catch(e) {}
    }
    log.info('RpaView', '[' + platform + '] ' + stage)
  }

  // ========== P2-B: Config loading ==========
  _getPlatformConfig(platform) {
    if (!_platformConfigInstance) {
      _platformConfigInstance = new PlatformConfig(path.join(__dirname, '..', '..', '..', 'config', 'platforms.yaml'))
    }
    var cfg = _platformConfigInstance.getPlatform(platform)
    if (!cfg) throw new Error('platform config not found: ' + platform)
    var sel = (platformSelectors.PLATFORM_PUBLISH_SELECTORS && platformSelectors.PLATFORM_PUBLISH_SELECTORS[platform]) || {}
    var rpa = cfg.rpa_config || {}
    var patterns = (rpa.success_patterns && rpa.success_patterns.length > 0) ? rpa.success_patterns : (PLATFORM_SUCCESS_PATTERNS[platform]||[])
    return { publish_url: cfg.publish_url||'', type: cfg.type||'article', has_api: cfg.has_api||false, selectors: sel, success_patterns: patterns, preFill: rpa.preFill||null, prePublishHook: rpa.prePublishHook||null, hookContext: rpa.hookContext||null, success_mode: rpa.success_mode||'url', success_selector: rpa.success_selector||null }
  }

  // ========== P2-B: Platform hooks ==========
  async _execHook(win, hookName, context) {
    switch (hookName) {
      case 'switchIframe':
        await this._waitForElement(win, (context&&context.iframeSelector)||'iframe', 10000); break
      case 'clickCreate':
        if (await this._click(win, (context&&context.createSelector)||'#create-icon')) {
          await new Promise(function(r){setTimeout(r,2000)})
          await this._click(win, (context&&context.uploadSelector)||'tp-yt-paper-item')
        }; break
      case 'clickWrite':
        await this._click(win, (context&&context.writeSelector)||'button:has-text("写文章")')
        await new Promise(function(r){setTimeout(r,2000)}); break
      default: log.warn('RpaView', 'Unknown hook: ' + hookName)
    }
  }

  // ========== P2-D: Execute JavaScript in iframe context ==========
  async _execInFrame(win, frameSelector, jsCode) {
    var fs = JSON.stringify(frameSelector)
    return await win.webContents.executeJavaScript([
      '(function() {',
      '  var frame = document.querySelector(' + fs + ');',
      '  if (!frame) throw new Error("iframe not found");',
      '  var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);',
      '  if (!doc) throw new Error("iframe cross-origin");',
      '  return (function() { ' + jsCode + ' }).call(doc);',
      '})()',
    ].join('\n'))
  }

  // ========== P2-D: Fill content inside iframe ==========
  async _fillInFrame(win, frameSelector, innerSelector, content) {
    var fs = JSON.stringify(frameSelector)
    var is_ = JSON.stringify(innerSelector)
    var sc = JSON.stringify(content)
    return await this._execInFrame(win, frameSelector, [
      'var el = document.querySelector(' + is_ + ');',
      'if (!el) throw new Error("element not found in iframe");',
      'if (el.getAttribute("contenteditable") === "true") {',
      '  el.innerHTML = ' + sc + ';',
      '} else {',
      '  el.value = ' + sc + ';',
      '}',
      'el.dispatchEvent(new Event("input", { bubbles: true }));',
      'el.dispatchEvent(new Event("change", { bubbles: true }));',
      'return true;',
    ].join(' '))
  }

  // ========== P2-B: Generic publish engine ==========
  async _publish_generic(win, article, platform, publishConfig) {
    var config = publishConfig || this._getPlatformConfig(platform)
    var sel = config.selectors
    var throttle = new ProgressThrottle(5000, 10)
    var retry = new FieldRetryState(3)

    if (!config.publish_url) return { success: false, error: platform+' no publish_url', platform: platform }

    this._emitProgress(platform, 'navigating...', 5)
    await this._navigateAndWait(win, config.publish_url, 3000)

    var curUrl = win.webContents.getURL()
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
          if (!retry.retry('title')) break; await new Promise(function(r){setTimeout(r,1000)})
        }
      }
    }

    // content
    var cs = sel.editor || sel.content_textarea || sel.textarea
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
          if (!retry.retry('content')) break; await new Promise(function(r){setTimeout(r,1000)})
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
            var done = await this._waitForCondition(win, 'function(){var p=document.querySelector(\'[class*="progress"],[class*="uploading"]\');var s=document.querySelector(\'[class*="success"],[class*="complete"]\');return !p||s!==null}', 300000)
            if (!done) log.warn('RpaView', '['+platform+'] upload timeout')
            retry.markDone('file_upload'); this._emitProgress(platform, 'file uploaded', 60)
          }
        } catch(e) {
          log.warn('RpaView', '['+platform+'] upload: '+e.message)
          if (!retry.retry('file_upload')) break; await new Promise(function(r){setTimeout(r,2000)})
        }
      }
    }

    // cover
    if (article.cover_path && sel.cover_input) {
      try { this._emitProgress(platform,'uploading cover...',65); await this._setFileInput(win,article.cover_path); await new Promise(function(r){setTimeout(r,2000)}) } catch(e) { log.warn('RpaView','['+platform+'] cover: '+e.message) }
    }

    // tags
    if (article.tags && article.tags.length>0 && sel.tag_input && sel.tag_input.length>0) {
      for (var ti=0;ti<Math.min(article.tags.length,5);ti++) {
        try {
          this._emitProgress(platform,'adding tags...',72)
          await this._waitForElement(win,sel.tag_input[0],5000)
          await this._fillInput(win,sel.tag_input[0],article.tags[ti])
          await win.webContents.executeJavaScript('(function(){var el=document.querySelector(\''+sel.tag_input[0]+'\');if(el)el.dispatchEvent(new KeyboardEvent(\'keydown\',{key:\'Enter\',code:\'Enter\',keyCode:13}))})()')
          await new Promise(function(r){setTimeout(r,800)})
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
          var rp = (config.has_api && config.success_patterns.length>0) ? this._waitForResponse(win,config.success_patterns,60000) : null
          if (!(await this._waitForElement(win,sel.publish_btn[0],10000))) throw new Error('publish btn not found')
          await this._click(win,sel.publish_btn[0])
          if (article.draft && sel.draft_btn) await this._click(win,sel.draft_btn)
          retry.markDone('publish')
          if (throttle.shouldReport(95)) this._emitProgress(platform,'verifying...',95)
          return await this._verifyPublishSuccess(win,platform,config,rp)
        } catch(e) {
          log.warn('RpaView','['+platform+'] publish btn: '+e.message)
          if (!retry.retry('publish')) return {success:false,error:e.message,platform:platform}
          await new Promise(function(r){setTimeout(r,1500)})
        }
      }
    }
    return {success:false,error:platform+' no publish_btn selector',platform:platform}
  }

  // ========== Verify publish success ==========
  async _verifyPublishSuccess(win, platform, config, responsePromise) {
    var mode = config.success_mode || 'url'
    // Mode: api — wait for matching API response
    if (mode === 'api' && responsePromise) {
      var r = await responsePromise
      if (r) { this._emitProgress(platform,'API success',100); return { success:true, url:win.webContents.getURL()||'', platform:platform } }
    }
    // Mode: url — wait for URL to leave publish page
    if (mode === 'url') {
      try {
        await new Promise(function(r){setTimeout(r,5000)})
        var url = win.webContents.getURL(), pubUrl = config.publish_url||''
        if (url && pubUrl && !url.includes(pubUrl) && !url.includes('login') && !url.includes('passport')) {
          this._emitProgress(platform,'URL changed',100); return { success:true, url:url, platform:platform }
        }
      } catch(e) { log.warn('RpaView','['+platform+'] URL check: '+e.message) }
    }
    // Mode: dom — wait for success DOM selector
    if (mode === 'dom') {
      var sel = config.success_selector || (config.selectors && config.selectors.success_selector)
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
      var r = await responsePromise
      if (r) { this._emitProgress(platform,'API success',100); return { success:true, url:win.webContents.getURL()||'', platform:platform } }
    }
    try {
      await new Promise(function(r){setTimeout(r,5000)})
      var url2 = win.webContents.getURL(), pubUrl2 = config.publish_url||''
      if (url2 && pubUrl2 && !url2.includes(pubUrl2) && !url2.includes('login') && !url2.includes('passport')) {
        this._emitProgress(platform,'URL fallback',100); return { success:true, url:url2, platform:platform }
      }
    } catch(e) { log.warn('RpaView','['+platform+'] URL fallback: '+e.message) }
    return { success:false, error:'publish verification timeout', platform:platform }
  }

  // ========== Window management ==========
  _createWindow(partition) {
    var win = new BrowserWindow({ show:false, width:1280, height:800, webPreferences:{ session:session.fromPartition(partition,{cache:true}), contextIsolation:true, nodeIntegration:false, backgroundThrottling:false } })
    win.webContents.on('did-fail-load',function(e,code,desc){log.warn('RpaView','load fail: '+desc+' ('+code+')')})
    win.webContents.on('console-message',function(){})
    // anti-detection: inject stealth on every navigation
    win.webContents.on('did-finish-load',function(){ win.webContents.executeJavaScript(STEALTH_SOURCE).catch(function(){}) })
    return win
  }
  _windowKey(platform, accountId) { return 'rpa-'+platform+'-'+(accountId||'default')+'-'+(this._nextId++) }

  // ========== Cookie / localStorage restore ==========
  async _restoreCookies(win, cookies) {
    if (!cookies||!cookies.length) return
    for (var ci=0;ci<cookies.length;ci++) { try { await win.webContents.session.cookies.set(cookies[ci]) } catch(e) {} }
    log.info('RpaView','Restored '+cookies.length+' cookies')
  }
  async _restoreLocalStorage(win, ls) {
    if (!ls||!Object.keys(ls).length) return
    var j = JSON.stringify(ls)
    try { await win.webContents.executeJavaScript('(function(){var d='+j+';Object.keys(d).forEach(function(k){try{localStorage.setItem(k,d[k])}catch(e){}});return Object.keys(d).length})()'); log.info('RpaView','localStorage restored') } catch(e) { log.warn('RpaView','localStorage restore: '+e.message) }
  }

  // ========== executeJavaScript utilities ==========
  async _waitForElement(win, sel, timeout) {
    timeout = timeout||30000
    try { return await win.webContents.executeJavaScript('(function(){return new Promise(function(r){var e=document.querySelector(\''+sel+'\');if(e){r(true);return}var o=new MutationObserver(function(){var f=document.querySelector(\''+sel+'\');if(f){o.disconnect();r(true)}});o.observe(document.body,{childList:true,subtree:true});setTimeout(function(){o.disconnect();r(false)},'+timeout+')})})()') } catch(e) { return false }
  }
  async _waitForCondition(win, fn, timeout, interval) {
    timeout=timeout||30000; interval=interval||500
    try { return await win.webContents.executeJavaScript('(function(){var c='+fn+';return new Promise(function(r){if(c()){r(true);return}var ch=setInterval(function(){if(c()){clearInterval(ch);clearTimeout(t);r(true)}},'+interval+');var t=setTimeout(function(){clearInterval(ch);r(false)},'+timeout+')})})()') } catch(e) { return false }
  }
  async _fillInput(win, sel, val) {
    var sv=JSON.stringify(val)
    return await win.webContents.executeJavaScript('(function(){var el=document.querySelector(\''+sel+'\');if(!el)throw new Error("input not found");if(el.getAttribute("contenteditable")==="true"){el.innerHTML='+sv+';el.dispatchEvent(new Event("input",{bubbles:true}));return}var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value")?.set||Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value")?.set;if(ns)ns.call(el,'+sv+');else el.value='+sv+';el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));return true})()')
  }
  async _click(win, sel) {
    return await win.webContents.executeJavaScript('(function(){var el=document.querySelector(\''+sel+'\');if(!el)throw new Error("not found: "+"'+sel+'");el.click();return true})()')
  }

  // ========== CDP file upload ==========
  async _setFileInput(win, filePath) {
    if (!fs.existsSync(filePath)) throw new Error('File not found: '+filePath)
    var dbg = win.webContents.debugger
    try { await dbg.attach('1.3') } catch(e) {}
    try {
      var fr = await dbg.sendCommand('Runtime.evaluate',{expression:'(function(){return document.querySelectorAll(\'input[type="file"]\').length>0?1:0})()',returnByValue:true})
      if (fr.result.value!==1) throw new Error('No file input found')
      var re = await dbg.sendCommand('Runtime.evaluate',{expression:'document.querySelector(\'input[type="file"]\')'})
      var nd = await dbg.sendCommand('DOM.requestNode',{objectId:re.result.objectId})
      await dbg.sendCommand('DOM.setFileInputFiles',{files:[path.resolve(filePath)],nodeId:nd.nodeId||nd})
      log.info('RpaView','CDP file: '+path.basename(filePath)); return true
    } finally { try { await dbg.detach() } catch(e) {} }
  }

  // ========== Network response monitor ==========
  async _waitForResponse(win, patterns, timeout) {
    timeout = timeout||60000
    return new Promise(function(resolve) {
      var t = setTimeout(function(){resolve(null)}, timeout)
      var matched = []
      win.webContents.session.webRequest.onCompleted({urls:['<all_urls>']}, function(d) {
        var url = d.url||'', hit = false
        for (var pi=0;pi<patterns.length;pi++){if(url.includes(patterns[pi])){hit=true;break}}
        if (!hit) return
        matched.push({url:url,statusCode:d.statusCode})
        if (d.statusCode===200) { clearTimeout(t); resolve({url:url,statusCode:d.statusCode,matchedUrls:matched}) }
      })
      setTimeout(function(){if(matched.length>0)resolve({url:matched[0].url,statusCode:matched[0].statusCode,matchedUrls:matched})}, timeout+1000)
    })
  }

  // ========== Navigation ==========
  async _navigateAndWait(win, url, stabilizeMs) {
    stabilizeMs = stabilizeMs||3000
    return new Promise(function(resolve,reject) {
      var t = setTimeout(function(){reject(new Error('nav timeout: '+url))},45000)
      win.webContents.once('did-finish-load',function(){clearTimeout(t);setTimeout(function(){win.webContents.executeJavaScript('void(0)').then(resolve).catch(reject)},stabilizeMs)})
      win.webContents.once('did-fail-load',function(e,code,desc){clearTimeout(t);log.warn('RpaView','nav warn: '+desc);setTimeout(resolve,stabilizeMs)})
      win.webContents.loadURL(url)
    })
  }

  // ========== Platform-specific: douyin ==========
  async _publish_douyin(win, article) {
    var self = this
    this._emitProgress('douyin','navigating...',5)
    await this._navigateAndWait(win,'https://creator.douyin.com/creator-micro/content/upload')
    if (win.webContents.getURL().includes('login')) return {success:false,error:'douyin not logged in',platform:'douyin'}

    if (article.video_path) {
      this._emitProgress('douyin','uploading video...',20)
      if (!(await this._waitForElement(win,'input[type="file"]',15000))) return {success:false,error:'no file input',platform:'douyin'}
      await this._setFileInput(win,article.video_path)
      this._emitProgress('douyin','waiting upload...',30)
      var done = await this._waitForCondition(win,'function(){var p=document.querySelector(\'[class*="progress"]\');var s=document.querySelector(\'[class*="upload-success"],[class*="success"]\');return !p||s!==null}',300000)
      if (!done) log.warn('RpaView','douyin: upload timeout')
      this._emitProgress('douyin','video uploaded',50)
    }

    if (article.title) {
      this._emitProgress('douyin','filling title...',55)
      if (await this._waitForElement(win,'[class*="input"], [class*="title"]',10000)) {
        try {
          await this._fillInput(win,'[class*="input"]',article.title)
          await win.webContents.executeJavaScript('(function(){var inputs=document.querySelectorAll(\'[class*="input"],input,[contenteditable]\');for(var i=0;i<inputs.length;i++){var el=inputs[i];if(el.placeholder&&el.placeholder.indexOf("标题")!==-1){el.focus();var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value")?.set;if(ns)ns.call(el,'+JSON.stringify(article.title)+');else el.value='+JSON.stringify(article.title)+';el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));break}}})()')
        } catch(e) { log.warn('RpaView','douyin title: '+e.message) }
      }
    }

    if (article.content) {
      this._emitProgress('douyin','filling desc...',65)
      try {
        var dj=JSON.stringify(article.content)
        await win.webContents.executeJavaScript('(function(){var els=document.querySelectorAll(\'textarea,[contenteditable="true"],[class*="description"],[class*="desc"]\');for(var i=0;i<els.length;i++){var el=els[i];if(el.tagName==="TEXTAREA"){el.value='+dj+';el.dispatchEvent(new Event("input",{bubbles:true}));break}else if(el.getAttribute("contenteditable")==="true"){el.innerHTML='+dj+';el.dispatchEvent(new Event("input",{bubbles:true}));break}}})()')
      } catch(e) { log.warn('RpaView','douyin desc: '+e.message) }
    }

    if (article.cover_path) {
      this._emitProgress('douyin','uploading cover...',75)
      try { if(await this._click(win,'[class*="cover"]')){await new Promise(function(r){setTimeout(r,1000)});await this._setFileInput(win,article.cover_path);await new Promise(function(r){setTimeout(r,2000)})} } catch(e) { log.warn('RpaView','douyin cover: '+e.message) }
    }

    if (article.tags && article.tags.length>0) {
      this._emitProgress('douyin','adding tags...',80)
      for (var ti=0;ti<article.tags.length;ti++) {
        try {
          await win.webContents.executeJavaScript('(function(){var ti=document.querySelectorAll(\'[class*="tag"] input,input[placeholder*="tag"],input[placeholder*="标签"]\');if(ti.length>0){var inp=ti[0];inp.value='+JSON.stringify(article.tags[ti])+';inp.dispatchEvent(new Event("input",{bubbles:true}));inp.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13}))}})()')
          await new Promise(function(r){setTimeout(r,1000)})
        } catch(e) { log.warn('RpaView','douyin tag: '+e.message) }
      }
    }

    this._emitProgress('douyin','publishing...',90)
    try {
      var rp = this._waitForResponse(win,['aweme/create','aweme/post'],60000)
      if (article.draft) await this._click(win,'button:has-text("草稿"), [class*="draft"]')
      else await this._click(win,'button:has-text("发布"), [class*="publish"]')
      var resp = await rp
      if (resp) { this._emitProgress('douyin','API success',100); return { success:true, url:win.webContents.getURL()||'', platform:'douyin' } }
      await new Promise(function(r){setTimeout(r,5000)})
      var fu=win.webContents.getURL()
      if (fu.includes('success')||fu.includes('publish/success')) return { success:true, url:fu||'', platform:'douyin' }
      return { success:false, error:'publish timeout', platform:'douyin' }
    } catch(e) { log.error('RpaView','douyin publish: '+e.message); return { success:false, error:e.message, platform:'douyin' } }
  }

  async _publish_wechat_mp(win, article) { return {success:false,error:'wechat_mp RPA pending',platform:'wechat_mp'} }
  // ========== P2-D: wechat_mp — iframe save-draft + mass-send ==========
  async _publish_wechat_mp(win, article) {
    this._emitProgress('wechat_mp','navigating to draft...',5)
    // Direct draft edit URL
    await this._navigateAndWait(win,'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=10&create=1',3000)

    var curUrl = win.webContents.getURL()
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
      var iframeSel = 'iframe#ueditor_0, iframe[src*="ueditor"]'
      var contentSel = '#js_editor_content, .rich_media_area_primary_inner, [contenteditable="true"]'
      try {
        await this._waitForElement(win,iframeSel,15000)
        await this._fillInFrame(win,iframeSel,contentSel,article.content)
      } catch(e) {
        log.warn('RpaView','wechat_mp iframe content failed: '+e.message)
        // Fallback: try main frame editor
        try { await this._fillInput(win,contentSel,article.content) } catch(e2) {}
      }
    }

    // Fill author
    if (article.author) {
      try { await this._fillInput(win,'#author, input[name="author"]',article.author) } catch(e) {}
    }

    // Check agreement
    this._emitProgress('wechat_mp','checking agreement...',60)
    try {
      await win.webContents.executeJavaScript("(function(){var cb=document.querySelector('.weui-desktop-btn_wrp .weui-desktop-checkbox input, input#js_agree');if(cb&&!cb.checked){cb.click()}})()")
    } catch(e) { log.warn('RpaView','wechat_mp agree: '+e.message) }

    // Save draft
    this._emitProgress('wechat_mp','saving draft...',70)
    try {
      await this._click(win,'a[data-action="save"], a#js_sync_save')
      await new Promise(function(r){setTimeout(r,3000)})
      var finalUrl = win.webContents.getURL()
      var mediaId = null
      var match = finalUrl.match(/appmsgid=(\d+)/)
      if (match) mediaId = match[1]
    } catch(e) {
      log.warn('RpaView','wechat_mp save: '+e.message)
    }

    // Mass send (群发)
    if (article.massSend && mediaId) {
      this._emitProgress('wechat_mp','mass sending...',85)
      try {
        await this._navigateAndWait(win,'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_list&type=10&action=list',2000)
        await win.webContents.executeJavaScript("(function(){var row=document.querySelector('[appmsgid=\"' + mediaId + '\"]');if(row)row.click();})()")
        await new Promise(function(r){setTimeout(r,1000)})
        await this._click(win,'a.btn_masssend, a[data-action="masssend"]')
        await new Promise(function(r){setTimeout(r,2000)})
        await this._click(win,'.dialog_bd_btn a:has-text("确定"), .weui-desktop-btn:has-text("确定")')
        await new Promise(function(r){setTimeout(r,3000)})
      } catch(e) { log.warn('RpaView','wechat_mp mass send: '+e.message) }
    }

    this._emitProgress('wechat_mp','done',100)
    return { success:true, url:win.webContents.getURL()||'', platform:'wechat_mp' }
  }

  // ========== P2-D: youtube — multi-step wizard ==========
  async _publish_youtube(win, article) {
    this._emitProgress('youtube','navigating to Studio...',5)
    await this._navigateAndWait(win,'https://studio.youtube.com/',3000)

    var curUrl = win.webContents.getURL()
    if (curUrl.includes('signin')||curUrl.includes('login')||curUrl.includes('ServiceLogin'))
      return { success:false, error:'youtube not logged in', platform:'youtube' }

    if (!article.video_path)
      return { success:false, error:'youtube needs video file', platform:'youtube' }

    // Click Create → Upload video
    this._emitProgress('youtube','clicking Create...',10)
    var created = await this._click(win,'#create-icon, ytcp-button#create-icon')
    await new Promise(function(r){setTimeout(r,2000)})
    if (created) {
      await this._click(win,'tp-yt-paper-item:has-text("上传视频"), .ytcp-menu-item:has-text("上传视频")')
      await new Promise(function(r){setTimeout(r,2000)})
    }

    // Upload file
    this._emitProgress('youtube','uploading video...',25)
    if (await this._waitForElement(win,'input[type="file"]',15000)) {
      await this._setFileInput(win,article.video_path)
    }

    // Wait for upload to complete
    this._emitProgress('youtube','waiting for upload...',35)
    var uploaded = await this._waitForCondition(win, 'function(){var progress=document.querySelector(\'#progress-bar, [class*="progress"]\');var done=document.querySelector(\'#done-button, ytcp-button:has-text("下一步")\');return !progress||(done&&!done.disabled)}', 300000)
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
      await new Promise(function(r){setTimeout(r,3000)})
    } catch(e) { log.warn('RpaView','youtube: next1: '+e.message) }

    // Click Next (visibility/schedule)
    try {
      await this._click(win,'ytcp-button:has-text("下一步"), #next-button')
      await new Promise(function(r){setTimeout(r,3000)})
    } catch(e) { log.warn('RpaView','youtube: next2: '+e.message) }

    // Set visibility to Public
    try {
      await this._click(win,'tp-yt-paper-radio-button[name="PUBLIC"], #public-radio-button')
      await new Promise(function(r){setTimeout(r,1000)})
    } catch(e) { log.warn('RpaView','youtube: visibility: '+e.message) }

    // Click Publish
    this._emitProgress('youtube','publishing...',90)
    try {
      await this._click(win,'ytcp-button:has-text("发布"), #done-button')
      await new Promise(function(r){setTimeout(r,5000)})
    } catch(e) { log.warn('RpaView','youtube: publish btn: '+e.message) }

    this._emitProgress('youtube','done',100)
    return { success:true, url:win.webContents.getURL()||'', platform:'youtube' }
  }

  async _publish_xiaohongshu(win, article) { return {success:false,error:'xiaohongshu RPA pending',platform:'xiaohongshu'} }

  // ========== Main publish entry ==========
  async publish(platform, article, authData, timeout) {
    timeout = timeout||120000
    var key = this._windowKey(platform, article&&article.accountId)
    var partition = 'persist:rpa-'+key
    this._emitProgress(platform,'starting browser...',0)
    var win = this._createWindow(partition)
    this.windows[key] = win
    try {
      if (authData&&authData.cookies) { await this._restoreCookies(win,authData.cookies); this._emitProgress(platform,'cookies restored',2) }
      var mn = '_publish_'+platform
      if (typeof this[mn]==='function') return await Promise.race([this[mn](win,article),new Promise(function(_,rj){setTimeout(function(){rj(new Error('timeout ('+(timeout/1000)+'s)'))},timeout)})])
      var cfg = this._getPlatformConfig(platform)
      return await Promise.race([this._publish_generic(win,article,platform,cfg),new Promise(function(_,rj){setTimeout(function(){rj(new Error('timeout ('+(timeout/1000)+'s)'))},timeout)})])
    } catch(e) { log.error('RpaView','publish '+platform+': '+e.message); return { success:false, error:e.message, platform:platform } }
    finally { try { win.destroy() } catch(e) {}; delete this.windows[key] }
  }

  cleanup() {
    var ks = Object.keys(this.windows)
    for (var ki=0;ki<ks.length;ki++) { try { this.windows[ks[ki]].destroy() } catch(e) {} }
    this.windows = {}; log.info('RpaView','cleaned up')
  }
}

module.exports = RpaViewManager
module.exports.ProgressThrottle = ProgressThrottle
module.exports.FieldRetryState = FieldRetryState