'use strict'
/**
 * bilibili-capabilities.js — B站「发布前能力面」（W4 §4）
 *
 * 逐字对齐 01-docs/rpa-api-publish/evidence/yx-bundle-slices.txt：
 *   1. userInfo     GET  https://api.bilibili.com/x/web-interface/nav   （getUserInfoResponse$2）
 *   2. memberInfo   GET  https://api.bilibili.com/x/member/web/account  （getMemberInfoResponse）
 *   3. privilege    GET  https://api.bilibili.com/x/article/is_author  （getPrivilegeResponse）
 *
 * 为什么 privilege 值得单独一问：`is_author` 是 B站对「该账号是否为专栏作者」的
 * 权威裁定，而 B站图文走专栏入口（platform-entries.js:29）。非专栏账号发专栏会
 * 在投稿时被拒，而失败点现在可以前移到零字节上传。
 *
 * 合规：只直连 bilibili 官方域；client 可注入 → 测试零外发。
 * fail-closed：缺 cookie 抛错且零请求。
 */
const { createHttpClient, requestWithRetry } = require('../core/http-base')
const { errorCode } = require('../../error-codes')

const API_BASE = 'https://api.bilibili.com'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const USER_INFO_PATH = '/x/web-interface/nav'
const MEMBER_INFO_PATH = '/x/member/web/account'
const PRIVILEGE_PATH = '/x/article/is_author'

/** B站业务码：0 正常；-101 未登录；-352/-412 风控拦截（与既有链的 cookieExpired/601 并列）。 */
const BILI_CODE = {
  OK: 0,
  NOT_LOGIN: -101,
  RISK_CONTROL: -352,
}

class BilibiliCapabilitiesError extends Error {
  constructor (message, code) {
    super(message)
    this.name = 'BilibiliCapabilitiesError'
    this.code = code === undefined ? errorCode.data_error : code
  }
}

class BilibiliCapabilities {
  /**
   * @param {{cookie:string, userAgent?:string, client?:object, timeout?:number}} opts
   */
  constructor (opts = {}) {
    this.cookie = opts.cookie
    this.userAgent = opts.userAgent || UA
    this.client = opts.client || createHttpClient({
      baseURL: opts.apiBase || API_BASE,
      timeout: opts.timeout,
      agents: opts.agents,
      headers: { 'User-Agent': this.userAgent },
    })
  }

  _assertCookie () {
    if (!this.cookie) {
      throw new BilibiliCapabilitiesError(
        'bilibili-capabilities: missing cookie (fail-closed, refusing to query)', errorCode.data_error)
    }
  }

  async _get (path, referer) {
    this._assertCookie()
    const res = await requestWithRetry(this.client, {
      method: 'get', url: path,
      headers: { Cookie: this.cookie, Referer: referer || 'https://member.bilibili.com/', 'User-Agent': this.userAgent },
      validateStatus: (s) => s >= 200 && s < 500,
    })
    const d = res.data || {}
    if (d.code !== undefined && d.code !== BILI_CODE.OK) {
      const loginExpired = d.code === BILI_CODE.NOT_LOGIN || d.code === -1025 || d.code === -1026
      throw Object.assign(
        new BilibiliCapabilitiesError(
          'bilibili-capabilities: ' + path + ' code=' + d.code + ' msg=' + (d.message || ''),
          loginExpired ? errorCode.data_error : errorCode.request_error),
        { biliCode: d.code, cookieExpired: loginExpired, message: d.message || '' })
    }
    return d.data === undefined ? d : d.data
  }

  /** 1. 账号信息。nav 同时带 mid 与登录态，是登录可用性的权威探针。 */
  async userInfo () {
    const data = await this._get(USER_INFO_PATH)
    return {
      platform: 'bilibili',
      uid: String((data && (data.mid !== undefined ? data.mid : data.wbi_img && '')) || ''),
      nickname: (data && data.uname) || '',
      avatar: (data && data.face) || '',
      level: (data && data.level_info && data.level_info.current_level) || 0,
      vip: Boolean(data && data.isVip),
      loggedIn: Boolean(data && data.isLogin),
      raw: data,
    }
  }

  /** 2. 账号详细资料（member/web/account）：昵称/签名/投币数等。 */
  async memberInfo () {
    const data = await this._get(MEMBER_INFO_PATH, 'https://account.bilibili.com/')
    const profile = (data && data.profile) || {}
    return {
      platform: 'bilibili',
      uid: String(profile.mid || ''),
      nickname: profile.name || '',
      sign: profile.sign || '',
      coins: profile.money || 0,
      raw: profile,
    }
  }

  /** 3. 图文（专栏）发布权限预检。 */
  async publishPermission () {
    const data = await this._get(PRIVILEGE_PATH)
    const allowed = Number(data && data.is_author) === 1
    return {
      allowed,
      risk_blocked: false,
      platform: 'bilibili',
      reason: allowed ? '' : '当前账号未开通专栏（is_author != 1），B站图文投稿会被拒；视频投稿不受影响',
      raw: data,
    }
  }
}

module.exports = {
  BilibiliCapabilities,
  BilibiliCapabilitiesError,
  API_BASE,
  USER_INFO_PATH,
  MEMBER_INFO_PATH,
  PRIVILEGE_PATH,
  BILI_CODE,
}