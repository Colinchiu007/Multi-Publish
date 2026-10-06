'use strict'
/**
 * xiaohongshu-capabilities.js — 小红书「发布前能力面」（W4 §7）
 *
 * 逐字对齐 01-docs/rpa-api-publish/evidence/yx-bundle-slices.txt：
 *   userInfo  GET https://creator.xiaohongshu.com/api/galaxy/user/info  （getUserInfo$1）
 *   头部：{ cookie, referer: "https://creator.xiaohongshu.com/creator/home", Authorization: "" }
 *
 * 关于发布权限预检：参考产品导出表里有 getXiaoHongShuUserCanPubInfo，
 * 但**取证切片里没有它的函数体与端点**。这里刻意不实现 publishPermission ——
 * 编一个端点比留空更糟：调用方会以为预检过了，实际上从未验证过。
 *
 * 合规：只直连 creator.xiaohongshu.com 官方域；client 可注入 → 测试零外发。
 */
const { createHttpClient, requestWithRetry } = require('../core/http-base')
const { errorCode } = require('../../error-codes')

const CREATOR_BASE = 'https://creator.xiaohongshu.com'
const USER_INFO_PATH = '/api/galaxy/user/info'
const REFERER = CREATOR_BASE + '/creator/home'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

class XiaohongshuCapabilitiesError extends Error {
  constructor (message, code) {
    super(message)
    this.name = 'XiaohongshuCapabilitiesError'
    this.code = code === undefined ? errorCode.data_error : code
  }
}

class XiaohongshuCapabilities {
  /**
   * @param {{cookie:string, userAgent?:string, client?:object, timeout?:number}} opts
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

  _assertCookie () {
    if (!this.cookie) {
      throw new XiaohongshuCapabilitiesError(
        'xiaohongshu-capabilities: missing cookie (fail-closed, refusing to query)', errorCode.data_error)
    }
  }

  async _get (path) {
    this._assertCookie()
    const res = await requestWithRetry(this.client, {
      method: 'get', url: path,
      headers: { Cookie: this.cookie, referer: REFERER, Authorization: '', 'User-Agent': this.userAgent },
      validateStatus: (s) => s >= 200 && s < 500,
    })
    const d = res.data || {}
    if (d.success === false || (d.code !== undefined && d.code !== 0)) {
      throw new XiaohongshuCapabilitiesError(
        'xiaohongshu-capabilities: ' + path + ' code=' + d.code + ' msg=' + (d.msg || ''))
    }
    return d
  }

  /** 1. 账号信息（昵称/头像/小红书号/等级）。 */
  async userInfo () {
    const d = await this._get(USER_INFO_PATH)
    const data = d.data || {}
    return {
      platform: 'xiaohongshu',
      uid: String(data.red_id || data.user_id || data.userId || ''),
      nickname: data.nickname || data.nick_name || '',
      avatar: data.images || data.image || '',
      desc: data.desc || '',
      level: data.level || '',
      raw: data,
    }
  }
}

module.exports = {
  XiaohongshuCapabilities,
  XiaohongshuCapabilitiesError,
  CREATOR_BASE,
  USER_INFO_PATH,
  REFERER,
}