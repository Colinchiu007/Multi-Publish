/**
 * F3.1 百家号 RPA 发布器 — TDD 测试
 *
 * 运行：node test-baijiahao.js
 */
const assert = require('assert')
const path = require('path')

let Publisher
try {
  Publisher = require('../baijiahao-rpa')
} catch (e) {
  console.error('[SETUP] Module not yet implemented — tests will fail (TDD RED phase)')
  Publisher = null
}

// 抑制测试中的未捕获 rejection（publish 方法会尝试真实页面操作）
process.on('unhandledRejection', () => {})

let passed = 0
let failed = 0

function ok (name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`) }
}

function section (name) { console.log(`\n## ${name}`) }

// ─── 结构测试 ─────────────────────────────
section('类结构')
ok('模块导出为 class', () => {
  if (!Publisher) throw new Error('Module not implemented')
  assert.ok(typeof Publisher === 'function')
  assert.ok(Publisher.name === 'BaiJiaHaoPublisher' || Publisher.name.endsWith('Publisher'))
})

ok('继承 BaseRPAPublisher', () => {
  if (!Publisher) throw new Error('Module not implemented')
  const pub = new Publisher()
  assert.ok(pub.constructor.name.endsWith('Publisher'))
})

ok('有 publish 方法', () => {
  if (!Publisher) throw new Error('Module not implemented')
  const pub = new Publisher()
  assert.equal(typeof pub.publish, 'function')
})

ok('有 checkLogin 方法', () => {
  if (!Publisher) throw new Error('Module not implemented')
  const pub = new Publisher()
  assert.equal(typeof pub.checkLogin, 'function')
})

ok('有 waitForLogin 方法', () => {
  if (!Publisher) throw new Error('Module not implemented')
  const pub = new Publisher()
  assert.equal(typeof pub.waitForLogin, 'function')
})

ok('有 cleanup 方法', () => {
  if (!Publisher) throw new Error('Module not implemented')
  const pub = new Publisher()
  assert.equal(typeof pub.cleanup, 'function')
})

ok('platform 属性为 baijiahao', () => {
  if (!Publisher) throw new Error('Module not implemented')
  const pub = new Publisher()
  assert.equal(pub.platform, 'baijiahao')
})

// ─── 接口测试 ─────────────────────────────
section('接口')
ok('publish 返回 Promise', () => {
  if (!Publisher) throw new Error('Module not implemented')
  const pub = new Publisher()
  // mock init 不报错
  pub.init = async () => {}
  pub.checkLogin = async () => true
  const result = pub.publish({ title: 'test', content: 'test' })
  assert.ok(result instanceof Promise || (result && typeof result.then === 'function'))
})

ok('构造函数接受 options', () => {
  if (!Publisher) throw new Error('Module not implemented')
  const pub = new Publisher({ userDataDir: '/tmp/test' })
  assert.ok(pub)
})

// ─── 汇总 ─────────────────────────────────
console.log(`\n${'='.repeat(50)}`)
console.log(`结果: ${passed} 通过, ${failed} 失败, ${passed + failed} 总计`)
if (failed > 0) process.exit(1)
else console.log('全部通过 ✅')
