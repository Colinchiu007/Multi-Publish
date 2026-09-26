'use strict'
/**
 * handlers.js — `/api/v1/me/accounts*` 的 HTTP 处理器（PRD §7）。
 *
 * 设计约束：
 *   * **纯函数**：不依赖 PublishApiServer 实例，全部依赖（repository / crypto / bodyParser / json）
 *     由调用方注入；返回 `{ status, body }`，调用方 `this._json(res, status, body)` 出线。
 *     这样四个端点可以在不启服务、不连库的情况下被完整测试。
 *   * **归属只从 auth 取**（PRD §6.3：客户端 MUST NOT 自报归属）。请求体里的 `userId`/`ownerSubject`
 *     不在字段白名单内，会被 `ACCOUNT_FIELD_NOT_ALLOWED` 逐条拒掉。
 *   * **异常一律在内部收口**：每个分支自带 try/catch 语义（外层统一兜底），
 *     对外只暴露 §7.5 的语义码；驱动/依赖原文经 `safeErrorCode` 折叠，不外泄。
 *   * **fail closed**：未接仓储 → 503；未接加密器或 KMS 不可用 → 503 KMS_UNAVAILABLE，
 *     且一条都不写（PRD §8.3 禁止降级成不加密）。
 *
 * 401 / 403 的分工：401 由本文件负责（token 没解析出业务身份）；403（scope 不足）由
 * `publish-api-server.js` 的 `_requiredScope` 在进入本处理器之前负责，`/api/v1/me/` 前缀已覆盖。
 */

const { safeErrorCode } = require('../auth/safe-error-code')
const { encodeEnvelope } = require('./envelope-crypto')
const {
  CONTROL_CHARS,
  accountError,
  isPlainObject,
  validateAccountQuietly,
  validateBatch,
  validateSyncKeys,
} = require('./validate-account')

const ACCOUNTS_PATH = '/api/v1/me/accounts'
const SYNC_PATH = `${ACCOUNTS_PATH}/sync`
// 断开云端的正式契约只有一条：`POST /api/v1/me/accounts/disconnect` + body `{confirm:'cloud'}`。
// 曾经的 `DELETE /api/v1/me/accounts` + `X-Confirm-Disconnect` 已删除，不留别名：
// 本仓所有变更类云接口都是 POST（/me/sessions/revoke-others、/me/notifications/read），
// DELETE 带 body 在反代与 HTTP 客户端上是长期歧义源，而桌面侧会员白名单 ME_API_PATHS
// 对 /api/v1/me/accounts 只放开 GET/PUT。留两条入口等于留两个需要分别守住确认语义的门。
const DISCONNECT_PATH = `${ACCOUNTS_PATH}/disconnect`
// 墓碑写入端点：本机删除账号时 best-effort 登记，后续同步据此不复活。
// 没有这个写端点，墓碑就是只读机制 —— 删除过的账号下次同步必然复活。
const TOMBSTONES_PATH = `${ACCOUNTS_PATH}/tombstones`
const CONFIRM_DISCONNECT_VALUE = 'cloud'
const SUCCESS_CODE = 0
const REJECTED_CODE = -1

/**
 * 逐条终态白名单（PRD §7.2）。少登记一枚，那一枚就会被降级成 `rejected` 并让整批回 400，
 * 桌面端 member-api-service 随即把整次 PUT 当请求失败抛掉——`conflict` 就是这么从「四分支裁决」
 * 变成「同步失败」的：判对了我这边也报不出来。新增终态必须在此登记并在用例里覆盖。
 */
const STORED_OUTCOMES = Object.freeze(['created', 'updated', 'unchanged', 'conflict', 'rejected'])
/** `credentialFreshness` 的合法取值；缺席或非法时按 'cloud' 回传（保守侧，见 handleUpsert）。 */
const CREDENTIAL_FRESHNESS_VALUES = Object.freeze(['cloud', 'local'])

/** 本处理器接管的路由清单（与 PRD §7.1–§7.4 一一对应，供接线方与结构锁共用）。 */
const CLOUD_ACCOUNTS_ROUTES = Object.freeze([
  'GET /api/v1/me/accounts',
  'PUT /api/v1/me/accounts',
  'POST /api/v1/me/accounts/sync',
  'POST /api/v1/me/accounts/tombstones',
  'POST /api/v1/me/accounts/disconnect',
])

function respond(status, body) {
  return { status, body }
}

function fail(code, status) {
  return respond(Number(status) || 500, { error: code })
}

function errorResponse(error, fallbackCode, fallbackStatus) {
  return fail(safeErrorCode(error, fallbackCode), Number(error && error.status) || fallbackStatus || 500)
}

function requestPath(url) {
  if (typeof url !== 'string') return ''
  const head = url.split('?')[0].split('#')[0]
  if (!head) return ''
  return head.length > 1 ? head.replace(/\/+$/, '') : head
}

function queryString(url) {
  const out = {}
  if (typeof url !== 'string') return out
  const marker = url.indexOf('?')
  if (marker < 0) return out
  let tail = url.slice(marker + 1)
  const hash = tail.indexOf('#')
  if (hash >= 0) tail = tail.slice(0, hash)
  for (const pair of tail.split('&')) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    const rawKey = eq < 0 ? pair : pair.slice(0, eq)
    const rawValue = eq < 0 ? '' : pair.slice(eq + 1)
    let key = rawKey
    let value = rawValue
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, ' '))
      value = decodeURIComponent(rawValue.replace(/\+/g, ' '))
    } catch (error) {
      continue // 非法百分号编码：忽略该参数，绝不让它冒成 500
    }
    if (!(key in out)) out[key] = value
  }
  return out
}

function headerValue(req, name) {
  const headers = req && req.headers
  if (!headers || typeof headers !== 'object') return null
  const wanted = String(name).toLowerCase()
  if (typeof headers[wanted] === 'string') return headers[wanted]
  for (const key of Object.keys(headers)) {
    if (String(key).toLowerCase() !== wanted) continue
    const value = headers[key]
    if (typeof value === 'string') return value
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  }
  return null
}

/** 归属身份：只认 `auth.businessUser.id`（既有 /me 族口径）与 `auth.userId` 两条注入路径。 */
function resolveUserId(auth) {
  if (!isPlainObject(auth)) return null
  const candidates = [
    isPlainObject(auth.businessUser) ? auth.businessUser.id : null,
    auth.userId,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() && !CONTROL_CHARS.test(candidate)) return candidate.trim()
  }
  return null
}

/** 时钟注入点：允许 Date / 时间戳 / 取时函数（接线方 `publish-api-cloud-accounts.js` 传的是函数）。 */
function nowOf(context) {
  const injected = context.now
  if (typeof injected === 'function') {
    const value = injected()
    if (value instanceof Date) return value
    if (typeof value === 'number') return new Date(value)
    return new Date()
  }
  if (injected instanceof Date) return injected
  if (typeof injected === 'number') return new Date(injected)
  return new Date()
}

async function readBody(context) {
  if (typeof context.bodyParser !== 'function') return { body: null, failed: false }
  try {
    return { body: await context.bodyParser(context.req), failed: false }
  } catch (error) {
    return { body: null, failed: true, error }
  }
}

/** 逐条结果里如实回填键：坏值也按客户端送来的原样报回，便于定位是哪一行。 */
function keyOf(item) {
  if (!isPlainObject(item)) return { platform: null, platformUid: null }
  const platform = typeof item.platform === 'string' ? item.platform : null
  const uid = typeof item.platformUid === 'string' ? item.platformUid
    : (typeof item.platform_uid === 'string' ? item.platform_uid : null)
  return { platform, platformUid: uid }
}

// ---- GET /api/v1/me/accounts ------------------------------------------------------------

async function handleList(context, userId) {
  const view = queryString(context.url).view === 'full' ? 'full' : 'digest'
  if (view === 'digest') {
    const digest = await context.repository.listDigest(userId)
    const source = isPlainObject(digest) ? digest : {}
    return respond(200, {
      code: SUCCESS_CODE,
      data: {
        total: Number(source.total) || 0,
        byPlatform: Array.isArray(source.byPlatform) ? source.byPlatform : [],
        tombstones: Number(source.tombstones) || 0,
        updatedAt: source.updatedAt === undefined ? null : source.updatedAt,
      },
    })
  }
  const full = await context.repository.listFull(userId)
  const source = isPlainObject(full) ? full : {}
  return respond(200, {
    code: SUCCESS_CODE,
    data: {
      accounts: Array.isArray(source.accounts) ? source.accounts : [],
      tombstones: Array.isArray(source.tombstones) ? source.tombstones : [],
    },
  })
}

// ---- PUT /api/v1/me/accounts ------------------------------------------------------------

/**
 * 两趟式上行：先「全部预检（字段校验 + KMS 可用性）」再一次性交给仓储。
 * 预检阶段任何 KMS 异常都直接 503，此时库里一条都没写（PRD §8.3 与异常矩阵「未上传任何凭证」）；
 * 字段层错误则按 PRD §7.2 折叠进 `results` 的逐条 `rejected`，其余条目照常落库。
 */
async function handleUpsert(context, userId) {
  const parsed = await readBody(context)
  if (parsed.failed) return fail('ACCOUNT_BATCH_INVALID', 400)
  if (!isPlainObject(parsed.body)) return fail('ACCOUNT_BATCH_INVALID', 400)
  let incoming
  try {
    incoming = validateBatch(parsed.body.accounts)
  } catch (error) {
    return errorResponse(error, 'ACCOUNT_BATCH_INVALID', 400)
  }

  const now = nowOf(context)
  const nowIso = new Date(now).toISOString()
  const validated = incoming.map((item) => validateAccountQuietly(item, { now }))
  const writable = validated.filter((entry) => entry.ok).map((entry) => entry.value)

  if (writable.length > 0) {
    // 上行是明文凭证（PRD §7.2 / ADR-0003：加密发生在服务端，桌面端没有也不该有 KMS 访问权）。
    // 缺 crypto 一律 503 fail-closed，绝不存在「没有 KMS 就明文入库」的降级分支。
    // verifyDataKey 同为必需：只保证「wrap 得出去」不够，解不开的主密钥会把整片云端凭证变成
    // 永久不可恢复的字节，而这种形态只能在写之前拦。
    if (!context.crypto || typeof context.crypto.encryptCredential !== 'function'
      || typeof context.crypto.verifyDataKey !== 'function') {
      return fail('KMS_UNAVAILABLE', 503)
    }
    for (const item of writable) {
      let envelope = null
      try {
        envelope = await context.crypto.encryptCredential({
          userId,
          platform: item.platform,
          platformUid: item.platformUid,
          credential: item.credentialPlaintext,
        })
      } catch (error) {
        // 加密阶段失败：整条请求中止且零写入，明文不留痕
        return errorResponse(error, 'KMS_UNAVAILABLE', 503)
      }
      try {
        await context.crypto.verifyDataKey(envelope.encryptedDataKey, { userId })
      } catch (error) {
        return errorResponse(error, 'KMS_UNAVAILABLE', 503)
      }
      // 摘要只在这里产生：encryptCredential 的 digest 是服务端对明文算的（PRD §8.6），
      // 客户端提交同名字段早在白名单外被拒（validate-account.js）。
      item.credential = envelope
      item.credentialDigest = envelope.digest
      // 明文本体到此用完即从记录上摘掉：repository 是最后一道门，也是错误序列化、
      // 调试日志最容易把整个入参对象 dump 出来的地方。留一个 `credentialPlaintext` 在上面，
      // 等于把「库内不得出现 cookie 明文」（PRD 验收标准 7）寄托在下游每一处都记得不看它。
      delete item.credentialPlaintext
      // 时间戳由服务端盖戳：客户端上报的 credentialUpdatedAt 只用于回传 credentialFreshness，
      // 不得成为存储值，否则谁都能把时钟写成「最新」从而覆盖他人的有效凭证。
      item.credentialUpdatedAt = nowIso
      item.metadataUpdatedAt = nowIso
      item.createdAt = nowIso
    }
  }

  const written = writable.length > 0 ? await context.repository.upsertMany(userId, writable) : { results: [] }
  const stored = isPlainObject(written) && Array.isArray(written.results) ? written.results : []
  const results = []
  let storeCursor = 0
  let firstRejection = null
  validated.forEach((entry, index) => {
    const key = keyOf(incoming[index])
    if (!entry.ok) {
      results.push({ platform: key.platform, platformUid: key.platformUid, outcome: 'rejected', errorCode: entry.code })
      if (!firstRejection) firstRejection = entry.code
      return
    }
    const storedEntry = isPlainObject(stored[storeCursor]) ? stored[storeCursor] : {}
    storeCursor += 1
    // 'conflict' 是正常业务终态而非错误：整批仍回 200，由桌面端逐条本机实测裁决后带 force 重发。
    // 少这一枚白名单，conflict 会被降级成 rejected 并让整批 400，四分支裁决就永远跑不到。
    const outcome = STORED_OUTCOMES.includes(storedEntry.outcome) ? storedEntry.outcome : 'rejected'
    const row = { platform: key.platform, platformUid: key.platformUid, outcome }
    if (outcome === 'conflict') {
      // PRD §7.2：冲突必须带「谁的凭证更新」，桌面端据此决定先测哪一份。缺席也要给，
      // 且保守按 'cloud'——漏传时让本机先去实测云端那一份，绝不默认「本机较新」从而
      // 授权一次上行覆盖（与 repository 的「相等按 cloud」同一口径）。
      row.credentialFreshness = CREDENTIAL_FRESHNESS_VALUES.includes(storedEntry.credentialFreshness)
        ? storedEntry.credentialFreshness : 'cloud'
    }
    if (storedEntry.errorCode) row.errorCode = safeErrorCode({ code: storedEntry.errorCode }, 'ACCOUNT_WRITE_FAILED')
    if (outcome === 'rejected' && !firstRejection) firstRejection = row.errorCode || 'ACCOUNT_WRITE_FAILED'
    results.push(row)
  })

  if (firstRejection) {
    return respond(400, { code: REJECTED_CODE, error: firstRejection, data: { results } })
  }
  return respond(200, { code: SUCCESS_CODE, data: { results } })
}

// ---- POST /api/v1/me/accounts/sync ------------------------------------------------------

/**
 * 本期语义 = 批量取凭证槽（PRD §7.3 后半段：客户端裁决、服务端只存取）。
 * 出线形态是 base64 信封，正文仍是密文：服务端解密留给后续阶段，绝不在这条路径上返回明文。
 */
async function handleSyncFetch(context, userId) {
  const parsed = await readBody(context)
  if (parsed.failed || !isPlainObject(parsed.body)) return fail('ACCOUNT_BATCH_INVALID', 400)
  let keys
  try {
    keys = validateSyncKeys(parsed.body)
  } catch (error) {
    return errorResponse(error, 'ACCOUNT_BATCH_INVALID', 400)
  }
  const found = await context.repository.getCredentials(userId, keys)
  const credentials = (Array.isArray(found) ? found : []).map((entry) => {
    const source = isPlainObject(entry) ? entry : {}
    return {
      platform: source.platform === undefined ? null : source.platform,
      platformUid: source.platformUid === undefined ? null : source.platformUid,
      credentialUpdatedAt: source.credentialUpdatedAt === undefined ? null : source.credentialUpdatedAt,
      credentialEnvelope: encodeEnvelope(source.credentialEnvelope),
    }
  })
  return respond(200, { code: SUCCESS_CODE, data: { credentials } })
}

// ---- POST /api/v1/me/accounts/tombstones ------------------------------------------------

/**
 * 登记墓碑：本机删除账号后 best-effort 调用。幂等（同键重复写不产生第二行），
 * 逐条独立裁决、一条失败不影响其余（与 upsert 同一语义）。
 * 墓碑只阻止复活，**不**代表服务端已删除对应账号行 —— 删除仍是断开云端的事。
 */
async function handleTombstones(context, userId) {
  const parsed = await readBody(context)
  if (parsed.failed || !isPlainObject(parsed.body)) return fail('ACCOUNT_BATCH_INVALID', 400)
  let keys
  try {
    keys = validateSyncKeys(parsed.body)
  } catch (error) {
    return errorResponse(error, 'ACCOUNT_BATCH_INVALID', 400)
  }
  const results = []
  for (const entry of keys) {
    try {
      await context.repository.addTombstone(userId, entry.platform, entry.platformUid)
      results.push({ platform: entry.platform, platformUid: entry.platformUid, outcome: 'tombstoned' })
    } catch (error) {
      results.push({
        platform: entry.platform,
        platformUid: entry.platformUid,
        outcome: 'rejected',
        errorCode: (error && error.code) || 'ACCOUNT_WRITE_FAILED',
      })
    }
  }
  const firstRejection = results.find((r) => r.outcome === 'rejected')
  if (firstRejection) {
    return respond(400, { code: REJECTED_CODE, error: firstRejection.errorCode, data: { results } })
  }
  return respond(200, { code: SUCCESS_CODE, data: { results } })
}

// ---- POST /api/v1/me/accounts/disconnect ------------------------------------------------

/**
 * 断开云端：只清云端镜像与墓碑，本机 `accounts.json` 与凭证文件不在本服务的作用域内
 * （PRD §5.6 / 验收标准 5 要求本机逐字节不变）。防误触靠请求体里的显式确认值。
 */
async function handleDisconnect(context, userId) {
  const parsed = await readBody(context)
  if (parsed.failed) return fail('DISCONNECT_CONFIRMATION_REQUIRED', 400)
  const confirm = isPlainObject(parsed.body) ? parsed.body.confirm : null
  if (typeof confirm !== 'string' || confirm !== CONFIRM_DISCONNECT_VALUE) {
    return fail('DISCONNECT_CONFIRMATION_REQUIRED', 400)
  }
  return disconnect(context, userId)
}

async function disconnect(context, userId) {
  const result = await context.repository.clearAll(userId)
  const source = isPlainObject(result) ? result : {}
  const deletedAccounts = Number(source.deletedAccounts) || 0
  const deletedTombstones = Number(source.deletedTombstones) || 0
  if (source.ok !== true) {
    const remaining = Number(source.remaining) || 0
    // 部分失败也要把两组计数报全：成功与失败路径字段不对称，消费方就得为「缺字段」多写一条分支，
    // 而 UI 上恰恰是最需要知道「墓碑清了几枚、还剩几枚」的时候
    return respond(500, { error: 'CLOUD_DISCONNECT_PARTIAL', deletedAccounts, deletedTombstones, remaining })
  }
  return respond(200, { code: SUCCESS_CODE, data: { deletedAccounts, deletedTombstones } })
}

// ---- 路由 ------------------------------------------------------------------------------

async function route(context) {
  const path = requestPath(context.url)
  const method = typeof context.method === 'string' ? context.method.toUpperCase() : ''
  if (path !== ACCOUNTS_PATH && path !== SYNC_PATH && path !== DISCONNECT_PATH && path !== TOMBSTONES_PATH) {
    return fail('ROUTE_NOT_FOUND', 404)
  }

  const auth = context.auth
  if (!isPlainObject(auth)) return fail('UNAUTHORIZED', 401)
  const userId = resolveUserId(auth)
  if (!userId) return fail('UNAUTHORIZED', 401)

  const repository = context.repository
  if (!isPlainObject(repository) || typeof repository.listDigest !== 'function') {
    return fail('BUSINESS_USER_REPOSITORY_NOT_CONFIGURED', 503)
  }

  if (path === SYNC_PATH) {
    if (method !== 'POST') return fail('METHOD_NOT_ALLOWED', 405)
    return handleSyncFetch(context, userId)
  }
  if (path === DISCONNECT_PATH) {
    if (method !== 'POST') return fail('METHOD_NOT_ALLOWED', 405)
    return handleDisconnect(context, userId)
  }
  if (path === TOMBSTONES_PATH) {
    if (method !== 'POST') return fail('METHOD_NOT_ALLOWED', 405)
    return handleTombstones(context, userId)
  }
  if (method === 'GET') return handleList(context, userId)
  if (method === 'PUT') return handleUpsert(context, userId)
  return fail('METHOD_NOT_ALLOWED', 405)
}

/**
 * @param {object} context { method, url, req, auth, repository, crypto, bodyParser, json, now }
 * @returns {Promise<{status:number, body:object}>} 永不 reject。
 *   `json` 若提供则按 `json(status, body)` 出线（传输层异常由调用方负责，不属本函数职责）。
 */
async function handleCloudAccountsRequest(context) {
  const scope = isPlainObject(context) ? context : {}
  let response
  try {
    response = await route(scope)
  } catch (error) {
    response = errorResponse(error, 'INTERNAL_SERVER_ERROR', 500)
  }
  if (!response || !Number.isInteger(response.status) || !isPlainObject(response.body)) {
    response = fail('INTERNAL_SERVER_ERROR', 500)
  }
  if (typeof scope.json === 'function') scope.json(response.status, response.body)
  return response
}

module.exports = {
  ACCOUNTS_PATH,
  CLOUD_ACCOUNTS_ROUTES,
  CREDENTIAL_FRESHNESS_VALUES,
  STORED_OUTCOMES,
  CONFIRM_DISCONNECT_VALUE,
  DISCONNECT_PATH,
  REJECTED_CODE,
  SUCCESS_CODE,
  SYNC_PATH,
  TOMBSTONES_PATH,
  accountError,
  handleCloudAccountsRequest,
  headerValue,
  queryString,
  requestPath,
  resolveUserId,
}
