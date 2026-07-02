/**
 * P1-M7: Markdown input format-adapter integration test
 */
const assert = require('assert')
const adapter = require('../index')

let passed = 0
let failed = 0

function test (name, fn) {
  try { fn(); passed++; console.log('  OK ' + name) }
  catch (e) { failed++; console.log('  FAIL ' + name + ': ' + e.message) }
}

function suite (name, fn) { console.log('\n## ' + name); fn() }

suite('Markdown input auto-detection', () => {
  test('Markdown heading converts to HTML for weibo', () => {
    const result = adapter.formatForPlatform('# My Title\n\nContent here', 'weibo')
    assert.ok(result.title.includes('My Title'))
    assert.ok(result.content.includes('Content here'))
  })

  test('Markdown bold for zhihu', () => {
    const result = adapter.formatForPlatform('## Article\n\nThis is **important** and *italic*', 'zhihu')
    assert.ok(result.content.includes('important'))
    assert.ok(result.title.includes('Article'))
  })

  test('Markdown list for douyin', () => {
    const result = adapter.formatForPlatform('# Tips\n\n- tip 1\n- tip 2\n- tip 3', 'douyin')
    assert.ok(result.title.includes('Tips'))
  })

  test('Markdown link for bilibili', () => {
    const result = adapter.formatForPlatform('# Check this\n\n[link text](https://example.com)', 'bilibili')
    assert.ok(result.title.includes('Check this'))
  })

  test('Markdown table for toutiao', () => {
    const md = '# Data\n\n| Col A | Col B |\n|---|---|\n| 1 | 2 |'
    const result = adapter.formatForPlatform(md, 'toutiao')
    assert.ok(result.title.includes('Data'))
  })

  test('Markdown blockquote for wechat', () => {
    const md = '# Article\n\n> This is a quote'
    const result = adapter.formatForPlatform(md, 'wechat_mp')
    assert.ok(result.title.includes('Article'))
  })

  test('Markdown code block for zhihu', () => {
    const md = '# Code\n\n```js\nconsole.log(\"hello\")\n```'
    const result = adapter.formatForPlatform(md, 'zhihu')
    assert.ok(result.title.includes('Code'))
  })

  test('Plain HTML still works (no regression)', () => {
    const result = adapter.formatForPlatform('<h1>HTML Title</h1><p>HTML content</p>', 'weibo')
    assert.ok(result.title.includes('HTML Title'))
  })
})

suite('Markdown input limits', () => {
  test('Title truncation works with Markdown input', () => {
    const longTitle = '# ' + 'x'.repeat(200)
    const result = adapter.formatForPlatform(longTitle + '\n\ncontent', 'douyin')
    assert.ok(result.title.length <= 30)
  })
})

console.log('\n' + '='.repeat(50))
console.log('Results: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total')
if (failed > 0) process.exit(1)
else console.log('All passed')
