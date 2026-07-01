/**
 * F2 敏感词预检 — TDD 测试
 *
 * 运行：node test-sensitive-filter.js
 */
const assert = require('assert')

let SensitiveFilter
try {
  SensitiveFilter = require('../sensitive-filter')
} catch (e) {
  console.error('[SETUP] Module not yet implemented — tests will fail (TDD RED phase)')
  SensitiveFilter = null
}

let passed = 0
let failed = 0

function ok (name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`) }
}

function section (name) { console.log(`\n## ${name}`) }

// ─── 基础功能 ─────────────────────────────
section('基础功能')
ok('正常文本无命中', () => {
  if (!SensitiveFilter) throw new Error('Module not implemented')
  const filter = new SensitiveFilter(['敏感词'])
  const result = filter.check('这是一段正常文本')
  assert.equal(result.hasSensitive, false)
  assert.equal(result.words.length, 0)
})

ok('命中单个敏感词', () => {
  if (!SensitiveFilter) throw new Error('Module not implemented')
  const filter = new SensitiveFilter(['敏感'])
  const result = filter.check('这句话包含敏感内容')
  assert.equal(result.hasSensitive, true)
  assert.ok(result.words.includes('敏感'))
})

ok('命中多个敏感词', () => {
  if (!SensitiveFilter) throw new Error('Module not implemented')
  const filter = new SensitiveFilter(['词A', '词B'])
  const result = filter.check('词A和词B都在')
  assert.equal(result.hasSensitive, true)
  assert.ok(result.words.includes('词A'))
  assert.ok(result.words.includes('词B'))
})

ok('返回命中位置', () => {
  if (!SensitiveFilter) throw new Error('Module not implemented')
  const filter = new SensitiveFilter('词A')
  const result = filter.check('测试词A在文本中')
  assert.ok(result.positions.length > 0)
  assert.equal(result.positions[0].word, '词A')
  assert.ok(result.positions[0].index >= 0)
})

ok('空文本不崩溃', () => {
  if (!SensitiveFilter) throw new Error('Module not implemented')
  const filter = new SensitiveFilter(['敏感'])
  assert.doesNotThrow(() => filter.check(''))
  assert.doesNotThrow(() => filter.check(null))
  assert.doesNotThrow(() => filter.check(undefined))
})

ok('空词库不崩溃', () => {
  if (!SensitiveFilter) throw new Error('Module not implemented')
  const filter = new SensitiveFilter([])
  const result = filter.check('test')
  assert.equal(result.hasSensitive, false)
})

// ─── 替换功能 ─────────────────────────────
section('替换功能')
ok('替换敏感词为 ***', () => {
  if (!SensitiveFilter) throw new Error('Module not implemented')
  const filter = new SensitiveFilter(['敏感'])
  const result = filter.replace('这句话包含敏感内容')
  assert.ok(result.includes('***'))
  assert.ok(!result.includes('敏感'))
})

ok('替换多个敏感词', () => {
  if (!SensitiveFilter) throw new Error('Module not implemented')
  const filter = new SensitiveFilter(['词A', '词B'])
  const result = filter.replace('词A和词B')
  assert.ok(result.includes('***'))
  assert.ok(!result.includes('词A'))
  assert.ok(!result.includes('词B'))
})

ok('无敏感词不替换', () => {
  if (!SensitiveFilter) throw new Error('Module not implemented')
  const filter = new SensitiveFilter(['敏感'])
  const result = filter.replace('正常内容')
  assert.equal(result, '正常内容')
})

// ─── 内置词库测试 ─────────────────────────
section('内置词库')
ok('内置词库加载不崩溃', () => {
  if (!SensitiveFilter) throw new Error('Module not implemented')
  const filter = SensitiveFilter.createWithBuiltin()
  assert.ok(filter)
})

ok('内置词库能检测到词', () => {
  if (!SensitiveFilter) throw new Error('Module not implemented')
  const filter = SensitiveFilter.createWithBuiltin()
  const result = filter.check('法轮功')
  // 内置词库应该包含基本敏感词
  assert.ok(result.hasSensitive)
})

// ─── 汇总 ─────────────────────────────────
console.log(`\n${'='.repeat(50)}`)
console.log(`结果: ${passed} 通过, ${failed} 失败, ${passed + failed} 总计`)
if (failed > 0) process.exit(1)
else console.log('全部通过 ✅')
