'use strict'
/**
 * baijiahao-capabilities.js — 百家号「发布前能力面」（W4 §8）
 *
 * 逐字对齐 01-docs/rpa-api-publish/evidence/yx-slices-v2.txt：
 *   poiRecommend  POST /pcui/Brain/CoordRcmd   body={width,height,url,type}
 *                （getCoordRcmdAsync）
 *   drafts        GET  /pcui/article/lists     params={currentPage,pageSize,type,collection,search,dynamic}
 *                （getContentListAsync$a）
 *
 * 草稿箱这一项补的是既有链的真实缺口：baijiahao-article.js 只会「写草稿」
 * （save?callback=bjhdraft），却没有任何读回草稿的入口 —— 排期任务失败后
 * 用户看不到已存的草稿，运营侧等于失明。
 *
 * 合规：只直连 baijiahao.baidu.com 官方域；client 可注入 → 测试零外发。
 */
const { createHttpClient, requestWithRetry } = require('../core/http-base')
const { errorCode } = require('../../error-codes')

const BJH_BASE = 'https://baijiahao.baidu.com'
const COORD_RCMD_PATH = '/pcui/Brain/CoordRcmd'
const ARTICLE_LISTS_PATH = '/pcui/article/lists'
const CONTENT_REFERER = BJH_BASE + '/builder/rc/content'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

class BaijiahaoCapabilitiesError extends Error {
  constructor (message, code) {
    super(message)
    this.name = 'BaijiahaoCapabilitiesError'
    this.code = code === undefined ? errorCode.data_error : code
  }
}

class BaijiahaoCapabilities {
  /**
   * @param {{cookie:string, userAgent?:string, client?:object, timeout?:number}} opts
   */
  constructor (opts = {}) {
    this.cookie = opts.cookie
    this.userAgent = opts.userAgent || UA
    this.client = opts.client || createHttpClient({
      baseURL: opts.apiBase || BJH_BASE,
      timeout: opts.timeout,
      agents: opts.agents,
      headers: { 'User-Agent': this.userAgent },
    })
  }

  _assertCookie () {
    if (!this.cookie) {
      throw new BaijiahaoCapabilitiesError(
        'baijiahao-capabilities: missing cookie (fail-closed, refusing to query)', errorCode.data_error)
    }
  }

  /**
   * POI 位置推荐：按画布尺寸 + 正文 url + 内容类型取可挂载的坐标点。
   * 与抖音 poi/recommend 的差别：百家号这一路带 width/height/url 入参，
   * 返回的是与正文位置相关的推荐点（type 与 baijiahao-article 的内容类型一致）。
   */
  async poiRecommend (opts = {}) {
    this._assertCookie()
    const type = opts.type || 'news'
    const body = {
      width: opts.width || 1080,
      height: opts.height || 675,
      url: opts.url || '',
      type,
    }
    const res = await requestWithRetry(this.client, {
      method: 'post', url: COORD_RCMD_PATH, data: body,
      headers: {
        Cookie: this.cookie,
        referer: BJH_BASE + '/builder/rc/edit?type=' + type,
        'Content-type': 'application/x-www-form-urlencoded',
        'User-Agent': this.userAgent,
      },
      validateStatus: (s) => s >= 200 && s < 500,
    })
    const d = res.data || {}
    if (d.errno !== undefined && d.errno !== 0) {
      throw new BaijiahaoCapabilitiesError(
        'baijiahao-capabilities: CoordRcmd errno=' + d.errno + ' errmsg=' + (d.errmsg || ''))
    }
    const list = Array.isArray(d.data) ? d.data : []
    return {
      platform: 'baijiahao',
      items: list.map((p) => ({
        id: String((p && (p.id || p.point_id || p.loc_id)) || ''),
        name: String((p && (p.name || p.point_name)) || ''),
        raw: p,
      })).filter((x) => x.id || x.name),
      raw: d,
    }
  }

  /**
   * 草稿箱列表。type 缺省 news（图文），与 baijiahao-article 默认内容体裁一致。
   * dynamic:1 是切片里的固定入参——百家号用同一路由承载动态内容，不要删。
   */
  async drafts (opts = {}) {
    this._assertCookie()
    const type = opts.type || 'news'
    const params = {
      currentPage: Number(opts.page || 1) || 1,
      pageSize: Number(opts.pageSize || 10) || 10,
      type,
      collection: opts.collection || '',
      search: opts.search || '',
      dynamic: 1,
    }
    if (type === 'ugc_video') params.sub_type = 'vertical_small_video'
    const res = await requestWithRetry(this.client, {
      method: 'get', url: ARTICLE_LISTS_PATH, params,
      headers: { Cookie: this.cookie, referer: CONTENT_REFERER, 'User-Agent': this.userAgent },
      validateStatus: (s) => s >= 200 && s < 500,
    })
    const d = res.data || {}
    if (d.errno !== undefined && d.errno !== 0) {
      throw new BaijiahaoCapabilitiesError(
        'baijiahao-capabilities: article/lists errno=' + d.errno + ' errmsg=' + (d.errmsg || ''))
    }
    const list = Array.isArray(d.data) ? d.data : []
    return {
      platform: 'baijiahao',
      total: Number(d.total || list.length) || 0,
      items: list.map((it) => ({
        id: String((it && (it.id || it.article_id)) || ''),
        title: (it && it.title) || '',
        status: (it && it.status) || '',
        updatedAt: (it && it.update_time) || (it && it.publish_time) || '',
        raw: it,
      })),
      raw: d,
    }
  }
}

module.exports = {
  BaijiahaoCapabilities,
  BaijiahaoCapabilitiesError,
  BJH_BASE,
  COORD_RCMD_PATH,
  ARTICLE_LISTS_PATH,
}