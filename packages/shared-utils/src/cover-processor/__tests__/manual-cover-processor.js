/**
 * F2 封面图处理器 — TDD 测试
 *
 * 运行：node test-cover-processor.js
 */
const assert = require('assert')
const path = require('path')
const fs = require('fs')
const os = require('os')

const sharp = require('sharp')
const processor = require('../index')

let passed = 0
let failed = 0

function ok (name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`) }
}

async function okAsync (name, fn) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`) }
}

function section (name) { console.log(`\n## ${name}`) }

// ─── 主流程 ────────────────────────────────
;(async () => {
  // Setup: create test image
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-test-'))
  const testImg = path.join(testDir, 'input.png')
  await sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .png().toFile(testImg)

  // ─── 预设测试 ──────────────────────────
  section('平台预设')
  ok('获取有效平台的预设', () => {
    const p = processor.getPreset('wechat_mp')
    assert.equal(p.width, 900)
    assert.equal(p.height, 500)
    assert.equal(p.format, 'jpeg')
  })
  ok('无效平台返回 null', () => { assert.equal(processor.getPreset('unknown'), null) })
  ok('所有11平台都有预设', () => {
    for (const id of ['wechat_mp','zhihu','weibo','douyin','xiaohongshu','tencent_video','kuaishou','toutiao','youtube','tiktok','bilibili']) {
      assert.ok(processor.getPreset(id), `缺少 ${id}`)
    }
  })

  // ─── 处理测试 ──────────────────────────
  section('封面处理')
  await okAsync('处理有效图片返回正确结构', async () => {
    const r = await processor.processCover(testImg, 'weibo', testDir)
    assert.ok(r.path); assert.ok(r.width > 0); assert.ok(r.height > 0); assert.ok(r.size > 0); assert.ok(r.format)
  })
  await okAsync('裁剪到目标尺寸 (200x150 → 980x550)', async () => {
    const r = await processor.processCover(testImg, 'weibo', testDir)
    assert.equal(r.width, 980)
    assert.equal(r.height, 550)
  })
  await okAsync('格式转换 PNG → JPEG', async () => {
    const r = await processor.processCover(testImg, 'weibo', testDir)
    assert.equal(r.format, 'jpeg')
    assert.ok(r.path.endsWith('.jpg'))
  })
  await okAsync('空路径返回错误', async () => {
    try { await processor.processCover('', 'weibo', testDir); assert.fail() }
    catch (e) { assert.ok(e.message) }
  })
  await okAsync('不存在文件返回错误', async () => {
    try { await processor.processCover('/no/such/file.jpg', 'weibo', testDir); assert.fail() }
    catch (e) { assert.ok(e.message) }
  })
  await okAsync('输出文件实际存在', async () => {
    const r = await processor.processCover(testImg, 'wechat_mp', testDir)
    assert.ok(fs.existsSync(r.path))
  })

  // ─── 大小限制测试 ──────────────────────
  section('大小限制')
  ok('coverSize 解析', () => {
    const r = processor.parseCoverSize('900x500')
    assert.equal(r.width, 900); assert.equal(r.height, 500)
  })
  ok('无效 coverSize 返回 null', () => {
    assert.equal(processor.parseCoverSize(''), null)
    assert.equal(processor.parseCoverSize('abc'), null)
  })

  // ─── 清理 ──────────────────────────────
  try { fs.rmSync(testDir, { recursive: true, force: true }) } catch (e) {}

  // ─── 汇总 ──────────────────────────────
  console.log(`\n${'='.repeat(50)}`)
  console.log(`结果: ${passed} 通过, ${failed} 失败, ${passed + failed} 总计`)
  if (failed > 0) process.exit(1)
  else console.log('全部通过 ✅')
})()
