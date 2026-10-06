'use strict'
/**
 * baijiahao-capabilities.test.js — 百家号发布前能力面契约测试（零外发）
 */
const assert = require('assert')
const { startFakeServer } = require('./helpers/fake-http')
const {
  BaijiahaoCapabilities,
  COORD_RCMD_PATH,
  ARTICLE_LISTS_PATH,
} = require('../src/publish/capabilities/baijiahao-capabilities')

const COOKIE = 'BAIDUID=x; stoken=abc'

async function withServer (routes, fn) {
  const server = await startFakeServer(routes)
  try { return await fn(server) } finally { await server.close() }
}
function caps (server) {
  return new BaijiahaoCapabilities({ cookie: COOKIE, apiBase: server.url })
}

async function main () {
  console.log('--- 百家号能力面：POI 坐标推荐 ---')
  await withServer([
    { method: 'POST', match: new RegExp('^' + COORD_RCMD_PATH), body: { errno: 0, data: [{ id: 'loc-1', name: '北京总部' }, { id: 'loc-2', name: '上海分部' }] } },
  ], async (server) => {
    const poi = await caps(server).poiRecommend({ type: 'news', url: 'https://example.com/a' })
    assert.strictEqual(poi.items.length, 2)
    assert.strictEqual(poi.items[0].id, 'loc-1')
    assert.strictEqual(poi.items[1].name, '上海分部')
    const req = server.requests[0]
    assert.strictEqual(req.headers['content-type'], 'application/x-www-form-urlencoded')
    assert.match(req.headers.referer, /builder\/rc\/edit\?type=news/)
    assert.match(String(req.rawBody), /width=/)
    assert.match(String(req.rawBody), /url=/)
    console.log('  ✅ 表单逐字段对齐切片（width/height/url/type）')
  })

  console.log('--- 百家号能力面：CoordRcmd errno 非 0 ---')
  await withServer([
    { method: 'POST', match: new RegExp('^' + COORD_RCMD_PATH), body: { errno: 1001, errmsg: '未登录' } },
  ], async (server) => {
    await assert.rejects(() => caps(server).poiRecommend(), /errno=1001/)
    console.log('  ✅ 非 0 业务码 fail-closed 抛错')
  })

  console.log('--- 百家号能力面：草稿箱列表 ---')
  await withServer([
    { method: 'GET', match: new RegExp('^' + ARTICLE_LISTS_PATH), body: { errno: 0, total: 2, data: [{ id: 'd1', title: '已存草稿A', status: 'draft' }, { id: 'd2', title: '已存草稿B' }] } },
  ], async (server) => {
    const drafts = await caps(server).drafts()
    assert.strictEqual(drafts.total, 2)
    assert.strictEqual(drafts.items.length, 2)
    assert.strictEqual(drafts.items[0].id, 'd1')
    assert.strictEqual(drafts.items[0].title, '已存草稿A')
    assert.strictEqual(drafts.items[0].status, 'draft')
    assert.match(server.requests[0].url, /dynamic=1/)
    console.log('  ✅ 补上既有链缺失的「读回草稿」入口；dynamic=1 固定入参保留')
  })

  console.log('--- 百家号能力面：草稿箱分页与 ugc_video 子类型 ---')
  await withServer([
    { method: 'GET', match: new RegExp('^' + ARTICLE_LISTS_PATH), body: { errno: 0, data: [] } },
  ], async (server) => {
    const d = await caps(server).drafts({ page: 3, pageSize: 20, type: 'ugc_video' })
    assert.strictEqual(d.total, 0)
    assert.deepStrictEqual(d.items, [])
    assert.match(server.requests[0].url, /currentPage=3/)
    assert.match(server.requests[0].url, /pageSize=20/)
    assert.match(server.requests[0].url, /sub_type=vertical_small_video/)
    console.log('  ✅ 分页透传；ugc_video 自动补 sub_type（切片里的分支）')
  })

  console.log('--- 百家号能力面：缺 cookie 零请求 ---')
  await withServer([], async (server) => {
    const bare = new BaijiahaoCapabilities({ apiBase: server.url })
    await assert.rejects(() => bare.poiRecommend(), /missing cookie/)
    await assert.rejects(() => bare.drafts(), /missing cookie/)
    assert.strictEqual(server.requests.length, 0)
    console.log('  ✅ 两个能力一致 fail-closed，请求数为 0')
  })

  console.log('\n========== baijiahao-capabilities 全部通过 ==========')
}

main().catch((e) => { console.error('❌', e); process.exit(1) })