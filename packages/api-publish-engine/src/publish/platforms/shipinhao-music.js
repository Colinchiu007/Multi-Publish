'use strict'
/**
 * 视频号音乐库（BGM）查询
 *
 * 取证来源（对标产品 4.13.19 主进程 bundle，见 01-docs/rpa-api-publish/evidence/）：
 *   - 端点：channels.weixin.qq.com/cgi-bin/mmfinderassistant-bin/post/get_bgm_list
 *   - `_rid` = "678ddecb-" + 新 GUID 前 10 位（每次请求随机）
 *   - Referer: https://channels.weixin.qq.com/platform/post/finderNewLifeCreate
 *   - Origin:  https://channels.weixin.qq.com
 *   - 公共 body: currentPage / lastBuffer / pageSize / timestamp /
 *               _log_finder_uin / _log_finder_id / rawKeyBuff / pluginSessionId /
 *               scene:7 / reqScene:7
 *   - 三种模式：search → type=104 + query；recommend → type=103 + recommendThumbUrlList:[];
 *                默认（hot）→ type=3
 *   - 响应：{ errCode, errMsg, data: { totalCount, [items] } }
 *     条目两形态：{ listenItem: { musicSid | playableInfo{listenId,title,author,cover,duration}, url } }
 *                 或 { name, authorName, url, duration(ms) }
 *
 * 与 shipinhao-video.js 同构：同样 fail-closed、同样接受 agents 注入、同样走
 * requestWithRetry。不共用一个文件是因为发布链与查询链的生命周期不同（发布是一次性
 * 长流程、查询是短平快的分页读），合并会让两边都变难读。
 */
const crypto = require('crypto')
const { createHttpClient, requestWithRetry } = require('../core/http-base')
const { errorCode } = require('../../error-codes')

const DEFAULT_API_BASE = 'https://channels.weixin.qq.com'
const MUSIC_REFERER = 'https://channels.weixin.qq.com/platform/post/finderNewLifeCreate'
const MUSIC_PATH = '/cgi-bin/mmfinderassistant-bin/post/get_bgm_list'
const DEFAULT_PAGE_SIZE = 5
const DEFAULT_CURRENT_PAGE = 1

/** 三种模式 → 请求体的 type 取值（取证所得，非猜测）。 */
const MODE_TYPES = { hot: 3, recommend: 103, search: 104 }
const MODES = Object.keys(MODE_TYPES)

class ShipinhaoMusicError extends Error {
  constructor (message, code) {
    super(message)
    this.name = 'ShipinhaoMusicError'
    this.code = code
  }
}

/** _rid = "678ddecb-" + 新 GUID 前 10 位（取证：678ddecb-${Guid.NewGuid().substring(0,10)}） */
function buildRid () {
  return '678ddecb-' + crypto.randomUUID().replace(/-/g, '').substring(0, 10)
}

class ShipinhaoMusicChain {
  /**
   * @param {{cookie, userAgent, finderId, finderUin, api?, apiBase?, timeout?, agents?, logger?}} opts
   */
  constructor (opts = {}) {
    this.cookie = opts.cookie
    this.userAgent = opts.userAgent
    this.finderId = opts.finderId // _log_finder_id
    this.finderUin = opts.finderUin != null ? opts.finderUin : (opts.finderId || '')
    this.logger = opts.logger || console
    const headers = { 'User-Agent': this.userAgent }
    this.api = opts.api || createHttpClient({
      baseURL: opts.apiBase || DEFAULT_API_BASE,
      timeout: opts.timeout,
      agents: opts.agents,
      headers,
    })
  }

  /** 发起前校验：缺 cookie / UA → fail-closed 零请求（与发布链同一纪律） */
  _assertPreconditions () {
    if (!this.cookie) {
      throw new ShipinhaoMusicError('shipinhao-music: missing cookie (fail-closed, refusing to query)', errorCode.data_error)
    }
    if (!this.userAgent) {
      throw new ShipinhaoMusicError('shipinhao-music: missing User-Agent (fail-closed, refusing to query)', errorCode.request_error)
    }
  }

  /**
   * 把平台返回的条目归一化成统一形状。
   *
   * 取证见文件头：条目有两种形态，一种带 listenItem、另一种是扁平字段。
   * 两种都归一到 { id, name, authorName, image, playUrl, durationSeconds }——
   * 播放时只需要这几项，两种形态的字段名差异（url / playUrl、ms / 原值）不该
   * 泄漏给调用方。
   */
  _normalizeItem (raw) {
    if (!raw || typeof raw !== 'object') return null
    // 形态 A：listenItem 包裹
    const li = raw.listenItem
    if (li) {
      const info = li.playableInfo || {}
      return {
        id: String((li.musicSid != null ? li.musicSid : info.listenId) || '') || null,
        name: info.title || null,
        authorName: info.author || null,
        image: info.cover || null,
        playUrl: li.url || null,
        // 取证里形态 A 的 duration 直接透传，未见 ×1000；不做单位换算以免臆造。
        durationSeconds: info.duration != null ? Number(info.duration) : null,
      }
    }
    // 形态 B：扁平字段，duration 是毫秒（取证：parseInt((duration/1e3).toFixed(1))）
    return {
      id: raw.id != null ? String(raw.id) : null,
      name: raw.name || null,
      authorName: raw.authorName || null,
      image: raw.image || null,
      playUrl: raw.playUrl || raw.url || null,
      durationSeconds: raw.duration != null ? Number((raw.duration / 1e3).toFixed(1)) : null,
    }
  }

  /**
   * 查询音乐库。
   *
   * @param {{mode?: 'hot'|'recommend'|'search', query?: string,
   *          currentPage?: number, lastBuffer?: string, pageSize?: number}} [params]
   * @returns {Promise<{mode, items, total, page, pageSize, hasMore}>}
   */
  async listBgm (params = {}) {
    this._assertPreconditions()

    const mode = params.mode == null ? 'hot' : String(params.mode)
    if (MODE_TYPES[mode] === undefined) {
      // 未知模式 fail-closed：宁可不查，也不拿「猜一个 type」去换一个
      // 可能返回错误结果的 200 响应。
      throw new ShipinhaoMusicError(
        'shipinhao-music: unknown mode "' + mode + '" (expected one of ' + MODES.join(', ') + ')',
        errorCode.data_error)
    }

    const currentPage = Number.isInteger(params.currentPage) && params.currentPage > 0
      ? params.currentPage
      : DEFAULT_CURRENT_PAGE
    const pageSize = Number.isInteger(params.pageSize) && params.pageSize > 0
      ? params.pageSize
      : DEFAULT_PAGE_SIZE
    const query = params.query == null ? '' : String(params.query)
    const lastBuffer = params.lastBuffer == null ? '' : String(params.lastBuffer)

    if (mode === 'search' && query.trim() === '') {
      throw new ShipinhaoMusicError('shipinhao-music: search mode requires a non-empty query', errorCode.data_error)
    }

    // 公共 body（取证逐字段）
    const body = {
      currentPage,
      lastBuffer,
      pageSize,
      timestamp: Date.now(),
      _log_finder_uin: '',
      _log_finder_id: this.finderId,
      rawKeyBuff: null,
      pluginSessionId: null,
      scene: 7,
      reqScene: 7,
    }
    if (mode === 'search') {
      body.query = query
      body.type = MODE_TYPES.search // 104
    } else if (mode === 'recommend') {
      body.recommendThumbUrlList = []
      body.type = MODE_TYPES.recommend // 103
    } else {
      body.type = MODE_TYPES.hot // 3
    }

    const res = await requestWithRetry(this.api, {
      method: 'post',
      url: MUSIC_PATH + '?_rid=' + buildRid(),
      data: body,
      headers: {
        cookie: this.cookie,
        referer: MUSIC_REFERER,
        Origin: DEFAULT_API_BASE,
        'Content-Type': 'application/json; charset=UTF-8',
        Accept: 'application/json, text/plain, */*',
      },
    })

    const d = res && res.data != null ? res.data : {}
    // 取证：code 取 errCode，msg 取 errMsg，total 取 data.totalCount
    const errCodeValue = d.errCode != null ? d.errCode : 0
    const payload = d.data || {}
    const rawItems = Array.isArray(payload.list) ? payload.list
      : Array.isArray(payload) ? payload
        : (Array.isArray(d.list) ? d.list : [])
    const items = rawItems.map((it) => this._normalizeItem(it)).filter(Boolean)
    const total = Number.isFinite(Number(payload.totalCount)) ? Number(payload.totalCount) : items.length

    if (errCodeValue !== 0) {
      throw new ShipinhaoMusicError(
        'shipinhao-music: get_bgm_list failed errCode=' + errCodeValue + ' errMsg=' + (d.errMsg || ''),
        errorCode.request_error)
    }

    return {
      mode,
      items,
      total,
      page: currentPage,
      pageSize,
      // 取证里列表项是按数组顺序下发的，取满 pageSize 即视为还有下一页；
      // 不据此断言「一定还有」，调用方可用 lastBuffer 做二次请求对齐。
      hasMore: items.length >= pageSize,
      lastBuffer: typeof payload.lastBuffer === 'string' ? payload.lastBuffer : lastBuffer,
    }
  }
}

module.exports = { ShipinhaoMusicChain, ShipinhaoMusicError, MODE_TYPES, MODES }
