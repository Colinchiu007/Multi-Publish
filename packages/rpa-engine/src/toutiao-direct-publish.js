// @ts-check
/**
 * toutiao-direct-publish —— 头条 Node 侧直连发布（蚁小二同构，2026-10-02 立项落地）
 *
 * 背景（PRD §16.8.8）：DOM 点击被 onClick 闭包门控拦下（14 项排除定案），而页面自动保存
 * （source=29）能 code=0 ⇒ 走「页面内 SDK 签名 + Node 直连 + 蚁小二字段表」的 API 路线。
 *
 * 依赖三件套：
 *   1. cookies  —— 从 Electron session 导出（含 HttpOnly 登录态，document.cookie 拿不到）
 *   2. a_bogus  —— 页面内 byted_acrawler.sign({url,query,body}) 产出（publish-signer.hostSdkAdapter）
 *   3. body     —— buildPostData 字段表（蚁小二同款，见 toutiao-node-publish.js）
 *
 * ⚠️ 页面内 fetch 与页面自身 XHR 的上下文标记不同 ⇒ 必须在 Node 侧发请求（实测 100005 教训）。
 */
'use strict'

const https = require('https')
const { URL } = require('url')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const PUBLISH_URL = 'https://mp.toutiao.com/mp/agw/article/publish'
const PUBLISH_QUERY = 'source=mp&type=article&aid=1231&mp_publish_ab_val=0'
const UPLOAD_PATH = '/spice/image?upload_source=20020003&aid=1231&device_platform=web&need_cover_url=1'
const REFERER = 'https://mp.toutiao.com/profile_v4/graphic/publish'

/**
 * 从 Electron session 导出头条 cookie 串。
 * @param {Electron.Session} session
 * @param {{domain?: string}} [opts] 默认 toutiao.com 全域
 * @returns {Promise<string>} "k=v; k2=v2"（按 name 排序，保证可复现）
 */
async function cookiesFromSession (session, opts = {}) {
  const domain = opts.domain || 'toutiao.com'
  const list = await session.cookies.get({ domain })
  return list
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')
}

/**
 * 蚁小二 buildPostData 同款字段表。
 * @param {{title: string, htmlContent: string, covers?: Array<{uri:string, image_url?:string, thumb_width?:number, thumb_height?:number}>, publishTime?: string, adType?: number, original?: number}} p
 * @returns {string} form-urlencoded body
 */
function buildPostData (p) {
  const covers = p.covers || []
  const P = {}
  P.source = 0
  P.disable_praise = 0
  P.is_fans_article = 0
  P.tree_plan_article = 0
  P.title = encodeURIComponent(p.title || '')
  P.content = encodeURIComponent(p.htmlContent || '')
  P.save = 0
  if (covers.length > 0) {
    P.mp_editor_stat = encodeURIComponent(JSON.stringify({ image: covers.length }))
    P.pgc_feed_covers = encodeURIComponent(JSON.stringify(covers.map((c) => ({
      ic_uri: '', id: '',
      thumb_width: c.thumb_width || 120, thumb_height: c.thumb_height || 90,
      uri: c.uri, url: c.image_url || ('https://p3-sign.toutiaoimg.com/' + c.uri + '~noop.image'),
      thumb_url: c.uri, origin_uri: c.uri,
    }))))
  } else {
    P.pgc_feed_covers = encodeURIComponent('[]')
  }
  P.article_ad_type = p.adType === undefined ? 2 : p.adType
  if (p.original === 1) { P.origin_debut_check_pgc_normal = 1; P.claim_origin = 1; P.pgc_debut = 1; P.exclusive = 1 }
  else { P.origin_debut_check_pgc_normal = 0; P.claim_origin = 0 }
  const U = { gd_ext: { entrance: '', from_page: 'publisher_mp', enter_from: 'PC', device_platform: 'mp', is_message: 0 } }
  P.extra = encodeURIComponent(JSON.stringify(U))
  P.extern_link = ''
  if (p.publishTime) { P.timer_status = 1; P.timer_time = encodeURIComponent(p.publishTime.slice(0, 16)) }
  else { P.timer_status = 0; P.timer_time = '' }
  return Object.keys(P).map((k) => k + '=' + P[k]).join('&')
}

/** https POST 通用 */
function _post (url, { cookies, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'Referer': REFERER,
        'Origin': 'https://mp.toutiao.com',
        'User-Agent': UA,
        'Content-Length': Buffer.byteLength(body || ''),
        ...headers,
      },
    }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(data) } catch (_e) { /* 保留原文 */ }
        resolve({ status: res.statusCode, json, raw: data.slice(0, 500) })
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

/**
 * 封面上传（spice/image）。
 * @returns {Promise<{status:number, code?:number, uri?:string, image_url?:string, raw?:string}>}
 */
async function uploadCover ({ cookies, imageBuffer, filename = 'cover.jpg', mimeType = 'image/jpeg' }) {
  const boundary = '----MPBoundary' + Math.random().toString(36).slice(2)
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`)
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  const body = Buffer.concat([head, imageBuffer, tail])
  const r = await _post('https://mp.toutiao.com' + UPLOAD_PATH, {
    cookies, body,
    headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
  })
  return {
    status: r.status,
    code: r.json && r.json.code,
    uri: r.json && r.json.data && (r.json.data.image_uri || r.json.data.uri),
    image_url: r.json && r.json.data && r.json.data.image_url,
    raw: r.raw,
  }
}

/**
 * 正式发布（要求调用方已拿到 a_bogus 签名）。
 * @param {{cookies: string, body: string, aBogus: string}} p
 * @returns {Promise<{status:number, code?:number, message?:string, pgcId?:string, raw?:string}>}
 */
async function publishWithSign ({ cookies, body, aBogus }) {
  const r = await _post(PUBLISH_URL + '?' + PUBLISH_QUERY + '&a_bogus=' + encodeURIComponent(aBogus), {
    cookies, body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
  })
  return {
    status: r.status,
    code: r.json && r.json.code,
    message: r.json && r.json.message,
    pgcId: r.json && r.json.data && r.json.data.pgc_id,
    raw: r.raw,
  }
}

module.exports = { cookiesFromSession, buildPostData, uploadCover, publishWithSign, UA, PUBLISH_URL, PUBLISH_QUERY, REFERER }
