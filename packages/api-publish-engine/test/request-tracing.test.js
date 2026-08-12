// http-request-tracing（OpenSpec change）回归测试：requestId 贯穿 + 结构化 access log
const assert = require('assert')
const http = require('http')
const { createHarness } = require('./async-test-harness')
const { TestPublishApiServer } = require('./test-publish-api-server')

const { test: t, run } = createHarness()
function eq(a, b) { assert.deepStrictEqual(a, b) }

function makeAccessCapture() {
  const lines = []
  return { lines, writeFn: function(l) { lines.push(l) } }
}

function has(entry, needle) {
  return entry && entry.some(function(x) { return typeof x === 'string' && x.indexOf(needle) !== -1 })
}

function request(port, method, path, headers, body) {
  return new Promise(function(resolve, reject) {
    const opts = { hostname: '127.0.0.1', port, path, method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) }
    const req = http.request(opts, function(res) {
      let data = ''
      res.on('data', function(c) { data += c })
      res.on('end', function() {
        resolve({ status: res.statusCode, headers: res.headers, body: data })
      })
    })
    req.on('error', reject)
    if (body !== undefined && body !== null) req.write(JSON.stringify(body))
    req.end()
  })
}

console.log('--- R1: requestId 生成与回显 ---')

t('响应回显 x-request-id 且与 access log 一致（透传合法值）', async function() {
  const cap = makeAccessCapture()
  const server = new TestPublishApiServer({ dryRun: true, accessLogWriteFn: cap.writeFn })
  await server.start(0)
  const port = server._server.address().port
  const r = await request(port, 'GET', '/api/v1/platforms', { 'x-request-id': 'client-abc-123' })
  eq(r.status, 200)
  eq(r.headers['x-request-id'], 'client-abc-123')
  const entry = JSON.parse(cap.lines[0])
  eq(entry.requestId, 'client-abc-123')
  eq(entry.method, 'GET')
  eq(entry.path, '/api/v1/platforms')
  await server.stop()
})

t('无透传头时自生成 requestId 且响应/日志一致', async function() {
  const cap = makeAccessCapture()
  const server = new TestPublishApiServer({ dryRun: true, accessLogWriteFn: cap.writeFn })
  await server.start(0)
  const port = server._server.address().port
  const r = await request(port, 'GET', '/api/v1/platforms')
  eq(r.status, 200)
  const entry = JSON.parse(cap.lines[0])
  assert(r.headers['x-request-id'], 'expected x-request-id header')
  eq(r.headers['x-request-id'], entry.requestId)
  assert(entry.requestId.length > 0, 'non-empty requestId')
  await server.stop()
})

t('非法透传头回落自生成', async function() {
  const cap = makeAccessCapture()
  const server = new TestPublishApiServer({ dryRun: true, accessLogWriteFn: cap.writeFn })
  await server.start(0)
  const port = server._server.address().port
  const r = await request(port, 'GET', '/api/v1/platforms', { 'x-request-id': 'bad id with space!' })
  eq(r.status, 200)
  assert(r.headers['x-request-id'] !== 'bad id with space!', 'invalid header ignored')
  const entry = JSON.parse(cap.lines[0])
  eq(r.headers['x-request-id'], entry.requestId)
  await server.stop()
})

console.log('--- R2/R3: errorCode 关联 + 错误日志 requestId ---')

t('鉴权失败 access log 含 errorCode，错误日志含 requestId', async function() {
  const cap = makeAccessCapture()
  const logCalls = []
  const spyLog = { warn: function(...a) { logCalls.push(['warn', ...a]) }, error: function(...a) { logCalls.push(['error', ...a]) }, info: function(...a) { logCalls.push(['info', ...a]) } }
  const verifier = {
    verify: async function() {
      const err = new Error('bad token')
      err.code = 'AUTH_TOKEN_INVALID'
      throw err
    },
  }
  const server = new TestPublishApiServer({ dryRun: true, log: spyLog, accessLogWriteFn: cap.writeFn, logtoVerifier: verifier, identityAuthRequired: true })
  await server.start(0)
  const port = server._server.address().port
  const r = await request(port, 'GET', '/api/v1/platforms', { Authorization: 'Bearer tok', 'x-request-id': 'rid-auth-1' })
  eq(r.status, 401)
  await server.stop()
  const entry = JSON.parse(cap.lines[0])
  eq(entry.errorCode, 'AUTH_TOKEN_INVALID')
  eq(entry.requestId, 'rid-auth-1')
  const warn = logCalls.find(function(c) { return c[0] === 'warn' && has(c, 'AUTH_TOKEN_INVALID') })
  assert(warn, 'expected AUTH_TOKEN_INVALID warn')
  assert(has(warn, 'rid-auth-1'), 'warn 上下文含 requestId')
})

t('404 响应 access log 含 errorCode（Not found）', async function() {
  const cap = makeAccessCapture()
  const server = new TestPublishApiServer({ dryRun: true, accessLogWriteFn: cap.writeFn })
  await server.start(0)
  const port = server._server.address().port
  const r = await request(port, 'GET', '/api/v1/no-such-route')
  eq(r.status, 404)
  const entry = JSON.parse(cap.lines[0])
  eq(entry.errorCode, 'Not found')
  eq(entry.status, 404)
  await server.stop()
})

console.log("--- W1/W2/W3 回归（Claude 审查）---")

t("docs 端点响应也回显 x-request-id（W1）", async function() {
  const cap = makeAccessCapture()
  const server = new TestPublishApiServer({ dryRun: true, accessLogWriteFn: cap.writeFn })
  await server.start(0)
  const port = server._server.address().port
  const r = await request(port, "GET", "/api/v1/docs")
  eq(r.status, 200)
  assert(r.headers["x-request-id"], "docs 响应缺 x-request-id")
  const entry = JSON.parse(cap.lines[0])
  eq(r.headers["x-request-id"], entry.requestId)
  await server.stop()
})

t("HTTP 200 应用错误（发布失败）access log 含 errorCode（W3）", async function() {
  const cap = makeAccessCapture()
  const server = new TestPublishApiServer({ dryRun: true, accessLogWriteFn: cap.writeFn })
  await server.start(0)
  const port = server._server.address().port
  const r = await request(port, "POST", "/api/v1/publish", null, { platform: "unknown", title: "t", content: "c", cookie: "x" })
  await server.stop()
  eq(r.status, 200)
  const entry = JSON.parse(cap.lines[0])
  assert(entry.errorCode, "expected errorCode for success:false")
  assert(entry.errorCode.indexOf("No API adapter") !== -1, "errorCode 含适配器错误：" + entry.errorCode)
})

t("errorCode raw 回退脱敏且截断（W2）", function() {
  const { PublishApiServer } = require("../src/publish-api-server")
  const server = new PublishApiServer({ dryRun: true })
  const req = { requestId: "rid-w2" }
  const res = { req, statusCode: 500, writeHead: function() {}, end: function() {} }
  server._json(res, 500, { error: "boom Bearer sk-abcdefgh123456 " + "x".repeat(120) })
  assert(res.req._errorCode, "expected _errorCode")
  assert(res.req._errorCode.indexOf("sk-abcdefgh123456") === -1, "未脱敏：" + res.req._errorCode)
  assert(res.req._errorCode.length <= 64, "未截断：" + res.req._errorCode.length)
})


run()
