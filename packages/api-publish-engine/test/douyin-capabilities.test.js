'use strict'
/**
 * douyin-capabilities.test.js — 抖音发布前能力面契约测试
 *
 * 全部请求指向本机假 HTTP 服务器（test/helpers/fake-http.js），
 * 配合 network-egress-guard.setup.js 构成零外发双保险。
 */
const assert = require('assert')
const { startFakeServer } = require('./helpers/fake-http')
const {
  DouyinCapabilities,
  USER_INFO_PATH,
  POST_PERMISSION_PATH,
  POI_RECOMMEND_PATH,
} = require('../src/publish/capabilities/douyin-capabilities')

const COOKIE = 'sid_tt=abc; uid_tt=12345; sessionid=zzz'

async function withServer (routes, fn) {
  const server = await startFakeServer(routes)
  try { return await fn(server) } finally { await server.close() }
}

function caps (server) {
  return new DouyinCapabilities({ cookie: COOKIE, apiBase: server.url })
}

async function main () {
  console.log('--- 抖音能力面：账号信息 ---')
  await withServer([
    { method: 'GET', match: new RegExp('^' + USER_INFO_PATH), body: { status_code: 0, user: { uid: '12345', nickname: '某某创作者', avatar_life: 'https://p3-pc.douyinpic.com/avatar.jpg' } } },
  ], async (server) => {
    const info = await caps(server).userInfo()
    assert.strictEqual(info.platform, 'douyin')
    assert.strictEqual(info.uid, '12345')
    assert.strictEqual(info.nickname, '某某创作者')
    assert.match(info.avatar, /^https:\/\//)
    const req = server.requests[0]
    assert.strictEqual(req.method, 'GET')
    assert.strictEqual(req.headers.cookie, COOKIE)
    assert.match(req.url, /aid=2906/)
    assert.match(req.url, /_signature=_/)
    console.log('  ✅ 解析 uid / nickname / avatar，并透传 cookie 与固定浏览器参数')
  })

  console.log('--- 抖音能力面：账号信息 status_code 非 0 ---')
  await withServer([
    { method: 'GET', match: new RegExp('^' + USER_INFO_PATH), body: { status_code: 40013 } },
  ], async (server) => {
    await assert.rejects(() => caps(server).userInfo(), /status_code=40013/)
    console.log('  ✅ 非 0 业务码 fail-closed 抛错')
  })

  console.log('--- 抖音能力面：发布权限预检（放行）---')
  await withServer([
    { method: 'GET', match: new RegExp('^' + POST_PERMISSION_PATH), body: { status_code: 0, data: { can_post: true } } },
  ], async (server) => {
    const perm = await caps(server).publishPermission()
    assert.strictEqual(perm.allowed, true)
    assert.strictEqual(perm.risk_blocked, false)
    const url = server.requests[0].url
    assert.match(url, /is_image_album_style=0/)
    assert.match(url, /options=%7B%7D/)
    console.log('  ✅ 允许发布，无风控标记')
  })

  console.log('--- 抖音能力面：发布权限预检（风控 110）---')
  await withServer([
    { method: 'GET', match: new RegExp('^' + POST_PERMISSION_PATH), body: { status_code: 110, status_msg: '验证失败' } },
  ], async (server) => {
    const perm = await caps(server).publishPermission()
    assert.strictEqual(perm.allowed, false)
    assert.strictEqual(perm.risk_blocked, true)
    assert.match(perm.reason, /安全验证/)
    console.log('  ✅ 110 判为 risk_blocked（不自动换号，与既有链同一纪律）')
  })

  console.log('--- 抖音能力面：POI 推荐 ---')
  await withServer([
    { method: 'GET', match: new RegExp('^' + POI_RECOMMEND_PATH), body: { status_code: 0, poi_list: [{ poi_id: 'p1', poi_name: '北京总部', city_name: '北京' }, { poi_name: '仅有名字的挂载点' }, { poi_id: '', poi_name: '' }] } },
  ], async (server) => {
    const poi = await caps(server).poiRecommend()
    assert.strictEqual(poi.items.length, 2)
    assert.strictEqual(poi.items[0].id, 'p1')
    assert.strictEqual(poi.items[0].name, '北京总部')
    assert.strictEqual(poi.items[0].city, '北京')
    assert.strictEqual(poi.items[1].id, '')
    assert.strictEqual(poi.items[1].name, '仅有名字的挂载点')
    console.log('  ✅ 归一为 {id,name,city}；仅名字无 id 的条目保留，id/name 全空的条目丢弃')
  })

  console.log('--- 抖音能力面：POI 空列表不抛 ---')
  await withServer([
    { method: 'GET', match: new RegExp('^' + POI_RECOMMEND_PATH), body: { status_code: 0 } },
  ], async (server) => {
    const poi = await caps(server).poiRecommend()
    assert.deepStrictEqual(poi.items, [])
    console.log('  ✅ 缺字段返回空数组而非崩溃')
  })

  console.log('--- 抖音能力面：缺 cookie 零请求 fail-closed ---')
  await withServer([], async (server) => {
    const bare = new DouyinCapabilities({ apiBase: server.url })
    await assert.rejects(() => bare.userInfo(), /missing cookie/)
    await assert.rejects(() => bare.publishPermission(), /missing cookie/)
    await assert.rejects(() => bare.poiRecommend(), /missing cookie/)
    assert.strictEqual(server.requests.length, 0, '缺 cookie 时不得发出任何请求')
    console.log('  ✅ 三个能力一致 fail-closed，且请求数为 0')
  })

  console.log('\n========== douyin-capabilities 全部通过 ==========')
}

main().catch((e) => { console.error('❌', e); process.exit(1) })