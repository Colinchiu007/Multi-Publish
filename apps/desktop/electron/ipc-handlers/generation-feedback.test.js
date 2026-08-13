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
