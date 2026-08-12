// @ts-check
// @vitest-environment node
__enableElectronMock()
const fs = require('fs')
const os = require('os')
const path = require('path')
const registerPromptEvalHandlers = require('./prompt-eval')
const { createPromptEvalService } = require('../services/prompt-eval')

function makeDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-eval-ipc-' + process.pid + '-'))
}

const TRUSTED_EVENT = { senderFrame: { url: 'http://localhost:5174/' }, sender: {} }

function fakeIpcMain () {
  const handlers = {}
  return {
    handlers,
    handle (channel, fn) { handlers[channel] = fn },
  }
}

function okEvaluator () {
  return async ({ prompt, images }) => JSON.stringify({
    overall: 80,
    dimensions: [
      { id: 'relevance', score: 82, evidence: 'e1', issues: [], suggestions: [] },
      { id: 'content_accuracy', score: 78, evidence: 'e2', issues: [], suggestions: [] },
      { id: 'aesthetic_quality', score: 80, evidence: 'e3', issues: [], suggestions: [] },
    ],
    problems: [],
    promptOptimizationPoints: [],
  })
}

describe('prompt-eval ipc handlers', () => {
  let dir
  let service
  let ipc
  beforeEach(() => {
    dir = makeDir()
    service = createPromptEvalService({ userDataDir: dir, evaluator: okEvaluator(), log: noopLog })
    ipc = fakeIpcMain()
    registerPromptEvalHandlers(ipc, { promptEvalService: service })
  })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('注册全部 6 个通道', () => {
    for (const ch of ['prompt-eval:run', 'prompt-eval:list', 'prompt-eval:get', 'prompt-eval:delete', 'prompt-eval:analyze', 'prompt-eval:dimensions']) {
      expect(typeof ipc.handlers[ch]).toBe('function')
    }
  })

  it('未注入 service 时注册抛错', () => {
    expect(() => registerPromptEvalHandlers(fakeIpcMain(), {})).toThrow(/promptEvalService 未注入/)
  })

  it('run 成功并持久化，list/get/delete/analyze/dimensions 可用', async () => {
    const img = path.join(dir, 'a.png')
    fs.writeFileSync(img, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
    const req = {
      mediaType: 'image',
      items: [{ imagePath: img, sourceText: '老妇人在做饭', optimizedPrompt: '写实老妇人做饭' }],
      options: { language: 'zh' },
    }
    const runResult = await ipc.handlers['prompt-eval:run'](TRUSTED_EVENT, req)
    expect(runResult.success).toBe(true)
    const id = runResult.report.id
    const list = await ipc.handlers['prompt-eval:list'](TRUSTED_EVENT)
    expect(list).toHaveLength(1)
    const got = await ipc.handlers['prompt-eval:get'](TRUSTED_EVENT, id)
    expect(got.id).toBe(id)
    const analyze = await ipc.handlers['prompt-eval:analyze'](TRUSTED_EVENT)
    expect(analyze.recordCount).toBe(1)
    const dims = await ipc.handlers['prompt-eval:dimensions'](TRUSTED_EVENT)
    expect(dims.image).toHaveLength(4)
    await ipc.handlers['prompt-eval:delete'](TRUSTED_EVENT, id)
    expect(await ipc.handlers['prompt-eval:list'](TRUSTED_EVENT)).toHaveLength(0)
  })

  it('run 非法请求返回失败对象而非抛错；get 不存在抛 EVAL_RECORD_NOT_FOUND', async () => {
    const runResult = await ipc.handlers['prompt-eval:run'](TRUSTED_EVENT, { mediaType: 'video', items: [] })
    expect(runResult.success).toBe(false)
    expect(runResult.error.code).toBe('EVAL_MEDIA_TYPE_NOT_SUPPORTED')
    let failed = false
    try {
      await ipc.handlers['prompt-eval:get'](TRUSTED_EVENT, 'nope')
    } catch (e) {
      failed = true
      expect(e.code).toBe('EVAL_RECORD_NOT_FOUND')
    }
    expect(failed).toBe(true)
  })
})

const noopLog = { info: () => {}, warn: () => {}, error: () => {} }


