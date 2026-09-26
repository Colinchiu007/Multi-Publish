'use strict'
/**
 * test/cloud-accounts-no-store.test.js — 账号云镜像面的 `Cache-Control: no-store` 线级锁
 *
 * 为什么必须有这把锁：`POST /api/v1/me/accounts/sync` 返回的是**服务端解密后的明文凭证**
 * （ADR-0003「换设备免扫码 ⇒ 服务端必须能重新解出凭证」，下行不带信封）。明文凭证一旦落到
 * 中间代理 / CDN / 共享机器的 HTTP 缓存里，就等于把「库被拖走不是明文钥匙」这条防线在传输层
 * 重新打开。PRD §7.0 与运维文档 §4 已把它登记为残余缺口，本文件负责把它关掉并钉死。
 *
 * 为什么走真 HTTP 而不是直接调 handlers：handlers 是纯函数（返回 `{status, body}` / 由注入的
 * `json` 出线），头是在**服务端出口** `PublishApiServer.prototype._json` 上拼的。只测 handlers
 * 会退化成「测了一个不产生头的地方」。这里用真 `http.createServer` + 真 `_json` + 真 `_parseBody`，
 * 断言的是链路里实际抓到的出站头（AGENTS.md「出站行为以线级取证为准」）。
 *
 * 反证（本锁真的在跑）：把 `publish-api-cloud-accounts.js` 里的 `NO_STORE` 常量改成 `null`
 * （或删掉 `_json` 的第 4 个参数合并），下面每一条 `cache-control === 'no-store'` 必须立刻变红；
 * 只删 `_handleCloudAccounts` 里两处 503 的传参，则只有 503 两条变红——两者都测，正是为了区分
 * 「注入的 json 回调」与「提前应答的两个出口」这三处发送点各自都被守住。
 */
const test = require('node:test').test
const assert = require('node:assert/strict')
const http = require('node:http')

const { PublishApiServer } = require('../src/publish-api-server')
const { applyCloudAccountHelpers } = require('../src/auth/publish-api-cloud-accounts')
const { createCloudAccountServices } = require('../src/cloud-accounts')
const { createEnvelopeCrypto, createLocalKms } = require('../src/cloud-accounts/envelope-crypto')
const { credentialDigest } = require('../src/cloud-accounts/credential-digest')

const OWNER = 'user-no-store-1'
const MASTER_KEY = '33'.repeat(32)
const CREDENTIAL = JSON.stringify({ cookies: [{ name: 'sid', value: 'plain-secret' }] })
const ACCOUNTS = '/api/v1/me/accounts'

function crypto_() {
  return createEnvelopeCrypto({ kms: createLocalKms({ key: MASTER_KEY }) })
}

async function sealedEnvelope(platform, platformUid) {
  const sealed = await crypto_().encryptCredential({ userId: OWNER, platform, platformUid, credential: CREDENTIAL })
  return sealed
}

function repositoryStub(overrides) {
  const calls = []
  const base = {
    calls,
    async listDigest() {
      calls.push(['listDigest'])
      return { total: 1, byPlatform: [{ platform: 'douyin', count: 1 }], tombstones: 0, updatedAt: '2026-09-27T00:00:00.000Z' }
    },
    async listFull() {
      calls.push(['listFull'])
      return { accounts: [{ platform: 'douyin', platformUid: 'uid-1' }], tombstones: [] }
    },
    async getCredentials(userId, keys) {
      calls.push(['getCredentials', keys.length])
      return Promise.all(keys.map(async (key) => {
        const sealed = await sealedEnvelope(key.platform, key.platformUid)
        return {
          platform: key.platform,
          platformUid: key.platformUid,
          credentialUpdatedAt: '2026-09-27T00:00:00.000Z',
          credentialEnvelope: sealed,
        }
      }))
    },
    async addTombstone() { calls.push(['addTombstone']); return { created: true } },
    async clearAll() { calls.push(['clearAll']); return { ok: true, deletedAccounts: 1, deletedTombstones: 0, remaining: 0 } },
  }
  return Object.assign(base, overrides || {})
}

/**
 * 复刻 `publish-api-server.js` 的分派：命中云账号面就交给 mixin 应答。
 * `_json` / `_parseBody` 直接借生产实现，不复制——本锁要验的就是那两处出口。
 */
function createHost(services) {
  class Host {}
  Host.prototype._json = PublishApiServer.prototype._json
  Host.prototype._parseBody = PublishApiServer.prototype._parseBody
  Host.prototype._logWarn = () => {}
  applyCloudAccountHelpers(Host)
  const host = new Host()
  // 绕过惰性组装（那需要真连接池）：直接喂已组装好的服务，与生产同一字段。
  host.__cloudAccounts = services === undefined ? null : services
  return host
}

async function listen(host) {
  const server = http.createServer(async (req, res) => {
    req.auth = { businessUser: { id: OWNER } }
    if (!host._isCloudAccountsUrl(req.url)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end('{}')
      return
    }
    await host._handleCloudAccounts(req, res, req.method, req.url)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, port: server.address().port }
}

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body))
    const req = http.request({
      host: '127.0.0.1', port, method, path,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {},
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function withServices(t, services, fn) {
  const host = createHost(services)
  const { server, port } = await listen(host)
  t.after(() => new Promise((resolve) => server.close(resolve)))
  await fn(port)
}

test('云账号面每一条出站响应都必须带 Cache-Control: no-store（明文凭证不得被缓存）', async (t) => {
  const services = createCloudAccountServices({ repository: repositoryStub(), crypto: crypto_() })

  await withServices(t, services, async (port) => {
    const cases = [
      { name: 'GET digest', method: 'GET', path: ACCOUNTS, expectStatus: 200 },
      { name: 'GET full', method: 'GET', path: `${ACCOUNTS}?view=full`, expectStatus: 200 },
      { name: 'POST sync（明文凭证下行）', method: 'POST', path: `${ACCOUNTS}/sync`, body: { keys: [{ platform: 'douyin', platformUid: 'uid-1' }] }, expectStatus: 200 },
      { name: 'POST tombstones', method: 'POST', path: `${ACCOUNTS}/tombstones`, body: { keys: [{ platform: 'douyin', platformUid: 'uid-1' }] }, expectStatus: 200 },
      { name: 'POST disconnect', method: 'POST', path: `${ACCOUNTS}/disconnect`, body: { confirm: 'cloud' }, expectStatus: 200 },
      { name: '面内未支持的方法', method: 'PATCH', path: ACCOUNTS, expectStatus: 405 },
    ]
    for (const item of cases) {
      const res = await request(port, item.method, item.path, item.body)
      // 前置反空转：请求必须真的进到本面并给出预期结论，否则「头里没有别的东西」不算证据
      assert.equal(res.status, item.expectStatus, `${item.name} 预期状态 ${item.expectStatus}，实得 ${res.status}（body=${res.text.slice(0, 160)}）`)
      assert.ok(res.text.length > 2, `${item.name} 响应体不得为空`)
      assert.equal(res.headers['cache-control'], 'no-store', `${item.name} 必须 no-store，实得 ${JSON.stringify(res.headers['cache-control'])}`)
      assert.equal(res.headers['content-type'], 'application/json', `${item.name} 合并新头时不得覆盖 Content-Type`)
    }
  })

  await t.test('POST sync 的出站体里确实是明文凭证（no-store 的前提成立，不是空头防线）', async () => {
    const host = createHost(createCloudAccountServices({ repository: repositoryStub(), crypto: crypto_() }))
    const { server, port } = await listen(host)
    try {
      const res = await request(port, 'POST', `${ACCOUNTS}/sync`, { keys: [{ platform: 'douyin', platformUid: 'uid-1' }] })
      const parsed = JSON.parse(res.text)
      assert.equal(parsed.code, 0)
      assert.equal(parsed.data.credentials.length, 1)
      assert.equal(parsed.data.credentials[0].credential, CREDENTIAL)
      assert.equal(parsed.data.credentials[0].errorCode, undefined)
      assert.equal(res.headers['cache-control'], 'no-store')
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  await t.test('未接仓储（503 提前出口）与未解析出业务身份（另一处 503）也必须 no-store', async () => {
    // 出口一：_cloudAccounts() 返回 null
    const noServices = createHost(null)
    const a = await listen(noServices)
    try {
      const res = await request(a.port, 'GET', ACCOUNTS)
      assert.equal(res.status, 503)
      assert.equal(JSON.parse(res.text).error, 'CLOUD_ACCOUNTS_NOT_CONFIGURED')
      assert.equal(res.headers['cache-control'], 'no-store', '未配置面的 503 同样不得被缓存')
    } finally {
      await new Promise((resolve) => a.server.close(resolve))
    }

    // 出口二：token 没解析出 businessUser.id
    class Host2 {}
    Host2.prototype._json = PublishApiServer.prototype._json
    applyCloudAccountHelpers(Host2)
    const host2 = new Host2()
    host2.__cloudAccounts = createCloudAccountServices({ repository: repositoryStub(), crypto: crypto_() })
    const b = await http.createServer(async (req, res) => {
      req.auth = {}
      await host2._handleCloudAccounts(req, res, req.method, req.url)
    })
    await new Promise((resolve) => b.listen(0, '127.0.0.1', resolve))
    try {
      const res = await request(b.address().port, 'GET', ACCOUNTS)
      assert.equal(res.status, 503)
      assert.equal(JSON.parse(res.text).error, 'BUSINESS_USER_REPOSITORY_NOT_CONFIGURED')
      assert.equal(res.headers['cache-control'], 'no-store')
    } finally {
      await new Promise((resolve) => b.close(resolve))
    }
  })

  await t.test('KMS 不可用时的 503 也走同一出口并带 no-store（错误路径不泄露、也不留缓存）', async () => {
    const throwing = {
      async decryptCredential() {
        throw Object.assign(new Error('kms down'), { code: 'KMS_UNAVAILABLE' })
      },
      async encryptCredential() {
        throw Object.assign(new Error('kms down'), { code: 'KMS_UNAVAILABLE' })
      },
    }
    const services = createCloudAccountServices({ repository: repositoryStub(), crypto: throwing })
    await withServices(t, services, async (port) => {
      const res = await request(port, 'POST', `${ACCOUNTS}/sync`, { keys: [{ platform: 'douyin', platformUid: 'uid-1' }] })
      const parsed = JSON.parse(res.text)
      // 逐条独立：整条响应仍是 200，坏项以 errorCode 表达
      assert.equal(res.status, 200)
      assert.equal(parsed.data.credentials[0].credential, null)
      assert.equal(parsed.data.credentials[0].errorCode, 'KMS_UNAVAILABLE')
      assert.equal(res.headers['cache-control'], 'no-store')
    })
  })
})

test('反空转：digest 的 data 形状仍按 PRD §7.1 出线（证明请求真跑到了处理器）', async (t) => {
  await withServices(t, createCloudAccountServices({ repository: repositoryStub(), crypto: crypto_() }), async (port) => {
    const res = await request(port, 'GET', ACCOUNTS)
    assert.deepEqual(JSON.parse(res.text), {
      code: 0,
      data: { total: 1, byPlatform: [{ platform: 'douyin', count: 1 }], tombstones: 0, updatedAt: '2026-09-27T00:00:00.000Z' },
    })
  })
})
