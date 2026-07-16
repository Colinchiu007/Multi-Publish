// @ts-check
/**
 * RpaViewManager helpers mixin — DOM 操作与等待工具
 *
 * 拆分自 rpa-view-manager.js (2026-07-16 架构重构)
 * 通过 Object.assign 注入 RpaViewManager.prototype，方法内通过 this.* 访问
 * 其他 mixin 提供的方法。
 *
 * 依赖：fs / path / log（模块级 _guessMimeType 函数被 _setFileInputViaJs 使用）
 */
const fs = require('fs')
const path = require('path')
const log = require('./logger')

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

const helpersMixin = {
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
  },

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
  },

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
  },

  // ========== executeJavaScript utilities ==========
  async _waitForElement(win, sel, timeout) {
    timeout = timeout||30000
    // eslint-disable-next-line no-unused-vars
    try { return await win.webContents.executeJavaScript('(function(){var s='+JSON.stringify(sel)+';return new Promise(function(r){let e=document.querySelector(s);if(e){r(true);return}let o=new MutationObserver(function(){let f=document.querySelector(s);if(f){o.disconnect();r(true)}});o.observe(document.body,{childList:true,subtree:true});setTimeout(function(){o.disconnect();r(false)},'+timeout+')})})()') } catch(e) { return false }
  },
  async _waitForCondition(win, fn, timeout, interval) {
    // R75 防护：fn 必须是硬编码函数字面量字符串，禁止拼接用户输入
    if (typeof fn !== 'string' || fn.length === 0) return false
    timeout=timeout||30000; interval=interval||500
    // eslint-disable-next-line no-unused-vars
    try { return await win.webContents.executeJavaScript('(function(){let c='+fn+';return new Promise(function(r){if(c()){r(true);return}let ch=setInterval(function(){if(c()){clearInterval(ch);clearTimeout(t);r(true)}},'+interval+');let t=setTimeout(function(){clearInterval(ch);r(false)},'+timeout+')})})()') } catch(e) { return false }
  },
  // 安全修复（2026-07-16）：condition-based-waiting helper，替代硬编码 setTimeout 纯等待
  // 轮询条件函数直到满足或超时，避免 waitForTimeout 反模式
  async _waitForFn(win, fn, timeout, interval) {
    if (typeof fn !== 'string' || fn.length === 0) return false
    timeout = timeout || 3000; interval = interval || 300
    return await this._waitForCondition(win, fn, timeout, interval)
  },
  // 统一的 sleep helper（标记需要后续改为 condition-based-waiting 的点）
  _sleep(ms) {
    return new Promise(function(r){const t=setTimeout(r,ms);if(t&&t.unref)t.unref()})
  },
  async _fillInput(win, sel, val) {
    const sv=JSON.stringify(val)
    // 安全修复（2026-07-16）：contenteditable 元素 innerHTML 净化，移除 script/on*= 事件
    return await win.webContents.executeJavaScript('(function(){var s='+JSON.stringify(sel)+';let el=document.querySelector(s);if(!el)throw new Error("input not found");if(el.getAttribute("contenteditable")==="true"){let tmp=document.createElement("div");tmp.innerHTML='+sv+';tmp.querySelectorAll("script, iframe, object, embed").forEach(function(n){n.remove()});tmp.querySelectorAll("*").forEach(function(n){[].forEach.call(n.attributes,function(a){if(a.name.toLowerCase().indexOf("on")===0)n.removeAttribute(a.name)})});el.innerHTML=tmp.innerHTML;el.dispatchEvent(new Event("input",{bubbles:true}));return}let ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value")?.set||Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value")?.set;if(ns)ns.call(el,'+sv+');else el.value='+sv+';el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));return true})()')
  },
  async _click(win, sel) {
    return await win.webContents.executeJavaScript('(function(){var s='+JSON.stringify(sel)+';let el=document.querySelector(s);if(!el)throw new Error("not found: "+s);el.click();return true})()')
  },

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
  },

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
  },

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
  },

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
  },
}

module.exports = helpersMixin
module.exports._guessMimeType = _guessMimeType
