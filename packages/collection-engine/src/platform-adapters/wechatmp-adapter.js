/**
 * WechatMpAdapter — 微信公众号适配器（低风险，HTTP 直采）
 */
const { BaseAdapter } = require('./base-adapter')

class WechatMpAdapter extends BaseAdapter {
  constructor (opts = {}) {
    super({ ...opts, platform: 'wechat_mp' })
  }

  extractContent (response) {
    const body = response.body || ''
    // 简化提取：公众号文章正文通常位于 #js_content
    const match = body.match(/<div[^>]*id="js_content"[^>]*>([\s\S]*?)<\/div>/i)
    const text = match ? match[1].replace(/<[^>]+>/g, '').trim() : body.replace(/<[^>]+>/g, '').trim()
    return { text, title: response.title || '' }
  }

  buildUrl (target) {
    if (typeof target === 'string') return target
    return target.url
  }
}

module.exports = { WechatMpAdapter }
