// lib-toutiao-node-publish.js — Node 侧直连发布（蚁小二同构）：cookie 从 profile 导出，签名复用页面内 SDK 产出值
// 注意：签名必须与请求时的 ua/query/body 完全一致；本库提供"取 cookie + 构造 body + 发请求"的完整链
'use strict'
const https = require('https')
const { URL } = require('url')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * 从 Electron session（cookieStore）导出的 cookie 串发请求。
 * cookies: 形如 "name=value; name2=value2" 的完整 cookie 串（由调用方从 session 导出）
 */
function postPublish ({ cookies, body, query, aBogus }) {
  const qs = query + '&a_bogus=' + encodeURIComponent(aBogus)
  const url = 'https://mp.toutiao.com/mp/agw/article/publish?' + qs
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'Referer': 'https://mp.toutiao.com/profile_v4/graphic/publish',
        'Origin': 'https://mp.toutiao.com',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': UA,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }) }
        catch (e) { resolve({ status: res.statusCode, raw: data.slice(0, 400) }) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

/** 蚁小二 buildPostData 同款字段表（timer_status=1 定时 / 0 立即） */
function buildPostData ({ title, htmlContent, covers = [], publishTime = '', adType = 2, original = 0 }) {
  const P = {}
  P.source = 0
  P.disable_praise = 0
  P.is_fans_article = 0
  P.tree_plan_article = 0
  P.title = encodeURIComponent(title || '')
  P.content = encodeURIComponent(htmlContent || '')
  P.save = 0
  if (covers.length > 0) {
    P.mp_editor_stat = encodeURIComponent(JSON.stringify({ image: covers.length }))
    P.pgc_feed_covers = encodeURIComponent(JSON.stringify(covers.map((c) => ({
      ic_uri: '', id: '', thumb_width: c.thumb_width || 120, thumb_height: c.thumb_height || 90,
      uri: c.uri, url: c.url || ('https://p3-sign.toutiaoimg.com/' + c.uri + '~noop.image'),
      thumb_url: c.uri, origin_uri: c.uri,
    }))))
  } else {
    P.pgc_feed_covers = encodeURIComponent('[]')
  }
  P.article_ad_type = adType
  if (original === 1) { P.origin_debut_check_pgc_normal = 1; P.claim_origin = 1; P.pgc_debut = 1; P.exclusive = 1 }
  else { P.origin_debut_check_pgc_normal = 0; P.claim_origin = 0 }
  const U = { gd_ext: { entrance: '', from_page: 'publisher_mp', enter_from: 'PC', device_platform: 'mp', is_message: 0 } }
  P.extra = encodeURIComponent(JSON.stringify(U))
  P.extern_link = ''
  if (publishTime) { P.timer_status = 1; P.timer_time = encodeURIComponent(publishTime.slice(0, 16)) }
  else { P.timer_status = 0; P.timer_time = '' }
  return Object.keys(P).map((k) => k + '=' + P[k]).join('&')
}

/** 封面上传（spice/image，蚁小二同款） */
function uploadCover ({ cookies, imageBuffer, filename = 'cover.jpg', mimeType = 'image/jpeg' }) {
  return new Promise((resolve, reject) => {
    // multipart 手工构造
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2)
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`)
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
    const body = Buffer.concat([head, imageBuffer, tail])
    const req = https.request({
      hostname: 'mp.toutiao.com',
      path: '/spice/image?upload_source=20020003&aid=1231&device_platform=web&need_cover_url=1',
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'Referer': 'https://mp.toutiao.com/profile_v4/graphic/publish',
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'User-Agent': UA,
        'Content-Length': body.length,
      },
    }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        try {
          const j = JSON.parse(data)
          resolve({ status: res.statusCode, code: j.code, image_uri: j.data && j.data.image_uri, image_url: j.data && j.data.image_url, raw: data.slice(0, 300) })
        } catch (e) { resolve({ status: res.statusCode, raw: data.slice(0, 300) }) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

module.exports = { postPublish, buildPostData, uploadCover, UA }
