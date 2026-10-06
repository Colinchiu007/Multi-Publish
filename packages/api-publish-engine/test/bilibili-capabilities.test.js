'use strict'
/**
 * bilibili-capabilities.test.js — B站发布前能力面契约测试（零外发）
 */
const assert = require('assert')
const { startFakeServer } = require('./helpers/fake-http')
const {
  BilibiliCapabilities,
  USER_INFO_PATH,
  MEMBER_INFO_PATH,
  PRIVILEGE_PATH,
} = require('../src/publish/capabilities/bilibili-capabilities')

const COOKIE = 'SESSDATA=xyz; bili_jct=abcdef0123456789abcdef; DedeUserID=999'

async function withServer (routes, fn) {
  const server = await startFakeServer(routes)
  try { return await fn(server) } finally { await server.close() }
}
function caps (server) {
  return new BilibiliCapabilities({ cookie: COOKIE, apiBase: server.url })
}

async function main () {
  console.log('--- B站能力面：账号信息 ---')
  await withServer([
    { method: 'GET', match: new RegExp('^' + USER_INFO_PATH), body: { code: 0, data: { mid: 999, uname: '某某UP', face: 'https://i0.hdslb.com/face.jpg', isLogin: true, isVip: true, level_info: { current_level: 6 } } } },
  ], async (server) => {
    const info = await caps(server).userInfo()
    assert.strictEqual(info.uid, '999')
    assert.strictEqual(info.nickname, '某某UP')
    assert.strictEqual(info.level, 6)
    assert.strictEqual(info.vip, true)
    assert.strictEqual(info.loggedIn, true)
    assert.strictEqual(server.requests[0].headers.cookie, COOKIE)
    console.log('  ✅ 解析 mid / uname / face / 等级 / VIP / 登录态')
  })

  console.log('--- B站能力面：账号详细资料 ---')
  await withServer([
    { method: 'GET', match: new RegExp('^' + MEMBER_INFO_PATH), body: { code: 0, data: { profile: { mid: 999, name: '某某UP', sign: '签名档', money: 1234 } } } },
  ], async (server) => {
    const info = await caps(server).memberInfo()
    assert.strictEqual(info.nickname, '某某UP')
    assert.strictEqual(info.sign, '签名档')
    assert.strictEqual(info.coins, 1234)
    console.log('  ✅ 解析 member/web/account 的 name / sign / money')
  })

  console.log('--- B站能力面：专栏发布权限（已开通）---')
  await withServer([
    { method: 'GET', match: new RegExp('^' + PRIVILEGE_PATH), body: { code: 0, data: { is_author: 1 } } },
  ], async (server) => {
    const perm = await caps(server).publishPermission()
    assert.strictEqual(perm.allowed, true)
    assert.strictEqual(perm.reason, '')
    console.log('  ✅ is_author=1 → 允许')
  })

  console.log('--- B站能力面：专栏发布权限（未开通）---')
  await withServer([
    { method: 'GET', match: new RegExp('^' + PRIVILEGE_PATH), body: { code: 0, data: { is_author: 0 } } },
  ], async (server) => {
    const perm = await caps(server).publishPermission()
    assert.strictEqual(perm.allowed, false)
    assert.match(perm.reason, /专栏/)
    assert.match(perm.reason, /视频投稿不受影响/)
    console.log('  ✅ is_author≠1 → 拒绝并说明只影响图文（视频不受影响）')
  })

  console.log('--- B站能力面：-101 未登录 ---')
  await withServer([
    { method: 'GET', match: new RegExp('^' + USER_INFO_PATH), body: { code: -101, message: '账号未登录' } },
  ], async (server) => {
    await assert.rejects(
      () => caps(server).userInfo(),
      (err) => { assert.strictEqual(err.biliCode, -101); assert.strictEqual(err.cookieExpired, true); return true })
    console.log('  ✅ -101 标记 cookieExpired（供上层触发重新登录）')
  })

  console.log('--- B站能力面：缺 cookie 零请求 ---')
  await withServer([], async (server) => {
    const bare = new BilibiliCapabilities({ apiBase: server.url })
    await assert.rejects(() => bare.userInfo(), /missing cookie/)
    await assert.rejects(() => bare.memberInfo(), /missing cookie/)
    await assert.rejects(() => bare.publishPermission(), /missing cookie/)
    assert.strictEqual(server.requests.length, 0)
    console.log('  ✅ 三个能力一致 fail-closed，请求数为 0')
  })

  console.log('\n========== bilibili-capabilities 全部通过 ==========')
}

main().catch((e) => { console.error('❌', e); process.exit(1) })