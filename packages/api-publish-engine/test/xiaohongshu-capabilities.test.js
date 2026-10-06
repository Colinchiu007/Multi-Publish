'use strict'
/**
 * xiaohongshu-capabilities.test.js — 小红书发布前能力面契约测试（零外发）
 */
const assert = require('assert')
const { startFakeServer } = require('./helpers/fake-http')
const {
  XiaohongshuCapabilities,
  USER_INFO_PATH,
  REFERER,
} = require('../src/publish/capabilities/xiaohongshu-capabilities')

const COOKIE = 'web_session=abc123; a1=xyz'

async function withServer (routes, fn) {
  const server = await startFakeServer(routes)
  try { return await fn(server) } finally { await server.close() }
}
function caps (server) {
  return new XiaohongshuCapabilities({ cookie: COOKIE, apiBase: server.url })
}

async function main () {
  console.log('--- 小红书能力面：账号信息 ---')
  await withServer([
    { method: 'GET', match: new RegExp('^' + USER_INFO_PATH), body: { success: true, data: { red_id: '12345678', nickname: '某某笔记', desc: '简介', level: '普通用户' } } },
  ], async (server) => {
    const info = await caps(server).userInfo()
    assert.strictEqual(info.uid, '12345678')
    assert.strictEqual(info.nickname, '某某笔记')
    assert.strictEqual(info.desc, '简介')
    assert.strictEqual(info.level, '普通用户')
    const req = server.requests[0]
    assert.strictEqual(req.headers.cookie, COOKIE)
    assert.strictEqual(req.headers.referer, REFERER)
    assert.strictEqual(req.headers.authorization, '', '取证切片里 Authorization 固定空串')
    console.log('  ✅ 解析 red_id / 昵称 / 简介 / 等级；头部逐字段对齐切片')
  })

  console.log('--- 小红书能力面：业务码非 0 ---')
  await withServer([
    { method: 'GET', match: new RegExp('^' + USER_INFO_PATH), body: { success: false, code: -101, msg: '未登录' } },
  ], async (server) => {
    await assert.rejects(() => caps(server).userInfo(), /code=-101/)
    console.log('  ✅ 非成功应答 fail-closed 抛错')
  })

  console.log('--- 小红书能力面：缺 cookie 零请求 ---')
  await withServer([], async (server) => {
    const bare = new XiaohongshuCapabilities({ apiBase: server.url })
    await assert.rejects(() => bare.userInfo(), /missing cookie/)
    assert.strictEqual(server.requests.length, 0)
    console.log('  ✅ fail-closed，请求数为 0')
  })

  console.log('--- 小红书能力面：刻意不提供 publishPermission ---')
  const inst = new XiaohongshuCapabilities({ cookie: COOKIE })
  assert.strictEqual(typeof inst.publishPermission, 'undefined')
  console.log('  ✅ 未取证的能力不提供方法（宁可缺省也不假装支持）')

  console.log('\n========== xiaohongshu-capabilities 全部通过 ==========')
}

main().catch((e) => { console.error('❌', e); process.exit(1) })