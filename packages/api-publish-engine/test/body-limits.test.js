'use strict'
/**
 * body-limits.test.js — 请求体读取加固的回归锁（2026-10-06）
 *
 * 锁定两条此前缺失的语义：
 *   1. 体积上限：此前 _parseBody 无上限，chunks 无限累积。
 *   2. 解析失败：此前 `catch { resolve({}) }`，畸形 JSON 被当成「空对象」继续走，
 *      随后在 `body.platform` 之类处报出与真实原因无关的错误。
 *      本次要求畸形 JSON 必须是 400 INVALID_JSON_BODY。
 */
const assert = require('assert')
const http = require('http')
const { createHarness } = require('./async-test-harness')

var mod
try { mod = require('../src/publish-api-server') } catch (e) { mod = null }
var PublishApiServer = mod ? require('./test-publish-api-server').TestPublishApiServer : null

const { test: t, run } = createHarness()

/** 发送**原始字符串** body（不能用 JSON.stringify，否则测不到畸形 JSON）。 */
function postRaw (port, path, raw) {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      hostname: '127.0.0.1', port: port, path: path, method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, function (res) {
      var data = ''
      res.on('data', function (c) { data += c })
      res.on('end', function () {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch (e) { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.on('error', reject)
    req.write(raw)
    req.end()
  })
}

async function withServer (fn) {
  var server = new PublishApiServer({ dryRun: true })
  await server.start(0)
  try { return await fn(server._server.address().port) } finally { await server.stop() }
}

if (!PublishApiServer) {
  console.log('⚠️ publish-api-server 不可加载，跳过 body-limits')
} else {
  console.log('--- 请求体体积上限 ---')
  t('超过 1 MiB 的 body → 413 BODY_TOO_LARGE', async function () {
    await withServer(async function (port) {
      var payload = JSON.stringify({ platform: 'douyin', content: 'A'.repeat(1024 * 1024 + 64) })
      var r = await postRaw(port, '/api/v1/publish', payload)
      assert.strictEqual(r.status, 413)
      assert.strictEqual(r.body.error, 'BODY_TOO_LARGE')
    })
  })

  t('刚好在上限内的 body 正常受理（不误伤）', async function () {
    await withServer(async function (port) {
      var payload = JSON.stringify({ platform: 'douyin', content: 'A'.repeat(1024) })
      var r = await postRaw(port, '/api/v1/publish', payload)
      assert.strictEqual(r.status, 200)
    })
  })

  console.log('--- 畸形 JSON 不再静默吞掉 ---')
  t('{not json → 400 INVALID_JSON_BODY', async function () {
    await withServer(async function (port) {
      var r = await postRaw(port, '/api/v1/publish', '{not json')
      assert.strictEqual(r.status, 400)
      assert.strictEqual(r.body.error, 'INVALID_JSON_BODY')
    })
  })

  t('截断的 JSON → 400 而非当作空对象继续', async function () {
    await withServer(async function (port) {
      var r = await postRaw(port, '/api/v1/publish', '{"platform":"douyin"')
      assert.strictEqual(r.status, 400)
      assert.strictEqual(r.body.error, 'INVALID_JSON_BODY')
    })
  })

  t('JSON 数组（非对象）→ 400', async function () {
    await withServer(async function (port) {
      var r = await postRaw(port, '/api/v1/publish', '[1,2,3]')
      assert.strictEqual(r.status, 400)
    })
  })

  console.log('--- 空 body 仍按「缺字段」处理，不是解析错误 ---')
  t('空 body → 400 platform is required（保持既有语义）', async function () {
    await withServer(async function (port) {
      var r = await postRaw(port, '/api/v1/publish', '')
      assert.strictEqual(r.status, 400)
      assert.strictEqual(r.body.error, 'platform is required')
    })
  })

  t('能力面路由同样受上限保护', async function () {
    await withServer(async function (port) {
      var payload = JSON.stringify({ cookie: 'c=1', pad: 'B'.repeat(1024 * 1024 + 64) })
      var r = await postRaw(port, '/api/v1/platforms/douyin/user-info', payload)
      assert.strictEqual(r.status, 413)
    })
  })
}

run()
