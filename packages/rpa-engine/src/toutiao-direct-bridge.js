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
  // 2026-10-03 预装 XHR hook：捕获页面自动保存的 publish body（供兜底用页面 XHR 复刻）
  try {
    await win.webContents.executeJavaScript(
      '(function(){if(window.__lastSaveBody!==undefined)return "ALREADY";' +
      'window.__lastSaveBody="";' +
      'var oo=XMLHttpRequest.prototype.open,os=XMLHttpRequest.prototype.send;' +
      'XMLHttpRequest.prototype.open=function(m,u){this.__u=String(u);return oo.apply(this,arguments)};' +
      'XMLHttpRequest.prototype.send=function(b){try{var u=this.__u||"";' +
      'if(u.indexOf("article/publish")>=0&&b&&b.length>500){window.__lastSaveBody=String(b)}}catch(e){};' +
      'return os.apply(this,arguments)}})()'
    )
  } catch (_e) { /* hook 失败不影响 DOM 流程 */ }
  // 2026-10-03 ⭐ 首选：页面 XHR 定时发布（DOM 流程之前执行）——
  // 头条是两段式设计（首点只挂起），DOM 点击在此页面形态下永远停在"已保存草稿"；
  // 而自动保存（内容填充触发）会产生完整 body（含有效 pgc_id/title_id），
  // 此时改 save=0 + timer_status=1 用页面 XHR 发出即可真发布（真机验证 code=0）。
  // 页面 XHR 继承页面全部上下文（SDK 注入 tt-anti-token），页面内 fetch 则会被拒。
  try {
    // 等自动保存（内容填充 → 页面周期性自动保存；最长 45s）
    for (let i = 0; i < 23; i++) {
      const has = await win.webContents.executeJavaScript('String(window.__lastSaveBody||"").length>500')
      if (has) { log.info('RpaView', '[toutiao] 自动保存 body 已捕获（' + ((i + 1) * 2) + 's）'); break }
      await new Promise((r) => setTimeout(r, 2000))
    }
    const xhrResult = await publishViaPageXhr({ win, title: article && article.title, log })
    if (xhrResult.success) {
      log.info('RpaView', '[toutiao] 页面 XHR 定时发布成功 pgcId=' + xhrResult.pgcId + '（跳过 DOM 流程）')
      return xhrResult
    }
    log.warn('RpaView', '[toutiao] 页面 XHR 兜底未成功: ' + (xhrResult.error || '') + ' → 回退 DOM 流程')
  } catch (e) {
    log.warn('RpaView', '[toutiao] 页面 XHR 预发异常: ' + (e && e.message) + ' → 回退 DOM 流程')
  }
  const domResult = await host._publish_generic(win, { ...article, content: plainContent }, 'toutiao', {
    ...config,
    publish_url: publishUrl || config.publish_url,
    // 「展示封面」必填且默认「单图」但封面为空（真机取证）⇒ 传入封面图；第 52 轮实验证实封面非阻塞点
    prePublishHook: 'uploadCover',
    hookContext: { coverPath: (article.images && article.images[0]) || article.cover_path || null },
  })
  // 2026-10-03 新增第一优先兜底：页面 XHR 定时发布（真机验证 code=0，多次复现）。
  // 原理：自动保存的 publish 请求 body（含有效 pgc_id/title_id）改 save=0 + timer_status=1，
  // 用【页面自身 XHR】发出（继承页面全部上下文；页面内 fetch 会被拒，XHR 不会）。
  if (domResult && domResult.success === false && /verification timeout/.test(String(domResult.error || ''))) {
    const xhrResult = await publishViaPageXhr({ win, title: article && article.title, log })
    if (xhrResult.success) return xhrResult
  }
  return publishToutiaoWithFallback({ win, article: { ...article, content: plainContent }, domResult, sign: p.sign, log })
}

/**
 * 页面 XHR 定时发布（2026-10-03 真机验证 code=0）：
 * 在页面上下文里【实时读取编辑器内容】构造 body（含页面自动保存产生的 pgc_id/title_id
 * 由服务端在 publish 时分配，body 需带上一次保存返回的 pgc_id —— 从页面内存读），
 * 改 save=0 + timer_status=1（+1 分钟），用【页面自身的 XMLHttpRequest】同步发出。
 * 关键：页面 XHR 继承页面全部上下文（SDK 注入 tt-anti-token），页面内 fetch 则会被拒。
 * @param {{win: any, title?: string, log: any}} p
 * @returns {Promise<{success: boolean, platform: string, pgcId?: string, error?: string}>}
 */
async function publishViaPageXhr ({ win, title, log }) {
  try {
    const js = `(function(){
      // 编辑器实时内容
      var ta=[...document.querySelectorAll('textarea,input')].find(function(e){return /标题/.test(e.placeholder||'')})
      var title=ta?String(ta.value||''):'' + '${JSON.stringify(String(title || '')).slice(1, -1)}'
      var ed=document.querySelector('.ProseMirror')||document.querySelector('[contenteditable]')
      var html=ed?ed.innerHTML:''
      if(!title&&!html) return JSON.stringify({ok:false,reason:'EMPTY_EDITOR'})
      // pgc_id：页面自动保存链路会在内存里持有；从最近一次 publish 响应缓存读
      var pgc=window.__pgcIdCache||''
      var d=new Date(Date.now()+60*1000)
      function p2(n){return (n<10?'0':'')+n}
      var tt=d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())+' '+p2(d.getHours())+':'+p2(d.getMinutes())
      var P={}
      P.source=29
      P.extra=encodeURIComponent(JSON.stringify({content_source:100000000402,content_word_cnt:html.replace(/<[^>]+>/g,'').length,is_multi_title:0,sub_titles:[],gd_ext:{entrance:'',from_page:'publisher_mp',enter_from:'PC',device_platform:'mp',is_message:0},tuwen_wtt_transfer_switch:'1'}))
      P.content=encodeURIComponent(html)
      P.title=encodeURIComponent(title)
      P.search_creation_info=encodeURIComponent(JSON.stringify({searchTopOne:0,abstract:'',clue_id:''}))
      P.title_id=window.__titleIdCache||''
      P.mp_editor_stat='{}'
      P.is_refute_rumor=0
      P.save=0
      P.entrance=''
      P.timer_status=1
      P.timer_time=encodeURIComponent(tt)
      P.educluecard=''
      P.draft_form_data=encodeURIComponent(JSON.stringify({coverType:2}))
      P.pgc_feed_covers=encodeURIComponent('[]')
      P.article_ad_type=2
      P.is_fans_article=0
      P.govern_forward=0
      P.praise=0
      P.disable_praise=0
      P.tree_plan_article=0
      P.star_order_id=''
      P.star_order_name=''
      P.activity_tag=0
      P.trends_writing_tag=0
      P.claim_exclusive=1
      if(pgc) P.pgc_id=pgc
      var body=Object.keys(P).map(function(k){return k+'='+P[k]}).join('&')
      var x=new XMLHttpRequest()
      x.open('POST','/mp/agw/article/publish?source=mp&type=article&aid=1231&mp_publish_ab_val=0',false)
      x.setRequestHeader('Content-Type','application/x-www-form-urlencoded;charset=UTF-8')
      x.send(body)
      try{ var j=JSON.parse(x.responseText); var pid=(j.data&&j.data.pgc_id)||''; if(pid&&pid!=='0') window.__pgcIdCache=String(pid)
        return JSON.stringify({ok:true,code:j.code,msg:j.message,pgc:pid,timer:tt}) }
      catch(e){ return JSON.stringify({ok:false,reason:'PARSE:'+String(e&&e.message).slice(0,50)}) }
    })()`
    const raw = await win.webContents.executeJavaScript(js)
    const r = JSON.parse(raw)
    log.info('RpaView', '[toutiao-xhr] code=' + r.code + ' msg=' + r.msg + ' pgcId=' + r.pgc + ' timer=' + (r.timer || ''))
    if (r.ok && r.code === 0 && r.pgc && r.pgc !== '0') {
      return { success: true, platform: 'toutiao', pgcId: r.pgc }
    }
    return { success: false, platform: 'toutiao', error: 'XHR_REJECTED:' + r.code + ':' + (r.msg || r.reason || '').slice(0, 60) }
  } catch (e) {
    log.warn('RpaView', '[toutiao-xhr] 异常: ' + (e && e.message))
    return { success: false, platform: 'toutiao', error: 'XHR_THREW:' + String(e && e.message).slice(0, 60) }
  }
}

module.exports = { publishDirect, publishToutiaoWithFallback, publishToutiao }
