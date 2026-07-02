/**
 * P1-M8: Cover template generator tests
 */
const assert = require('assert')
const path = require('path')
const fs = require('fs')
const { generateCover, buildTitleSvg, wrapText, COVER_TEMPLATES } = require('../cover-processor/cover-generator')

const OUT = path.join(__dirname, '..', '..', '..', '..', 'tmp_cover_test')

let passed = 0
let failed = 0

function test (name, fn) {
  try { fn(); passed++; console.log('  OK ' + name) }
  catch (e) { failed++; console.log('  FAIL ' + name + ': ' + e.message) }
}

function suite (name, fn) { console.log('\n## ' + name); fn() }

suite('wrapText', () => {
  test('short text single line', () => {
    assert.deepEqual(wrapText('Hello', 20), ['Hello'])
  })
  test('long text wraps', () => {
    const lines = wrapText('This is a very long title that should be wrapped', 20)
    assert.ok(lines.length > 1)
    assert.ok(lines[0].length <= 20)
  })
  test('empty input', () => assert.deepEqual(wrapText('', 20), ['']))
  test('null input', () => assert.deepEqual(wrapText(null, 20), ['']))
})

suite('COVER_TEMPLATES', () => {
  test('has solid template', () => assert.ok(COVER_TEMPLATES.solid))
  test('has gradient template', () => assert.ok(COVER_TEMPLATES.gradient))
  test('has dark template', () => assert.ok(COVER_TEMPLATES.dark))
  test('solid has backgrounds', () => assert.ok(COVER_TEMPLATES.solid.backgrounds.length > 0))
})

suite('buildTitleSvg', () => {
  test('generates valid SVG', () => {
    const svg = buildTitleSvg('Test Title', 1200, 630)
    assert.ok(svg.includes('<svg'))
    assert.ok(svg.includes('Test Title'))
    assert.ok(svg.includes('1200'))
    assert.ok(svg.includes('630'))
  })
  test('escapes HTML in title', () => {
    const svg = buildTitleSvg('Title <script>alert(1)</script>', 800, 400)
    assert.ok(!svg.includes('<script>'))
    assert.ok(svg.includes('&lt;script&gt;'))
  })
  test('gradient SVG has linearGradient', () => {
    const svg = buildTitleSvg('Test', 800, 400, {
      template: 'gradient',
      bgColor: '#E8553A',
      bgColorEnd: '#FF8A65',
    })
    assert.ok(svg.includes('linearGradient'))
    assert.ok(svg.includes('#E8553A'))
  })
  test('multiline title for short width', () => {
    const svg = buildTitleSvg('This is a very long article title that will wrap', 400, 300)
    assert.ok(svg.includes('text'))
  })
})

suite('generateCover', () => {
  test('generates PNG for weibo', async () => {
    const result = await generateCover('My Article Title', 'weibo', OUT)
    assert.ok(fs.existsSync(result.path))
    assert.equal(result.width, 1280)
    assert.equal(result.height, 720)
    assert.equal(result.format, 'png')
    // Cleanup
    fs.unlinkSync(result.path)
  })

  test('generates PNG for douyin', async () => {
    const result = await generateCover('Douyin Cover', 'douyin', OUT)
    assert.ok(fs.existsSync(result.path))
    assert.equal(result.width, 980)
    assert.equal(result.height, 550)
    fs.unlinkSync(result.path)
  })

  test('generates with custom dimensions', async () => {
    const result = await generateCover('Custom', { width: 500, height: 500 }, OUT)
    assert.ok(fs.existsSync(result.path))
    assert.equal(result.width, 500)
    assert.equal(result.height, 500)
    fs.unlinkSync(result.path)
  })

  test('generates gradient template', async () => {
    const result = await generateCover('Gradient Cover', 'bilibili', OUT, { template: 'gradient' })
    assert.ok(fs.existsSync(result.path))
    fs.unlinkSync(result.path)
  })

  test('generates dark template', async () => {
    const result = await generateCover('Dark Cover', 'toutiao', OUT, { template: 'dark' })
    assert.ok(fs.existsSync(result.path))
    fs.unlinkSync(result.path)
  })

  test('throws on unknown platform', async () => {
    try {
      await generateCover('Test', 'nonexistent_platform', OUT)
      assert.fail('Should have thrown')
    } catch (e) {
      assert.ok(e.message.includes('nonexistent_platform'))
    }
  })

  test('throws on null platform', async () => {
    try {
      await generateCover('Test', null, OUT)
      assert.fail('Should have thrown')
    } catch (e) {
      assert.ok(e.message)
    }
  })
})

// Cleanup
// Cleanup
  try {
    if (fs.existsSync(OUT)) {
      const files = fs.readdirSync(OUT)
      for (const f of files) fs.unlinkSync(path.join(OUT, f))
      fs.rmdirSync(OUT)
    }
  } catch (e) {}
  process.exit(failed > 0 ? 1 : 0)

console.log('\n' + '='.repeat(50))
console.log('Results: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total')
if (failed > 0) process.exit(1)
else console.log('All passed')
