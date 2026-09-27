'use strict'

// 账号云镜像：PublishApiServer 的接线辅助。
// 按本仓既有 mixin 范式（见 publish-api-commerce.js）从 publish-api-server.js 拆出，
// 通过 applyCloudAccountHelpers 挂回原型，全部方法以 this 绑定访问实例成员。
//
// 为什么单独成文件：`publish-api-server.js` 是 1300+ 行的巨型 `_handle` if 链，
// 往里塞账号云镜像的组装逻辑会让本特性的可测试性与回滚面一起劣化。
const { createCloudAccountServices, createLocalKms, CLOUD_ACCOUNTS_ROUTES } = require('../cloud-accounts')

// 入口守卫的路径集由 handlers 的 CLOUD_ACCOUNTS_ROUTES 推导，不再手抄第二份清单。
// 手抄过一次真实事故：清单里已登记 `POST /api/v1/me/accounts/tombstones`，而守卫只认三条路径，
// 于是删除账号时写墓碑的请求在入口就 404 —— 墓碑永远写不上，「已删账号不得在别的设备复活」这条防线
// 静默失效（桌面端只看到一次 warn，用户毫无感知）。一处真源，两侧同步。
const CLOUD_ACCOUNT_PATHS = new Set(
  (Array.isArray(CLOUD_ACCOUNTS_ROUTES) ? CLOUD_ACCOUNTS_ROUTES : [])
    .map((entry) => String(entry).split(' ')[1])
    .filter(Boolean),
)

// 本面每一条应答都必须禁止缓存：`POST /sync` 回传的是**服务端解密后的明文凭证**（下行不带信封，
// 依据 ADR-0003「换设备免扫码 ⇒ 服务端必须能重新解出凭证」）。明文钥匙一旦落进中间代理 / CDN /
// 共享机器的 HTTP 缓存，「库被拖走不是明文」这条防线就在传输层被重新打开。
// 收在**这一个**出口常量上，而不是逐处理器各写一遍：新增路由只要经由本方法出线就自动被覆盖，
// 漏写的可能性被压成「去删这个常量」，而那会被 test/cloud-accounts-no-store.test.js 抓到。
const NO_STORE = Object.freeze({ 'Cache-Control': 'no-store' })

/**
 * 在**进入路由与鉴权之前**给云账号面的应答打上 no-store。
 *
 * 为什么不能只靠 `_handleCloudAccounts` 里的三处传参：401（`_checkAuth` 失败）、
 * 403/503（`_ensureRequestIdentity` / `_assertEntitlementFeature` 抛出）、429（限流）
 * 都在本面被路由到之前短路，那些发送点不归本模块管；漏一条就等于「同一条 URL 有时可被缓存」。
 * 未鉴权应答被缓存后，后续合法请求可能直接命中这条错误应答——比明文缓存更难排查。
 * 路径判定与入口守卫共用 `CLOUD_ACCOUNT_PATHS`（同一真源，不会漂成两套清单）。
 *
 * @returns {boolean} 是否已施加（供调用方与测试断言）
 */
const TRANSPORT_KEYS = Object.freeze({ 'content-length': 1, 'content-encoding': 1, 'transfer-encoding': 1 })
/**
 * 把「本面追加的响应头」并进出口头表，拒绝传输语义三键。
 * Content-Length 由最终 body 决定、Content-Encoding 由 gzip 分支决定，让调用方覆盖它们
 * 会造出「头写着 gzip、体是明文」这类只能在真实链路里才发现的损坏（评审 W-1）。
 */
function mergeFaceHeaders(headers, extraHeaders) {
  if (!extraHeaders) return headers
  for (const key of Object.keys(extraHeaders)) {
    if (!TRANSPORT_KEYS[String(key).toLowerCase()]) headers[key] = extraHeaders[key]
  }
  return headers
}

function applyCloudAccountNoStore(res, url) {
  if (!res || typeof res.setHeader !== 'function' || res.headersSent) return false
  if (typeof url !== 'string') return false
  if (!CLOUD_ACCOUNT_PATHS.has(url.split('?')[0])) return false
  res.setHeader('Cache-Control', 'no-store')
  return true
}

class PublishApiCloudAccountHelpers {
  /** 该 URL 是否属于账号云镜像面（路径集合与 CLOUD_ACCOUNTS_ROUTES 同源，含 digest/full/sync/tombstones/disconnect）。 */
  _isCloudAccountsUrl(url) {
    if (typeof url !== 'string') return false
    return CLOUD_ACCOUNT_PATHS.has(url.split('?')[0])
  }

  /**
   * 惰性组装云账号服务。连接池复用业务身份库的既有池（同一 Postgres、同一归属表），
   * 不另开第二个池——云账号与 identity_users 之间有外键，两个池就是两个事务域。
   *
   * KMS 缺失时 **fail closed**：createEnvelopeCrypto 在首次使用时抛 KMS_UNAVAILABLE。
   * 这里绝不做「没有 KMS 就明文入库」的降级，也绝不在构造期抛错——构造期抛错会让
   * 整个业务 API 起不来，而未配置本特性的部署不该被拖下水。
   */
  _cloudAccounts() {
    if (this.__cloudAccounts !== undefined) return this.__cloudAccounts
    const identityRepository = this._businessIdentityRepository
    const pool = identityRepository && identityRepository.pool
    if (!pool) {
      this.__cloudAccounts = null
      return null
    }
    let kms = null
    try {
      kms = createLocalKms({ env: process.env })
    } catch (error) {
      // 未配置/非法主密钥：记录一次，后续每次使用都由 crypto 抛 KMS_UNAVAILABLE
      this.__cloudAccountsKmsError = error && error.code ? error.code : 'KMS_CONFIG_INVALID'
      this._logWarn(this.__cloudAccountsKmsError, null, { module: 'cloud-accounts' })
      kms = null
    }
    this.__cloudAccounts = createCloudAccountServices({ pool, kms })
    return this.__cloudAccounts
  }

  /**
   * 云账号面的统一出口。返回 true 表示已应答（调用方必须 return），false 表示未命中本面、
   * 交回既有 if 链继续路由。
   *
   * 归属只认 `req.auth.businessUser.id`（服务端从已验签 token 解析），
   * 请求体里的任何 user/subject 字段一律不读——否则就是把「读别人的账号」变成一次请求体的事。
   */
  async _handleCloudAccounts(req, res, method, url) {
    const services = this._cloudAccounts()
    if (!services) {
      this._json(res, 503, { error: 'CLOUD_ACCOUNTS_NOT_CONFIGURED' }, NO_STORE)
      return true
    }
    const user = req.auth && req.auth.businessUser
    const userId = user && typeof user.id === 'string' ? user.id : null
    if (!userId) {
      this._json(res, 503, { error: 'BUSINESS_USER_REPOSITORY_NOT_CONFIGURED' }, NO_STORE)
      return true
    }
    const parsedBody = method === 'GET' ? null : await this._parseBody(req)
    await services.handle({
      method,
      url,
      req,
      auth: req.auth,
      // handlers 侧按 bodyParser 取体并自带解析失败收口（body 传进来会绕过它的错误语义）
      bodyParser: () => Promise.resolve(parsedBody),
      now: () => Date.now(),
      json: (status, body) => this._json(res, status, body, NO_STORE),
    })
    return true
  }
}

function applyCloudAccountHelpers(Proto) {
  const names = Object.getOwnPropertyNames(PublishApiCloudAccountHelpers.prototype)
  for (const key of names) {
    if (key === 'constructor') continue
    Object.defineProperty(Proto.prototype, key, Object.getOwnPropertyDescriptor(PublishApiCloudAccountHelpers.prototype, key))
  }
}

module.exports = { applyCloudAccountHelpers, applyCloudAccountNoStore, mergeFaceHeaders, NO_STORE }
