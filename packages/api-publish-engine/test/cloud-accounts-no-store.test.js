'use strict'
/**
 * test/cloud-accounts-no-store.test.js — 账号云镜像面的 `Cache-Control: no-store` 线级锁
 *
 * 为什么必须有：`POST /api/v1/me/accounts/sync` 返回的是**服务端解密后的明文凭证**（下行不带
 * 信封，依据 ADR-0003「换设备免扫码 ⇒ 服务端必须能重新解出凭证」）。明文钥匙一旦落进中间代理 /
 * CDN / 共享机器的 HTTP 缓存，「库被拖走不是明文」这条防线就在传输层被重新打开。
 * PRD §7.0 与运维文档 §4/§5 曾把它登记为残余缺口，本文件负责关掉并钉死。
 *
 * 两个发送缝，缺一不可（外部评审 W-2/C-1 的教训）：
 *   A. 本面自己的三处出线点（两处 503 + 注入 handlers 的 `json` 回调）；
 *   B. **路由与鉴权之前**的 `applyCloudAccountNoStore(res, url)` —— 401 / 403 / 503 / 429
 *      在进入本面之前就短路，不经过 A，只补 A 会留下「同一条 URL 有时可缓存」的口子。
 *
 * 为什么走真 HTTP 而不是直接调 handlers：handlers 是纯函数（返回 `{status, body}` 或经注入的
 * `json` 出线），头是在服务端出口 `PublishApiServer.prototype._json` 上拼的。只测 handlers 会退化
 * 成「测了一个不产生头的地方」。这里 `_json` 与 `_parseBody` 都直接借生产实现（AGENTS.md
 * 「出站行为以线级取证为准」）。
 *
 * 反证（每条都实测过，见 PR 记录）：
 *   ① 摘掉 `_json` 里对 `extraHeaders` 的合并 → A 组全部变红；
 *   ② 只摘两处 503 的 `NO_STORE` 实参 → 仅「503 提前出口」子测试变红（证明它不靠成功路径顺带通过）；
 *   ③ 摘掉 `applyCloudAccountNoStore(res, url)` 这一行 → 「鉴权之前」子测试变红而 A 组仍绿（两条缝互不掩盖）。
 */
const test = require('node:test').test
const assert = require('node:assert/strict')
const http = require('node:http')

const { PublishApiServer } = require('../src/publish-api-server')
const {
  applyCloudAccountHelpers,
  applyCloudAccountNoStore,
  NO_STORE,
} = require('../src/auth/publish-api-cloud-accounts')
const { createCloudAccountServices } = require('../src/cloud-accounts')
const { createEnvelopeCrypto, createLocalKms } = require('../src/cloud-accounts/envelope-crypto')

const OWNER = 'user-no-store-1'
const AUTH = { businessUser: { id: OWNER } }
const MASTER_KEY = '33'.repeat(32)
/** 库里已封存的凭证解出来的样子（下行是任意字符串，不再受上行形状约束）。 */
const CREDENTIAL = JSON.stringify({ cookies: [{ name: 'sid', value: 'plain-secret' }] })
/** 上行 PUT 的凭证必须是 §6.2 的明文形状（cookies 数组 + localStorage 对象），字符串会被 CREDENTIAL_SHAPE_INVALID 逐条拒收。 */
const UPLOAD_CREDENTIAL = { cookies: [{ name: 'sid', value: 'plain-secret' }], localStorage: {} }
const ACCOUNTS = '/api/v1/me/accounts'

function envelopeCrypto () {
  return createEnvelopeCrypto({ kms: createLocalKms({ key: MASTER_KEY }) })
}

async function sealedEnvelope (platform, platformUid) {
  return envelopeCrypto().encryptCredential({ userId: OWNER, platform, platformUid, credential: CREDENTIAL })
}

function repositoryStub (overrides) {
  const calls = []
  return Object.assign({
    calls,
    async listDigest () {
      calls.push(['listDigest'])
      return { total: 1, byPlatform: [{ platform: 'douyin', count: 1 }], tombstones: 0, updatedAt: '2026-09-27T00:00:00.000Z' }
    },
    async listFull () {
      calls.push(['listFull'])
      return { accounts: [{ platform: 'douyin', platformUid: 'uid-9' }], tombstones: [] }
    },
    async upsertMany (userId, items) {
      calls.push(['upsertMany', items.length])
      return { results: items.map((item) => ({ platform: item.platform, platformUid: item.platformUid, outcome: 'created' })) }
    },
    async getCredentials (userId, keys) {
      calls.push(['getCredentials', keys.length])
      return Promise.all(keys.map(async (key) => ({
        platform: key.platform,
        platformUid: key.platformUid,
        credentialUpdatedAt: '2026-09-27T00:00:00.000Z',
        credentialEnvelope: await sealedEnvelope(key.platform, key.platformUid),
      })))
    },
    async addTombstone () { calls.push(['addTombstone']); return { created: true } },
    async clearAll () { calls.push(['clearAll']); return { ok: true, deletedAccounts: 1, deletedTombstones: 0, remaining: 0 } },
  }, overrides || {})
}

function servicesFor (overrides) {
  return createCloudAccountServices({ repository: repositoryStub(overrides), crypto: envelopeCrypto() })
}

function createHost (services) {
  class Host {}
  // 直接借生产实现，不复制：本锁要验的就是这两处出口的行为。
  Host.prototype._json = PublishApiServer.prototype._json
  Host.prototype._parseBody = PublishApiServer.prototype._parseBody
  Host.prototype._logWarn = () => {}
  applyCloudAccountHelpers(Host)
  const host = new Host()
  // 绕过惰性组装（那需要真连接池）：直接喂已组装好的服务，与生产同一字段。
  host.__cloudAccounts = services === undefined ? null : services
  return host
}

/**
 * 起一条真 loopback 服务，复刻 `publish-api-server.js` 的接线顺序：
 * 先打 no-store 前置守卫（B 缝），再判路由交给本面（A 缝）。
 *
 * @param {object} t node:test 的 TestContext（用 t.after 统一收口，不留第二套清理风格）
 * @param {{services?: any, auth?: any, mode?: 'route'|'auth-fail'|'raw'}} [options]
 */
async function startServer (t, options = {}) {
  const { services, auth = AUTH, mode = 'route' } = options
  const host = createHost(services)
  const server = http.createServer(async (req, res) => {
    applyCloudAccountNoStore(res, req.url)
    if (mode === 'auth-fail') {
      // 模拟 `_checkAuth` 失败：走通用出口，**不**经过本面三处出线点（这正是 B 缝要补的路径）
      host._json(res, 401, { error: 'Unauthorized', message: 'Valid API key required' })
      return
    }
    if (mode === 'raw') {
      host._json(res, 200, { code: 0, data: { ok: true } }, {
        'Cache-Control': 'no-store',
        'Content-Encoding': 'gzip',
        'Content-Length': 99,
        'Transfer-Encoding': 'chunked',
        'X-Face': 'cloud-accounts',
      })
      return
    }
    req.auth = auth
    if (!host._isCloudAccountsUrl(req.url)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end('{}')
      return
    }
    await host._handleCloudAccounts(req, res, req.method, req.url)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return server.address().port
}

function request (port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body))
    const req = http.request({
      host: '127.0.0.1', port, method, path,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {},
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        text: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

const PUT_BODY = {
  accounts: [{
    platform: 'douyin', platformUid: 'uid-9', displayName: '甲',
    followers: 100, isActive: true, credential: UPLOAD_CREDENTIAL,
  }],
}

test('云账号面每一条出站响应都必须带 Cache-Control: no-store（明文凭证不得被缓存）', async (t) => {
  const port = await startServer(t, { services: servicesFor() })
  const cases = [
    { name: 'GET digest', method: 'GET', path: ACCOUNTS, status: 200 },
    { name: 'GET full', method: 'GET', path: `${ACCOUNTS}?view=full`, status: 200 },
    { name: 'POST sync（明文凭证下行）', method: 'POST', path: `${ACCOUNTS}/sync`, body: { keys: [{ platform: 'douyin', platformUid: 'uid-9' }] }, status: 200 },
    { name: 'POST tombstones', method: 'POST', path: `${ACCOUNTS}/tombstones`, body: { keys: [{ platform: 'douyin', platformUid: 'uid-9' }] }, status: 200 },
    { name: 'POST disconnect', method: 'POST', path: `${ACCOUNTS}/disconnect`, body: { confirm: 'cloud' }, status: 200 },
    { name: 'PUT accounts（上行写面）', method: 'PUT', path: ACCOUNTS, body: PUT_BODY, status: 200 },
    { name: '面内未支持的方法', method: 'PATCH', path: ACCOUNTS, status: 405 },
  ]
  for (const item of cases) {
    const res = await request(port, item.method, item.path, item.body)
    // 反空转：请求必须真的进到本面并给出预期结论，否则「头里没有别的东西」不算证据
    assert.equal(res.status, item.status, `${item.name} 预期 ${item.status}，实得 ${res.status}（body=${res.text.slice(0, 200)}）`)
    assert.ok(res.text.length > 2, `${item.name} 响应体不得为空`)
    assert.equal(res.headers['cache-control'], 'no-store', `${item.name} 必须 no-store，实得 ${JSON.stringify(res.headers['cache-control'])}`)
    assert.equal(res.headers['content-type'], 'application/json', `${item.name} 追加头不得覆盖 Content-Type`)
  }

  await t.test('GET digest 的 data 形状仍按 PRD §7.1 逐字段出线（证明请求真跑到处理器）', async () => {
    const res = await request(port, 'GET', ACCOUNTS)
    assert.deepEqual(JSON.parse(res.text), {
      code: 0,
      data: { total: 1, byPlatform: [{ platform: 'douyin', count: 1 }], tombstones: 0, updatedAt: '2026-09-27T00:00:00.000Z' },
    })
  })

  await t.test('POST sync 的出站体里确实是明文凭证（no-store 的前提成立，不是空头防线）', async () => {
    const res = await request(port, 'POST', `${ACCOUNTS}/sync`, { keys: [{ platform: 'douyin', platformUid: 'uid-9' }] })
    const parsed = JSON.parse(res.text)
    assert.equal(parsed.code, 0)
    assert.equal(parsed.data.credentials.length, 1)
    assert.equal(parsed.data.credentials[0].credential, CREDENTIAL)
    assert.equal(parsed.data.credentials[0].errorCode, undefined)
    assert.equal(parsed.data.credentials[0].credentialEnvelope, undefined, '出线不得再带信封材料')
  })

  await t.test('出站头集合快照：除 no-store 外不得夹带任何可缓存/条件请求头', async () => {
    const res = await request(port, 'GET', ACCOUNTS)
    for (const forbidden of ['etag', 'last-modified', 'expires', 'pragma', 'set-cookie']) {
      assert.equal(res.headers[forbidden], undefined, `${forbidden} 不得出现在云账号面应答里`)
    }
    assert.equal(res.headers['cache-control'], 'no-store')
  })
})

test('鉴权之前的短路应答也必须 no-store（B 缝：applyCloudAccountNoStore）', async (t) => {
  await t.test('未鉴权 401 经通用出口应答，仍带 no-store', async () => {
    const port = await startServer(t, { services: servicesFor(), mode: 'auth-fail' })
    const res = await request(port, 'GET', ACCOUNTS)
    assert.equal(res.status, 401)
    assert.equal(JSON.parse(res.text).error, 'Unauthorized')
    assert.equal(res.headers['cache-control'], 'no-store',
      '鉴权失败不经本面出线点，只能靠路由前的守卫；摘掉 applyCloudAccountNoStore 这一行本用例必须红')
  })

  await t.test('对照：非本面 URL 不被该守卫波及（不得把策略一把加到全 API 上）', async () => {
    const port = await startServer(t, { services: servicesFor(), mode: 'auth-fail' })
    const res = await request(port, 'GET', '/api/v1/notifications')
    assert.equal(res.status, 401)
    assert.equal(res.headers['cache-control'], undefined,
      '守卫的路径集必须与 CLOUD_ACCOUNTS_ROUTES 同源，越界会把 no-store 铺到全 API')
  })

  await t.test('本面两处 503 提前出口（未接仓储 / 未解析出业务身份）', async () => {
    const noServices = await startServer(t, { services: null })
    const a = await request(noServices, 'GET', ACCOUNTS)
    assert.equal(a.status, 503)
    assert.equal(JSON.parse(a.text).error, 'CLOUD_ACCOUNTS_NOT_CONFIGURED')
    assert.equal(a.headers['cache-control'], 'no-store')

    const noUser = await startServer(t, { services: servicesFor(), auth: {} })
    const b = await request(noUser, 'GET', ACCOUNTS)
    assert.equal(b.status, 503)
    assert.equal(JSON.parse(b.text).error, 'BUSINESS_USER_REPOSITORY_NOT_CONFIGURED')
    assert.equal(b.headers['cache-control'], 'no-store')
  })
})

test('_json 不接受传输语义相关的追加头（防「头写 gzip、体是明文」）', async (t) => {
  const port = await startServer(t, { services: servicesFor(), mode: 'raw' })
  const res = await request(port, 'POST', ACCOUNTS, {})
  assert.equal(res.status, 200)
  assert.equal(res.headers['content-encoding'], undefined, 'Content-Encoding 由 gzip 分支决定，调用方不得覆盖')
  assert.equal(res.headers['transfer-encoding'], undefined, 'Transfer-Encoding 不得由调用方注入')
  assert.equal(res.headers['cache-control'], 'no-store', '业务头照常透传')
  assert.equal(res.headers['x-face'], 'cloud-accounts')
  const body = Buffer.from(res.text, 'utf8')
  assert.equal(Number(res.headers['content-length']), body.length, 'Content-Length 必须始终等于最终 body 长度')
})

test('NO_STORE 常量是冻结的共享对象（防止跨路由泄漏）', () => {
  assert.equal(Object.isFrozen(NO_STORE), true)
  assert.throws(() => { NO_STORE['Cache-Control'] = 'public' }, TypeError)
  assert.equal(NO_STORE['Cache-Control'], 'no-store')
})

test('KMS 故障逐条降级仍走同一出口并带 no-store（错误项不泄露、也不留缓存）', async (t) => {
  const broken = {
    async decryptCredential () { throw Object.assign(new Error('kms down'), { code: 'KMS_UNAVAILABLE' }) },
    async encryptCredential () { throw Object.assign(new Error('kms down'), { code: 'KMS_UNAVAILABLE' }) },
  }
  const port = await startServer(t, { services: createCloudAccountServices({ repository: repositoryStub(), crypto: broken }) })
  const res = await request(port, 'POST', `${ACCOUNTS}/sync`, { keys: [{ platform: 'douyin', platformUid: 'uid-9' }] })
  const parsed = JSON.parse(res.text)
  assert.equal(res.status, 200)
  assert.equal(parsed.data.credentials[0].credential, null)
  assert.equal(parsed.data.credentials[0].errorCode, 'KMS_UNAVAILABLE')
  assert.equal(res.headers['cache-control'], 'no-store')
})
