'use strict'
/**
 * publish-api-capabilities.js — PublishApiServer 的「发布前能力面」路由 mixin
 *
 * 为什么单独成文件：publish-api-server.js 已是 1300+ 行的巨型 _handle if 链，
 * 往里塞 5 条能力面路由会让可测试性与回滚面一起劣化。
 * 沿用本仓既有 mixin 范式（publish-api-commerce.js / publish-api-cloud-accounts.js），
 * 通过 applyCapabilitiesHelpers 挂回原型，全部方法以 this 绑定访问实例成员。
 *
 * 路由契约（全部在 /api/v1/ 下，POST 才有副作用语义）：
 *   GET  /api/v1/platforms/capabilities              能力矩阵总览（哪些平台有什么）
 *   POST /api/v1/platforms/:platform/user-info      账号信息
 *   POST /api/v1/platforms/:platform/permission-check 发布权限预检
 *   POST /api/v1/platforms/:platform/poi            POI / 位置推荐
 *   POST /api/v1/platforms/:platform/drafts         草稿箱列表
 *
 * 纪律：
 *   - 不支持的平台/能力一律 404 + PLATFORM_CAPABILITIES_UNSUPPORTED，
 *     **不返回空对象**——调用方必须能区分「没有这个能力」与「查到了但为空」。
 *   - 能力矩阵在入口就校对：矩阵里为 null 的格子即使模块碰巧有同名方法也不暴露。
 *   - cookie 必填（与既有发布面同一形态），缺失 400。
 */
const {
  CAPABILITY_MATRIX,
  supportsCapabilities,
  getCapabilities,
  listCapabilities,
} = require('../publish/capabilities')

const CAPABILITIES_PREFIX = '/api/v1/platforms/'
const CAPABILITIES_BASE = '/api/v1/platforms/capabilities'

/** 矩阵里允许暴露的能力名（白名单，防止模块新增方法被无意间暴露成 HTTP 面）。 */
const EXPOSED_CAPABILITIES = ['userInfo', 'publishPermission', 'poiRecommend', 'drafts']

/** 能力名 → HTTP 路径段 */
const PATH_TO_METHOD = Object.freeze({
  'user-info': 'userInfo',
  'permission-check': 'publishPermission',
  'poi': 'poiRecommend',
  'drafts': 'drafts',
})

/** 匹配 /api/v1/platforms/<platform>/<action>；返回 null 表示不属本面。 */
function parseCapabilitiesPath (url) {
  if (typeof url !== 'string' || url.indexOf(CAPABILITIES_PREFIX) !== 0) return null
  const rest = url.slice(CAPABILITIES_PREFIX.length)
  const parts = rest.split('/')
  if (parts.length !== 2) return null
  const [platform, action] = parts
  const method = PATH_TO_METHOD[action]
  if (!platform || !method) return null
  return { platform, method, action }
}

function isCapabilitiesUrl (url) {
  return url === CAPABILITIES_BASE || parseCapabilitiesPath(url) !== null
}

class PublishApiCapabilitiesHelpers {
  /**
   * 本面统一出口。返回 true = 已应答（调用方必须 return）；false = 不属本面。
   */
  async _handleCapabilities (req, res, method, url) {
    if (url === CAPABILITIES_BASE) {
      if (method !== 'GET') { this._json(res, 405, { error: 'METHOD_NOT_ALLOWED' }); return true }
      this._json(res, 200, {
        platforms: CAPABILITY_MATRIX,
        // 同时给出「该平台实际可调用哪些」，由矩阵推导而非第二份清单
        list: Object.keys(CAPABILITY_MATRIX).reduce((acc, p) => {
          acc[p] = listCapabilities(p)
          return acc
        }, {}),
      })
      return true
    }

    const parsed = parseCapabilitiesPath(url)
    if (!parsed) return false
    if (method !== 'POST') { this._json(res, 405, { error: 'METHOD_NOT_ALLOWED' }); return true }
    if (!supportsCapabilities(parsed.platform)) {
      this._json(res, 404, {
        error: 'PLATFORM_CAPABILITIES_UNSUPPORTED',
        message: '平台未提供发布前能力面: ' + parsed.platform,
      })
      return true
    }
    // 矩阵校对：格子为 null 即「无取证来源」，即便模块将来加了同名方法也不暴露。
    //
    // 必须 **fail-closed**：同时把 `undefined`（键不存在／登记名与方法名对不上）
    // 判为不支持。只判 `=== null` 时，拼错或漏登记的键会退化成 `undefined` 而
    // 穿过本守卫——这正是 poiRecommend 被放行的成因（矩阵键曾写作 `poi`，而
    // parsed.method 来自 PATH_TO_METHOD，是 `poiRecommend`）。未知即拒绝，
    // 不能靠「恰好有一个格子是 null」来兜底。
    const cell = CAPABILITY_MATRIX[parsed.platform][parsed.method]
    if (cell === null || cell === undefined) {
      this._json(res, 404, {
        error: 'CAPABILITY_NOT_SUPPORTED',
        message: parsed.platform + ' 不支持 ' + parsed.action + '（无平台取证来源）',
      })
      return true
    }
    if (EXPOSED_CAPABILITIES.indexOf(parsed.method) === -1) {
      this._json(res, 404, { error: 'CAPABILITY_NOT_SUPPORTED', message: parsed.action })
      return true
    }

    const body = await this._parseBody(req)
    const cookie = body && typeof body.cookie === 'string' ? body.cookie : ''
    if (!cookie) {
      this._json(res, 400, { success: false, error: 'COOKIE_REQUIRED', message: 'cookie is required' })
      return true
    }

    let caps
    try {
      caps = getCapabilities(parsed.platform, { cookie })
    } catch (err) {
      this._capabilitiesFailure(req, res, err)
      return true
    }
    if (!caps || typeof caps[parsed.method] !== 'function') {
      this._json(res, 404, { error: 'CAPABILITY_NOT_SUPPORTED', message: parsed.action })
      return true
    }

    try {
      // 只透传白名单内的业务入参：cookie 已单独取用，不重复下传。
      const args = {}
      if (parsed.method === 'drafts' || parsed.method === 'poiRecommend') {
        for (const k of ['page', 'pageSize', 'type', 'collection', 'search', 'width', 'height', 'url']) {
          if (body[k] !== undefined) args[k] = body[k]
        }
      }
      const result = await caps[parsed.method](args)
      this._json(res, 200, { success: true, platform: parsed.platform, capability: parsed.action, data: result })
    } catch (err) {
      this._capabilitiesFailure(req, res, err)
    }
    return true
  }

  /** 能力面失败统一收口：登录失效 401、签名未就绪 503、其余 502/400 按 error.code 夹紧。 */
  _capabilitiesFailure (req, res, error) {
    const code = error && typeof error.code === 'number' ? error.code : null
    if (error && error.login_expired) {
      this._json(res, 401, { success: false, error: 'LOGIN_EXPIRED', message: error.message })
      return
    }
    if (error && error.signerNotReady) {
      this._json(res, 503, { success: false, error: 'SIGNER_NOT_READY', message: '平台签名能力未就绪' })
      return
    }
    if (error && error.code === -101) {
      this._json(res, 401, { success: false, error: 'LOGIN_EXPIRED', message: error.message })
      return
    }
    // -5 io_error / -2 data_error / -1 request_error → 400（调用方请求或凭证问题）
    const status = code === -5 || code === -2 || code === -1 ? 400 : 502
    this._json(res, status, {
      success: false,
      error: 'CAPABILITY_QUERY_FAILED',
      message: error && error.message ? String(error.message).slice(0, 300) : 'capability query failed',
    })
  }
}

function applyCapabilitiesHelpers (Proto) {
  const names = Object.getOwnPropertyNames(PublishApiCapabilitiesHelpers.prototype)
  for (const key of names) {
    if (key === 'constructor') continue
    Object.defineProperty(Proto.prototype, key,
      Object.getOwnPropertyDescriptor(PublishApiCapabilitiesHelpers.prototype, key))
  }
}

module.exports = {
  applyCapabilitiesHelpers,
  isCapabilitiesUrl,
  parseCapabilitiesPath,
  CAPABILITIES_BASE,
  CAPABILITIES_PREFIX,
  EXPOSED_CAPABILITIES,
  PATH_TO_METHOD,
}