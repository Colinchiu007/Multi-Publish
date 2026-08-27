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

const PUBLISH_ID_KEYS = /(?:post|article|media|content|clue|work|video|photo|material|resource|publish)[_-]?id$/i
const PUBLISH_ID_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/
const PUBLISH_ID_NAV_WORDS = new Set(['article', 'articles', 'content', 'manage', 'video', 'edit', 'publish', 'list', 'lists', 'page', 'media', 'photo', 'clue', 'builder', 'pcui', 'status', 'create', 'upload', 'works', 'work', 'new', 'draft', 'detail', 'index', 'home'])
const STRICT_PUBLISH_ID_PLATFORMS = new Set(['baijiahao', 'kuaishou'])
const SENSITIVE_URL_QUERY_KEY = /(?:token|auth|cookie|session|signature|sign|credential|secret|ticket|code|sid)/i

function normalizePublishId (value) {
  if (value === null || value === undefined) return null
  const id = String(value).trim()
  if (!id || id.length > 160 || id.toLowerCase().startsWith('task_') || /^(?:true|false|null|undefined)$/i.test(id) || PUBLISH_ID_NAV_WORDS.has(id.toLowerCase()) || !PUBLISH_ID_VALUE.test(id)) return null
  return id
}

function collectPublishIds (value, key, ids) {
  if (value === null || value === undefined) return
  if (Array.isArray(value)) {
    value.forEach(item => collectPublishIds(item, key, ids))
    return
  }
  if (typeof value !== 'object') {
    if (PUBLISH_ID_KEYS.test(String(key || ''))) {
      const id = normalizePublishId(value)
      if (id) ids.push(id)
    }
    return
  }
  Object.entries(value).forEach(([childKey, childValue]) => collectPublishIds(childValue, childKey, ids))
}

function extractPublishIdFromUrl (url) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const params = [...parsed.searchParams.entries()]
    for (const [key, value] of params) {
      if (PUBLISH_ID_KEYS.test(key)) {
        const id = normalizePublishId(value)
        if (id) return id
      }
    }
    const parts = parsed.pathname.split('/').filter(Boolean)
    for (let index = 0; index < parts.length - 1; index += 1) {
      if (!/(?:post|article|media|content|clue|work)/i.test(parts[index])) continue
      const id = normalizePublishId(parts[index + 1])
      if (id) return id
    }
  } catch (_) { /* 页面 URL 可能暂时不是绝对 URL */ }
  return null
}

function extractPublishIdsFromResponseBody (body) {
  const ids = []
  try {
    collectPublishIds(JSON.parse(String(body || '')), '', ids)
  } catch (_) {
    const matches = String(body || '').match(/(?:post|article|media|content|clue|work|video|photo|material|resource|publish)[_-]?(?:id)?["'=:\s]+([A-Za-z0-9][A-Za-z0-9._:-]{3,})/ig) || []
    matches.forEach(match => {
      const value = match.split(/["'=:\s]+/).pop()
      const id = normalizePublishId(value)
      if (id) ids.push(id)
    })
  }
  return [...new Set(ids)]
}

function extractPublishIdFromEvidence (evidence = []) {
  const ids = []
  ;(Array.isArray(evidence) ? evidence : []).forEach(item => {
    if (!item || typeof item !== 'object') return
    ;(Array.isArray(item.publishIds) ? item.publishIds : []).forEach(value => {
      const id = normalizePublishId(value)
      if (id) ids.push(id)
    })
  })
  return [...new Set(ids)][0] || null
}

function sanitizeDiagnosticEndpoint (url) {
  try {
    const parsed = new URL(String(url || ''))
    return parsed.origin + parsed.pathname
  } catch (_) {
    return ''
  }
}

function sanitizePublishResultUrl (url) {
  try {
    const parsed = new URL(String(url || ''))
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_URL_QUERY_KEY.test(key)) parsed.searchParams.delete(key)
    }
    parsed.hash = ''
    return parsed.toString()
  } catch (_) {
    return ''
  }
}

function summarizePublishDiagnostics (records, artifact) {
  const source = Array.isArray(records) ? records : []
  const responses = source.slice(-20).map(record => ({
    endpoint: sanitizeDiagnosticEndpoint(record?.endpoint || record?.url),
    status: Number.isFinite(Number(record?.status)) ? Number(record.status) : 0,
    mimeType: String(record?.mimeType || '').split(';')[0].slice(0, 160),
  }))
  return {
    responseCount: source.length,
    responses,
    artifactFound: Boolean(artifact && normalizePublishId(artifact.postId)),
  }
}

function parsePublishResponseEvidence (body, response) {
  const status = Number(response?.status)
  if (!Number.isFinite(status) || status < 200 || status >= 300) return null
  if (!/(?:publish|submit|create|commit|release)/i.test(String(response?.endpoint || ''))) return null
  const publishIds = extractPublishIdsFromResponseBody(body)
  return publishIds.length > 0 ? { publishIds } : null
}

function parseKuaishouArtifactEvidence (body, response) {
  const status = Number(response?.status)
  if (!Number.isFinite(status) || status < 200 || status >= 300) return null
  if (!String(response?.endpoint || '').includes('/rest/cp/works/v2/video/pc/photo/list')) return null
  try {
    const json = JSON.parse(String(body || ''))
    const rows = json && json.data && Array.isArray(json.data.list) ? json.data.list : []
    const kuaishouArtifacts = rows.map(item => {
      const postId = normalizePublishId(item && (item.workId || item.photoId || item.id))
      if (!postId) return null
      const title = String(item.title || item.caption || '').replace(/#g/g, '').replace(/ g/g, '').trim().slice(0, 512)
      const rawTime = item.publishTime || item.uploadTime || 0
      const seconds = Number(String(rawTime).substring(0, 10))
      return {
        postId,
        title,
        publishedAt: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0,
        url: 'https://m.gifshow.com/fw/photo/' + postId,
      }
    }).filter(Boolean).slice(0, 50)
    return kuaishouArtifacts.length > 0 ? { kuaishouArtifacts } : null
  } catch (_) {
    return null
  }
}

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
    log.info('RpaView', '[' + platform + '] publish config=' + (publishConfig ? 'provided' : 'default') + '; selectorCount=' + Object.keys(sel || {}).length + '; publishButtons=' + (sel?.publish_btn?.length || 0) + '; titleInputs=' + (sel?.title_input?.length || 0) + '; fileInputs=' + (sel?.file_input?.length || 0) + '; hasCoverInput=' + Boolean(sel?.cover_input) + '; hasTitle=' + Boolean(article?.title) + '; hasVideo=' + Boolean(article?.video_path) + '; hasCover=' + Boolean(article?.cover_path))
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
    log.info('RpaView', '[' + platform + '] title input hasTitle=' + Boolean(article.title) + ' titleType=' + typeof article.title + ' selectorCount=' + (sel.title_input ? sel.title_input.length : 0))
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
    log.info('RpaView', '[' + platform + '] file input hasVideo=' + Boolean(article.video_path) + ' selectorCount=' + (sel.file_input ? sel.file_input.length : 0))
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
          try {
            if (await this._waitForElement(win, sel.cover_trigger[0], 5000)) {
              await this._click(win, sel.cover_trigger[0])
              await this._sleep(1800)
            }
          } catch (e) { log.warn('RpaView','['+platform+'] cover trigger: '+e.message) }
        }
        // The V2 page keeps a hidden cover input in the DOM after the panel
        // closes; prefer the configured selector, then fall back to the
        // platform selector without requiring the trigger to succeed.
        try {
          await this._setFileInput(win, article.cover_path, coverSel)
        } catch (coverError) {
          if (platform !== 'baijiahao' || !sel.cover_input || sel.cover_input.length === 0) throw coverError
          await this._setFileInput(win, article.cover_path, sel.cover_input[0])
        }
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
        let networkCapture = null
        try {
          this._emitProgress(platform,'publishing...',85)
          const rp = (config.has_api && config.success_patterns.length>0) ? this._waitForResponse(win,config.success_patterns,60000) : null
          if (!(await this._waitForElement(win,sel.publish_btn[0],10000))) throw new Error('publish btn not found')
          networkCapture = await this._startPublishNetworkCapture(win, { parseResponseBody: parsePublishResponseEvidence })
          await this._click(win,sel.publish_btn[0])
          if (article.draft && sel.draft_btn) await this._click(win,sel.draft_btn)
          retry.markDone('publish')
          if (throttle.shouldReport(95)) this._emitProgress(platform,'verifying...',95)
          const publishContext = { title: article.title, publishedAt: Date.now() }
          const verificationCapture = networkCapture
          networkCapture = null
          return await this._verifyPublishSuccess(win,platform,config,rp,verificationCapture,publishContext)
        } catch(e) {
          if (networkCapture) {
            try { await networkCapture.stop() } catch (_) { /* 发布失败时不得遗留 debugger listener */ }
          }
          log.warn('RpaView','['+platform+'] publish btn: '+e.message)
          try {
            const visibleActionCount = await win.webContents.executeJavaScript('(function(){var count=0;var all=document.querySelectorAll("button,a,[role=button],span");for(var i=0;i<all.length;i++){if(all[i].offsetParent)count++}return count})()')
            log.info('RpaView', '[' + platform + '] publish click failure visibleActionCount=' + Number(visibleActionCount || 0))
          } catch (_) { /* ignore */ }
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
    // 关闭"视频创作一键填写引导弹窗"（宽松匹配：文本包含"我知道了"，优先最内层叶子元素）
    try {
      await win.webContents.executeJavaScript('(function(){var els=[...document.querySelectorAll("button,a,span,div,[role=button]")].filter(function(e){var t=(e.innerText||"").trim();return t==="我知道了"&&e.children.length===0});if(els.length){els[els.length-1].click();return "CLICKED:"+els.length}var wrap=[...document.querySelectorAll("[class*=guide],[class*=Guide],[class*=mask],[class*=Mask],[class*=popup],[class*=Popup]")].filter(function(e){var t=(e.innerText||"").trim();return t.indexOf("我知道了")!==-1});if(wrap.length){var b=[...wrap[0].querySelectorAll("button,a,span")].filter(function(e){return (e.innerText||"").trim()==="我知道了"});if(b.length){b[b.length-1].click();return "WRAP:"+wrap.length}}return "NOT_FOUND"})()')
    } catch (e) { /* ignore */ }
    await this._sleep(1200)
    // 选择创作声明：点击输入框 → 弹窗选"无需声明" → 确定
    // 返回 { state: 'no-input'|'already'|'done'|'option-missing'|'confirm-missing', value } 供调用方与日志判定
    let state = 'unknown'
    let selectedValue = ''
    try {
      const opened = await win.webContents.executeJavaScript('(function(){var el=[...document.querySelectorAll("input")].find(function(i){return String(i.placeholder||"").indexOf("创作声明")!==-1});if(!el)return "NO_INPUT";if(el.value)return "ALREADY";el.click();el.focus();return "OPENED"})()')
      if (opened === 'NO_INPUT') {
        state = 'no-input'
      } else if (opened === 'ALREADY') {
        state = 'already'
      } else if (opened === 'OPENED') {
        await this._sleep(2500)
        const optionClicked = await win.webContents.executeJavaScript('(function(){var opts=["无需声明","无声明","默认声明"];for(var k=0;k<opts.length;k++){var cands=[...document.querySelectorAll(".cheetah-modal-body span,.cheetah-modal-body label,.cheetah-modal-body div,.cheetah-modal span,.cheetah-modal label,.cheetah-modal div,[class*=modal] span,[class*=modal] label,[class*=modal] div")].filter(function(e){return (e.innerText||"").trim()===opts[k]&&e.children.length===0});if(cands.length){cands[0].click();return {ok:true,option:opts[k]}}}return {ok:false}})()')
        if (optionClicked && optionClicked.ok) {
          selectedValue = optionClicked.option || ''
          state = 'option-selected'
          await this._sleep(1200)
          const confirmClicked = await win.webContents.executeJavaScript('(function(){var btns=[...document.querySelectorAll(".cheetah-modal-footer button,.cheetah-modal-footer span,.cheetah-modal button,.cheetah-modal span,[class*=modal] button,[class*=modal] span")].filter(function(e){return (e.innerText||"").trim()==="确定"&&e.children.length===0});if(btns.length){var b=btns[0];if(b.tagName==="BUTTON"||b.tagName==="SPAN")b.click();else b.parentElement.click();return true}return false})()')
          state = confirmClicked ? 'done' : 'confirm-missing'
          await this._sleep(1500)
        } else {
          state = 'option-missing'
        }
      }
    } catch (e) {
      log.warn('RpaView', 'baijiahao declaration prep: ' + e.message)
      state = 'error'
    }
    log.info('RpaView', '[baijiahao] declaration prep state=' + state + (selectedValue ? ' option=' + selectedValue : ''))
    return { state, option: selectedValue }
  },

  async _queryBaijiahaoArtifact(win, context, maxAttempts = 3) {
    const title = String(context.title || '').trim()
    const startedAt = Number(context.publishedAt || Date.now())
    if (!title) return null
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const js = '(async function(){' +
          'var title = ' + JSON.stringify(title) + ';' +
          'var startedAt = ' + JSON.stringify(startedAt) + ';' +
          'var endpoint = "https://baijiahao.baidu.com/pcui/article/lists";' +
          'for (var page = 0; page < 3; page++) {' +
            'var params = new URLSearchParams({currentPage:String(page+1),pageSize:"10",type:"video",collection:"publish",search:"",dynamic:"1"});' +
            'var resp = await fetch(endpoint + "?" + params.toString(), {credentials:"include",headers:{Accept:"application/json, text/plain, */*","X-Requested-With":"XMLHttpRequest"}});' +
            'if (!resp.ok) continue;' +
            'var json = await resp.json();' +
            'var rows = json && json.data && Array.isArray(json.data.list) ? json.data.list : [];' +
            'for (var i = 0; i < rows.length; i++) {' +
              'var item = rows[i] || {};' +
              'var id = item.article_id || item.id;' +
              'if (!id) continue;' +
              'var itemTitle = String(item.title || "").trim();' +
              'var status = String(item.status || "");' +
              'var publishAt = item.publish_at ? new Date(item.publish_at).getTime() : 0;' +
              'var inWindow = Number.isFinite(publishAt) && publishAt > 0 && publishAt >= startedAt - 300000 && publishAt <= startedAt + 900000;' +
              'if (status === "publish" && inWindow && itemTitle === title) {' +
                'return {postId:String(id),url:item.share_url || "",title:itemTitle,status:status};' +
              '}' +
            '}' +
          '}' +
          'return null;' +
        '})()'
        const found = await win.webContents.executeJavaScript(js)
        const postId = normalizePublishId(found && found.postId)
        if (postId) {
          log.info('RpaView', '[baijiahao] artifact lookup matched id=' + postId.slice(0, 80))
          return { ...found, postId, url: sanitizePublishResultUrl(found.url) }
        }
      } catch (e) {
        log.warn('RpaView', '[baijiahao] artifact lookup attempt ' + (attempt + 1) + ': ' + e.message)
      }
      if (attempt + 1 < maxAttempts) await this._sleep(3000)
    }
    return null
  },

  _parseKuaishouArtifact(evidence, context) {
    const title = String(context.title || '').trim()
    const startedAt = Number(context.publishedAt || Date.now())
    if (!title) return null
    for (const entry of evidence || []) {
      const artifacts = entry && Array.isArray(entry.kuaishouArtifacts) ? entry.kuaishouArtifacts : []
      for (const item of artifacts) {
        const postId = normalizePublishId(item && item.postId)
        if (!postId) continue
        const itemTitle = String(item.title || '').trim()
        const publishedAt = Number(item.publishedAt || 0)
        const inWindow = Number.isFinite(publishedAt) && publishedAt > 0 && publishedAt >= startedAt - 120000 && publishedAt <= startedAt + 900000
        if (inWindow && itemTitle === title) {
          return { postId, url: item.url || 'https://m.gifshow.com/fw/photo/' + postId, title: itemTitle }
        }
      }
    }
    return null
  },

  async _findKuaishouArtifact(win, context, maxAttempts = 2) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let capture = null
      try {
        capture = await this._startPublishNetworkCapture(win, { parseResponseBody: parseKuaishouArtifactEvidence })
        const statuses = attempt === 0 ? ['1', '2', '3'] : ['1']
        for (const status of statuses) {
          try {
            await this._navigateAndWait(win, 'https://cp.kuaishou.com/article/manage/video?status=' + status, 2000)
            await this._waitForCondition(win, 'function(){var t=(document.body&&document.body.innerText)||"";return /作品管理|发布作品|视频管理|内容管理/.test(t)||document.querySelectorAll("a[href*=photo],[data-photo-id],[class*=work-item],[class*=works-list]").length>0}', 15000, 500)
          } catch (e) { log.warn('RpaView', 'kuaishou manage page: ' + e.message) }
          await this._sleep(2500)
          const artifact = this._parseKuaishouArtifact(capture?.evidence || [], context)
          if (artifact) {
            log.info('RpaView', '[kuaishou] artifact lookup matched id=' + String(artifact.postId).slice(0, 80))
            await capture.stop()
            capture = null
            return artifact
          }
        }
      } catch (e) {
        log.warn('RpaView', '[kuaishou] artifact lookup attempt ' + (attempt + 1) + ': ' + e.message)
      } finally {
        if (capture) { try { await capture.stop() } catch (e) { /* ignore */ } }
      }
      if (attempt + 1 < maxAttempts) await this._sleep(3000)
    }
    return null
  },

  async _findPublishedArtifact(win, platform, context = {}) {
    if (platform === 'baijiahao') return await this._queryBaijiahaoArtifact(win, context)
    if (platform === 'kuaishou') return await this._findKuaishouArtifact(win, context)
    return null
  },


  // ========== Verify publish success ==========
  async _verifyPublishSuccess(win, platform, config, responsePromise, networkCapture, context = {}) {
    let captureStopped = false
    let requests = []
    const stopNetworkCapture = async () => {
      if (captureStopped) return requests
      captureStopped = true
      if (!networkCapture || typeof networkCapture.stop !== 'function') return requests
      try {
        const stoppedRequests = await networkCapture.stop()
        requests = Array.isArray(stoppedRequests) ? stoppedRequests : []
      } catch (_) {
        log.warn('RpaView', '[' + platform + '] publish network capture cleanup failed')
      }
      return requests
    }
    try {
    const finish = async (result) => {
      const stoppedRequests = await stopNetworkCapture()
      const currentUrl = win.webContents.getURL() || ''
      const strictPlatform = STRICT_PUBLISH_ID_PLATFORMS.has(platform)
      const explicitId = normalizePublishId(result && result.postId)
      const responseId = extractPublishIdFromEvidence(networkCapture?.evidence)
      let postId = strictPlatform
        ? responseId
        : (explicitId || responseId || extractPublishIdFromUrl(result && result.url) || extractPublishIdFromUrl(currentUrl))
      let artifact = null
      if (!postId && strictPlatform) {
        try {
          artifact = await this._findPublishedArtifact(win, platform, context)
          postId = normalizePublishId(artifact && artifact.postId)
        } catch (error) {
          log.warn('RpaView', '[' + platform + '] artifact lookup failed: ' + error.message)
        }
      }
      const diagnostics = summarizePublishDiagnostics(stoppedRequests, artifact)
      if (!postId) {
        log.warn('RpaView', '[' + platform + '] publish signal lacked platform ID; endpoint=' + sanitizeDiagnosticEndpoint(currentUrl) + ' responses=' + stoppedRequests.length)
        return { success: false, error: '发布结果缺少平台作品 ID', platform, url: sanitizePublishResultUrl(currentUrl), diagnostics }
      }
      this._emitProgress(platform, result.stage || 'published!', 100)
      const resolvedUrl = sanitizePublishResultUrl((artifact && artifact.url) || result.url || currentUrl)
      return { success: true, url: resolvedUrl, postId, platform, diagnostics }
    }
    const mode = config.success_mode || 'url'
    // Mode: api — wait for matching API response
    if (mode === 'api' && responsePromise) {
      const r = await responsePromise
      if (r) return await finish({ stage: 'API success', url: win.webContents.getURL() || '' })
    }
    // Mode: url — wait for URL to leave publish page
    if (mode === 'url') {
      try {
        await this._sleep(5000)
        const url = win.webContents.getURL(), pubUrl = config.publish_url||''
        if (url && pubUrl && !url.includes(pubUrl) && !url.includes('login') && !url.includes('passport')) {
          return await finish({ stage: 'URL changed', url })
        }
      } catch(e) { log.warn('RpaView','['+platform+'] URL check: '+e.message) }
    }
    // Mode: dom — wait for success DOM selector
    if (mode === 'dom') {
      const sel = config.success_selector || (config.selectors && config.selectors.success_selector)
      if (sel) {
        try {
          if (await this._waitForElement(win,sel,15000)) {
            return await finish({ stage: 'DOM success', url: win.webContents.getURL() || '' })
          }
        } catch(e) { log.warn('RpaView','['+platform+'] DOM check: '+e.message) }
      }
    }
    // Some creator pages submit inside an SPA and keep the editor URL. Treat
    // success only when a real success message or success route is present;
    // a disabled publish button alone is only an upload/loading state.
    try {
      const domSuccess = await this._waitForCondition(win, 'function(){' +
        'var text=(document.body&&document.body.innerText)||"";' +
        'var success=/(发布成功|投稿成功|发布完成|提交成功|作品已发布|已发布)/.test(text);' +
        'var failure=/(发布失败|提交失败|上传失败|登录失效|请登录)/.test(text);' +
        'if(failure)return false;' +
        'return success;', 30000, 500)
      if (domSuccess) {
        return await finish({ stage: 'DOM success', url: win.webContents.getURL() || '' })
      }
    } catch (e) {
      log.warn('RpaView', '[' + platform + '] DOM success check: ' + e.message)
    }
    // Fallback: try all modes in order
    if (responsePromise) {
      const r = await responsePromise
      if (r) return await finish({ stage: 'API success', url: win.webContents.getURL() || '' })
    }
    try {
      await this._sleep(5000)
      const url2 = win.webContents.getURL(), pubUrl2 = config.publish_url||''
      if (url2 && pubUrl2 && !url2.includes(pubUrl2) && !url2.includes('login') && !url2.includes('passport')) {
        return await finish({ stage: 'URL fallback', url: url2 })
      }
    } catch(e) { log.warn('RpaView','['+platform+'] URL fallback: '+e.message) }
    const finalUrl = win.webContents.getURL() || ''
    const stoppedRequests = await stopNetworkCapture()
    // 诊断快照：超时前记录页面关键文本与可见弹窗，帮助区分"弹窗拦截/校验失败/静默成功"
    try {
      const pageSnapshot = await win.webContents.executeJavaScript('(function(){var t=(document.body&&document.body.innerText)||"";var m=[...document.querySelectorAll("[class*=modal],[class*=dialog],[class*=Modal],[class*=Dialog]")].filter(function(e){return (e.innerText||"").trim()}).map(function(e){return (e.innerText||"").replace(/\\s+/g," ").trim().slice(0,160)}).slice(0,5);var btns=[...document.querySelectorAll("button")].filter(function(b){var x=(b.innerText||"").trim();return x&&x.length<20}).map(function(b){return (b.innerText||"").trim()}).slice(0,10);return {text:t.replace(/\\s+/g," ").slice(0,400),modals:m,buttons:btns}})()')
      log.warn('RpaView', '[' + platform + '] publish verify snapshot: ' + JSON.stringify(pageSnapshot).slice(0, 900))
      try {
        const image = await win.webContents.capturePage()
        if (image && !image.isEmpty()) {
          const diagDir = path.join(require('os').tmpdir(), 'mp-rpa-diag')
          require('fs').mkdirSync(diagDir, { recursive: true })
          const shotPath = path.join(diagDir, platform + '-verify-' + Date.now() + '.png')
          require('fs').writeFileSync(shotPath, image.toPNG())
          log.warn('RpaView', '[' + platform + '] publish verify screenshot saved: ' + shotPath)
        }
      } catch (_) { /* 截图失败不阻塞 */ }
    } catch (_) { /* 快照失败不阻塞 */ }
    log.warn('RpaView', '[' + platform + '] publish verification timeout endpoint=' + sanitizeDiagnosticEndpoint(finalUrl) + ' responses=' + stoppedRequests.length)
    return { success: false, error: 'publish verification timeout', platform, url: sanitizePublishResultUrl(finalUrl), diagnostics: summarizePublishDiagnostics(stoppedRequests, null) }
    } finally {
      await stopNetworkCapture()
    }
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
