// @ts-check
// @vitest-environment node
const fs = require('fs')
const os = require('os')
const path = require('path')
const registerHandlers = require('./generation-feedback')
const { createSignalCollector, monthKey } = require('../services/prompt-evolution/signal-collector')
const { createPromptMemory } = require('../services/prompt-evolution/prompt-memory')
const { createGovernance } = require('../services/prompt-evolution/governance')
const { ERROR } = require('../core/error-codes')

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

describe('generation-feedback: prompt-library 记忆库 IPC', () => {
  let root
  let ipc
  let collector
  let memory
  let governance

  function makeMemoryEnv () {
    const memRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-library-ipc-' + process.pid + '-'))
    memory = createPromptMemory({
      libraryRoot: path.join(memRoot, 'prompt-library'),
      config: {},
      statsProvider: () => null,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    })
    memory.load()
    governance = createGovernance({
      config: {},
      memory,
      statsProvider: () => null,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    })
  }

  beforeEach(() => {
    root = makeRoot()
    ipc = mockIpcMain()
    collector = makeCollector(root)
    makeMemoryEnv()
    registerHandlers(ipc, { signalCollector: collector, promptMemory: memory, governance })
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('注册 prompt-library:get/save/activate 通道', () => {
    expect(typeof ipc.handlers['prompt-library:get']).toBe('function')
    expect(typeof ipc.handlers['prompt-library:save']).toBe('function')
    expect(typeof ipc.handlers['prompt-library:activate']).toBe('function')
  })

  it('save 合法入参进入 draft，返回 id/version/state', async () => {
    const res = await ipc.handlers['prompt-library:save']({}, {
      engine: 'image', mode: 'storyboard', type: 'fragment',
      content: { compositionType: '前后对比', action: '放大', object: '书本', creativeLevel: 7 },
      concept: 'AI 改变教育', eventId: 'evt_' + 'a'.repeat(16),
    })
    expect(res.code).toBe(0)
    expect(res.data.state).toBe('draft')
    expect(res.data.id).toMatch(/^tpl_/)
    expect(res.data.version).toBe(1)
  })

  it('save 缺 eventId 拒绝', async () => {
    const res = await ipc.handlers['prompt-library:save']({}, {
      engine: 'image', mode: 'storyboard', type: 'fragment',
      content: { compositionType: '前后对比', action: '放大', object: '书本', creativeLevel: 7 },
      concept: 'AI 改变教育',
    })
    expect(res.code).toBe(ERROR.TEMPLATE_INVALID)
  })

  it('save 非法 eventId（非 evt_ 前缀）拒绝', async () => {
    const res = await ipc.handlers['prompt-library:save']({}, {
      engine: 'image', mode: 'storyboard', type: 'fragment',
      content: { compositionType: '前后对比', action: '放大', object: '书本', creativeLevel: 7 },
      concept: 'AI 改变教育', eventId: 'bad-id',
    })
    expect(res.code).toBe(ERROR.TEMPLATE_INVALID)
  })

  it('save 非法 mode 拒绝', async () => {
    const res = await ipc.handlers['prompt-library:save']({}, {
      engine: 'image', mode: 'magic', type: 'fragment',
      content: { compositionType: '前后对比', action: '放大', object: '书本', creativeLevel: 7 },
      concept: 'AI 改变教育', eventId: 'evt_' + 'a'.repeat(16),
    })
    expect(res.code).toBe(ERROR.TEMPLATE_INVALID)
  })

  it('save 越界字段（含 color）门禁拒绝', async () => {
    const res = await ipc.handlers['prompt-library:save']({}, {
      engine: 'image', mode: 'storyboard', type: 'fragment',
      content: { compositionType: '前后对比', color: 'red' },
      concept: 'AI 改变教育', eventId: 'evt_' + 'a'.repeat(16),
    })
    expect(res.code).toBe(ERROR.TEMPLATE_GATE_FAILED)
  })

  it('list 返回已入库模板（保持 P0 envelope）', async () => {
    await ipc.handlers['prompt-library:save']({}, {
      engine: 'image', mode: 'storyboard', type: 'fragment',
      content: { compositionType: '前后对比', action: '放大', object: '书本', creativeLevel: 7 },
      concept: 'AI 改变教育', eventId: 'evt_' + 'a'.repeat(16),
    })
    const res = await ipc.handlers['prompt-library:list']()
    expect(res.code).toBe(0)
    expect(res.data.templates.length).toBe(1)
    expect(res.data.evolution).toBe('enabled')
  })

  it('get 返回单模板详情', async () => {
    const saved = await ipc.handlers['prompt-library:save']({}, {
      engine: 'image', mode: 'storyboard', type: 'fragment',
      content: { compositionType: '前后对比', action: '放大', object: '书本', creativeLevel: 7 },
      concept: 'AI 改变教育', eventId: 'evt_' + 'a'.repeat(16),
    })
    const res = await ipc.handlers['prompt-library:get']({}, { id: saved.data.id })
    expect(res.code).toBe(0)
    expect(res.data.id).toBe(saved.data.id)
    expect(res.data.state).toBe('draft')
  })

  it('get 不存在的模板返回 NOT_FOUND', async () => {
    const res = await ipc.handlers['prompt-library:get']({}, { id: 'tpl_nonexistent' })
    expect(res.code).toBe(ERROR.TEMPLATE_NOT_FOUND)
  })

  it('activate draft→active', async () => {
    const saved = await ipc.handlers['prompt-library:save']({}, {
      engine: 'image', mode: 'storyboard', type: 'fragment',
      content: { compositionType: '前后对比', action: '放大', object: '书本', creativeLevel: 7 },
      concept: 'AI 改变教育', eventId: 'evt_' + 'a'.repeat(16),
    })
    const res = await ipc.handlers['prompt-library:activate']({}, { id: saved.data.id, confirmedBy: 'user-hash' })
    expect(res.code).toBe(0)
    expect(res.data.state).toBe('active')
    // 激活后可被 listActive 命中
    expect(memory.listActive({ engine: 'image' }).length).toBe(1)
  })

  it('activate 不存在的模板返回 BAD_STATE', async () => {
    const res = await ipc.handlers['prompt-library:activate']({}, { id: 'tpl_nonexistent' })
    expect(res.code).toBe(ERROR.TEMPLATE_BAD_STATE)
  })

  it('记忆库未启用时 list 返回 P0 骨架', async () => {
    const ipc2 = mockIpcMain()
    registerHandlers(ipc2, { signalCollector: collector }) // 无 promptMemory
    const res = await ipc2.handlers['prompt-library:list']()
    expect(res.code).toBe(0)
    expect(res.data.templates).toEqual([])
  })

  it('EC.TEMPLATE_* 数值断言', () => {
    expect(ERROR.TEMPLATE_INVALID).toBe(-20)
    expect(ERROR.TEMPLATE_GATE_FAILED).toBe(-21)
    expect(ERROR.TEMPLATE_NOT_FOUND).toBe(-22)
    expect(ERROR.TEMPLATE_BAD_STATE).toBe(-23)
  })
})
