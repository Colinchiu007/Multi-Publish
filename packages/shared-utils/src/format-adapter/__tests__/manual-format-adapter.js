/**
 * F1 格式适配器 — TDD 测试
 *
 * 运行：node test-format-adapter.js
 */
const assert = require('assert')
const path = require('path')

// 待实现模块 — 测试时先报错，实现后通过
let adapter
try {
  adapter = require('../index')
} catch (e) {
  // 第一阶段：模块还不存在，测试全部 FAIL
  console.error('[SETUP] Module not yet implemented — tests will fail (TDD RED phase)')
  adapter = null
}

let passed = 0
let failed = 0

function test (name, fn) {
  try {
    fn()
    passed++
    console.log(`  ✅ ${name}`)
  } catch (e) {
    failed++
    console.log(`  ❌ ${name}: ${e.message}`)
  }
}

function suite (name, fn) {
  console.log(`\n## ${name}`)
  fn()
}

// ─── HTML 解析测试 ─────────────────────────

suite('HTML 解析 / normalize', () => {
  test('提取标题（h1）', () => {
    if (!adapter) throw new Error('Module not implemented')
    const result = adapter.formatForPlatform('<h1>标题</h1><p>正文</p>', 'weibo')
    assert.equal(result.title, '标题')
  })

  test('提取标题（无 h1 取首行）', () => {
    if (!adapter) throw new Error('Module not implemented')
    const result = adapter.formatForPlatform('<p>第一行</p><p>正文</p>', 'weibo')
    assert.ok(result.title)
  })

  test('提取图片 URL', () => {
    if (!adapter) throw new Error('Module not implemented')
    const result = adapter.formatForPlatform('<p><img src="https://example.com/1.jpg"/></p>', 'weibo')
    assert.ok(result.images.includes('https://example.com/1.jpg'))
  })

  test('提取 tags（#标签 格式）', () => {
    if (!adapter) throw new Error('Module not implemented')
    const result = adapter.formatForPlatform('<p>内容 #标签1 #标签2 结束</p>', 'weibo')
    assert.ok(result.tags.includes('标签1'))
    assert.ok(result.tags.includes('标签2'))
  })

  test('空输入不崩溃', () => {
    if (!adapter) throw new Error('Module not implemented')
    const result = adapter.formatForPlatform('', 'weibo')
    assert.equal(result.title, '')
    assert.equal(result.content, '')
    assert.ok(Array.isArray(result.images))
    assert.ok(Array.isArray(result.tags))
  })

  test('Null/undefined 不崩溃', () => {
    if (!adapter) throw new Error('Module not implemented')
    const r1 = adapter.formatForPlatform(null, 'weibo')
    const r2 = adapter.formatForPlatform(undefined, 'weibo')
    assert.equal(r1.title, '')
    assert.equal(r2.title, '')
  })
})

// ─── 长度截断测试 ─────────────────────────

suite('长度截断', () => {
  test('微博标题截断到 120 字', () => {
    if (!adapter) throw new Error('Module not implemented')
    const longTitle = 'x'.repeat(200)
    const result = adapter.formatForPlatform(`<h1>${longTitle}</h1>`, 'weibo')
    assert.ok(result.title.length <= 120)
  })

  test('抖音标题截断到 30 字', () => {
    if (!adapter) throw new Error('Module not implemented')
    const longTitle = 'x'.repeat(100)
    const result = adapter.formatForPlatform(`<h1>${longTitle}</h1>`, 'douyin')
    assert.ok(result.title.length <= 30)
  })

  test('微博正文截断到 2000 字', () => {
    if (!adapter) throw new Error('Module not implemented')
    const longContent = 'x'.repeat(3000)
    const result = adapter.formatForPlatform(`<p>${longContent}</p>`, 'weibo')
    assert.ok(result.content.length <= 2000)
  })

  test('微信标题截断到 64 字', () => {
    if (!adapter) throw new Error('Module not implemented')
    const longTitle = 'x'.repeat(100)
    const result = adapter.formatForPlatform(`<h1>${longTitle}</h1>`, 'wechat_mp')
    assert.ok(result.title.length <= 64)
  })
})

// ─── 各平台格式测试 ────────────────────────

suite('平台格式器', () => {
  test('微博：纯文本，移除 HTML 标签', () => {
    if (!adapter) throw new Error('Module not implemented')
    const result = adapter.formatForPlatform('<h1>标题</h1><p>正文<i>斜体</i></p>', 'weibo')
    assert.ok(!result.content.includes('<'))
    assert.ok(!result.content.includes('>'))
  })

  test('微信公众号：保留基本 HTML 结构', () => {
    if (!adapter) throw new Error('Module not implemented')
    const result = adapter.formatForPlatform('<h1>标题</h1><p>正文<b>粗体</b></p>', 'wechat_mp')
    // 微信允许部分 HTML
    assert.ok(result.content.includes('<b>') || result.content.includes('粗体'))
  })

  test('YouTube：纯文本，限制 5000 字', () => {
    if (!adapter) throw new Error('Module not implemented')
    const result = adapter.formatForPlatform('<p>' + 'x'.repeat(6000) + '</p>', 'youtube')
    assert.ok(result.content.length <= 5000)
  })

  test('B站：保留基础格式', () => {
    if (!adapter) throw new Error('Module not implemented')
    const result = adapter.formatForPlatform('<h1>标题</h1><p>正文</p>', 'bilibili')
    assert.ok(result.title)
    assert.ok(result.content)
  })
})

// ─── 非法平台测试 ─────────────────────────

suite('边界情况', () => {
  test('不支持的平台名称 → throw 或 graceful 回退', () => {
    if (!adapter) throw new Error('Module not implemented')
    try {
      const result = adapter.formatForPlatform('<p>test</p>', 'unknown_platform')
      // 可以 graceful 回退为纯文本
      assert.ok(result.content)
    } catch (e) {
      assert.ok(e.message.includes('unknown_platform'))
    }
  })

  test('格式输出含 coverSize', () => {
    if (!adapter) throw new Error('Module not implemented')
    const result = adapter.formatForPlatform('<h1>t</h1><p>c</p>', 'wechat_mp')
    assert.ok(result.coverSize)
  })
})

// ─── 汇总 ─────────────────────────────────

console.log(`\n${'='.repeat(50)}`)
console.log(`结果: ${passed} 通过, ${failed} 失败, ${passed + failed} 总计`)
if (failed > 0) {
  process.exit(1)
} else {
  console.log('全部通过 ✅')
}
