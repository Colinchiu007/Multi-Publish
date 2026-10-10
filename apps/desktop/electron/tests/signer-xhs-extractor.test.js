'use strict'
/**
 * XYS_ 页内签名 extractor 单元测试（TDD 红灯先行）。
 *
 * 背景（note-406-signature-report.md）：真机 x-s 为 Base64 JSON 信封形态
 * （signSvn/signType/appId/signVersion/payload），由页内 window._webmsxyw(url, data) 生成。
 * 本测试钉住新 extractor 的契约：
 *   1. 脚本内调用 window._webmsxyw 且 url/data 经占位符注入
 *   2. 返回 { ok, signature, xT } 结构——X-s 缺失/异常时 fail-closed 返回 reason 而非 reject
 *   3. 不复用 kuaishou 的 webpack probe 占位符（两条链路彻底分道）
 * 真机回归（extractor 在真实 creator 页执行）由 probe 通道验证，不在单测范围。
 */
const assert = require('node:assert')
const { buildXhsExtractorScript } = require('../signer/xhs-extractor')

describe('signer-xhs-extractor: XYS_ 页内签名脚本契约', () => {

function runInFakePage (script, pageGlobals) {
  const fn = new Function('window', 'localStorage', 'return ' + script)
  return fn(pageGlobals.window || {}, pageGlobals.localStorage || { getItem: () => null })
}

  test('脚本调用 window._webmsxyw，url/data 经占位符注入，无 kuaishou 残留', () => {
  const script = buildXhsExtractorScript({ url: '/api/sns/web/v1/feed', data: { a: 1 } })
  assert.match(script, /window\._webmsxyw/)
  assert.ok(!script.includes('__XHS_URL__'), 'URL 占位符应已替换为字面量')
  assert.ok(!script.includes('__XHS_DATA__'), 'DATA 占位符应已替换为字面量')
  assert.ok(!script.includes('__MP_SIGN_CHUNK_GLOBAL__'), '不得残留 kuaishou 占位符')
  assert.ok(script.includes('/api/sns/web/v1/feed'))
})

  test('_webmsxyw 缺失时 fail-closed（reason=no-webms-fn，不 reject）', async () => {
  const script = buildXhsExtractorScript({ url: '/x', data: {} })
  const r = await runInFakePage(script, { window: {} })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no-webms-fn')
})

  test('正常返回时 signature/xT 透传（X-s 与 X-t 键名兼容大小写变体）', async () => {
  const script = buildXhsExtractorScript({ url: '/x', data: {} })
  const fake = { 'X-s': 'XYW_abc', 'X-t': '1791541509850' }
  const r = await runInFakePage(script, { window: { _webmsxyw: async () => fake } })
  assert.equal(r.ok, true)
  assert.equal(r.signature, 'XYW_abc')
  assert.equal(r.xT, '1791541509850')
})

  test('小写键名变体（x-s/x-t）同样兼容', async () => {
  const script = buildXhsExtractorScript({ url: '/x', data: {} })
  const r = await runInFakePage(script, { window: { _webmsxyw: async () => ({ 'x-s': 'XYW_lo', 'x-t': '42' }) } })
  assert.equal(r.ok, true)
  assert.equal(r.signature, 'XYW_lo')
  assert.equal(r.xT, '42')
})

  test('X-s 缺失时返回 reason=x-s-missing（fail-closed）', async () => {
  const script = buildXhsExtractorScript({ url: '/x', data: {} })
  const r = await runInFakePage(script, { window: { _webmsxyw: async () => ({ 'X-t': '1' }) } })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'x-s-missing')
})

  test('_webmsxyw 抛错时返回结构化 reason（threw 前缀）而非向上 reject', async () => {
  const script = buildXhsExtractorScript({ url: '/x', data: {} })
  const r = await runInFakePage(script, { window: { _webmsxyw: async () => { throw new Error('boom') } } })
  assert.equal(r.ok, false)
  assert.match(r.reason, /^threw/)
})

  test('返回非对象（如纯字符串）时同样 fail-closed（reason=bad-shape）', async () => {
  const script = buildXhsExtractorScript({ url: '/x', data: {} })
  const r = await runInFakePage(script, { window: { _webmsxyw: async () => 'XYW_str' } })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'bad-shape')
})

})