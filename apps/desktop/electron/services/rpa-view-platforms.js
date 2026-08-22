// @ts-check
/**
 * RpaViewManager platforms mixin — 平台发布逻辑
 *
 * 拆分自 rpa-view-manager.js (2026-07-16 架构重构)
 * 通过 Object.assign 注入 RpaViewManager.prototype，方法内通过 this.* 访问
 * 其他 mixin（helpers/session）提供的方法。
 *
 * 依赖：log / PlatformConfig / getConfigPath / platformSelectors
 *       ProgressThrottle / FieldRetryState
log.info('RpaView', 'DIAG[module] rpa-engine path: ' + require.resolve('@multi-publish/rpa-engine'))
log.info('RpaView', 'DIAG[module] kuaishou keys: ' + (platformSelectors.PLATFORM_PUBLISH_SELECTORS && platformSelectors.PLATFORM_PUBLISH_SELECTORS.kuaishou ? Object.keys(platformSelectors.PLATFORM_PUBLISH_SELECTORS.kuaishou).join('|') : 'MISSING'))
 *
 * 模块级变量：
 *   - _platformConfigInstance：PlatformConfig 单例（_getPlatformConfig 使用）
 *   - PLATFORM_SUCCESS_PATTERNS：平台成功匹配模式回退表
 */
const log = require('./logger')
const { getConfigPath } = require('./config-resolver')
const PlatformConfig = require('@multi-publish/shared-utils/src/platform-config')
const { platformSelectors } = require('@multi-publish/rpa-engine')
const { getPublishUrl } = require('@multi-publish/api-publish-engine/src/platform-entries')
const { ProgressThrottle } = require('./rpa-progress-throttle')
const { FieldRetryState } = require('./rpa-field-retry')

let _platformConfigInstance
const PLATFORM_SUCCESS_PATTERNS = {}

const platformsMixin = {
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
  },

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
  },

  // ========== P2-B: Generic publish engine ==========
  async _publish_generic(win, article, platform, publishConfig) {
    const config = publishConfig || this._getPlatformConfig(platform)
    const sel = config.selectors
log.info('RpaView', '['+platform+'] DIAG[publish] publishConfig given: ' + (publishConfig?'YES':'NO') + '; sel keys: ' + Object.keys(sel||{}).join('|') + '; pubBtn: ' + (sel&&sel.publish_btn?sel.publish_btn.length:'EMPTY') + '; titleIn: ' + (sel&&sel.title_input?sel.title_input.length:'EMPTY') + '; fileIn: ' + (sel&&sel.file_input?sel.file_input.length:'EMPTY') + '; coverIn: ' + (sel&&sel.cover_input?'Y':'N') + '; art.title: ' + String(article&&article.title||'').slice(0,20) + '; video: ' + String(article&&article.video_path||'').slice(0,40) + '; cover: ' + String(article&&article.cover_path||'').slice(0,40))
    const throttle = new ProgressThrottle(5000, 10)
    const retry = new FieldRetryState(3)

    if (!config.publish_url) return { success: false, error: platform+' no publish_url', platform: platform }

    this._emitProgress(platform, 'navigating...', 5)
    await this._navigateAndWait(win, config.publish_url, 3000)

    const curUrl = win.webContents.getURL()
    if (curUrl.includes('login')||curUrl.includes('passport')||curUrl.includes('signin'))
      return { success: false, error: platform+' not logged in', platform: platform }
    // SPA 鐧诲綍鎬?DOM 鎺㈡祴锛歎RL 鏈烦杞絾椤甸潰宸叉槸鐧诲綍寮曞锛堝揩鎵嬬瓑 SPA 鏈櫥褰曚笉鏀瑰彉 URL锛?
    const loginProbe = await win.webContents.executeJavaScript(`(function(){
      var t = (document.body && document.body.innerText) || '';
      return {
                hasLoginPrompt: /立即登录|扫码登录|登录后|请登录/.test(t.slice(0, 4000)),
        hasForm: !!document.querySelector('input[type="file"], textarea, [contenteditable="true"]')
      };
    })()`).catch(function () { return { hasLoginPrompt: false, hasForm: true } })
    if (loginProbe && loginProbe.hasLoginPrompt && !loginProbe.hasForm) {
      log.warn('RpaView', '['+platform+'] SPA login page detected, fail fast')
      return { success: false, error: platform+' not logged in', platform: platform }
    }

    if (config.preFill) await this._execHook(win, config.preFill, config.hookContext)

    // title
    log.info('RpaView', '['+platform+'] DIAG[title] cond=' + (!!article.title) + ' titleType=' + typeof article.title + ' titleVal=' + JSON.stringify(String(article.title)).slice(0,30) + ' selTitleIn=' + (sel.title_input ? sel.title_input.length : 'NONE'))
    if (article.title && sel.title_input && sel.title_input.length > 0) {
      retry.addField('title')
      while (!retry.isDone('title')) {
        try {
          this._emitProgress(platform, 'filling title...', 20)
          if (await this._waitForElement(win, sel.title_input[0], 10000)) {
            await this._fillInput(win, sel.title_input[0], article.title); retry.markDone('title')
          } else {
            if (!retry.retry('title')) break; await this._sleep(1000)
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
          } else {
            if (!retry.retry('content')) break; await this._sleep(1000)
          }
        } catch(e) {
          log.warn('RpaView', '['+platform+'] content: '+e.message)
          if (!retry.retry('content')) break; await this._sleep(1000)
        }
      }
    }

    // file upload
    log.info('RpaView', '['+platform+'] DIAG[file] video=' + String(article.video_path||'').slice(0,30) + ' fileIn=' + (sel.file_input ? sel.file_input.length : 'NONE'))
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
          } else {
            if (!retry.retry('file_upload')) break; await this._sleep(2000)
          }
        } catch(e) {
          log.warn('RpaView', '['+platform+'] upload: '+e.message)
          if (!retry.retry('file_upload')) break; await this._sleep(2000)
        }
      }
    }

    // cover
    if (article.cover_path && sel.cover_input) {
      try {
        this._emitProgress(platform,'uploading cover...',65)
        const coverSel = 'input[type="file"][accept*="image"], input[type="file"][accept*="jpg"], input[type="file"][accept*="jpeg"], input[type="file"][accept*="png"]'
        // 先点击封面上传触发器（打开上传面板），再设置文件；trigger 不存在时直接设置
        if (sel.cover_trigger && sel.cover_trigger.length > 0) {
          try { await this._click(win, sel.cover_trigger[0]); await this._sleep(1800) } catch (e) { log.warn('RpaView','['+platform+'] cover trigger: '+e.message) }
        }
        await this._setFileInput(win, article.cover_path, coverSel)
        await this._sleep(2000)
      } catch(e) { log.warn('RpaView','['+platform+'] cover: '+e.message) }
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

    // 平台专用发布前准备（百家号：关闭引导弹窗 + 选择创作声明）
    if (platform === 'baijiahao') {
      try { await this._prepBaijiahao(win) } catch (e) { log.warn('RpaView', 'baijiahao prep: ' + e.message) }
    }

    // publish button
    log.info('RpaView', '['+platform+'] DIAG[publish2] pubBtn=' + (sel.publish_btn ? sel.publish_btn.length : 'NONE') + ' cfgHasApi=' + (config.has_api) + ' prePublishHook=' + String(config.prePublishHook||''))
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
          try {
            const dump = await win.webContents.executeJavaScript('(function(){var out=[];var all=document.querySelectorAll("button,a,[role=button],span");for(var i=0;i<all.length;i++){var b=all[i];if(!b.offsetParent)continue;var t=(b.innerText||b.textContent||"").trim().replace(/\s+/g," ");if(t&&t.length<=14){var cls=(typeof b.className==="string"&&b.className)?("."+b.className.split(" ").slice(0,2).join(".")):"";out.push(b.tagName.toLowerCase()+cls+"="+t)}}return out.slice(0,60).join(" | ")})()')
            log.info('RpaView','['+platform+'] DOM buttons: ' + String(dump).slice(0,1200))
          } catch(dumpErr) { /* ignore */ }
          if (!retry.retry('publish')) return {success:false,error:e.message,platform:platform}
          await this._sleep(1500)
        }
      }
    }
    return {success:false,error:platform+' no publish_btn selector',platform:platform}
  },

  // ========== 平台专用：百家号发布前准备（创作声明等） ==========
  async _prepBaijiahao(win) {
    this._emitProgress('baijiahao', 'preparing declaration...', 82)
    // 关闭"视频新增一键填写功能"引导弹窗
    try {
      await win.webContents.executeJavaScript('(function(){var b=[...document.querySelectorAll("button,a,span,div")].filter(function(e){return (e.innerText||"").trim()==="我知道了"&&e.children.length===0});if(b.length){b[0].click();return true}return false})()')
    } catch (e) { /* ignore */ }
    await this._sleep(1200)
    // 选择创作声明：点击输入框 → 弹窗选"无需声明" → 确定
    const opened = await win.webContents.executeJavaScript('(function(){var el=[...document.querySelectorAll("input")].find(function(i){return i.placeholder.indexOf("创作声明")!==-1});if(!el)return "NO_INPUT";if(el.value)return "ALREADY";el.click();el.focus();return "OPENED"})()')
    if (opened === 'OPENED') {
      await this._sleep(2500)
      await win.webContents.executeJavaScript('(function(){var cands=[...document.querySelectorAll(".cheetah-modal-body span,.cheetah-modal-body label,.cheetah-modal-body div")].filter(function(e){return (e.innerText||"").trim()==="无需声明"});if(cands.length){cands[0].click();return true}return false})()')
      await this._sleep(1200)
      await win.webContents.executeJavaScript('(function(){var btns=[...document.querySelectorAll(".cheetah-modal-footer button,.cheetah-modal-footer span")].filter(function(e){return (e.innerText||"").trim()==="确定"});if(btns.length){var b=btns[0];if(b.tagName==="BUTTON")b.click();else b.parentElement.click();return true}return false})()')
      await this._sleep(1500)
    }
    return true
  },

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
    return {success:false, error:'publish verification timeout', platform:platform }
  },

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
  },

  // ========== P2-D: wechat_mp — iframe save-draft + mass-send ==========
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
    let mediaId = null
    try {
      const saved = await this._click(win,'a[data-action="save"], a#js_sync_save')
      if (!saved) {
        return { success:false, error:'微信公众号草稿保存失败：保存按钮不可用', platform:'wechat_mp' }
      }
      await this._sleep(3000)
      const finalUrl = win.webContents.getURL()
      const match = finalUrl.match(/appmsgid=(\d+)/)
      if (match) mediaId = match[1]
    } catch(e) {
      log.warn('RpaView','wechat_mp save: '+e.message)
      return { success:false, error:'微信公众号草稿保存失败：'+e.message, platform:'wechat_mp' }
    }

    if (!mediaId) {
      return { success:false, error:'微信公众号草稿保存结果无法验证：缺少媒体 ID', platform:'wechat_mp' }
    }

    // Mass send (群发)
    if (article.massSend) {
      this._emitProgress('wechat_mp','mass sending...',85)
      try {
        await this._navigateAndWait(win,'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_list&type=10&action=list',2000)
        const draftSelected = await win.webContents.executeJavaScript('(function(){var s='+JSON.stringify('[appmsgid="'+mediaId+'"]')+';let row=document.querySelector(s);if(!row)return false;row.click();return true;})()')
        if (!draftSelected) {
          return { success:false, error:'微信公众号群发失败：未找到已保存草稿', platform:'wechat_mp' }
        }
        await this._sleep(1000)
        const massSendStarted = await this._click(win,'a.btn_masssend, a[data-action="masssend"]')
        if (!massSendStarted) {
          return { success:false, error:'微信公众号群发失败：群发按钮不可用', platform:'wechat_mp' }
        }
        await this._sleep(2000)
        const massSendConfirmed = await this._click(win,'.dialog_bd_btn a:has-text("确定"), .weui-desktop-btn:has-text("确定")')
        if (!massSendConfirmed) {
          return { success:false, error:'微信公众号群发确认失败：确认按钮不可用', platform:'wechat_mp' }
        }
        await this._sleep(3000)
      } catch(e) {
        log.warn('RpaView','wechat_mp mass send: '+e.message)
        return { success:false, error:'微信公众号群发失败：'+e.message, platform:'wechat_mp' }
      }
    }

    this._emitProgress('wechat_mp','done',100)
    return { success:true, url:win.webContents.getURL()||'', platform:'wechat_mp' }
  },

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
  },

  async _publish_xiaohongshu(win, article) {
    if (!article || (!article.title && !article.content && !article.video_path)) {
      return { success:false, error:'小红书发布至少需要标题、正文或视频', platform:'xiaohongshu' }
    }
    const config = this._getPlatformConfig('xiaohongshu')
    const contentType = article.video_path ? 'video' : 'image'
    const publishUrl = getPublishUrl('xiaohongshu', contentType)
    return this._publish_generic(win, article, 'xiaohongshu', {
      ...config,
      publish_url: publishUrl || config.publish_url,
    })
  },

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
  },
}

module.exports = platformsMixin
