// @ts-check
// @vitest-environment node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const CLI = path.join(__dirname, 'cli.js')

function makeFixture () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-eval-cli-test-' + process.pid + '-'))
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const img = path.join(dir, 'a.png')
  fs.writeFileSync(img, png)
  const evalMod = path.join(dir, 'eval-stub.js')
  fs.writeFileSync(evalMod, [
    'module.exports = async ({ prompt, images }) => {',
    '  if (!prompt.includes("AI 生成图像评估专家")) throw new Error("prompt contract broken");',
    '  if (!Array.isArray(images) || images.length !== 1) throw new Error("images contract broken");',
    '  return JSON.stringify({',
    '    overall: 81,',
    '    dimensions: [',
    '      { id: "relevance", score: 82, evidence: "e1", issues: [], suggestions: [] },',
    '      { id: "content_accuracy", score: 80, evidence: "e2", issues: [], suggestions: [] },',
    '      { id: "aesthetic_quality", score: 79, evidence: "e3", issues: [], suggestions: [] }',
    '    ],',
    '    problems: [],',
    '    promptOptimizationPoints: []',
    '  })',
    '}',
  ].join('\n'))
  return { dir, img, evalMod }
}

describe('prompt-eval cli', () => {
  let fx
  beforeEach(() => { fx = makeFixture() })
  afterEach(() => { fs.rmSync(fx.dir, { recursive: true, force: true }) })

  it('单图评估成功输出 JSON（exit 0）', () => {
    const out = execFileSync('node', [CLI, '--image', fx.img, '--source-text', '老妇人在做饭', '--optimized-prompt', '写实老妇人做饭', '--evaluator', fx.evalMod, '--json'], { encoding: 'utf8' })
    const parsed = JSON.parse(out)
    expect(parsed.overallScore).toBe(81)
    expect(parsed.mediaType).toBe('image')
  })

  it('缺少必填参数 → exit 2', () => {
    let failed = false
    try {
      execFileSync('node', [CLI, '--evaluator', fx.evalMod], { encoding: 'utf8' })
    } catch (e) {
      failed = true
      expect(e.status).toBe(2)
    }
    expect(failed).toBe(true)
  })

  it('缺少评估器 → exit 2 且提示', () => {
    let failed = false
    try {
      execFileSync('node', [CLI, '--image', fx.img, '--source-text', 'x', '--optimized-prompt', 'y'], { encoding: 'utf8' })
    } catch (e) {
      failed = true
      expect(e.status).toBe(2)
      expect(String(e.stderr)).toContain('缺少评估器')
    }
    expect(failed).toBe(true)
  })
})
