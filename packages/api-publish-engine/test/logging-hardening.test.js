// logging-hardening（OpenSpec change logging-hardening-p0）回归测试
const assert = require('assert')
const http = require('http')
const { createHarness } = require('./async-test-harness')
const { PublishApiServer } = require('../src/publish-api-server')
const { TestPublishApiServer } = require('./test-publish-api-server')

const { test: t, run } = createHarness()
function eq(a, b) { assert.deepStrictEqual(a, b) }

function makeSpyLogger() {
  const calls = []
  const logger = {
    calls,
    warn: function(...a) { calls.push(['warn', ...a]) },
    error: function(...a) { calls.push(['error', ...a]) },
    info: function(...a) { calls.push(['info', ...a]) },
  }
  return logger
}

function has(entry, needle) {
  return entry && entry.some(function(x) { return typeof x === 'string' && x.indexOf(needle) !== -1 })
}

function request(port, method, path, body, headers) {
  return new Promise(function(resolve, reject) {
    const opts = { hostname: '127.0.0.1', port, path, method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) }
    const req = http.request(opts, function(res) {
      let data = ''
      res.on('data', function(c) { data += c })
      res.on('end', function() {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch (e) { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.on('error', reject)
    if (body !== undefined && body !== null) req.write(JSON.stringify(body))
    req.end()
  })
}

console.log('--- R2: 服务错误路径日志 ---')

t('_logError 记录 code/message/stack 且脱敏', function() {
  const log = makeSpyLogger()
  const server = new PublishApiServer({ dryRun: true, log })
  server._logError('AUTH_PROVIDER_UNAVAILABLE', new Error('Bearer sk-abcdefgh123456 boom'), { path: '/x' })
  const entry = log.calls.find(function(c) { return c[0] === 'error' })
  assert(entry, 'expected error log')
  assert(has(entry, 'AUTH_PROVIDER_UNAVAILABLE'), 'code present')
  assert(has(entry, 'boom'), 'message present')
  assert(!has(entry, 'sk-abcdefgh123456'), 'secret redacted')
})

t('内部错误路径 5xx 记录 error 日志（ENTITLEMENT_UNAVAILABLE）', function() {
  const log = makeSpyLogger()
  const server = new PublishApiServer({ dryRun: true, log })
  server._logError('ENTITLEMENT_UNAVAILABLE', new Error('entitlement backend down'), { path: '/api/v1/x', method: 'GET' })
  const entry = log.calls.find(function(c) { return c[0] === 'error' })
  assert(entry, 'expected error log')
  assert(has(entry, 'ENTITLEMENT_UNAVAILABLE'))
  assert(has(entry, 'entitlement backend down'))
})

console.log('--- R3: 鉴权失败日志 ---')

t('无效 token 请求返回 401 且记录 warn（AUTH_TOKEN_INVALID）', async function() {
  const log = makeSpyLogger()
  const verifier = {
    verify: async function() {
      const err = new Error('bad token')
      err.code = 'AUTH_TOKEN_INVALID'
      throw err
    },
  }
  const server = new TestPublishApiServer({ dryRun: true, log, logtoVerifier: verifier, identityAuthRequired: true })
  await server.start(0)
  const port = server._server.address().port
  const r = await request(port, 'GET', '/api/v1/platforms', null, { Authorization: 'Bearer tok' })
  eq(r.status, 401)
  await server.stop()
  const warn = log.calls.find(function(c) { return c[0] === 'warn' && has(c, 'AUTH_TOKEN_INVALID') })
  assert(warn, 'expected AUTH_TOKEN_INVALID warn')
})

t('鉴权提供方不可用返回 503 且记录 error 带堆栈', async function() {
  const log = makeSpyLogger()
  const verifier = {
    verify: async function() {
      const err = new Error('jwks fetch failed')
      err.code = 'AUTH_JWKS_UNAVAILABLE'
      err.status = 503
      throw err
    },
  }
  const server = new TestPublishApiServer({ dryRun: true, log, logtoVerifier: verifier, identityAuthRequired: true })
  await server.start(0)
  const port = server._server.address().port
  const r = await request(port, 'GET', '/api/v1/platforms', null, { Authorization: 'Bearer t' })
  eq(r.status, 503)
  await server.stop()
  const err = log.calls.find(function(c) { return c[0] === 'error' && has(c, 'AUTH_JWKS_UNAVAILABLE') })
  assert(err, 'expected AUTH_JWKS_UNAVAILABLE error')
  assert(has(err, 'jwks fetch failed'), 'stack/message present')
})

console.log('--- R3: webhook 失败日志 ---')

t('webhook 处理失败记录 error（WEBHOOK_SIGNATURE_MISMATCH）', async function() {
  const log = makeSpyLogger()
  const consumer = {
    maxBodyBytes: 4096,
    consume: async function() {
      const err = new Error('signature mismatch')
      err.code = 'WEBHOOK_SIGNATURE_MISMATCH'
      err.status = 401
      throw err
    },
  }
  const server = new TestPublishApiServer({ dryRun: true, log, logtoWebhookConsumer: consumer })
  await server.start(0)
  const port = server._server.address().port
  const r = await request(port, 'POST', '/api/v1/auth/logto/webhook', { hello: 'world' })
  eq(r.status, 401)
  await server.stop()
  const err = log.calls.find(function(c) { return c[0] === 'error' && has(c, 'WEBHOOK_SIGNATURE_MISMATCH') })
  assert(err, 'expected webhook error log')
})

console.log('--- R2: 空 catch 修复 ---')

t('plugins 列表异常记录 error 且响应 200 空列表（不再吞错）', async function() {
  const log = makeSpyLogger()
  const pluginLoader = {
    listAll: function() { throw new Error('boom plugins') },
    isEnabled: function() { return true },
  }
  const server = new TestPublishApiServer({ dryRun: true, log, pluginLoader })
  await server.start(0)
  const port = server._server.address().port
  const r = await request(port, 'GET', '/api/v1/plugins')
  eq(r.status, 200)
  eq(r.body.plugins.length, 0)
  await server.stop()
  const err = log.calls.find(function(c) { return c[0] === 'error' && has(c, 'PLUGIN_LIST_FAILED') })
  assert(err, 'expected PLUGIN_LIST_FAILED error log')
})

run()
