'use strict'

// 发布执行前「权益 / 激活态」复校回归测试。
//
// 设计契约（与 _authorizeScheduledEntry 对称，见 publish-api-server.js L536-560）：
//   即时发布（POST /api/v1/publish、POST /api/v1/batch-publish）执行前，
//   必须经由 _authorizeImmediateEntry 复用与定时发布同一套授权契约：
//     1) 激活态复校（assertBusinessUserActive）：suspended/deleted/inactive 一律 fail-closed；
//     2) 权益校验（_assertEntitlementFeature, feature=cloud_publish）：无权益 → 403；
//     3) 权益扣减（_consumeEntitlementFeature, amount=平台数）：按量扣减；
//     4) API Key 路径：当 identityAuthRequired=false 且 subject 为 api-key 所有者时，
//        只走 _authorizeApiKeyScheduledOwner 校验 Key 有效性，不查也不扣权益。
//
// 计数模型（Logto 身份 + 有效 ownerSubject）：
//   - 活跃用户：中央预检 L690 调用 requireFeature #1，路由 L557 调用 requireFeature #2，
//              路由 L558 调用 consumeFeature #1 ⇒ requireFeature=2, consumeFeature=1。
//   - 暂停用户：中央预检 L689 的 _ensureRequestIdentity（ensureBusinessUser→
//              assertBusinessUserActive）先抛 BUSINESS_USER_SUSPENDED，
//              L690 与路由 _authorizeImmediateEntry 均不执行 ⇒ 二者都 =0。
//   - API Key 所有者（identityAuthRequired=false）：_authorizeImmediateEntry 直接短路到
//              _authorizeApiKeyScheduledOwner，不查也不扣权益 ⇒ 二者都 =0。

const assert = require('assert')
const crypto = require('crypto')
const http = require('http')
const test = require('node:test')

const ApiKeyManager = require('../src/api-key-manager')
const { TestPublishApiServer: PublishApiServer } = require('./test-publish-api-server')

function request(port, method, path, token, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }))
    })
    req.on('error', reject)
    if (body !== undefined) req.write(JSON.stringify(body))
    req.end()
  })
}

// 与 publish-api-server.js L64-66 本地 apiKeyOwnerSubject 同公式（该函数未导出，测试侧复刻）。
function apiKeyOwnerSubject(key) {
  return `api-key:${crypto.createHash('sha256').update(String(key)).digest('hex')}`
}

function makeEntitlementProvider() {
  return {
    requireFeatureCalls: 0,
    consumeFeatureCalls: 0,
    async requireFeature() { this.requireFeatureCalls += 1; return true },
    async consumeFeature() { this.consumeFeatureCalls += 1; return { granted: true } },
  }
}

const ACTIVE_USER = { id: 'business-active', auth_subject: 'sub-active', status: 'active' }
const SUSPENDED_USER = { id: 'business-suspended', auth_subject: 'sub-suspended', status: 'suspended' }

function activeLogtoServer(extra = {}) {
  const entitlement = makeEntitlementProvider()
  const server = new PublishApiServer({
    dryRun: true,
    logtoVerifier: { async verify() { return { subject: 'sub-active', scopes: ['publish:submit'] } } },
    businessIdentityRepository: {
      async findBySubject() { return ACTIVE_USER },
      async create() { return null },
    },
    entitlementProvider: entitlement,
    ...extra,
  })
  return { server, entitlement }
}

function suspendedLogtoServer(extra = {}) {
  const entitlement = makeEntitlementProvider()
  const server = new PublishApiServer({
    dryRun: true,
    logtoVerifier: { async verify() { return { subject: 'sub-suspended', scopes: ['publish:submit'] } } },
    businessIdentityRepository: {
      async findBySubject() { return SUSPENDED_USER },
      async create() { return null },
    },
    entitlementProvider: entitlement,
    ...extra,
  })
  return { server, entitlement }
}

test('单元：_authorizeImmediateEntry 对暂停 Logto 用户 fail-closed 且不查询/扣减权益', async () => {
  const { server, entitlement } = suspendedLogtoServer()
  await server.start(0)
  try {
    await assert.rejects(
      server._authorizeImmediateEntry({ auth: { subject: 'sub-suspended', authType: 'logto' } }),
      (error) => error.code === 'BUSINESS_USER_SUSPENDED',
    )
    assert.strictEqual(entitlement.requireFeatureCalls, 0, '暂停用户不应查询权益')
    assert.strictEqual(entitlement.consumeFeatureCalls, 0, '暂停用户不应扣减权益')
  } finally {
    await server.stop()
  }
})

test('单元：_authorizeImmediateEntry 对有效 API Key 所有者只校验 Key 不查/扣权益', async () => {
  const { server, entitlement } = activeLogtoServer({ identityAuthRequired: false })
  await server.start(0)
  try {
    const { key } = new ApiKeyManager(server._keyManager._keysPath).createKey('recheck-owner', ['publish:submit'])
    const ownerSubject = apiKeyOwnerSubject(key)
    const ok = await server._authorizeImmediateEntry({
      auth: { subject: ownerSubject, ownerSubject, authType: 'api_key' },
    })
    assert.strictEqual(ok, true)
    assert.strictEqual(entitlement.requireFeatureCalls, 0, 'API Key 路径不应查询权益')
    assert.strictEqual(entitlement.consumeFeatureCalls, 0, 'API Key 路径不应扣减权益')
  } finally {
    await server.stop()
  }
})

test('集成：POST /api/v1/publish 对暂停 Logto 用户返回 403 BUSINESS_USER_SUSPENDED 且不查/扣权益', async () => {
  const { server, entitlement } = suspendedLogtoServer()
  await server.start(0)
  const port = server._server.address().port
  try {
    const res = await request(port, 'POST', '/api/v1/publish', 'tok-suspended', {
      platform: 'zhihu', title: 't', content: 'c',
    })
    assert.strictEqual(res.status, 403)
    assert.strictEqual(res.body.error, 'BUSINESS_USER_SUSPENDED')
    assert.strictEqual(res.body.message, '当前账号无权执行此操作')
    assert.strictEqual(entitlement.requireFeatureCalls, 0, '暂停用户不应查询权益')
    assert.strictEqual(entitlement.consumeFeatureCalls, 0, '暂停用户不应扣减权益')
  } finally {
    await server.stop()
  }
})

test('集成：POST /api/v1/publish 对活跃 Logto 用户放行并校验+扣减权益（dryRun zhihu 成功）', async () => {
  const { server, entitlement } = activeLogtoServer()
  await server.start(0)
  const port = server._server.address().port
  try {
    const res = await request(port, 'POST', '/api/v1/publish', 'tok-active', {
      platform: 'zhihu', title: 't', content: 'c',
    })
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.success, true)
    assert.strictEqual(res.body.dryRun, true)
    // 中央预检 requireFeature #1 + 路由 _authorizeImmediateEntry requireFeature #2
    assert.strictEqual(entitlement.requireFeatureCalls, 2, '活跃用户应查两次权益（中央+路由）')
    // 路由 _authorizeImmediateEntry consumeFeature #1（amount=1）
    assert.strictEqual(entitlement.consumeFeatureCalls, 1, '活跃用户应扣减一次权益')
  } finally {
    await server.stop()
  }
})

test('集成：POST /api/v1/batch-publish 对暂停 Logto 用户返回 403 BUSINESS_USER_SUSPENDED', async () => {
  const { server, entitlement } = suspendedLogtoServer()
  await server.start(0)
  const port = server._server.address().port
  try {
    const res = await request(port, 'POST', '/api/v1/batch-publish', 'tok-suspended', {
      platforms: ['zhihu', 'weibo'], title: 't', content: 'c',
    })
    assert.strictEqual(res.status, 403)
    assert.strictEqual(res.body.error, 'BUSINESS_USER_SUSPENDED')
    assert.strictEqual(entitlement.requireFeatureCalls, 0)
    assert.strictEqual(entitlement.consumeFeatureCalls, 0)
  } finally {
    await server.stop()
  }
})

test('集成：POST /api/v1/batch-publish 对活跃 Logto 用户放行并扣减权益（按平台数）', async () => {
  const { server, entitlement } = activeLogtoServer()
  await server.start(0)
  const port = server._server.address().port
  try {
    const res = await request(port, 'POST', '/api/v1/batch-publish', 'tok-active', {
      platforms: ['zhihu', 'weibo'], title: 't', content: 'c',
    })
    assert.strictEqual(res.status, 200)
    assert.strictEqual(entitlement.requireFeatureCalls, 2, '活跃用户应查两次权益（中央+路由）')
    assert.strictEqual(entitlement.consumeFeatureCalls, 1, '批量发布只扣减一次（amount=平台数）')
  } finally {
    await server.stop()
  }
})

test('安全：启用 Logto 且 identityAuthRequired=true 时，真实 API Key Bearer 被拒绝（401）', async () => {
  const entitlement = makeEntitlementProvider()
  const server = new PublishApiServer({
    dryRun: true,
    identityAuthRequired: true,
    logtoVerifier: {
      async verify() { throw Object.assign(new Error('AUTH_TOKEN_INVALID'), { code: 'AUTH_TOKEN_INVALID' }) },
    },
    businessIdentityRepository: { async findBySubject() { return ACTIVE_USER } },
    entitlementProvider: entitlement,
  })
  await server.start(0)
  const port = server._server.address().port
  try {
    // 真实 API Key 形态（mp_ 前缀），但 Logto 校验优先且 verify 拒绝 ⇒ 不做 API Key 回退。
    const res = await request(port, 'POST', '/api/v1/publish', 'mp_does-not-matter', {
      platform: 'zhihu', title: 't', content: 'c',
    })
    assert.strictEqual(res.status, 401)
    assert.strictEqual(res.body.message, 'AUTH_TOKEN_INVALID')
    assert.strictEqual(entitlement.requireFeatureCalls, 0)
    assert.strictEqual(entitlement.consumeFeatureCalls, 0)
  } finally {
    await server.stop()
  }
})
