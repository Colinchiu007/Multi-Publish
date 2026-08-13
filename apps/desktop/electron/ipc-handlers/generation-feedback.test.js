// @ts-check
// @vitest-environment node
const fs = require('fs')
const os = require('os')
const path = require('path')
const registerHandlers = require('./generation-feedback')
const { createSignalCollector, monthKey } = require('../services/prompt-evolution/signal-collector')

function makeRoot () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-evolution-ipc-' + process.pid + '-'))
}

function makeCollector (root) {
  return createSignalCollector({
    logDir: root,
    log: { info: () => {}, warn: () => {}, error: () => {} },
  })
}

function mockIpcMain () {
  const handlers = {}
  return {
    handlers,
    handle: (channel, fn) => { handlers[channel] = fn },
  }
}

describe('generation-feedback IPC', () => {
  let root
  let ipc
  let collector

  beforeEach(() => {
    root = makeRoot()
    ipc = mockIpcMain()
    collector = makeCollector(root)
    registerHandlers(ipc, { signalCollector: collector })
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('注册 generation:feedback 与 prompt-library:list 通道', () => {
    expect(typeof ipc.handlers['generation:feedback']).toBe('function')
    expect(typeof ipc.handlers['prompt-library:list']).toBe('function')
  })

  it('合法上报返回 code 0 且写入 feedback-log', async () => {
    const gen = collector.recordGeneration({
      engine: 'image', mode: 'story2video',
      context: { userId: 'u1', sessionId: 's1' },
      input: { concept: 'AI' },
      prompt: { optimized: 'p' },
      provider: { name: 'flux' },
      result: { status: 'success', outputRefs: [] },
    })
    const res = await ipc.handlers['generation:feedback']({}, { eventId: gen.id, type: 'accepted', detail: {} })
    expect(res.code).toBe(0)
    expect(res.data.orphan).toBe(false)
    const month = monthKey(new Date())
    const realFile = path.join(root, 'feedback-log', month + '.jsonl')
    expect(fs.existsSync(realFile)).toBe(true)
  })

  it('eventId 与 sessionId 皆缺返回 VALIDATION_ERROR 且不写入', async () => {
    const res = await ipc.handlers['generation:feedback']({}, { type: 'accepted' })
    expect(res.code).toBe(-2)
    const month = monthKey(new Date())
    expect(fs.existsSync(path.join(root, 'feedback-log', month + '.jsonl'))).toBe(false)
  })

  it('仅 sessionId 可关联到最新生成事件', async () => {
    const gen = collector.recordGeneration({
      engine: 'image', mode: 'story2video',
      context: { userId: 'u1', sessionId: 'run-42' },
      input: { concept: 'AI' },
      prompt: { optimized: 'p' },
      provider: { name: 'flux' },
      result: { status: 'success', outputRefs: [] },
    })
    const res = await ipc.handlers['generation:feedback']({}, { sessionId: 'run-42', type: 'accepted' })
    expect(res.code).toBe(0)
    expect(res.data.orphan).toBe(false)
    const month = monthKey(new Date())
    const parsed = JSON.parse(fs.readFileSync(path.join(root, 'feedback-log', month + '.jsonl'), 'utf8').trim())
    expect(parsed.eventId).toBe(gen.id)
  })

  it('非对象入参拒绝', async () => {
    const res = await ipc.handlers['generation:feedback']({}, null)
    expect(res.code).toBe(-2)
  })

  it('采集器未启用时返回错误', async () => {
    const ipc2 = mockIpcMain()
    registerHandlers(ipc2, {}) // 无 signalCollector
    const res = await ipc2.handlers['generation:feedback']({}, { eventId: 'e1', type: 'accepted' })
    expect(res.code).toBe(-99)
  })

  it('prompt-library:list 返回 P0 骨架', async () => {
    const res = await ipc.handlers['prompt-library:list']()
    expect(res.code).toBe(0)
    expect(res.data.templates).toEqual([])
    expect(res.data.evolution).toBe('enabled')
  })
})

describe('generation-feedback IPC: prompt-library 契约（P1b 记忆库）', () => {
  let root
  let ipc
  let collector
  let memory
  let gov

  beforeEach(() => {
    root = makeRoot()
    ipc = mockIpcMain()
    collector = makeCollector(root)
    const { createPromptMemory } = require('../services/prompt-evolution/prompt-memory')
    const { createGovernance } = require('../services/prompt-evolution/governance')
    gov = createGovernance({ log: { info: () => {}, warn: () => {}, error: () => {} } })
    memory = createPromptMemory({
      libraryRoot: path.join(root, 'prompt-library'),
      governance: gov,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    })
    memory.load()
    registerHandlers(ipc, { signalCollector: collector, promptMemory: memory })
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  const validSave = {
    engine: 'image', mode: 'story2video', type: 'composition',
    content: { compositionType: '前后对比', action: '放大', object: '书本', creativeLevel: 7 },
    concept: 'AI 改变教育', eventId: 'evt_1234567890abcdef',
  }

  it('EC.TEMPLATE_* 数值断言 -20..-23', () => {
    const { ERROR } = require('../core/error-codes')
    expect(ERROR.TEMPLATE_INVALID).toBe(-20)
    expect(ERROR.TEMPLATE_GATE_FAILED).toBe(-21)
    expect(ERROR.TEMPLATE_NOT_FOUND).toBe(-22)
    expect(ERROR.TEMPLATE_BAD_STATE).toBe(-23)
  })

  it('save 合法入参 → code 0 + {id, version, state:draft}，模板落盘', async () => {
    const res = await ipc.handlers['prompt-library:save']({}, validSave)
    expect(res.code).toBe(0)
    expect(res.data.id).toMatch(/^tpl_[0-9a-f]{16}$/)
    expect(res.data.version).toBe(1)
    expect(res.data.state).toBe('draft')
    const list = await ipc.handlers['prompt-library:list']()
    expect(list.code).toBe(0)
    expect(list.data.templates).toHaveLength(1)
    expect(list.data.templates[0].id).toBe(res.data.id)
    expect(list.data.evolution).toBe('enabled')
  })

  it('save 缺 eventId → TEMPLATE_INVALID(-20)，不写入', async () => {
    const arg = Object.assign({}, validSave, { eventId: undefined })
    const res = await ipc.handlers['prompt-library:save']({}, arg)
    expect(res.code).toBe(-20)
    const list = await ipc.handlers['prompt-library:list']()
    expect(list.data.templates).toEqual([])
  })

  it('save eventId 非 evt_ 前缀 → -20', async () => {
    const res = await ipc.handlers['prompt-library:save']({}, Object.assign({}, validSave, { eventId: 'abc' }))
    expect(res.code).toBe(-20)
  })

  it('save 非法 mode → -20', async () => {
    const res = await ipc.handlers['prompt-library:save']({}, Object.assign({}, validSave, { mode: 'bogus' }))
    expect(res.code).toBe(-20)
  })

  it('save fragment 越界字段 → TEMPLATE_GATE_FAILED(-21)', async () => {
    const res = await ipc.handlers['prompt-library:save']({}, Object.assign({}, validSave, { content: { compositionType: '前后对比', color: 'red' } }))
    expect(res.code).toBe(-21)
  })

  it('activate 不存在 → TEMPLATE_NOT_FOUND(-22)，状态不变', async () => {
    const res = await ipc.handlers['prompt-library:activate']({}, { id: 'tpl_deadbeefdeadbeef' })
    expect(res.code).toBe(-22)
  })

  it('activate draft → code 0 + active', async () => {
    const saved = await ipc.handlers['prompt-library:save']({}, validSave)
    const res = await ipc.handlers['prompt-library:activate']({}, { id: saved.data.id, confirmedBy: 'a'.repeat(64) })
    expect(res.code).toBe(0)
    expect(res.data.state).toBe('active')
  })

  it('activate 非 draft → TEMPLATE_BAD_STATE(-23)', async () => {
    const saved = await ipc.handlers['prompt-library:save']({}, validSave)
    await ipc.handlers['prompt-library:activate']({}, { id: saved.data.id, confirmedBy: 'a'.repeat(64) })
    const again = await ipc.handlers['prompt-library:activate']({}, { id: saved.data.id, confirmedBy: 'a'.repeat(64) })
    expect(again.code).toBe(-23)
  })

  it('activate 缺 confirmedBy → TEMPLATE_INVALID(-20)，不改变状态', async () => {
    const saved = await ipc.handlers['prompt-library:save']({}, validSave)
    const res = await ipc.handlers['prompt-library:activate']({}, { id: saved.data.id })
    expect(res.code).toBe(-20)
    const list = await ipc.handlers['prompt-library:list']()
    expect(list.data.templates[0].state).toBe('draft')
  })

  it('get/activate 缺 id → TEMPLATE_INVALID(-20)；version 非法 → -20', async () => {
    expect((await ipc.handlers['prompt-library:get']({}, {})).code).toBe(-20)
    expect((await ipc.handlers['prompt-library:get']({}, { id: '' })).code).toBe(-20)
    expect((await ipc.handlers['prompt-library:activate']({}, {})).code).toBe(-20)
    const saved = await ipc.handlers['prompt-library:save']({}, validSave)
    for (const v of [0, 1.5, '2']) {
      const res = await ipc.handlers['prompt-library:get']({}, { id: saved.data.id, version: v })
      expect(res.code).toBe(-20)
    }
  })

  it('get 返回单模板详情；不存在 → -22', async () => {
    const saved = await ipc.handlers['prompt-library:save']({}, validSave)
    const res = await ipc.handlers['prompt-library:get']({}, { id: saved.data.id })
    expect(res.code).toBe(0)
    expect(res.data.id).toBe(saved.data.id)
    expect(res.data.sourceText).toBe('AI 改变教育')
    const miss = await ipc.handlers['prompt-library:get']({}, { id: 'tpl_deadbeefdeadbeef' })
    expect(miss.code).toBe(-22)
  })

  it('记忆库未启用（无 promptMemory）→ save 返回 UNKNOWN_ERROR(-99)，list 仍返回 P0 envelope', async () => {
    const ipc2 = mockIpcMain()
    registerHandlers(ipc2, { signalCollector: collector })
    const res = await ipc2.handlers['prompt-library:save']({}, validSave)
    expect(res.code).toBe(-99)
    const list = await ipc2.handlers['prompt-library:list']()
    expect(list.code).toBe(0)
    expect(list.data.templates).toEqual([])
    expect(list.data.evolution).toBe('enabled')
  })

  it('list 保持 P0 envelope：空库返回 {code:0, data:{templates:[], evolution:...}}', async () => {
    const ipc3 = mockIpcMain()
    registerHandlers(ipc3, { signalCollector: collector, promptMemory: memory })
    const res = await ipc3.handlers['prompt-library:list']()
    expect(res.code).toBe(0)
    expect(res.data.templates).toEqual([])
    expect(typeof res.data.evolution).toBe('string')
  })
})
