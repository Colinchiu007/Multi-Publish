'use strict'
/**
 * shipinhao-capabilities.test.js — 视频号发布前能力面契约测试（零外发）
 */
const assert = require('assert')
const { startFakeServer } = require('./helpers/fake-http')
const {
  ShipinhaoCapabilities,
  AUTH_DATA_PATH,
  LOGIN_EXPIRED_CODES,
} = require('../src/publish/capabilities/shipinhao-capabilities')

const COOKIE = 'finder_auth=xx; wxuin=520'

async function withServer (routes, fn) {
  const server = await startFakeServer(routes)
  try { return await fn(server) } finally { await server.close() }
}
function caps (server, extra) {
  return new ShipinhaoCapabilities(Object.assign({ cookie: COOKIE, apiBase: server.url }, extra || {}))
}

async function main () {
  console.log('--- 视频号能力面：账号信息 ---')
  await withServer([
    { method: 'POST', match: new RegExp('^' + AUTH_DATA_PATH), body: { errCode: 0, data: { finderUser: { uin: '1234567', finderId: 'f-888', finderUsername: '某某视频号' } } } },
  ], async (server) => {
    const info = await caps(server).userInfo()
    assert.strictEqual(info.uin, '1234567')
    assert.strictEqual(info.finderId, 'f-888')
    assert.strictEqual(info.nickname, '某某视频号')
    const body = server.requests[0].body
    assert.strictEqual(body.scene, 7)
    assert.strictEqual(body.reqScene, 7)
    assert.strictEqual(body.rawKeyBuff, null)
    assert.strictEqual(body.pluginSessionId, null)
    assert.strictEqual(body._log_finder_id, null, 'finderId 缺省时传 null，平台用 cookie 自解析')
    assert.strictEqual(typeof body.timestamp, 'string')
    console.log('  ✅ 解析 uin / finderId / 昵称；请求体与取证切片逐字段一致')
  })

  console.log('--- 视频号能力面：显式 finderId 下传 ---')
  await withServer([
    { method: 'POST', match: new RegExp('^' + AUTH_DATA_PATH), body: { errCode: 0, data: { finderUser: { uin: '1', finderUsername: 'x' } } } },
  ], async (server) => {
    await caps(server, { finderId: 'given-finder' }).userInfo()
    assert.strictEqual(server.requests[0].body._log_finder_id, 'given-finder')
    console.log('  ✅ 构造期传入的 finderId 被透传')
  })

  console.log('--- 视频号能力面：登录失效码 ---')
  for (const code of LOGIN_EXPIRED_CODES) {
    await withServer([
      { method: 'POST', match: new RegExp('^' + AUTH_DATA_PATH), body: { errCode: code, errMsg: '登录失效' } },
    ], async (server) => {
      await assert.rejects(
        () => caps(server).userInfo(),
        (err) => { assert.strictEqual(err.login_expired, true); return true })
    })
  }
  console.log(`  ✅ 300333 / 300334 均标记 login_expired（与既有链判定口径一致）`)

  console.log('--- 视频号能力面：发布预检放行 ---')
  await withServer([
    { method: 'POST', match: new RegExp('^' + AUTH_DATA_PATH), body: { errCode: 0, data: { finderUser: { uin: '1234567' } } } },
  ], async (server) => {
    const perm = await caps(server).publishPermission()
    assert.strictEqual(perm.allowed, true)
    console.log('  ✅ 返回 uin → 允许')
  })

  console.log('--- 视频号能力面：发布预检遇登录失效 → 不抛，转 allowed:false ---')
  await withServer([
    { method: 'POST', match: new RegExp('^' + AUTH_DATA_PATH), body: { errCode: 300334, errMsg: '登录失效' } },
  ], async (server) => {
    const perm = await caps(server).publishPermission()
    assert.strictEqual(perm.allowed, false)
    assert.strictEqual(perm.login_expired, true)
    console.log('  ✅ 预检面只回答「能不能发」，登录失效转成结构化结果而非异常上抛')
  })

  console.log('--- 视频号能力面：缺 cookie 零请求 ---')
  await withServer([], async (server) => {
    const bare = new ShipinhaoCapabilities({ apiBase: server.url })
    await assert.rejects(() => bare.userInfo(), /missing cookie/)
    assert.strictEqual(server.requests.length, 0)
    console.log('  ✅ fail-closed，请求数为 0')
  })

  console.log('\n========== shipinhao-capabilities 全部通过 ==========')
}

main().catch((e) => { console.error('❌', e); process.exit(1) })