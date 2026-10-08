'use strict'
/**
 * shipinhao-capabilities.js — 微信视频号「发布前能力面」（W4 §5）
 *
 * 逐字对齐 01-docs/rpa-api-publish/evidence/yx-bundle-slices.txt：
 *   authData  POST https://channels.weixin.qq.com/cgi-bin/mmfinderassistant-bin/auth/auth_data
 *            （getShipinhaoPrivilegeResponse）
 *   请求体：{ timestamp, _log_finder_uin:null, _log_finder_id, rawKeyBuff:null,
 *             pluginSessionId:null, scene:7, reqScene:7 }
 *   响应：data.finderUser.{ uin, finderUsername }（与既有链 buildShipinhaoPostData
 *         消费的 _log_finder_id / _log_finder_uin 同源）
 *
 * 一个端点同时给出账号身份与登录有效性：errCode 300334 / 300333 即登录失效
 * （既有链 uploadAuthKey 的重试分支已按此两码判定，此处把它前移到预检面）。
 *
 * 合规：只直连 channels.weixin.qq.com 官方域；client 可注入 → 测试零外发。
 * fail-closed：缺 cookie 抛错且零请求。
 */
const { createHttpClient, requestWithRetry } = require('../core/http-base')
const { ShipinhaoMusicChain } = require('../platforms/shipinhao-music')
const { errorCode } = require('../../error-codes')

const API_BASE = 'https://channels.weixin.qq.com'
const REFERER = API_BASE + '/index'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const AUTH_DATA_PATH = '/cgi-bin/mmfinderassistant-bin/auth/auth_data'
/** 既有链已按此两码判定登录失效（shipinhao-video.js getUploadAuthKey 的调用侧重试）。 */
const LOGIN_EXPIRED_CODES = [300333, 300334]

function getTimeStamp (len) {
  const s = Date.now().toString()
  return len ? s.substring(0, len) : s
}

class ShipinhaoCapabilitiesError extends Error {
  constructor (message, code) {
    super(message)
    this.name = 'ShipinhaoCapabilitiesError'
    this.code = code === undefined ? errorCode.data_error : code
  }
}

class ShipinhaoCapabilities {
  /**
   * @param {{cookie:string, finderId?:string, userAgent?:string, client?:object, timeout?:number}} opts
   */
  constructor (opts = {}) {
    this.cookie = opts.cookie
    this.finderId = opts.finderId || null
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
      throw new ShipinhaoCapabilitiesError(
        'shipinhao-capabilities: missing cookie (fail-closed, refusing to query)', errorCode.data_error)
    }
  }

  /**
   * auth_data 原始调用。finderId 缺省时传 null（平台会用 cookie 自解析），
   * 这一点与取证切片一致 —— 不要在这里 fail-closed 到必须有 finderId。
   */
  async authData (finderId) {
    this._assertCookie()
    const body = {
      timestamp: getTimeStamp(13),
      _log_finder_uin: null,
      _log_finder_id: (finderId !== undefined ? finderId : this.finderId) || null,
      rawKeyBuff: null,
      pluginSessionId: null,
      scene: 7,
      reqScene: 7,
    }
    const res = await requestWithRetry(this.client, {
      method: 'post', url: AUTH_DATA_PATH, data: body,
      headers: { cookie: this.cookie, referer: REFERER, 'User-Agent': this.userAgent },
      validateStatus: (s) => s >= 200 && s < 500,
    })
    return res.data || {}
  }

  /** 1. 账号信息（uin + 视频号昵称）。 */
  async userInfo () {
    const d = await this.authData()
    const errCode = d.errCode != null ? d.errCode : (d.data && d.data.errCode)
    if (errCode && LOGIN_EXPIRED_CODES.indexOf(Number(errCode)) !== -1) {
      throw Object.assign(
        new ShipinhaoCapabilitiesError(
          'shipinhao-capabilities: 视频号登录失效 errCode=' + errCode, errorCode.data_error),
        { login_expired: true })
    }
    if (errCode && Number(errCode) !== 0) {
      throw new ShipinhaoCapabilitiesError(
        'shipinhao-capabilities: auth_data errCode=' + errCode, errorCode.data_error)
    }
    const finderUser = (d.data && d.data.finderUser) || {}
    return {
      platform: 'shipinhao',
      uin: String(finderUser.uin || ''),
      finderId: String(finderUser.finderId || ''),
      nickname: finderUser.finderUsername || '',
      raw: d,
    }
  }

  /**
   * 2. 发布有效性预检。与 userInfo 同端点，但裁定口径不同：
   *    只回答「登录态能否发起投稿」，不回答「能不能发某类内容」
   *    （后者需要平台侧投稿态字段，切片中未取证，故不编造）。
   */
  async publishPermission () {
    try {
      const info = await this.userInfo()
      return {
        allowed: Boolean(info.uin || info.finderId),
        risk_blocked: false,
        platform: 'shipinhao',
        reason: (info.uin || info.finderId) ? '' : 'auth_data 未返回 finderUser，登录态可能已失效',
        raw: info.raw,
      }
    } catch (err) {
      if (err && err.login_expired) {
        return { allowed: false, risk_blocked: false, platform: 'shipinhao', reason: err.message, login_expired: true }
      }
      throw err
    }
  }

  /**
   * 音乐库查询（2026-10-07 接入）。
   *
   * 委托 publish/platforms/shipinhao-music.js —— 端点、_rid 生成规则、三种模式的
   * type 值、公共 body 字段全部取自对标产品 bundle（见该文件头取证注释）。
   * 本层只做「HTTP 面字段 → listBgm 入参」的翻译与分页游标回传，**不复制协议逻辑**。
   *
   * @param {{mode?:string, query?:string, search?:string, page?:number,
   *          currentPage?:number, pageSize?:number, lastBuffer?:string}} [params]
   */
  async musicLibrary (params = {}) {
    params = params || {}
    // HTTP 面用 page（与 drafts/poi 一致），listBgm 用 currentPage；search 是 query 的别名
    const page = params.currentPage != null ? params.currentPage
      : (params.page != null ? params.page : undefined)
    const query = params.query != null ? params.query : params.search
    const r = await new ShipinhaoMusicChain({
      cookie: this.cookie,
      userAgent: this.userAgent,
      finderId: this.finderId,
      // ⚠️ 键名必须是 api：ShipinhaoMusicChain 的构造器读 opts.api，不是 opts.client。
      // 上一版这里写 client，静默不匹配 ⇒ 音乐库自建默认 client，能力层的连接配置
      // （含代理/超时）对它**完全不生效**，且外部注入面也失效（测试打不进假服务器）。
      // ⚠️ 键名必须是 api —— ShipinhaoMusicChain 的构造器只读 opts.api，不认 opts.client。
      // 上一版写的是 client: this.client，静默不匹配：音乐库于是自建默认 client，
      // 能力层的连接配置（含代理/超时）对它完全不生效，外部注入面也随之失效
      // （测试打不进假服务器，请求直接走真实域名）。**只传 api，不要为了「保险」
      // 再补一个 client** —— 同名不同义的键并排出现，正是这次要根治的温床。
      api: this.client,
    }).listBgm({
      mode: params.mode,
      query: query,
      currentPage: page,
      pageSize: params.pageSize,
      lastBuffer: params.lastBuffer,
    })
    return {
      mode: r.mode,
      items: r.items,
      total: r.total,
      page: r.page,
      pageSize: r.pageSize,
      hasMore: r.hasMore,
      lastBuffer: r.lastBuffer,
      raw: { totalCount: r.total },
    }
  }
}

module.exports = {
  ShipinhaoCapabilities,
  ShipinhaoCapabilitiesError,
  API_BASE,
  AUTH_DATA_PATH,
  LOGIN_EXPIRED_CODES,
}