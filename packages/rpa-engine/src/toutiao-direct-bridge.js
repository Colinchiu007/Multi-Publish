// @ts-check
/**
 * toutiao-direct-bridge —— 头条 Node 直连兜底的执行桥（从 rpa-view-platforms 拆出，行数门禁）
 *
 * 职责：cookie 导出（Electron session）→ body 构造（蚁小二字段表）→ 页面内 SDK 签名 → Node 直连 POST。
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

    // ⑤ Node 直连（蚁小二同构：页面内 fetch 的上下文标记会被服务端拒绝 ⇒ 必须 Node 侧发）
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
  })
  return publishToutiaoWithFallback({ win, article: { ...article, content: plainContent }, domResult, sign: p.sign, log })
}

module.exports = { publishDirect, publishToutiaoWithFallback, publishToutiao }
