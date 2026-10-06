'use strict'
/**
 * douyin-capabilities.js — 抖音「发布前能力面」（W4 §3）
 *
 * 补齐发布链之外的三件事，均逐字对齐参考产品取证切片
 * （01-docs/rpa-api-publish/evidence/yx-orch.txt）：
 *   1. userInfo          GET  /aweme/v1/creator/user/info/      （getCreatorUserInfo）
 *   2. publishPermission GET  /aweme/v1/life/video_api/post/permission/
 *                                       （getUserPositionPrivilegeNew）
 *   3. poiRecommend      GET  /aweme/v1/poi/recommend/         （getUserPositionPrivilege）
 *
 * 为什么必须有第 2 项：现有 douyin-video.js 链是「失败才知道能不能发」——
 * status_code 110 / x-tt-verify-passport-decision 都是发完之后才发现风控，
 * 视频已传完、封面已传完才发现不能发。权限预检把失败点前移到零字节上传。
 * 第 3 项同理：现有链里 `poi_name: ''` 恒为空串（buildDouyinPostData），
 * 即「能发但发不出位置」；接上推荐列表后位置才有真值可填。
 *
 * 合规：只直连 creator.douyin.com 官方域；client 全部可注入 → 测试零外发。
 * fail-closed：缺 cookie 抛错且零请求（与既有链同一纪律）。
 */
const { createHttpClient, requestWithRetry } = require('../core/http-base')
const { errorCode } = require('../../error-codes')

const CREATOR_BASE = 'https://creator.douyin.com'
const REFERER = CREATOR_BASE + '/creator-micro/home'
const ORIGIN = CREATOR_BASE
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const APP_ID = 2906

/** 取证切片里的固定浏览器参数段（three 段查询串共用，逐字对齐）。 */
const COMMON_QUERY = {
  from_webapp: 1,
  cookie_enabled: true,
  screen_width: 1920,
  screen_height: 1080,
  browser_language: 'zh-CN',
  browser_platform: 'Win32',
  browser_name: 'Mozilla',
  browser_version: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  browser_online: true,
  timezone_name: 'Asia/Shanghai',
  aid: APP_ID,
  _signature: '_',
}

const USER_INFO_PATH = '/aweme/v1/creator/user/info/'
const POST_PERMISSION_PATH = '/aweme/v1/life/video_api/post/permission/'
const POI_RECOMMEND_PATH = '/aweme/v1/poi/recommend/'

class DouyinCapabilitiesError extends Error {
  constructor (message, code) {
    super(message)
    this.name = 'DouyinCapabilitiesError'
    this.code = code === undefined ? errorCode.data_error : code
  }
}

function buildQuery (extra) {
  const params = Object.assign({}, COMMON_QUERY, extra || {})
  return Object.keys(params)
    .map((k) => {
      const v = params[k]
      // 对象入参必须先 JSON 序列化：直接 encodeURIComponent({}) 会得到
      // 「[object]%20Object」，而取证切片里是 options=%7B%7D（即 {} 的 JSON 形态）。
      const raw = (v !== null && typeof v === 'object') ? JSON.stringify(v) : v
      return encodeURIComponent(k) + '=' + encodeURIComponent(raw)
    })
    .join('&')
}

class DouyinCapabilities {
  /**
   * @param {{cookie:string, userAgent?:string, client?:object, timeout?:number}} opts
   *   client 注入点：测试指向本机假 HTTP 服务器，零外发。
   */
  constructor (opts = {}) {
    this.cookie = opts.cookie
    this.userAgent = opts.userAgent || UA
    this.client = opts.client || createHttpClient({
      baseURL: opts.apiBase || CREATOR_BASE,
      timeout: opts.timeout,
      agents: opts.agents,
      headers: { 'User-Agent': this.userAgent },
    })
  }

  /** fail-closed：缺 cookie 抛错且零请求 */
  _assertCookie () {
    if (!this.cookie) {
      throw new DouyinCapabilitiesError(
        'douyin-capabilities: missing cookie (fail-closed, refusing to query)', errorCode.data_error)
    }
  }

  _headers () {
    return { Cookie: this.cookie, Referer: REFERER, Origin: ORIGIN, 'User-Agent': this.userAgent }
  }

  async _get (path, extraQuery) {
    this._assertCookie()
    const url = path + '?' + buildQuery(extraQuery)
    return requestWithRetry(this.client, {
      method: 'get', url, headers: this._headers(),
      validateStatus: (s) => s >= 200 && s < 500,
    })
  }

  /** 1. 账号信息（昵称/头像/uid）—— 供账号云上行字段与发布前置展示使用。 */
  async userInfo () {
    const res = await this._get(USER_INFO_PATH)
    const d = res.data || {}
    if (d.status_code !== undefined && d.status_code !== 0) {
      throw new DouyinCapabilitiesError(
        'douyin-capabilities: user info status_code=' + d.status_code, errorCode.data_error)
    }
    return {
      platform: 'douyin',
      uid: String((d.user && (d.user.uid || d.user.sec_uid)) || d.uid || ''),
      nickname: (d.user && d.user.nickname) || '',
      avatar: (d.user && (d.user.avatar_life || d.user.avatar_medium || d.user.avatar_168x168)) || '',
      raw: d,
    }
  }

  /**
   * 2. 发布权限预检。返回能否发布，而不是把失败点留到上传之后。
   *    裁定口径与既有链一致：风控/验证一律 risk_blocked，绝不自动换号。
   */
  async publishPermission () {
    const res = await this._get(POST_PERMISSION_PATH, { is_image_album_style: 0, options: {} })
    const d = res.data || {}

    // **fail-closed**：只有 status_code === 0 这一个肯定分支可以放行。
    // 此前把「无法识别」（status_code 缺失、风控换壳、平台改字段名、网关兜底返 {}）
    // 一律落到末尾的 allowed:true —— 与本函数存在的意义正好相反：它的全部价值
    // 就是把失败点前移到零字节上传，一旦遇到没见过的响应就报「可以发」，
    // 预检就退化成了摆设。**改动平台语义必须显式承认，不靠默认放行兜底。**
    if (d.status_code === 0) {
      return { allowed: true, risk_blocked: false, platform: 'douyin', reason: '', raw: d }
    }
    if (d.status_code === 110) {
      return {
        allowed: false, risk_blocked: true, platform: 'douyin',
        reason: '抖音安全验证未通过（status_code=110），请在创作者中心手动完成验证后重试',
      }
    }
    if (d.status_code !== undefined && d.status_code !== null && typeof d.status_code === 'number') {
      return {
        allowed: false, risk_blocked: false, platform: 'douyin',
        reason: '抖音发布权限不可用 status_code=' + d.status_code,
      }
    }
    // 响应无法识别：status_code 缺失 / 为 null / 非数字（风控换壳、平台改字段名、
    // 网关兜底返 {}、上游把异常吞成空体）。上面两个肯定分支都判过之后才走到这里，
    // 说明平台返回了本模块没有取证覆盖的形状——不猜，按拒绝处理。
    // unrecognized 供调用方区分「平台明说不行」与「我们读不懂」。
    return {
      allowed: false, risk_blocked: false, platform: 'douyin', unrecognized: true,
      reason: '抖音发布权限响应无法识别（缺 status_code），按 fail-closed 拒绝放行；不猜测平台语义',
      raw: d,
    }
  }

  /**
   * 3. POI 位置推荐。取证端点无关键词入参，返回创作者可用的推荐点位集合。
   *    调用方按需取 poi_id / poi_name 填进投稿体的 poi_name。
   */
  async poiRecommend () {
    const res = await this._get(POI_RECOMMEND_PATH)
    const d = res.data || {}
    const list = Array.isArray(d.poi_list) ? d.poi_list
      : Array.isArray(d.data && d.data.poi_list) ? d.data.poi_list
        : Array.isArray(d.list) ? d.list : []
    return {
      platform: 'douyin',
      items: list.map((p) => ({
        id: String((p && (p.poi_id || p.id)) || ''),
        name: String((p && p.poi_name) || ''),
        city: String((p && (p.city_name || p.city)) || ''),
        raw: p,
      })).filter((x) => x.id || x.name),
      raw: d,
    }
  }
}

module.exports = {
  DouyinCapabilities,
  DouyinCapabilitiesError,
  CREATOR_BASE,
  USER_INFO_PATH,
  POST_PERMISSION_PATH,
  POI_RECOMMEND_PATH,
  buildQuery,
}
