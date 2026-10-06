'use strict'
/**
 * kuaishou-capabilities.test.js — 快手发布前能力面契约测试（零外发）
 *
 * signer 一律注入假实现：本文件不触碰真实签名通道，也不断言签名算法。
 */
const assert = require('assert')
const { startFakeServer } = require('./helpers/fake-http')
const {
  KuaishouCapabilities,
  ACCOUNT_CURRENT_PATH,
  HOME_INFO_PATH,
  MIN_SIG_LEN,
} = require('../src/publish/capabilities/kuaishou-capabilities')

const COOKIE = 'kuaishou.web.cp.api_ph=abc123; kuaishou.web.cp.api_st=sess; userId=u1'
const FAKE_SIG = 'x'.repeat(MIN_SIG_LEN + 1)

async function withServer (routes, fn) {
  const server = await startFakeServer(routes)
  try { return await fn(server) } finally { await server.close() }
}
function caps (server, extra) {
  return new KuaishouCapabilities(Object.assign(
    { cookie: COOKIE, apiBase: server.url, signer: async () => FAKE_SIG },
    extra || {}))
}

async function main () {
  console.log('--- 快手能力面：账号信息 ---')
  await withServer([
    { method: 'POST', match: new RegExp('^' + ACCOUNT_CURRENT_PATH), body: { result: 1, data: { user: { authorId: 'a-77', userName: '某某作者', headUrl: 'https://p1.a.yximgs.com/head.jpg' } } } },
  ], async (server) => {
    const info = await caps(server).userInfo()
    assert.strictEqual(info.uid, 'a-77')
    assert.strictEqual(info.nickname, '某某作者')
    assert.match(info.avatar, /^https:\/\//)
    const req = server.requests[0]
    assert.match(req.url, /__NS_sig3=/)
    assert.strictEqual(req.headers['x-requested-with'], 'XMLHttpRequest')
    assert.match(req.headers.referer, /cp\.kuaishou\.com\/profile/)
    assert.strictEqual(req.body['kuaishou.web.cp.api_ph'], 'abc123')
    console.log('  ✅ 解析作者信息；__NS_sig3 拼入 query，api_ph 拼入请求体')
  })

  console.log('--- 快手能力面：粉丝数 ---')
  await withServer([
    { method: 'POST', match: new RegExp('^' + HOME_INFO_PATH), body: { result: 1, data: { info: { fansCount: 88888, userName: '某某作者' } } } },
  ], async (server) => {
    const f = await caps(server).fansCount()
    assert.strictEqual(f.fans, 88888)
    assert.strictEqual(f.nickname, '某某作者')
    console.log('  ✅ 解析 home/infoV2 的粉丝数')
  })

  console.log('--- 快手能力面：登录失效 result=109 ---')
  await withServer([
    { method: 'POST', match: new RegExp('^' + ACCOUNT_CURRENT_PATH), body: { result: 109, message: '登录态失效' } },
  ], async (server) => {
    await assert.rejects(
      () => caps(server).userInfo(),
      (err) => { assert.strictEqual(err.login_expired, true); return true })
    console.log('  ✅ result=109 标记 login_expired')
  })

  console.log('--- 快手能力面：签名过短 fail-closed ---')
  await withServer([
    { method: 'POST', match: new RegExp('^' + ACCOUNT_CURRENT_PATH), body: { result: 1, data: {} } },
  ], async (server) => {
    const short = new KuaishouCapabilities({
      cookie: COOKIE, apiBase: server.url, signer: async () => 'too-short',
    })
    await assert.rejects(() => short.userInfo(), /invalid __NS_sig3/)
    assert.strictEqual(server.requests.length, 0, '签名不合格时不得发出请求')
    console.log('  ✅ 签名长度不足 → 抛错且零请求')
  })

  console.log('--- 快手能力面：签名未就绪 → 预检转 signer_not_ready 而非上抛 ---')
  await withServer([
    { method: 'POST', match: new RegExp('^' + ACCOUNT_CURRENT_PATH), body: { result: 1, data: {} } },
  ], async (server) => {
    const notReady = new KuaishouCapabilities({
      cookie: COOKIE, apiBase: server.url,
      signer: async () => { throw new Error('签名页未就绪') },
    })
    const perm = await notReady.publishPermission()
    assert.strictEqual(perm.allowed, false)
    assert.strictEqual(perm.signer_not_ready, true)
    console.log('  ✅ 未就绪是「发不出去」而非「程序错误」，与 publish-mode 的 unsupported 降级对齐')
  })

  console.log('--- 快手能力面：cookie 缺 api_ph 零请求 ---')
  await withServer([], async (server) => {
    const noPh = new KuaishouCapabilities({
      cookie: 'kuaishou.web.cp.api_st=sess', apiBase: server.url, signer: async () => FAKE_SIG,
    })
    await assert.rejects(() => noPh.userInfo(), /api_ph/)
    assert.strictEqual(server.requests.length, 0)
    console.log('  ✅ 缺 api_ph 立即 fail-closed（不伪造 Guid），与既有链同一纪律')
  })

  console.log('\n========== kuaishou-capabilities 全部通过 ==========')
}

main().catch((e) => { console.error('❌', e); process.exit(1) })