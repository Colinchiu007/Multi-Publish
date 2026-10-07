'use strict'
/**
 * 音乐库**接线**回归锁（能力面层）
 *
 * 为什么单独一个文件：上一轮 shipinhao-music.js 的 21 个锁全绿、CI 21 项全绿，
 * 但生产代码**零引用**——模块存在却没有任何调用方，属「做完功能没接线」。
 * unit 级测试对此完全无感，所以本文件专门锁「能不能从对外路由走到实现」。
 */
const assert = require('assert')
const { startFakeServer } = require('./helpers/fake-http')
const { createHttpClient } = require('../src/publish/core/http-base')
const { ShipinhaoCapabilities } = require('../src/publish/capabilities/shipinhao-capabilities')
const matrixModule = require('../src/publish/capabilities')

const COOKIE = 'finder_st=xx'
const UA = 'Mozilla/5.0 test'

let p = 0, f = 0
async function t (name, fn) {
  try { await fn(); p++; console.log('  ✅ ' + name) }
  catch (e) { f++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function eq (a, b) { assert.deepStrictEqual(a, b) }

/**
 * 最小宿主类。`applyCapabilitiesHelpers` 是往 prototype 上定义方法，
 * 故必须先 apply 再 new（传实例会报 `Object.defineProperty called on non-object`）。
 */
class Harness {
  constructor (client) { this._capabilitiesClient = client || null }
  _json (res, status, data) { Harness.__calls.push({ status, data }) }
  async _parseBody () { return Harness.__body || {} }
  _logError () {}
  _ctx () { return {} }
}
Harness.__calls = []

/** 契约层用的导出 */
const capRoute = require('../src/auth/publish-api-capabilities')
// helpers 必须挂在**类**上（挂实例会报 Object.defineProperty called on non-object）
capRoute.applyCapabilitiesHelpers(Harness)

async function main () {
  console.log('--- 契约层：矩阵 / 路由 / 白名单三处必须同时有 musicLibrary ---')

  await t('矩阵 tencent_video.musicLibrary 已声明端点', function () {
    const cell = matrixModule.CAPABILITY_MATRIX.tencent_video.musicLibrary
    assert.ok(cell, '矩阵缺 musicLibrary')
    assert.match(cell, /get_bgm_list/, '端点应为取证所得的 get_bgm_list，实际：' + cell)
  })

  await t('其余平台的 musicLibrary 未声明或为 null（不假装支持）', function () {
    ['douyin', 'bilibili', 'kuaishou', 'xiaohongshu', 'baijiahao'].forEach((pl) => {
      const v = matrixModule.CAPABILITY_MATRIX[pl].musicLibrary
      assert.ok(v === undefined || v === null,
        pl + ' 没有音乐库取证，不应声明非空值（实际 ' + v + '）')
    })
  })

  await t('路由 PATH_TO_METHOD 认得 music-library', function () {
    eq(capRoute.PATH_TO_METHOD['music-library'], 'musicLibrary')
  })

  await t('EXPOSED_CAPABILITIES 白名单含 musicLibrary', function () {
    assert.ok(capRoute.EXPOSED_CAPABILITIES.indexOf('musicLibrary') !== -1)
  })

  await t('isCapabilitiesUrl 认得 /music-library 路径', function () {
    eq(capRoute.isCapabilitiesUrl('/api/v1/platforms/tencent_video/music-library'), true)
  })

  console.log('\n--- 实现层：方法存在且真委托，不是空壳 ---')

  await t('原型上有 musicLibrary 方法', function () {
    assert.strictEqual(typeof ShipinhaoCapabilities.prototype.musicLibrary, 'function')
  })

  await t('方法体确实委托给 ShipinhaoMusicChain', function () {
    const src = require('fs').readFileSync(
      require.resolve('../src/publish/capabilities/shipinhao-capabilities.js'), 'utf8')
    const body = src.slice(src.indexOf('async musicLibrary'))
    assert.match(body, /ShipinhaoMusicChain/, '未引用音乐库链')
    assert.match(body, /listBgm\(/, '未调用 listBgm')
    // 锁**承重**的那一行：ShipinhaoMusicChain 只读 opts.api。
    // 上一版这条断言写的是 /client: this\.client/ —— 恰好锁在死键上：
    // 删掉 api: 它不红，删掉 client: 它反而红，方向完全反了。
    assert.match(body, /api: this\.client/, '未把能力层 client 透传给音乐库链（连接配置/代理会对音乐库失效）')
    // 只看代码行（行首缩进 + 键名），别让注释里提到的那行自我否定式地误伤。
    assert.doesNotMatch(body, /^\s+client: this\.client,/m,
      'client 是构造器不认的死键，与 api 并排会重新制造同名不同义的坑')
  })

  console.log('\n--- 端到端：HTTP 路由 → 能力 → 音乐库链 → 归一化 ---')

  await (async function () {
    const payload = { errCode: 0, data: { totalCount: 1, list: [{
      listenItem: {
        musicSid: 66,
        url: 'https://cdn/a.mp3',
        playableInfo: { title: '歌A', author: '唱A', cover: 'https://c/a.jpg', duration: 200 },
      },
    }] } }
    const srv = await startFakeServer([
      { method: 'POST', match: /get_bgm_list/, body: payload },
    ])
    const client = createHttpClient({ baseURL: srv.url, timeout: 5000 })
    try {
      await t('路由认得 music-library：解析出 musicLibrary 而非 404/405', async function () {
        const parsed = capRoute.parseCapabilitiesPath('/api/v1/platforms/tencent_video/music-library')
        assert.ok(parsed, '应能解析')
        eq(parsed.method, 'musicLibrary')
        eq(capRoute.EXPOSED_CAPABILITIES.indexOf(parsed.method) !== -1, true)
      })

      const out = await runThrough(capRoute, client, { cookie: COOKIE })

      await t('请求真的打到假服务器（不是真实域名）', function () {
        eq(srv.requests.length, 1, '应有且仅有 1 个请求落到假服务器')
      })

      await t('端到端返回 200 且条目已归一化', function () {
        eq(out.status, 200)
        eq(out.data.success, true)
        eq(out.data.platform, 'tencent_video')
        eq(out.data.capability, 'music-library')
        const d = out.data.data
        eq(d.mode, 'hot', '默认应为 hot')
        eq(d.total, 1)
        eq(d.items.length, 1)
        eq(d.items[0].id, '66')
        eq(d.items[0].name, '歌A')
        eq(d.items[0].authorName, '唱A')
        eq(d.items[0].image, 'https://c/a.jpg')
        eq(d.items[0].playUrl, 'https://cdn/a.mp3')
        eq(d.items[0].durationSeconds, 200)
      })

      await t('默认 hot → 请求体 type=3，URL 带 _rid', function () {
        const b = parseBody(srv.requests[0].body)
        eq(b.type, 3)
        assert.match(srv.requests[0].url, /get_bgm_list\?_rid=678ddecb-[0-9a-f]{10}$/, '实际 ' + srv.requests[0].url)
      })

      await t('search：HTTP 面 search 字段 → query，type=104', async function () {
        const before = srv.requests.length
        const r = await runThrough(capRoute, client, { cookie: COOKIE, mode: 'search', search: '告白气球' })
        eq(r.status, 200)
        const b = parseBody(srv.requests[before].body)
        eq(b.type, 104)
        eq(b.query, '告白气球')
      })

      await t('recommend：page→currentPage 透传，type=103', async function () {
        const before = srv.requests.length
        const r = await runThrough(capRoute, client, { cookie: COOKIE, mode: 'recommend', page: 3, pageSize: 7 })
        eq(r.status, 200)
        const b = parseBody(srv.requests[before].body)
        eq(b.currentPage, 3)
        eq(b.pageSize, 7)
        eq(b.type, 103)
      })
    } finally {
      await srv.close()
    }
  })()

  console.log('\n--- fail-closed ---')

  await t('矩阵里没有取证的格子为空（不假装支持）', function () {
    ['douyin', 'bilibili', 'kuaishou', 'xiaohongshu', 'baijiahao'].forEach((pl) => {
      const cell = matrixModule.CAPABILITY_MATRIX[pl].musicLibrary
      assert.ok(cell === undefined || cell === null,
        pl + ' 无音乐库取证，矩阵必须为 null/undefined，实际 ' + cell)
    })
  })

  // 上一版这条用例名叫「→ 404」，但只断言了矩阵格子为空、一次 status 都没断言，
  // 且完全没打路由——名字承诺的 404 根本没有被验证。改成真打路由并断言 status。
  await (async function () {
    const srv = await startFakeServer([
      { method: 'POST', match: /.*/, body: { errCode: 0, data: { totalCount: 0, list: [] } } },
    ])
    try {
      const client = createHttpClient({ baseURL: srv.url, timeout: 5000 })
      for (const platform of ['douyin', 'bilibili', 'kuaishou', 'xiaohongshu', 'baijiahao']) {
        Harness.__body = { cookie: COOKIE }
        Harness.__calls.length = 0
        const h = new Harness(client)
        capRoute.applyCapabilitiesHelpers(Harness)
        await h._handleCapabilities({}, {}, 'POST', '/api/v1/platforms/' + platform + '/music-library')
        const out = Harness.__calls[0]
        assert.strictEqual(out.status, 404,
          platform + '/music-library 应 404（矩阵未声明），实际 ' + out.status)
        assert.strictEqual(out.data.error, 'CAPABILITY_NOT_SUPPORTED', platform + ' 错误码不符')
      }
      eq(srv.requests.length, 0, '不支持的平台不得发出任何请求')
    } finally { await srv.close() }
  })()
  console.log('  ✅ 五个未声明平台经路由实测全部 404 且零请求')

  await t('能力层缺 cookie → 零请求且报错', async function () {
    const srv = await startFakeServer([
      { method: 'POST', match: /get_bgm_list/, body: { errCode: 0, data: { totalCount: 0, list: [] } } },
    ])
    try {
      const client = createHttpClient({ baseURL: srv.url, timeout: 5000 })
      const caps = new ShipinhaoCapabilities({ cookie: '', userAgent: UA, finderId: 'F1', client })
      let threw = false
      try { await caps.musicLibrary({}) } catch (e) { threw = /cookie/i.test(e.message) }
      assert.ok(threw, '缺 cookie 应抛错')
      eq(srv.requests.length, 0, '缺 cookie 时不得发出任何请求')
    } finally { await srv.close() }
  })

  console.log('\n========== shipinhao-music-capability ' + p + '/' + (p + f) + ' ==========')
  if (f) process.exit(1)
}

function parseBody (b) { return typeof b === 'string' ? JSON.parse(b) : b }

/**
 * 走「路由模块解析路径 → 组 args → 调能力方法 → 组响应」这条链，
 * 与 PublishApiServer 内部 `_handleCapabilities` 的做法一致，
 * 区别只在于 cookie / client 由测试固定注入。
 */
async function runThrough (route, client, body) {
  Harness.__body = body
  Harness.__calls.length = 0
  const h = new Harness(client)   // Harness 类已在模块级 apply 过 helpers，这里直接用实例
  await h._handleCapabilities({}, {}, 'POST', '/api/v1/platforms/tencent_video/music-library')
  return Harness.__calls[0]
}

main().catch((e) => { console.error('❌', e); process.exit(1) })