// @ts-check
// @vitest-environment node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createPromptEvalEngine } = require('./engine')

function makeImage (dir, name) {
  const file = path.join(dir, name)
  // 1x1 PNG（合法文件，engine 只做存在性与大小校验）
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  fs.writeFileSync(file, png)
  return file
}

function makeDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-eval-engine-' + process.pid + '-'))
}

function validRequest (imgDir) {
  const imagePath = makeImage(imgDir, 'a.png')
  return {
    mediaType: 'image',
    items: [
      { imagePath, sourceText: '老妇人在做饭', context: { synopsis: '唐代中国' }, optimizedPrompt: '写实唐代老妇人做饭', negativePrompt: '现代电器', imageIndex: 0 },
    ],
    options: { language: 'zh', temperature: 0 },
  }
}

function mockEvaluator (reply) {
  return async ({ prompt, images }) => {
    expect(prompt).toContain('AI 生成图像评估专家')
    expect(Array.isArray(images)).toBe(true)
    expect(images[0].base64.length).toBeGreaterThan(0)
    return typeof reply === 'function' ? reply({ prompt, images }) : reply
  }
}

function validReply () {
  return JSON.stringify({
    overall: 80,
    dimensions: [
      { id: 'relevance', score: 82, evidence: 'e1', issues: [], suggestions: [] },
      { id: 'content_accuracy', score: 78, evidence: 'e2', issues: ['缺碗筷'], suggestions: ['补碗筷'] },
      { id: 'aesthetic_quality', score: 80, evidence: 'e3', issues: [], suggestions: [] },
    ],
    problems: [],
    promptOptimizationPoints: [],
  })
}

describe('prompt-eval engine', () => {
  let dir
  let store
  let engine
  beforeEach(() => {
    dir = makeDir()
    const { createPromptEvalStore } = require('./store')
    store = createPromptEvalStore({ userDataDir: dir, log: noopLog })
    engine = createPromptEvalEngine({ store, log: noopLog })
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('单图评估成功：返回报告并持久化', async () => {
    const result = await engine.evaluateImages(validRequest(dir), { evaluator: mockEvaluator(validReply()) })
    expect(result.success).toBe(true)
    expect(result.report.overallScore).toBe(80)
    expect(result.report.grade).toBe('good')
    expect(result.report.dimensions).toHaveLength(3)
    expect(store.getRecord(result.report.id)).not.toBeNull()
  })

  it('多图评估启用跨图一致性维度', async () => {
    const req = validRequest(dir)
    req.items.push({ ...req.items[0], imagePath: makeImage(dir, 'b.png'), imageIndex: 1 })
    const reply = JSON.stringify({
      overall: 75,
      dimensions: [
        { id: 'relevance', score: 76, evidence: 'e1', issues: [], suggestions: [] },
        { id: 'content_accuracy', score: 74, evidence: 'e2', issues: [], suggestions: [] },
        { id: 'aesthetic_quality', score: 77, evidence: 'e3', issues: [], suggestions: [] },
        { id: 'cross_image_consistency', score: 72, evidence: 'e4', issues: ['色调差异'], suggestions: ['统一色调'] },
      ],
      problems: [],
      promptOptimizationPoints: [],
    })
    const result = await engine.evaluateImages(req, { evaluator: mockEvaluator(reply) })
    expect(result.success).toBe(true)
    expect(result.report.dimensions).toHaveLength(4)
  })

  it('输入校验矩阵：每个非法输入返回对应 EVAL_*', async () => {
    const cases = [
      [{ ...validRequest(dir), mediaType: 'video' }, 'EVAL_MEDIA_TYPE_NOT_SUPPORTED'],
      [{ ...validRequest(dir), items: [] }, 'EVAL_EMPTY_ITEMS'],
      [{ ...validRequest(dir), items: [{ ...validRequest(dir).items[0], imagePath: path.join(dir, 'missing.png') }] }, 'EVAL_IMAGE_NOT_FOUND'],
      [{ ...validRequest(dir), items: [{ ...validRequest(dir).items[0], optimizedPrompt: '' }] }, 'EVAL_OPTIMIZED_PROMPT_INVALID'],
      [{ ...validRequest(dir), items: [{ ...validRequest(dir).items[0], sourceText: '', context: null }] }, 'EVAL_SOURCE_MISSING'],
      [{ ...validRequest(dir), items: [{ ...validRequest(dir).items[0], context: { password: 'x' } }] }, 'EVAL_SENSITIVE_CONTEXT'],
      [{ ...validRequest(dir), options: { language: 'fr' } }, 'EVAL_LANGUAGE_INVALID'],
    ]
    for (const [req, code] of cases) {
      const result = await engine.evaluateImages(req, { evaluator: mockEvaluator(validReply()) })
      expect(result.success).toBe(false)
      expect(result.error && result.error.code).toBe(code)
    }
  })

  it('图片过大（>8MB）返回 EVAL_IMAGE_TOO_LARGE', async () => {
    const req = validRequest(dir)
    const big = path.join(dir, 'big.png')
    fs.writeFileSync(big, Buffer.alloc(8 * 1024 * 1024 + 1))
    req.items[0].imagePath = big
    const result = await engine.evaluateImages(req, { evaluator: mockEvaluator(validReply()) })
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('EVAL_IMAGE_TOO_LARGE')
  })

  it('评估器抛出瞬时错误时重试 ≤2 次后成功', async () => {
    let calls = 0
    const flaky = async () => {
      calls += 1
      if (calls <= 2) { const e = new Error('timeout'); e.code = 'ETIMEDOUT'; throw e }
      return validReply()
    }
    const result = await engine.evaluateImages(validRequest(dir), { evaluator: flaky })
    expect(result.success).toBe(true)
    expect(calls).toBe(3)
  })

  it('评估器输出非法 → EVAL_LLM_INVALID_RESPONSE，不落盘', async () => {
    const result = await engine.evaluateImages(validRequest(dir), { evaluator: mockEvaluator('not json') })
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('EVAL_LLM_INVALID_RESPONSE')
    const recordsDir = path.join(dir, 'prompt-eval', 'records'); expect(fs.existsSync(recordsDir) ? fs.readdirSync(recordsDir).length : 0).toBe(0)
  })

  it('未提供评估器 → EVAL_LLM_UNAVAILABLE', async () => {
    const result = await engine.evaluateImages(validRequest(dir), { evaluator: null })
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('EVAL_LLM_UNAVAILABLE')
  })
})

const noopLog = { info: () => {}, warn: () => {}, error: () => {} }


