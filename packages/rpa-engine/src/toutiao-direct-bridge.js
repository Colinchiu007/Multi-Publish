// @ts-check
/**
 * toutiao-direct-bridge —— 头条 Node 直连兜底的执行桥（从 rpa-view-platforms 拆出，行数门禁）
 *
 * 职责：cookie 导出（Electron session）→ body 构造（参考产品字段表）→ 页面内 SDK 签名 → Node 直连 POST。
 * 宿主（rpa-view-platforms）只提供 win / article / sign 入口 / log。
 *
 * 背景：DOM 点击被 onClick 闭包门控拦下（PRD §16.8.8，14 项排除定案）；
 * 页面自动保存（source=29）code=0 ⇒ 服务端接受「页面上下文的请求」，
 * 而 Node 侧请求的可用性由本桥真机验证（100005 → cookie 导出修复后待终验）。
 */
'use strict'

const { cookiesFromSession, buildPostData, publishWithSign } = require('./toutiao-direct-publish')
const PUBLISH_URL = 'https://mp.toutiao.com/mp/agw/article/publish'
const PUBLISH_QUERY = 'source=mp&type=article&aid=1231&mp_publish_ab_val=0'

/**
 * DOM 流程失败后的兜底发布（也可独立调用）。
 * @param {{win: any, article: {title?: string, content?: string}, sign: Function, log: {info: Function, warn: Function}}} p
 * @returns {Promise<{success: boolean, platform: string, pgcId?: string, error?: string}>}
 */
async function publishDirect ({ win, article, sign, log }) {
  try {
    // ① cookie：从头条页所属 session 导出（含 HttpOnly 登录态；document.cookie 拿不到）
    const session = win.webContents && win.webContents.session
    if (!session) return { success: false, platform: 'toutiao', error: 'NO_SESSION' }
    const cookies = await cookiesFromSession(session)
    if (!cookies) return { success: false, platform: 'toutiao', error: 'NO_COOKIES' }

    // ② 正文转 HTML（纯文本 → <p> 段落；转义先行防注入）
    const html = '<p>' + String(article && article.content || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .split(/\n+/).filter(Boolean).join('</p><p>') + '</p>'

    // ③ 定时 1 分钟后（用户已确认「定时路径近似立即发布」可接受；立即路径被页面 deferred 死锁）
    const d = new Date(Date.now() + 60 * 1000)
    const p2 = (n) => (n < 10 ? '0' : '') + n
    const timerTime = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`

    const body = buildPostData({
      title: String(article && article.title || ''),
      htmlContent: html,
      covers: [],
      publishTime: timerTime,
    })

    // ④ 签名：页面内 SDK 按同一 (url, query, body) 产出 a_bogus
    const signResult = await sign('toutiao_sdk', { url: PUBLISH_URL, query: PUBLISH_QUERY, body }, { win })
    if (!signResult.ok || !signResult.signature) {
      log.warn('RpaView', '[toutiao-direct] 签名失败 via=' + signResult.via + ' reason=' + (signResult.reason || ''))
      return { success: false, platform: 'toutiao', error: 'SIGN_FAILED' }
    }

    // ⑤ Node 直连（参考产品同构：页面内 fetch 的上下文标记会被服务端拒绝 ⇒ 必须 Node 侧发）
    const res = await publishWithSign({ cookies, body, aBogus: signResult.signature })
    log.info('RpaView', '[toutiao-direct] status=' + res.status + ' code=' + res.code + ' msg=' + res.message + ' pgcId=' + res.pgcId)
    if (res.code === 0 && res.pgcId && res.pgcId !== '0') {
      return { success: true, platform: 'toutiao', pgcId: res.pgcId }
    }
    return { success: false, platform: 'toutiao', error: 'API_REJECTED:' + res.code + ':' + (res.message || '').slice(0, 60) }
  } catch (e) {
    log.warn('RpaView', '[toutiao-direct] 异常: ' + (e && e.message))
    return { success: false, platform: 'toutiao', error: 'DIRECT_THREW:' + String(e && e.message).slice(0, 60) }
  }
}

/**
 * 一站式入口：DOM 结果失败（verification timeout）时自动切 Node 直连。
 * @param {{win: any, article: {title?: string, content?: string}, domResult: {success?: boolean, error?: string}, sign: Function, log: {info: Function, warn: Function}}} p
 */
async function publishToutiaoWithFallback (p) {
  const domResult = p.domResult
  if (!domResult || domResult.success !== false || !/verification timeout/.test(String(domResult.error || ''))) {
    return domResult
  }
  p.log.warn('RpaView', '[toutiao] DOM verification timeout → Node 直连兜底')
  const direct = await publishDirect(p)
  if (direct.success) return direct
  p.log.warn('RpaView', '[toutiao-direct] 兜底未成功: ' + (direct.error || ''))
  return domResult
}

/**
 * 头条发布完整流程（从 rpa-view-platforms 外移，行数门禁）：
 * DOM 流程（host._publish_generic）失败且为 verification timeout 时，自动切 Node 直连兜底。
 * @param {{win: any, article: any, host: any, sign: Function, log: any, getPublishUrl: Function, stripHtml: Function}} p
 * @returns {Promise<{success: boolean, platform?: string, pgcId?: string, error?: string}>}
 */
async function publishToutiao (p) {
  const { win, article, host, log, getPublishUrl, stripHtml } = p
  const config = host._getPlatformConfig('toutiao')
  const contentType = article.video_path ? 'video' : 'image'
  const publishUrl = getPublishUrl('toutiao', contentType)
  // ProseMirror 走纯文本通道；Quill 草稿会把 HTML 规范化为 <p>，
  // 不剥离会让 <p> 以字面量出现在文章正文（真机 verify snapshot 实证）。
  const plainContent = stripHtml(article && article.content)
  const domResult = await host._publish_generic(win, { ...article, content: plainContent }, 'toutiao', {
    ...config,
    publish_url: publishUrl || config.publish_url,
    // 「展示封面」必填且默认「单图」但封面为空（真机取证）⇒ 传入封面图；第 52 轮实验证实封面非阻塞点
    prePublishHook: 'uploadCover',
    hookContext: { coverPath: (article.images && article.images[0]) || article.cover_path || null },
    // 2026-10-03 ⭐ preFill：编辑器加载完成后立刻装 XHR hook（比兜底时重装早整个发布周期，
    // 捕获填充触发的所有自动保存请求；兜底时 body 早已在手，不再受 60s 后页面关闭影响）
    preFill: 'installToutiaoSaveHook',
  })
  // 2026-10-03 ⭐ 兜底（在 DOM 流程【之后】执行——页面此时已填充、未关闭）：
  // 1) 重装 XHR hook（导航已重置上下文，之前装的必失效）
  // 2) 微调标题触发页面自动保存 ⇒ 页面自己发 save=1 publish 请求 ⇒ hook 捕获
  // 3) 用捕获的 body 原样重放（改 save=1 保持），即完成真发布
  if (domResult && domResult.success === false && /verification timeout/.test(String(domResult.error || ''))) {
    log.warn('RpaView', '[toutiao] DOM verification timeout → 页面 XHR 重放兜底')
    const xhrResult = await publishViaPageXhr({ win, title: article && article.title, log })
    if (xhrResult.success) return xhrResult
  }
  return publishToutiaoWithFallback({ win, article: { ...article, content: plainContent }, domResult, sign: p.sign, log })
}

/**
 * 页面 XHR 真发布（2026-10-03 真机验证：save=1 → code=0「提交成功」，后台作品列表可见）：
 * 在页面上下文里【实时读取编辑器内容】构造 body（含页面自动保存产生的 pgc_id/title_id），
 * save=1（真发布语义；save=0 实为存草稿——2026-10-03 后台对照定案），
 * 用【页面自身的 XMLHttpRequest】同步发出 —— 继承页面全部上下文（SDK 注入的 tt-anti-token 等）。
 * @param {{win: any, title?: string, log: any}} p
 * @returns {Promise<{success: boolean, platform: string, pgcId?: string, error?: string}>}
 */
async function publishViaPageXhr ({ win, title, log }) {
  /** 派发 Ctrl+S（头条保存草稿快捷键；走 CDP 真实键盘事件） */
  async function tcDispatchCtrlS (win) {
    try {
      const dbg = win.webContents.debugger
      try { await dbg.attach('1.3') } catch (_) { /* 已附加 */ }
      await dbg.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, windowsVirtualKeyCode: 83, code: 'KeyS' })
      await dbg.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, windowsVirtualKeyCode: 83, code: 'KeyS' })
    } catch (_e) { /* 忽略 */ }
  }
  try {
    // hook 必须在页面加载后重装（每次导航重置 JS 上下文）；再触发一次 input 促发自动保存
    const setup = `(function(){
      window.__lastSaveBody=''; window.__titleId=''
      var oo=XMLHttpRequest.prototype.open, os=XMLHttpRequest.prototype.send
      XMLHttpRequest.prototype.open=function(m,u){this.__u=String(u);return oo.apply(this,arguments)}
      XMLHttpRequest.prototype.send=function(b){
        try{ var u=this.__u||''
          if(u.indexOf('article/publish')>=0&&b){
            var tb=String(b).match(/title_id=([^&]+)/); if(tb) window.__titleId=tb[1]
            window.__lastSaveBody=String(b)
          }
        }catch(e){}
        return os.apply(this,arguments)
      }
      var ta=[...document.querySelectorAll('textarea,input')].find(function(e){return /标题/.test(e.placeholder||'')})
      if(ta){ var s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
        s.call(ta, ta.value); ta.dispatchEvent(new Event('input',{bubbles:true})) }
      return 'SETUP_OK'
    })()`
    await win.webContents.executeJavaScript(setup)
    // 等页面捕获 body（最长 12s）；若 6s 后仍无，点一次页面真实「预览并发布」促发内部保存
    // （该按钮 onClick 会先执行保存再挂 deferred——保存请求可被 hook 捕获，门控只拦最终提交）
    for (let i = 0; i < 6; i++) {
      if (await win.webContents.executeJavaScript('String(window.__lastSaveBody||"").length>500')) break
      await tcDispatchCtrlS(win)
      await new Promise((r) => setTimeout(r, 2000))
    }
    if (!await win.webContents.executeJavaScript('String(window.__lastSaveBody||"").length>500')) {
      log.warn('RpaView', '[toutiao] Ctrl+S 未促发保存 → 点击页面「预览并发布」促发内部保存')
      await win.webContents.executeJavaScript(`(function(){
        var b=[...document.querySelectorAll('button')].filter(function(x){
          return String(x.innerText||'').replace(/\\s+/g,'')==='预览并发布'&&x.getClientRects().length>0})[0]
        if(b) b.click()
        return b?'CLICKED':'NO_BTN'
      })()`)
      await new Promise((r) => setTimeout(r, 4000))
    }
    const js = `(function(){
      // 原样重放页面自己的自动保存 body（含新鲜 pgc_id/title_id/tt-anti-token 上下文），
      // 仅把 save 改为 1（真发布；save=0 实为存草稿——2026-10-03 后台对照定案）
      var b=window.__lastSaveBody
      if(!b||b.length<500) return JSON.stringify({ok:false,reason:'NO_BODY'})
      var b2=b.replace(/(^|&)save=\\d+/,'$1save=1')
      var x=new XMLHttpRequest()
      x.open('POST','/mp/agw/article/publish?source=mp&type=article&aid=1231&mp_publish_ab_val=0',false)
      x.setRequestHeader('Content-Type','application/x-www-form-urlencoded;charset=UTF-8')
      x.send(b2)
      try{ var j=JSON.parse(x.responseText); return JSON.stringify({ok:true,code:j.code,msg:j.message,pgc:(j.data&&j.data.pgc_id)||''}) }
      catch(e){ return JSON.stringify({ok:false,reason:'PARSE:'+String(e&&e.message).slice(0,50)}) }
    })()`
    const raw = await win.webContents.executeJavaScript(js)
    const r = JSON.parse(raw)
    log.info('RpaView', '[toutiao-xhr] code=' + r.code + ' msg=' + r.msg + ' pgcId=' + (r.pgc || '') + ' reason=' + (r.reason || '-'))
    if (r.ok && r.code === 0 && r.pgc && r.pgc !== '0') {
      return { success: true, platform: 'toutiao', pgcId: r.pgc }
    }
    return { success: false, platform: 'toutiao', error: 'XHR_REJECTED:' + r.code + ':' + (r.msg || r.reason || '').slice(0, 60) }
  } catch (e) {
    log.warn('RpaView', '[toutiao-xhr] 异常: ' + (e && e.message))
    return { success: false, platform: 'toutiao', error: 'XHR_THREW:' + String(e && e.message).slice(0, 60) }
  }
}

/**
 * 安装 XHR 捕获 hook（由 rpa-view-platforms._execHook 在 preFill 阶段调用）：
 * 在编辑器加载完成后立即挂钩，捕获填充触发的所有 publish 自动保存请求 body。
 * hook 挂在 window.__lastSaveBody；兜底重放时直接读取（无需再等）。
 * @param {{win: any, log: any}} p
 * @returns {Promise<void>}
 */
async function installToutiaoSaveHook ({ win, log }) {
  try {
    const setup = `(function(){
      if(window.__lastSaveBody!==undefined) return 'ALREADY'
      window.__lastSaveBody=''; window.__titleId=''
      var oo=XMLHttpRequest.prototype.open, os=XMLHttpRequest.prototype.send
      XMLHttpRequest.prototype.open=function(m,u){this.__u=String(u);return oo.apply(this,arguments)}
      XMLHttpRequest.prototype.send=function(b){
        try{ var u=this.__u||''
          if(u.indexOf('article/publish')>=0&&b){
            var tb=String(b).match(/title_id=([^&]+)/); if(tb) window.__titleId=tb[1]
            window.__lastSaveBody=String(b)
          }
        }catch(e){}
        return os.apply(this,arguments)
      }
      return 'HOOKED'
    })()`
    await win.webContents.executeJavaScript(setup)
    if (log) log.info('RpaView', '[toutiao] preFill XHR hook 已安装（捕获自动保存 body）')
  } catch (_e) { /* hook 失败不影响 DOM 流程 */ }
}

module.exports = { publishDirect, publishToutiaoWithFallback, publishToutiao, installToutiaoSaveHook }

