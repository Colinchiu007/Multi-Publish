/**
 * P1-M7: Markdown -> HTML 转换器测试
 */
const assert = require('assert')
const { markdownToHtml, detectMarkdown, htmlToMarkdown } = require('../md-converter')

let passed = 0
let failed = 0

function test (name, fn) {
  try { fn(); passed++; console.log(`  OK ${name}`) }
  catch (e) { failed++; console.log(`  FAIL ${name}: ${e.message}`) }
}

function suite (name, fn) { console.log(`\n## ${name}`); fn() }

suite('detectMarkdown', () => {
  test('detects heading', () => assert.ok(detectMarkdown('# Hello')))
  test('detects bold', () => assert.ok(detectMarkdown('**bold** text')))
  test('detects code block', () => assert.ok(detectMarkdown('```js\nconsole.log(1)\n```')))
  test('detects list', () => assert.ok(detectMarkdown('- item 1\n- item 2')))
  test('detects table', () => assert.ok(detectMarkdown('| a | b |\n|---|---|')))
  test('detects link', () => assert.ok(detectMarkdown('[click](https://x.com)')))
  test('detects image', () => assert.ok(detectMarkdown('![alt](img.png)')))
  test('detects quote', () => assert.ok(detectMarkdown('> quote')))
  test('detects hr', () => assert.ok(detectMarkdown('---')))
  test('does not detect HTML', () => assert.ok(!detectMarkdown('<p>hello</p>')))
  test('does not detect plain text', () => assert.ok(!detectMarkdown('just plain text')))
  test('empty input', () => assert.ok(!detectMarkdown('')))
  test('null input', () => assert.ok(!detectMarkdown(null)))
})

suite('markdownToHtml', () => {
  test('heading h1', () => {
    const html = markdownToHtml('# Title')
    assert.ok(html.includes('<h1>Title</h1>'))
  })
  test('heading h2', () => {
    const html = markdownToHtml('## Sub')
    assert.ok(html.includes('<h2>Sub</h2>'))
  })
  test('bold + italic', () => {
    const html = markdownToHtml('**bold** and *italic*')
    assert.ok(html.includes('<strong>bold</strong>'))
    assert.ok(html.includes('<em>italic</em>'))
  })
  test('unordered list', () => {
    const html = markdownToHtml('- a\n- b\n- c')
    assert.ok(html.includes('<ul>'))
    assert.ok(html.includes('<li>a</li>'))
  })
  test('ordered list', () => {
    const html = markdownToHtml('1. first\n2. second')
    assert.ok(html.includes('<ol>'))
  })
  test('link', () => {
    const html = markdownToHtml('[click](https://example.com)')
    assert.ok(html.includes('href="https://example.com"'))
  })
  test('image', () => {
    const html = markdownToHtml('![alt text](img.png)')
    assert.ok(html.includes('<img'))
    assert.ok(html.includes('src="img.png"'))
  })
  test('code block', () => {
    const html = markdownToHtml('```js\nconsole.log(1)\n```')
    assert.ok(html.includes('<code'))
  })
  test('blockquote', () => {
    const html = markdownToHtml('> quote text')
    assert.ok(html.includes('<blockquote'))
  })
  test('table', () => {
    const html = markdownToHtml('| A | B |\n|---|---|\n| 1 | 2 |')
    assert.ok(html.includes('<table'))
  })
  test('hr', () => {
    const html = markdownToHtml('---')
    assert.ok(html.includes('<hr'))
  })
  test('strips script tags (XSS)', () => {
    const html = markdownToHtml('Hello\n\n<script>alert(1)</script>')
    assert.ok(!html.includes('<script>'))
    assert.ok(html.includes('Hello'))
  })
  test('empty input', () => assert.equal(markdownToHtml(''), ''))
  test('null input', () => assert.equal(markdownToHtml(null), ''))
  test('complex document', () => {
    const md = '# Title\n\nPara **bold** and *italic*.\n\n- list\n\n> quote\n\n```\ncode\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n![img](pic.png)\n\n[link](url)\n\n---'
    const html = markdownToHtml(md)
    assert.ok(html.includes('<h1>'))
    assert.ok(html.includes('<strong>'))
    assert.ok(html.includes('<em>'))
    assert.ok(html.includes('<ul>'))
    assert.ok(html.includes('<blockquote'))
    assert.ok(html.includes('<table'))
    assert.ok(html.includes('<img'))
    assert.ok(html.includes('<a'))
    assert.ok(html.includes('<hr'))
  })
})

suite('htmlToMarkdown', () => {
  test('h1', () => assert.ok(htmlToMarkdown('<h1>Title</h1>').includes('# Title')))
  test('bold', () => assert.ok(htmlToMarkdown('<b>text</b>').includes('**text**')))
  test('link', () => assert.ok(htmlToMarkdown('<a href="url">text</a>').includes('[text](url)')))
  test('image', () => assert.ok(htmlToMarkdown('<img src="img.png" alt="alt"/>').includes('![alt](img.png)')))
  test('empty', () => assert.equal(htmlToMarkdown(''), ''))
  test('null', () => assert.equal(htmlToMarkdown(null), ''))
})

console.log(`\n${'='.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`)
if (failed > 0) process.exit(1)
else console.log('All passed')
