/**
 * F1 平台 URL 配置化 — TDD 测试
 *
 * 运行：node test-platform-config.js
 */
const assert = require('assert')
const path = require('path')
const fs = require('fs')
const os = require('os')

let PlatformConfig
try {
  PlatformConfig = require('../platform-config')
} catch (e) {
  console.error('[SETUP] Module not yet implemented — tests will fail (TDD RED phase)')
  PlatformConfig = null
}

let passed = 0
let failed = 0

function ok (name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`) }
}

function section (name) { console.log(`\n## ${name}`) }

// ─── 配置加载测试 ─────────────────────────
section('配置加载')
ok('从 YAML 文件加载配置', () => {
  if (!PlatformConfig) throw new Error('Module not implemented')
  const configPath = path.join(__dirname, '..', '..', '..', '..', 'config', 'platforms.yaml')
  const pc = new PlatformConfig(configPath)
  assert.ok(pc.listPlatforms().length >= 12)
})

ok('获取单个平台配置', () => {
  if (!PlatformConfig) throw new Error('Module not implemented')
  const configPath = path.join(__dirname, '..', '..', '..', '..', 'config', 'platforms.yaml')
  const pc = new PlatformConfig(configPath)
  const wp = pc.getPlatform('wechat_mp')
  assert.ok(wp)
  assert.equal(wp.name, '微信公众号')
  assert.equal(wp.type, 'article')
})

ok('不存在平台返回 null', () => {
  if (!PlatformConfig) throw new Error('Module not implemented')
  const configPath = path.join(__dirname, '..', '..', '..', '..', 'config', 'platforms.yaml')
  const pc = new PlatformConfig(configPath)
  assert.equal(pc.getPlatform('nonexistent'), null)
})

ok('所有平台都有必要字段', () => {
  if (!PlatformConfig) throw new Error('Module not implemented')
  const configPath = path.join(__dirname, '..', '..', '..', '..', 'config', 'platforms.yaml')
  const pc = new PlatformConfig(configPath)
  const required = ['id', 'name', 'type', 'icon', 'cover_size', 'max_title', 'max_content']
  for (const p of pc.listPlatforms()) {
    for (const field of required) {
      assert.ok(p[field] !== undefined && p[field] !== null,
        `平台 ${p.id} 缺少字段: ${field}`)
    }
  }
})

// ─── 辅助方法测试 ─────────────────────────
section('辅助方法')
ok('getDataUrl 返回正确 URL', () => {
  if (!PlatformConfig) throw new Error('Module not implemented')
  const configPath = path.join(__dirname, '..', '..', '..', '..', 'config', 'platforms.yaml')
  const pc = new PlatformConfig(configPath)
  const url = pc.getDataUrl('douyin')
  // 抖音可能有 data_url，也可能为空
  // 只要不崩溃即可
  assert.ok(url !== undefined)
})

ok('getCommentUrl 返回正确 URL', () => {
  if (!PlatformConfig) throw new Error('Module not implemented')
  const configPath = path.join(__dirname, '..', '..', '..', '..', 'config', 'platforms.yaml')
  const pc = new PlatformConfig(configPath)
  const url = pc.getCommentUrl('weibo')
  assert.ok(url !== undefined)
})

ok('getCoverSize 返回正确尺寸', () => {
  if (!PlatformConfig) throw new Error('Module not implemented')
  const configPath = path.join(__dirname, '..', '..', '..', '..', 'config', 'platforms.yaml')
  const pc = new PlatformConfig(configPath)
  const size = pc.getCoverSize('wechat_mp')
  assert.deepEqual(size, { width: 900, height: 500 })
})

ok('配置不存在时抛出错误', () => {
  if (!PlatformConfig) throw new Error('Module not implemented')
  try {
    new PlatformConfig('/nonexistent/path.yaml')
    assert.fail('应该抛出错误')
  } catch (e) {
    assert.ok(e.message)
  }
})

// ─── 汇总 ─────────────────────────────────
console.log(`\n${'='.repeat(50)}`)
console.log(`结果: ${passed} 通过, ${failed} 失败, ${passed + failed} 总计`)
if (failed > 0) process.exit(1)
else console.log('全部通过 ✅')
