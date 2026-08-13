// @ts-check
// @vitest-environment node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createSignalCollector, monthKey } = require('./signal-collector')
const { validateGeneration, validateFeedback, SCHEMA_VERSION, ENGINES, FEEDBACK_TYPES } = require('./schema')

function makeRoot () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-evolution-' + process.pid + '-'))
}

function makeEvent (overrides) {
  return Object.assign({
    id: 'evt_test_123',
    schemaVersion: SCHEMA_VERSION,
    ts: new Date().toISOString(),
    engine: 'image',
    mode: 'story2video',
    context: { tenantId: 't1', userId: 'u1', sessionId: 's1', appVersion: '1.0.0' },
    input: { concept: 'AI 如何改变教育', creativeLevel: 7 },
    prompt: { raw: 'raw', optimized: 'optimized prompt', optimizedBy: 'prompt-engine', templateVersion: 'builtin-v1', librarySource: 'builtin' },
    provider: { name: 'flux', model: 'flux-pro' },
    result: { status: 'success', outputRefs: ['a.png'], durationMs: 1200 },
  }, overrides)
}

describe('prompt-evolution schema', () => {
  it('validateGeneration 通过合法事件', () => {
    const r = validateGeneration(makeEvent())
    expect(r.ok).toBe(true)
  })

  it('validateGeneration 拒绝缺 id/engine/mode/prompt.optimized/provider.name/result.status', () => {
    const cases = [
      { id: undefined },
      { engine: undefined },
      { mode: 'bogus' },
      { prompt: { optimized: '' } },
      { provider: { name: '' } },
      { result: { status: 'bogus' } },
    ]
    for (const c of cases) {
      const r = validateGeneration(makeEvent(c))
      expect(r.ok).toBe(false)
      expect(r.errors.length).toBeGreaterThan(0)
    }
  })

  it('validateGeneration 拒绝非法 creativeLevel 与 durationMs', () => {
    expect(validateGeneration(makeEvent({ input: { concept: 'x', creativeLevel: 11 } })).ok).toBe(false)
    expect(validateGeneration(makeEvent({ result: { status: 'success', outputRefs: [], durationMs: -1 } })).ok).toBe(false)
  })

  it('validateFeedback 要求 eventId 必填且 type 合法', () => {
    expect(validateFeedback({ eventId: 'e1', type: 'accepted', ts: new Date().toISOString() }).ok).toBe(true)
    expect(validateFeedback({ type: 'accepted', ts: new Date().toISOString() }).ok).toBe(false)
    expect(validateFeedback({ eventId: 'e1', type: 'bogus', ts: new Date().toISOString() }).ok).toBe(false)
  })

  it('枚举单一来源：FEEDBACK_TYPES/ENGINES 与校验一致', () => {
    expect(ENGINES).toEqual(['image', 'video'])
    expect(FEEDBACK_TYPES).toContain('accepted')
    expect(SCHEMA_VERSION).toBe(1)
  })
})

describe('prompt-evolution signal-collector', () => {
  let root
  let collector
  let warnSpy

  beforeEach(() => {
    root = makeRoot()
    warnSpy = { warn: [] }
    collector = createSignalCollector({
      logDir: root,
      config: { collection: 'enabled', userHashSalt: 'test-salt' },
      log: { info: () => {}, warn: (a, b) => warnSpy.warn.push([a, b]), error: () => {} },
    })
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('recordGeneration 写入当月 generation-log.jsonl 并返回 id', () => {
    const r = collector.recordGeneration(makeEvent())
    expect(r.ok).toBe(true)
    expect(r.id).toMatch(/^evt_/)
    const file = path.join(root, 'generation-log', monthKey(new Date()) + '.jsonl')
    expect(fs.existsSync(file)).toBe(true)
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0])
    expect(parsed.id).toBe(r.id)
    expect(parsed.context.userHash).toMatch(/^[0-9a-f]{64}$/)
    expect(parsed.context.userHash).not.toContain('u1')
    // 脱敏铁律：明文 userId 不得落盘（M1 修复）
    expect(parsed.context.userId).toBeUndefined()
    expect(lines[0]).not.toContain('"userId"')
  })

  it('recordFeedback 写入 feedback-log 且与主记录 join 成功（非孤儿）', () => {
    const gen = collector.recordGeneration(makeEvent())
    const fb = collector.recordFeedback({ eventId: gen.id, type: 'accepted', detail: {} })
    expect(fb.ok).toBe(true)
    expect(fb.orphan).toBe(false)
    const file = path.join(root, 'feedback-log', monthKey(new Date()) + '.jsonl')
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8').trim())
    expect(parsed.eventId).toBe(gen.id)
    expect(parsed.type).toBe('accepted')
  })

  it('recordFeedback 对不存在 eventId 标记 orphan 但仍写入', () => {
    const fb = collector.recordFeedback({ eventId: 'evt_missing', type: 'downloaded' })
    expect(fb.ok).toBe(true)
    expect(fb.orphan).toBe(true)
    expect(warnSpy.warn.length).toBeGreaterThan(0)
  })

  it('recordFeedback 支持 sessionId 解析到最新同 session 生成事件', () => {
    collector.recordGeneration(makeEvent({ context: { userId: 'u1', sessionId: 'run-1' }, input: { concept: 'A' } }))
    const latest = collector.recordGeneration(makeEvent({ context: { userId: 'u1', sessionId: 'run-1' }, input: { concept: 'B' } }))
    const fb = collector.recordFeedback({ sessionId: 'run-1', type: 'accepted' })
    expect(fb.ok).toBe(true)
    expect(fb.orphan).toBe(false)
    expect(fb.eventId).toBe(latest.id)
  })

  it('recordFeedback 无匹配 session 时写入孤儿反馈', () => {
    const fb = collector.recordFeedback({ sessionId: 'no-such-run', type: 'accepted' })
    expect(fb.ok).toBe(true)
    expect(fb.orphan).toBe(true)
    expect(fb.eventId).toBe('unknown-session')
  })

  it('recordFeedback 跨月 join：上月生成的事件不被误判为孤儿（M2 修复）', () => {
    // 手工构造上月 generation-log
    const prev = new Date()
    prev.setMonth(prev.getMonth() - 1)
    const prevFile = path.join(root, 'generation-log', monthKey(prev) + '.jsonl')
    fs.mkdirSync(path.dirname(prevFile), { recursive: true })
    fs.appendFileSync(prevFile, JSON.stringify({ id: 'evt_lastmonth', engine: 'image', schemaVersion: 1, ts: prev.toISOString(), context: { sessionId: 'run-old' } }) + '\n', 'utf8')
    const fb = collector.recordFeedback({ eventId: 'evt_lastmonth', type: 'downloaded' })
    expect(fb.ok).toBe(true)
    expect(fb.orphan).toBe(false)
  })

  it('recordGeneration 校验失败返回 invalid-event 且不写文件', () => {
    const r = collector.recordGeneration(makeEvent({ provider: { name: '' } }))
    expect(r.ok).toBe(false)
    expect(r.error).toBe('invalid-event')
    expect(fs.existsSync(path.join(root, 'generation-log'))).toBe(false)
  })

  it('写入失败不阻断：日志路径为文件时追加抛错返回 write-failed', () => {
    const bad = createSignalCollector({ logDir: root, log: { info: () => {}, warn: () => {}, error: () => {} } })
    // 制造 generation-log 路径冲突：把父目录占为文件
    fs.mkdirSync(path.join(root, 'generation-log'))
    fs.writeFileSync(path.join(root, 'generation-log', 'conflict'), 'x')
    // 覆盖为文件使 mkdir/append 失败
    fs.rmSync(path.join(root, 'generation-log'), { recursive: true })
    fs.writeFileSync(path.join(root, 'generation-log'), 'file')
    const r = bad.recordGeneration(makeEvent())
    expect(r.ok).toBe(false)
    expect(r.error).toBe('write-failed')
  })

  it('muted 模式停写', () => {
    const muted = createSignalCollector({ logDir: root, config: { collection: 'muted' }, log: { info: () => {}, warn: () => {}, error: () => {} } })
    expect(muted.isEnabled()).toBe(false)
    const r = muted.recordGeneration(makeEvent())
    expect(r.ok).toBe(false)
    expect(r.error).toBe('collection-muted')
    expect(fs.existsSync(path.join(root, 'generation-log'))).toBe(false)
  })

  it('getStats 按 engine 聚合 acceptRate/regenerateRate/avgDurationMs', () => {
    const g1 = collector.recordGeneration(makeEvent({ engine: 'image', result: { status: 'success', outputRefs: [], durationMs: 1000 } }))
    const g2 = collector.recordGeneration(makeEvent({ engine: 'image', result: { status: 'success', outputRefs: [], durationMs: 3000 } }))
    const g3 = collector.recordGeneration(makeEvent({ engine: 'video', mode: 'storyboard', result: { status: 'success', outputRefs: [], durationMs: 5000 } }))
    collector.recordFeedback({ eventId: g1.id, type: 'accepted' })
    collector.recordFeedback({ eventId: g2.id, type: 'regenerated' })
    collector.recordFeedback({ eventId: g3.id, type: 'accepted' })

    const all = collector.getStats()
    const img = all.find((s) => s.engine === 'image')
    expect(img.shown).toBe(2)
    expect(img.accepted).toBe(1)
    expect(img.regenerated).toBe(1)
    expect(img.acceptRate).toBe(0.5)
    expect(img.regenerateRate).toBe(0.5)
    expect(img.avgDurationMs).toBe(2000)

    const vid = all.find((s) => s.engine === 'video')
    expect(vid.shown).toBe(1)
    expect(vid.acceptRate).toBe(1)

    const filtered = collector.getStats({ engine: 'image' })
    expect(filtered).toHaveLength(1)
  })

  it('JSONL 尾部残缺行容忍', () => {
    const gen = collector.recordGeneration(makeEvent())
    const file = path.join(root, 'generation-log', monthKey(new Date()) + '.jsonl')
    fs.appendFileSync(file, '\n{"broken": true\n')
    const fb = collector.recordFeedback({ eventId: gen.id, type: 'accepted' })
    expect(fb.ok).toBe(true)
    expect(fb.orphan).toBe(false)
  })

  it('cleanup 删除过期月份文件（真实布局 YYYY-MM.jsonl）', () => {
    const oldFile = path.join(root, 'generation-log', '2026-01.jsonl')
    fs.mkdirSync(path.dirname(oldFile), { recursive: true })
    fs.writeFileSync(oldFile, 'x')
    collector.cleanup()
    expect(fs.existsSync(oldFile)).toBe(false)
  })

  it('cleanup 保留当前月份文件', () => {
    const curFile = path.join(root, 'generation-log', monthKey(new Date()) + '.jsonl')
    fs.mkdirSync(path.dirname(curFile), { recursive: true })
    fs.writeFileSync(curFile, 'x')
    collector.cleanup()
    expect(fs.existsSync(curFile)).toBe(true)
  })
})
