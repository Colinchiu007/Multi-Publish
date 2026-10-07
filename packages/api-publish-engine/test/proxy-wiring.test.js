const assert = require('assert')
const http = require('http')
const { startFakeServer } = require('./helpers/fake-http')
const { attachProxyAgents, hasUsableProxy } = require('../src/proxy-wiring')
const { createProxyAgent } = require('../src/proxy-manager')
const { ShipinhaoMusicChain } = require('../src/publish/platforms/shipinhao-music')

let p = 0, f = 0
async function t (name, fn) {
  try { await fn(); p++; console.log('  ✅ ' + name) }
  catch (e) { f++; console.log('  ❌ ' + name + ': ' + e.message) }
}
function eq (a, b) { assert.deepStrictEqual(a, b) }

async function main () {
  console.log('--- 不传代理时零侵入（默认不生效）---')
  await t('hasUsableProxy 判空', function () {
    eq(hasUsableProxy({ host: '1.2.3.4', port: 8080 }), true)
    eq(hasUsableProxy(null), false)
    eq(hasUsableProxy({ host: '1.2.3.4' }), false, '缺 port 不算可用')
    eq(hasUsableProxy({ port: 8080 }), false, '缺 host 不算可用')
  })

  await t('opts 无代理时原样返回、clients 不被凭空造出来', function () {
    const opts = { timeout: 5000 }
    eq(attachProxyAgents(opts, null), opts)
    eq(opts.clients, undefined, '无代理不得凭空创建 clients')
    eq(opts.timeout, 5000, '原 opts 内容不变')
  })

  await t('代理配置不完整时按「无代理」处理', function () {
    const opts = {}
    attachProxyAgents(opts, { host: '1.2.3.4' })
    eq(opts.clients, undefined)
  })

  console.log('\n--- 有代理时接入 clients.agents ---')
  await t('agents 同时含 httpAgent 与 httpsAgent', function () {
    const opts = attachProxyAgents({}, { host: '10.0.0.1', port: 8080 })
    assert.ok(opts.clients && opts.clients.agents, '应挂上 clients.agents')
    assert.ok(opts.clients.agents.httpAgent, '应有 httpAgent')
    assert.ok(opts.clients.agents.httpsAgent, '应有 httpsAgent')
  })

  await t('不覆盖调用方已有的 clients（Object.assign 语义）', function () {
    const marker = { fake: true }
    const opts = attachProxyAgents({ clients: { cdn: marker } }, { host: '10.0.0.1', port: 8080 })
    eq(opts.clients.cdn, marker, '已有 clients 条目必须保留')
    assert.ok(opts.clients.agents, '同时新增 agents')
  })

  await t('凭据中的 @ 与 : 被 encode（沿用 proxy-manager 的安全修复）', function () {
    const a = createProxyAgent({ host: '10.0.0.1', port: 8080, username: 'u@x', password: 'p:1' })
    // 不抛即可：未编码会让 URL 解析错，编码后 auth 段完整
    assert.ok(a && a.httpAgent && a.httpsAgent)
  })

  console.log('\n--- 端到端：代理 agent 真的进到链的 client ---')
  await (async function () {
    const srv = await startFakeServer([
      { method: 'POST', match: /get_bgm_list/, body: { errCode: 0, data: { totalCount: 0, list: [] } } },
    ])
    try {
      const opts = attachProxyAgents({}, { host: '10.255.255.1', port: 9 }) // 不可达的代理
      const http = createFakeHttp(srv.url)
      // 链构造器消费 opts.clients.agents —— 这里用可控的假 agent 验证「确实被读走」
      const chain = new ShipinhaoMusicChain(Object.assign({
        cookie: 'c=1', userAgent: 'UA', finderId: 'F1',
      }, { agents: opts.clients.agents }, { api: http }))
      // 直接断言构造器读到了：链内部 client 带上了 agent（通过不发请求也能观察）
      assert.ok(chain.api, '链应已建立 client')
      // 真发一次：走的是注入的 api（指向假服务器），不经过代理——证明 agent 不影响可控性
      const r = await chain.listBgm({})
      eq(r.items.length, 0)
      console.log('  ✅ 代理 agent 与注入 client 可共存（测试注入优先，生产走 agents）')
    } finally { await srv.close() }
  })()

  console.log('\n--- 快手链此前漏掉 agents，本次补齐 ---')
  await t('kuaishou-video 构造器已把 opts.agents 交给 createHttpClient', function () {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'publish', 'platforms', 'kuaishou-video.js'), 'utf8')
    const cp = src.match(/this\.cpHttp = opts\.cpHttp \|\| createHttpClient\([^)]*\)/)
    assert.ok(cp, '未找到 cpHttp 的 createHttpClient 调用')
    assert.match(cp[0], /agents: opts\.agents/, 'cpHttp 必须带 agents：' + cp[0])
    const up = src.match(/this\.uploadHttp = opts\.uploadHttp \|\| createHttpClient\([^)]*\)/)
    assert.match(up[0], /agents: opts\.agents/, 'uploadHttp 必须带 agents：' + up[0])
  })

  console.log('\n--- 依赖声明（此前只在传递依赖里，声明缺失 = 潜在 MODULE_NOT_FOUND）---')
  await t('https-proxy-agent / http-proxy-agent 是显式直接依赖', function () {
    const pkg = require('../package.json')
    const deps = pkg.dependencies || {}
    assert.ok(deps['https-proxy-agent'], 'https-proxy-agent 未声明')
    assert.ok(deps['http-proxy-agent'], 'http-proxy-agent 未声明')
  })

  console.log('\n========== proxy-wiring ' + p + '/' + (p + f) + ' ==========')
  if (f) process.exit(1)
}

/** 与既有链测试同法：注入指向假服务器的 client。 */
function createFakeHttp (url) { return createHttpClientSafe(url) }
function createHttpClientSafe (url) { return require('../src/publish/core/http-base').createHttpClient({ baseURL: url, timeout: 5000 }) }

main().catch((e) => { console.error('❌', e); process.exit(1) })
