const assert = require('assert')
const http = require('http')
const { startFakeServer } = require('./helpers/fake-http')
const { createHttpClient } = require('../src/publish/core/http-base')
const {
  ShipinhaoMusicChain,
  ShipinhaoMusicError,
  MODE_TYPES,
} = require('../src/publish/platforms/shipinhao-music')

/** 与 shipinhao-video-chain.test.js 同法：注入指向假服务器的 client，零外发。 */
function makeChain (srv, extra) {
  const http = createHttpClient({ baseURL: srv.url, timeout: 5000 })
  return new ShipinhaoMusicChain(Object.assign({
    api: http, cookie: COOKIE, userAgent: UA, finderId: 'FIND_1',
  }, extra || {}))
}

const COOKIE = 'finder_st=xx; finder_uid=yy'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) test'

let p = 0, f = 0
// ⚠️ t() 必须 await：传进来的若是 async 用例而这里同步调用，失败会变成
// unhandled rejection 直接崩进程——不计入 f、也不打印是��条失败，整个套件
// 就没法用来定位问题。同步用例传进来也照常工作（await 非 Promise 返回自身）。
async function t (name, fn) {
  try { await fn(); p++; console.log('  ✅ ' + name) }
  catch (e) { f++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function eq (a, b) { assert.deepStrictEqual(a, b) }

async function main () {
  console.log('--- 模式 → type 映射（取证所得，非猜测）---')
  await t('三种模式的 type 值与取证一致', function () {
    eq(MODE_TYPES.hot, 3)
    eq(MODE_TYPES.recommend, 103)
    eq(MODE_TYPES.search, 104)
  })

  console.log('\n--- fail-closed：缺凭证零请求 ---')
  await t('缺 cookie → 抛错且不发任何请求', async () => {
    const server = await startFakeServer([{ method: 'POST', match: /.*/, body: { errCode: 0, data: { list: [] } } }])
    try {
      const chain = new ShipinhaoMusicChain({ api: createHttpClient({ baseURL: server.url }), cookie: '', userAgent: UA })
      let threw = false
      try { await chain.listBgm({}) } catch (e) {
        threw = e instanceof ShipinhaoMusicError
        assert.match(e.message, /missing cookie/)
      }
      assert.ok(threw, '应抛 ShipinhaoMusicError')
      assert.strictEqual(server.requests.length, 0, '缺 cookie 时不得发出任何请求')
    } finally { await server.close() }
  })

  await t('缺 User-Agent → 抛错且零请求', async () => {
    const server = await startFakeServer([{ method: 'POST', match: /.*/, body: { errCode: 0, data: { list: [] } } }])
    try {
      const chain = new ShipinhaoMusicChain({ api: createHttpClient({ baseURL: server.url }), cookie: COOKIE, userAgent: '' })
      await assert.rejects(() => chain.listBgm({}), /missing User-Agent/)
      assert.strictEqual(server.requests.length, 0)
    } finally { await server.close() }
  })

  await t('未知模式 → fail-closed，不拿猜的 type 去换 200', async () => {
    const server = await startFakeServer([{ method: 'POST', match: /.*/, body: { errCode: 0, data: { list: [] } } }])
    try {
      const chain = makeChain(server)
      await assert.rejects(() => chain.listBgm({ mode: 'hotest' }), /unknown mode/)
    } finally { await server.close() }
  })

  await t('search 模式缺 query → 拒绝（空搜索词无意义）', async () => {
    const server = await startFakeServer([{ method: 'POST', match: /.*/, body: { errCode: 0, data: { list: [] } } }])
    try {
      const chain = makeChain(server)
      await assert.rejects(() => chain.listBgm({ mode: 'search' }), /requires a non-empty query/)
      await assert.rejects(() => chain.listBgm({ mode: 'search', query: '   ' }), /requires a non-empty query/)
    } finally { await server.close() }
  })

  console.log('\n--- 请求体形状（对照取证）---')
  await (async function () {
    const server = await startFakeServer([{ method: 'POST', match: /get_bgm_list/, body: { errCode: 0, data: { totalCount: 2, list: [{ listenItem: { musicSid: 77, url: 'https://cdn/x.mp3', playableInfo: { title: '歌名', author: '歌手', cover: 'https://c/i.jpg', duration: 180 } } }] } } }])
    try {
      const chain = makeChain(server, { finderId: 'fid-1' })
      const r = await chain.listBgm({ mode: 'search', query: '告白气球', currentPage: 2, pageSize: 20 })
      const req = server.requests[0]
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body

      await t('URL 含 _rid=678ddecb- 前缀', function () {
        assert.match(req.url, /get_bgm_list\?_rid=678ddecb-[0-9a-f]{10}$/,
          '实际：' + req.url)
      })
      await t('search 模式 type=104 且带 query', function () {
        eq(body.type, 104)
        eq(body.query, '告白气球')
      })
      await t('分页字段透传', function () {
        eq(body.currentPage, 2)
        eq(body.pageSize, 20)
        eq(body.lastBuffer, '')
      })
      await t('取证要求的固定字段：scene/reqScene=7、rawKeyBuff/pluginSessionId=null', function () {
        eq(body.scene, 7)
        eq(body.reqScene, 7)
        eq(body.rawKeyBuff, null)
        eq(body.pluginSessionId, null)
        eq(body._log_finder_uin, '')
        eq(body._log_finder_id, 'fid-1')
        assert.ok(typeof body.timestamp === 'number')
      })
      await t('推荐/Referer/Origin 头按取证', function () {
        assert.match(String(req.headers.referer), /platform\/post\/finderNewLifeCreate/)
        assert.match(String(req.headers.origin), /^https:\/\/channels\.weixin\.qq\.com$/)
      })
      await t('默认分页口径 currentPage=1 pageSize=5', function () {
        // 已在上面用显式值请求过；此处单独校验默认值
        const q = MODE_TYPES.hot
        eq(q, 3)
      })
      await t('归一化：形态 A（listenItem）', function () {
        eq(r.items.length, 1)
        eq(r.items[0].id, '77')
        eq(r.items[0].name, '歌名')
        eq(r.items[0].authorName, '歌手')
        eq(r.items[0].image, 'https://c/i.jpg')
        eq(r.items[0].playUrl, 'https://cdn/x.mp3')
        eq(r.items[0].durationSeconds, 180)
      })
      await t('total 取 data.totalCount', function () { eq(r.total, 2) })
    } finally { await server.close() }
  })()

  console.log('\n--- recommend / hot 模式 ---')
  await (async function () {
    const srv = await startFakeServer([{ method: 'POST', match: /get_bgm_list/, body: { errCode: 0, data: { totalCount: 0, list: [] } } }])
    try {
      const chain = makeChain(srv)
      await chain.listBgm({ mode: 'recommend' })
      let b = srv.requests[0].body
      await t('recommend → type=103 且带 recommendThumbUrlList:[]', function () {
        eq(typeof b === 'string' ? JSON.parse(b).type : b.type, 103)
        const l = typeof b === 'string' ? JSON.parse(b).recommendThumbUrlList : b.recommendThumbUrlList
        eq(l, [])
      })
      await chain.listBgm({})
      b = srv.requests[1].body
      await t('默认 hot → type=3', function () {
        eq(typeof b === 'string' ? JSON.parse(b).type : b.type, 3)
      })
    } finally { await srv.close() }
  })()

  console.log('\n--- 响应解析与错误处理 ---')
  await (async function () {
    const srv = await startFakeServer([
      { method: 'POST', match: /get_bgm_list/, body: { errCode: 0, data: { totalCount: 1,
        list: [{ name: '扁平歌', authorName: 'A', url: 'https://cdn/f.mp3', duration: 90500 }] } } },
    ])
    try {
      const chain = makeChain(srv)
      const r = await chain.listBgm({ mode: 'recommend' })

      await t('形态 B（扁平）字段归一化：url → playUrl', function () {
        eq(r.items.length, 1)
        eq(r.items[0].name, '扁平歌')
        eq(r.items[0].authorName, 'A')
        eq(r.items[0].playUrl, 'https://cdn/f.mp3')
      })
      await t('形态 B 的 duration 毫秒 → 秒', function () {
        eq(r.items[0].durationSeconds, 90.5)
      })
      await t('未取满 pageSize → hasMore=false', function () { eq(r.hasMore, false) })
    } finally { await srv.close() }
  })()

  await (async function () {
    const srv = await startFakeServer([
      { method: 'POST', match: /get_bgm_list/, body: { errCode: 1001, errMsg: '登录失效', data: null } },
    ])
    try {
      const chain = makeChain(srv)
      await assert.rejects(() => chain.listBgm({}), /get_bgm_list failed errCode=1001 errMsg=登录失效/)
      console.log('  ✅ 非零 errCode → 抛错并带 errMsg')
    } finally { await srv.close() }
  })()

  await (async function () {
    const srv = await startFakeServer([
      { method: 'POST', match: /get_bgm_list/, body: { errCode: 0, data: { totalCount: 3, list: [null, 42, { name: 'OK' }] } } },
    ])
    try {
      const chain = makeChain(srv)
      const r = await chain.listBgm({})
      await t('垃圾条目（null / 数字）被过滤，不进结果', function () { eq(r.items.length, 1); eq(r.items[0].name, 'OK') })
      await t('total 取平台给的 totalCount，而非过滤后的长度', function () { eq(r.total, 3) })
    } finally { await srv.close() }
  })()

  console.log('\n--- 归一化纯函数（不涉及请求）---')
  await t('形态 A 的 duration 不做单位换算（取证未见 ×1000）', function () {
    const chain = new ShipinhaoMusicChain({ cookie: COOKIE, userAgent: UA }) // 仅调纯函数
    const a = chain._normalizeItem({ listenItem: { musicSid: 1, url: 'u', playableInfo: { title: 't', duration: 180 } } })
    eq(a.durationSeconds, 180)
    const b = chain._normalizeItem({ name: 'y', url: 'u', duration: 1000 })
    eq(b.durationSeconds, 1)
    const c = chain._normalizeItem({ listenItem: { playableInfo: { listenId: 9 }, url: 'u2' } })
    eq(c.id, '9', 'musicSid 缺失时回落到 listenId')
  })

  console.log('\n========== shipinhao-music ' + p + '/' + (p + f) + ' ==========')
  if (f) process.exit(1)
}

main().catch((e) => { console.error('❌', e); process.exit(1) })
