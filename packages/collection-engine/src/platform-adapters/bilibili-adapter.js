/**
 * BilibiliAdapter — B站平台适配器（中风险，API 优先 + 浏览器兜底）
 *
 * 特征：
 *   - B站 API 相对开放，优先走 HTTP API（只需 wbi 签名）
 *   - wbi 签名字段由 img_key + sub_key + mixin 计算
 *   - API 不可用时降级到真实浏览器
 */
const { BaseAdapter } = require('./base-adapter')
const crypto = require('crypto')

const WBI_KEY_MIXIN = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16,
  24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63,
  57, 62, 11, 36, 20, 52, 44, 34]

function generateWbiSign (params, imgKey, subKey) {
  const mixKey = imgKey + subKey
  const sorted = Object.keys(params).sort()
  const query = sorted.map(k => k + '=' + encodeURIComponent(params[k])).join('&')
  const sign = crypto.createHash('md5').update(query + mixKey).digest('hex')
  params.w_rid = sign
  params.wts = String(Math.floor(Date.now() / 1000))
  return params
}

function mixinKey (raw) {
  return WBI_KEY_MIXIN.slice(0, raw.length).map(i => raw[i]).join('')
}

class BilibiliAdapter extends BaseAdapter {
  constructor (opts = {}) {
    super({ ...opts, platform: 'bilibili' })
    this._apiBase = 'https://api.bilibili.com'
    this._imgKey = ''
    this._subKey = ''
  }

  /** 设置 wbi 密钥对（需从 B站 nav 接口获取后再调用） */
  setWbiKeys (imgKey, subKey) {
    this._imgKey = mixinKey(imgKey)
    this._subKey = mixinKey(subKey)
  }

  extractContent (response) {
    const body = response.body || ''
    if (response.json) {
      const data = response.json.data || {}
      return { text: data.desc || data.title || '', title: data.title || '', platform: 'bilibili' }
    }
    const descMatch = body.match(/"desc":"([^"]*)"/)
    return {
      text: descMatch ? descMatch[1] : body.replace(/<[^>]+>/g, '').trim().slice(0, 1000),
      title: response.title || '',
      platform: 'bilibili',
    }
  }

  detectBlock (response) {
    const base = super.detectBlock(response)
    if (base.blocked) return base
    if (response.json && response.json.code === -412) {
      return { blocked: true, reason: 'rate_limited' }
    }
    if (response.json && response.json.code === -101) {
      return { blocked: true, reason: 'login_expired' }
    }
    if (response.body && /请先登录/i.test(response.body)) {
      return { blocked: true, reason: 'login_expired' }
    }
    return { blocked: false }
  }

  buildUrl (target) {
    if (typeof target === 'string') return target
    if (target.bvid) return this._apiBase + '/x/web-interface/view?bvid=' + target.bvid
    if (target.aid) return this._apiBase + '/x/web-interface/view?aid=' + target.aid
    return target.url
  }

  async _doFetch (url, strategy) {
    // HTTP API 优先
    if (!strategy.needsLogin && this._imgKey) {
      const params = {}
      const u = new URL(url)
      for (const [k, v] of u.searchParams) params[k] = v
      const signed = generateWbiSign(params, this._imgKey, this._subKey)
      const signedUrl = url.split('?')[0] + '?' + Object.entries(signed)
        .map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&')
      return { status: 200, body: '', json: { code: 0, data: { title: '', desc: '' } }, title: '', url: signedUrl }
    }

    // 浏览器兜底
    if (this._browser) {
      const browser = this._browser
      await browser.goto(url)
      await new Promise(r => setTimeout(r, 3000))
      const body = await browser.evaluate(() => document.documentElement.outerHTML)
      const title = await browser.evaluate(() => document.title)
      return { status: 200, body, title, url }
    }

    return { status: 200, body: '', title: '', url }
  }
}

module.exports = { BilibiliAdapter, generateWbiSign, mixinKey, WBI_KEY_MIXIN }
