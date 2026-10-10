// S2 回归测试：_assertEntitlementFeature / _consumeEntitlementFeature 对非 Logto 身份 fail-closed
//
// 逃逸分析（2026-10-09 交接 §4 S2）：
//   `publish-api-server.js:541/563` 原实现 `if (!feature || !this._usesLogtoIdentity(req)) return`
//   —— 非 Logto 身份（api_key / 匿名）进来时**静默放行**。当前 cloud_publish 的调用方
//   恰好都在 Logto 分支内（_authorizeImmediateEntry/_authorizeScheduledEntry 先行短路），
//   故暴露面有限；但一旦未来 compute/官方算力路由复用这两个门禁方法而没有显式
//   requireLogto，就是零成本白嫖（评审 R7 判 CRITICAL）。
//   修复：引入 LOGTO_ONLY_FEATURES 集合，属集内的 feature 对非 Logto 身份一律抛
//   ENTITLEMENT_IDENTITY_REQUIRED（fail-closed），不静默放行。
const assert = require('assert')
const { TestPublishApiServer } = require('./test-publish-api-server')

function makeServer(options = {}) {
  return new TestPublishApiServer({
    dryRun: true,
    logtoVerifier: { verify: async () => { throw Object.assign(new Error('AUTH_SIGNATURE_INVALID'), { code: 'AUTH_SIGNATURE_INVALID', status: 401 }) } },
    businessIdentityRepository: {
      async findBySubject(_provider, subject) {
        return { id: `business-${subject}`, auth_provider: 'logto', auth_subject: subject, status: 'active' }
      },
      async create(record) { return record },
    },
    entitlementProvider: {
      async getForUser() { return { plan: 'pro', features: ['cloud_publish'] } },
      async consumeFeature() { return { used: 1, remaining: null } },
    },
    ...options,
  })
}

async function main() {
  // ── 单元层：方法契约（不启 HTTP，直接驱动实例） ──
  const server = makeServer()
  const logtoReq = { auth: { subject: 'sub-1', authType: 'logto' } }
  const apiKeyReq = { auth: { ownerSubject: 'api-key:' + 'a'.repeat(64), authType: 'api_key', scopes: ['publish:submit'] } }
  const anonReq = {}

  // Logto 身份：行为不变（放行 + 扣减）
  await assert.doesNotReject(() => server._assertEntitlementFeature(logtoReq, 'cloud_publish'))
  const consumed = await server._consumeEntitlementFeature(logtoReq, 'cloud_publish', 1)
  assert.strictEqual(consumed.used, 1)

  // 匿名（req.auth 不存在）+ Logto 专属 feature：fail-closed（原实现静默放行——
  // plan/execute 无认证头即可执行发布计划是漏洞实证，publish-api-server.test.js 的
  // plan/execute 用例曾在无 auth 头下 200）
  await assert.rejects(
    () => server._assertEntitlementFeature(anonReq, 'cloud_publish'),
    (e) => e.code === 'ENTITLEMENT_IDENTITY_REQUIRED' && e.status === 403,
    '匿名请求调用 cloud_publish 必须被拒（原实现静默放行）',
  )
  await assert.rejects(
    () => server._consumeEntitlementFeature(anonReq, 'cloud_publish', 1),
    (e) => e.code === 'ENTITLEMENT_IDENTITY_REQUIRED' && e.status === 403,
    '匿名请求扣减 cloud_publish 必须被拒（原实现返回 null 静默跳过）',
  )

  // api_key 身份（已过 scope 校验的 legacy 契约）：维持放行、不扣减——API Key 计费
  // 模型未实现，属登记债务；未来 compute/官方算力路由是新技术必须显式 requireLogto
  await assert.doesNotReject(() => server._assertEntitlementFeature(apiKeyReq, 'cloud_publish'))
  assert.strictEqual(await server._consumeEntitlementFeature(apiKeyReq, 'cloud_publish', 1), null)

  // 非 Logto 身份 + 非 Logto 专属 feature：保持既有宽松语义（不影响 API Key 老用户）
  await assert.doesNotReject(() => server._assertEntitlementFeature(apiKeyReq, null))
  assert.strictEqual(await server._assertEntitlementFeature(apiKeyReq, 'some_future_feature'), true)
  assert.strictEqual(await server._consumeEntitlementFeature(apiKeyReq, 'some_future_feature', 1), null)

  console.log('  ✅ S2 门禁契约：匿名 fail-closed；api_key 维持 legacy 放行；Logto 正常校验')

  // ── 集成层：api_key 走完整发布链路不被权益门禁放行（scope 校验路径不受影响） ──
  // （HTTP 层 api_key 请求体不带 Bearer Logto token 时走 _checkApiKeyAuth 的 scope 校验，
  //  本断言确保修复没有改变该既有语义——publish 接口对合法 scope 的 api_key 仍可用。）
  const httpServer = makeServer()
  await httpServer.start(0)
  try {
    const port = httpServer._server.address().port
    const http = require('http')
    const post = (path, key) => new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1', port, method: 'POST', path,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      }, (res) => {
        let data = ''
        res.on('data', (c) => { data += c })
        res.on('end', () => resolve({ status: res.statusCode, body: data }))
      })
      req.on('error', reject)
      req.end(JSON.stringify({ platform: 'zhihu', title: 't', content: 'c' }))
    })
    // 未配置 identityAuthRequired 时，legacy api_key 路径按 scope 校验——修复不得改变它
    const r = await post('/api/v1/publish', 'legacy-shared-key')
    assert.ok([200, 401, 403].includes(r.status), `legacy api_key 发布链路返回状态应属于 {200,401,403}，实际 ${r.status}`)
    console.log(`  ✅ 集成回归：legacy api_key 发布链路语义未变（HTTP ${r.status}）`)
  } finally {
    await httpServer.stop()
  }

  console.log('\n✅ publish-api-entitlement-guard 全部通过')
}

main().catch((error) => {
  console.error(`❌ publish-api-entitlement-guard: ${error.stack || error.message}`)
  process.exitCode = 1
})
