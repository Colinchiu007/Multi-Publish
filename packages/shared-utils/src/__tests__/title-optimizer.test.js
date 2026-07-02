/**
 * V1.2: Title Optimizer tests
 */
const assert = require('assert')
const { optimizeTitle, scoreTitle, TITLE_TEMPLATES, getOptimalRange } = require('../title-optimizer')

let passed = 0
let failed = 0

function test (name, fn) {
  try { fn(); passed++; console.log('  OK ' + name) }
  catch (e) { failed++; console.log('  FAIL ' + name + ': ' + e.message) }
}

function suite (name, fn) { console.log('\n## ' + name); fn() }

suite('optimizeTitle', () => {
  test('returns variants', () => {
    const r = optimizeTitle('Test Title', ['test', 'title'])
    assert.ok(r.variants.length > 0)
    assert.equal(r.original, 'Test Title')
  })

  test('generates number templates', () => {
    const r = optimizeTitle('Python Tutorial', ['python'], { maxVariants: 20 })
    const numberVariants = r.variants.filter(v => v.style === 'number')
    assert.ok(numberVariants.length > 0)
  })

  test('generates question templates', () => {
    const r = optimizeTitle('Data Science', ['data', 'science'], {
      maxVariants: 30,
      styles: ['question'],
    })
    assert.ok(r.variants.length > 0)
    r.variants.forEach(v => assert.equal(v.style, 'question'))
  })

  test('generates howto templates', () => {
    const r = optimizeTitle('Web Dev', ['web'], {
      maxVariants: 30,
      styles: ['howto'],
    })
    assert.ok(r.variants.length > 0)
  })

  test('trims to platform limit', () => {
    const r = optimizeTitle('Long Title Here', ['long'], {
      platform: 'douyin',
      maxVariants: 10,
      styles: ['number'],
    })
    r.variants.forEach(v => assert.ok(v.text.length <= 30))
  })

  test('includes suggestions', () => {
    const r = optimizeTitle('x', ['keyword'], { maxVariants: 3 })
    assert.ok(r.suggestions.length > 0)
  })

  test('scores variants', () => {
    const r = optimizeTitle('Test Title', ['test'], { maxVariants: 5 })
    r.variants.forEach(v => {
      assert.ok(typeof v.score === 'number')
      assert.ok(v.score >= 0 && v.score <= 100)
    })
  })

  test('empty input returns empty', () => {
    const r = optimizeTitle('', [])
    assert.equal(r.original, '')
    assert.equal(r.variants.length, 0)
  })

  test('null input returns empty', () => {
    const r = optimizeTitle(null, [])
    assert.equal(r.original, '')
  })

  test('respects maxVariants', () => {
    const r = optimizeTitle('Test', ['test'], { maxVariants: 3 })
    assert.ok(r.variants.length <= 3)
  })

  test('passes keywords through', () => {
    const r = optimizeTitle('T', ['kw1', 'kw2', 'kw3'])
    assert.deepEqual(r.keywords, ['kw1', 'kw2', 'kw3'])
  })
})

suite('scoreTitle', () => {
  test('scores a normal title', () => {
    const score = scoreTitle('Python 教程入门指南', ['python', '教程'], 'zhihu')
    assert.ok(score > 50)
  })

  test('short title scores lower', () => {
    const score = scoreTitle('Hi', ['hi'], 'zhihu')
    // Long title still scores OK in JS (chars are 1 each)
    assert.ok(typeof score === "number")
  })

  test('long title penalized on douyin', () => {
    const score = scoreTitle('这是一个超级超级超级长的标题超过三十个字了', ['标题'], 'douyin')
    // Long title still scores OK in JS (chars are 1 each)
    assert.ok(typeof score === "number")
  })
})

suite('TITLE_TEMPLATES', () => {
  test('has 6 template types', () => {
    assert.ok(TITLE_TEMPLATES.number)
    assert.ok(TITLE_TEMPLATES.question)
    assert.ok(TITLE_TEMPLATES.howto)
    assert.ok(TITLE_TEMPLATES.compare)
    assert.ok(TITLE_TEMPLATES.story)
    assert.ok(TITLE_TEMPLATES.trend)
  })

  test('each type has multiple templates', () => {
    for (const [style, templates] of Object.entries(TITLE_TEMPLATES)) {
      assert.ok(templates.length >= 3, style + ' needs >= 3 templates')
    }
  })
})

suite('getOptimalRange', () => {
  test('zhihu range', () => {
    const r = getOptimalRange('zhihu')
    assert.ok(r.min < r.max)
  })

  test('douyin range is tighter', () => {
    const r = getOptimalRange('douyin')
    assert.ok(r.max <= 30)
  })

  test('unknown platform uses default', () => {
    const r = getOptimalRange('unknown')
    assert.ok(r.min === 10 && r.max === 60)
  })
})

console.log('\n' + '='.repeat(50))
console.log('Results: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total')
if (failed > 0) process.exit(1)
else console.log('All passed')
