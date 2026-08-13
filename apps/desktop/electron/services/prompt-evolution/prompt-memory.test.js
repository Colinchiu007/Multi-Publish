// @ts-check
// @vitest-environment node
/**
 * prompt-memory.test.js — 记忆库 V0（TDD，P1b 记忆库+治理）
 * 规格：openspec/changes/prompt-engine-evolution-p1b-memory
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createPromptMemory } = require('./prompt-memory')
const { createGovernance } = require('./governance')
const { buildFingerprint, DICT_VERSION } = require('./fingerprint')
const { ERROR } = require('../../core/error-codes')

const silent = { info: () => {}, warn: () => {}, error: () => {} }

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pm-' + process.pid + '-'))
}

function makeMemory({ root, governanceConfig, statsProvider, log } = {}) {
  const libRoot = root || makeRoot()
  const gov = createGovernance({ config: governanceConfig, statsProvider, log: log || silent })
  const memory = createPromptMemory({ libraryRoot: libRoot, governance: gov, statsProvider, config: {}, log: log || silent })
  memory.load()
  return { root: libRoot, gov, memory }
}

function fragmentArgs(overrides) {
  return Object.assign(
    {
      engine: 'image', mode: 'story2video', type: 'composition',
      content: { compositionType: '前后对比', action: '放大', object: '书本', creativeLevel: 7 },
      concept: 'AI 改变教育', eventId: 'evt_1234567890abcdef',
    },
    overrides,
  )
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function templateDir(root) {
  return path.join(root, 'templates')
}

function findTmpFiles(root) {
  const out = []
  for (const f of fs.readdirSync(root)) if (f.includes('.tmp-')) out.push(f)
  return out
}

describe('prompt-memory: saveLearnt 入库', () => {
  it('合法 fragment 入库 → draft，文件落盘（library.json + templates/<id>@1.json）', () => {
    const { root, memory } = makeMemory()
    const r = memory.saveLearnt(fragmentArgs())
    expect(r.ok).toBe(true)
    expect(r.state).toBe('draft')
    expect(r.version).toBe(1)
    expect(r.id).toMatch(/^tpl_[0-9a-f]{16}$/)
    expect(fs.existsSync(path.join(root, 'library.json'))).toBe(true)
    const tpl = readJson(path.join(templateDir(root), r.id + '@1.json'))
    expect(tpl.id).toBe(r.id)
    expect(tpl.state).toBe('draft')
    expect(tpl.source).toBe('learnt')
    expect(tpl.sourceText).toBe('AI 改变教育')
    expect(tpl.fingerprint.dictVersion).toBe(DICT_VERSION)
    expect(tpl.guard.checksum).toMatch(/^[0-9a-f]{64}$/)
    expect(tpl.guard.gateRules).toEqual(expect.arrayContaining(['structure', 'compliance', 'length', 'noSecrets', 'dedup']))
    expect(tpl.guard.evaluatorVersion).toBe('rule-v0')
    expect(tpl.provenance.learnedFrom).toBe('evt_1234567890abcdef')
  })

  it('四类参数越界（color）→ 门禁错误码且不产生模板文件', () => {
    const { root, memory } = makeMemory()
    const r = memory.saveLearnt(fragmentArgs({ content: { compositionType: '前后对比', color: 'red' } }))
    expect(r.ok).toBe(false)
    expect(r.code).toBe(ERROR.TEMPLATE_GATE_FAILED)
    expect(fs.existsSync(templateDir(root))).toBe(false)
  })

  it('mode 非法 → TEMPLATE_INVALID', () => {
    const { root, memory } = makeMemory()
    const r = memory.saveLearnt(fragmentArgs({ mode: 'bogus' }))
    expect(r.ok).toBe(false)
    expect(r.code).toBe(ERROR.TEMPLATE_INVALID)
    expect(fs.existsSync(templateDir(root))).toBe(false)
  })

  it('eventId 缺失或非 evt_ 前缀 → TEMPLATE_INVALID', () => {
    const { memory } = makeMemory()
    expect(memory.saveLearnt(fragmentArgs({ eventId: undefined })).code).toBe(ERROR.TEMPLATE_INVALID)
    expect(memory.saveLearnt(fragmentArgs({ eventId: 'abc' })).code).toBe(ERROR.TEMPLATE_INVALID)
    expect(memory.saveLearnt(fragmentArgs({ eventId: 'evt_' })).code).toBe(ERROR.TEMPLATE_INVALID)
  })

  it('concept 缺失/空 → TEMPLATE_INVALID；concept 超长截断到 2000', () => {
    const { memory } = makeMemory()
    expect(memory.saveLearnt(fragmentArgs({ concept: '' })).code).toBe(ERROR.TEMPLATE_INVALID)
    const long = '教'.repeat(3000)
    const r = memory.saveLearnt(fragmentArgs({ concept: long }))
    expect(r.ok).toBe(true)
    const tpl = memory.get(r.id)
    expect(tpl.sourceText.length).toBe(2000)
  })

  it('fingerprint 由 concept 计算落盘（非 content）', () => {
    const { memory } = makeMemory()
    const r = memory.saveLearnt(fragmentArgs({ concept: 'AI 改变教育' }))
    const tpl = memory.get(r.id)
    expect(tpl.fingerprint.domains).toContain('tech')
    expect(tpl.fingerprint.compositionIntents).toContain('前后对比')
    // 无意图概念 → compositionIntents 为空（不虚构意图）
    const r2 = memory.saveLearnt(fragmentArgs({ concept: '医疗数字化转型' }))
    expect(memory.get(r2.id).fingerprint.compositionIntents).toEqual([])
  })
})

describe('prompt-memory: 加载防御', () => {
  it('dictVersion 变更 → 以 sourceText 惰性重算指纹后参与检索', () => {
    const { root, memory } = makeMemory()
    const r = memory.saveLearnt(fragmentArgs({ concept: 'AI 改变教育' }))
    memory.activate(r.id, { confirmedBy: 'a'.repeat(64) })
    // 手工改坏 dictVersion（模拟词典升级）
    const file = path.join(templateDir(root), r.id + '@1.json')
    const tpl = readJson(file)
    tpl.fingerprint.dictVersion = '2026-01-01'
    fs.writeFileSync(file, JSON.stringify(tpl, null, 2), 'utf8')
    const mem2 = createPromptMemory({ libraryRoot: root, governance: makeGov2(), log: silent })
    mem2.load()
    const loaded = mem2.get(r.id)
    expect(loaded.fingerprint.dictVersion).toBe(DICT_VERSION)
    expect(mem2.listActive({ engine: 'image' }).map((x) => x.id)).toContain(r.id)
  })

  it('dictVersion 不匹配且无 sourceText → 标 stale 不参与检索（告警）', () => {
    const { root, memory } = makeMemory()
    const r = memory.saveLearnt(fragmentArgs())
    const file = path.join(templateDir(root), r.id + '@1.json')
    const tpl = readJson(file)
    tpl.fingerprint.dictVersion = '2026-01-01'
    delete tpl.sourceText
    fs.writeFileSync(file, JSON.stringify(tpl, null, 2), 'utf8')
    const warns = []
    const mem2 = createPromptMemory({ libraryRoot: root, governance: makeGov2(), log: { info: () => {}, warn: (...a) => warns.push(a), error: () => {} } })
    mem2.load()
    expect(mem2.listActive({ engine: 'image' })).toEqual([])
    expect(warns.length).toBeGreaterThan(0)
  })

  it('fingerprint 缺失/不可解析 → fail-close 不参与检索，其余模板可用', () => {
    const { root, memory } = makeMemory()
    const r1 = memory.saveLearnt(fragmentArgs({ concept: 'AI 改变教育' }))
    const r2 = memory.saveLearnt(fragmentArgs({ concept: '医疗数字化转型', content: { compositionType: '概念隐喻', action: '融合', object: '数据' } }))
    memory.activate(r1.id, { confirmedBy: 'a'.repeat(64) })
    memory.activate(r2.id, { confirmedBy: 'a'.repeat(64) })
    // 破坏 r1 的 fingerprint
    const f1 = path.join(templateDir(root), r1.id + '@1.json')
    const t1 = readJson(f1)
    delete t1.fingerprint
    fs.writeFileSync(f1, JSON.stringify(t1, null, 2), 'utf8')
    const warns = []
    const mem2 = createPromptMemory({ libraryRoot: root, governance: makeGov2(), log: { info: () => {}, warn: (...a) => warns.push(a), error: () => {} } })
    mem2.load()
    const active = mem2.listActive({ engine: 'image' })
    expect(active.map((x) => x.id)).not.toContain(r1.id)
    expect(active.map((x) => x.id)).toContain(r2.id)
    expect(warns.length).toBeGreaterThan(0)
    // get 仍可访问（仅不参与检索）
    expect(mem2.get(r1.id)).not.toBeNull()
  })

  it('library.json 损坏 → fail-close 重建空库并保留 .corrupt 备份', () => {
    const { root, memory } = makeMemory()
    memory.saveLearnt(fragmentArgs())
    fs.writeFileSync(path.join(root, 'library.json'), '{broken json', 'utf8')
    const mem2 = createPromptMemory({ libraryRoot: root, governance: makeGov2(), log: silent })
    const res = mem2.load()
    expect(res.ok).toBe(true)
    expect(mem2.list()).toEqual([])
    expect(fs.readdirSync(root).some((f) => f.startsWith('library.json.corrupt-'))).toBe(true)
  })

  it('单模板文件损坏 → 跳过该模板，其余保持可用', () => {
    const { root, memory } = makeMemory()
    const r1 = memory.saveLearnt(fragmentArgs({ concept: 'AI 改变教育' }))
    const r2 = memory.saveLearnt(fragmentArgs({ concept: '医疗数字化转型', content: { compositionType: '概念隐喻', action: '融合', object: '数据' } }))
    memory.activate(r1.id, { confirmedBy: 'a'.repeat(64) })
    memory.activate(r2.id, { confirmedBy: 'a'.repeat(64) })
    fs.writeFileSync(path.join(templateDir(root), r1.id + '@1.json'), '{broken', 'utf8')
    const mem2 = createPromptMemory({ libraryRoot: root, governance: makeGov2(), log: silent })
    mem2.load()
    expect(mem2.get(r1.id)).toBeNull()
    expect(mem2.listActive({ engine: 'image' }).map((x) => x.id)).toEqual([r2.id])
  })
})

describe('prompt-memory: 版本化优先级（m9）', () => {
  it('checksum 与 active 模板完全碰撞 → 拒绝', () => {
    const { memory } = makeMemory()
    const r1 = memory.saveLearnt(fragmentArgs())
    memory.activate(r1.id, { confirmedBy: 'a'.repeat(64) })
    const r2 = memory.saveLearnt(fragmentArgs({ eventId: 'evt_ffffffffffffffff' }))
    expect(r2.ok).toBe(false)
    expect(r2.code).toBe(ERROR.TEMPLATE_GATE_FAILED)
  })

  it('同 learnedFrom + 指纹相似 → 升版（同 id，versions [1,2]，新版本回 draft）', () => {
    const { root, memory } = makeMemory()
    const r1 = memory.saveLearnt(fragmentArgs())
    memory.activate(r1.id, { confirmedBy: 'a'.repeat(64) })
    const r2 = memory.saveLearnt(fragmentArgs({ content: { compositionType: '前后对比', action: '缩小', object: '书本' } }))
    expect(r2.ok).toBe(true)
    expect(r2.id).toBe(r1.id)
    expect(r2.version).toBe(2)
    expect(r2.state).toBe('draft')
    const idx = readJson(path.join(root, 'library.json'))
    expect(idx.items[r1.id].versions).toEqual([1, 2])
    expect(idx.items[r1.id].latestVersion).toBe(2)
    expect(idx.items[r1.id].state).toBe('draft')
    expect(fs.existsSync(path.join(templateDir(root), r1.id + '@2.json'))).toBe(true)
  })

  it('不同 learnedFrom → 新 id', () => {
    const { memory } = makeMemory()
    const r1 = memory.saveLearnt(fragmentArgs())
    const r2 = memory.saveLearnt(fragmentArgs({ eventId: 'evt_aaaaaaaaaaaaaaaa', content: { compositionType: '前后对比', action: '缩小', object: '书本' } }))
    expect(r2.ok).toBe(true)
    expect(r2.id).not.toBe(r1.id)
    expect(r2.version).toBe(1)
  })

  it('同 learnedFrom 多候选 → 升版到 score 最高者，不取插入序首个（W5）', () => {
    const { root, memory } = makeMemory()
    const evt = 'evt_w5multi000000'
    const mkFp = (domains, intents) => ({ schemaVersion: 1, dictVersion: DICT_VERSION, domains, compositionIntents: intents, topics: [], tone: 'peaceful' })
    const mkRec = (id, fp) => ({
      id, version: 1, engine: 'image', mode: 'story2video', type: 'composition',
      content: { compositionType: '前后对比', action: '放大', object: '书本', creativeLevel: 7 },
      sourceText: 'seed', fingerprint: fp, source: 'learnt',
      provenance: { learnedFrom: evt, acceptedEvents: [] },
      stats: { uses: 0, acceptRate: 0, avgScore: null, avgCost: 0, lastUsedAt: null },
      state: 'active',
      guard: { checksum: 'checksum-' + id, validatedAt: '2026-08-13T00:00:00.000Z', gateRules: ['structure'], evaluatorVersion: 'rule-v0' },
      createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z',
      confirmedBy: 'a'.repeat(64),
    })
    fs.mkdirSync(templateDir(root), { recursive: true })
    // A 高分（tech+education 两域重叠 → HIGH 8 分）；B 低分（仅 tech → MID 6 分）；插入序 A 在前
    fs.writeFileSync(path.join(templateDir(root), 'tpl_w5a@1.json'), JSON.stringify(mkRec('tpl_w5a', mkFp(['tech', 'education'], ['前后对比']))))
    fs.writeFileSync(path.join(templateDir(root), 'tpl_w5b@1.json'), JSON.stringify(mkRec('tpl_w5b', mkFp(['tech'], ['前后对比']))))
    fs.writeFileSync(path.join(root, 'library.json'), JSON.stringify({
      schemaVersion: 1, dictVersion: DICT_VERSION,
      items: {
        tpl_w5a: { id: 'tpl_w5a', engine: 'image', mode: 'story2video', type: 'composition', versions: [1], latestVersion: 1, state: 'active', createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' },
        tpl_w5b: { id: 'tpl_w5b', engine: 'image', mode: 'story2video', type: 'composition', versions: [1], latestVersion: 1, state: 'active', createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' },
      },
    }))
    memory.load()
    const r = memory.saveLearnt(fragmentArgs({ eventId: evt, concept: 'AI 改变教育对比' }))
    expect(r.ok).toBe(true)
    expect(r.id).toBe('tpl_w5a') // score(A)=8 HIGH > score(B)=6 MID
    expect(r.version).toBe(2)
    expect(memory.get('tpl_w5b').version).toBe(1)
  })
})

describe('prompt-memory: 状态机入口', () => {
  it('activate 不存在 → TEMPLATE_NOT_FOUND', () => {
    const { memory } = makeMemory()
    expect(memory.activate('tpl_deadbeefdeadbeef', {}).code).toBe(ERROR.TEMPLATE_NOT_FOUND)
  })

  it('activate 缺 confirmedBy / 非法 userHash → TEMPLATE_INVALID；合法 → active（W2 强制人工确认归因）', () => {
    const { memory } = makeMemory()
    const r = memory.saveLearnt(fragmentArgs())
    expect(memory.activate(r.id, {}).code).toBe(ERROR.TEMPLATE_INVALID)
    const bad = memory.activate(r.id, { confirmedBy: 'not-a-hash' })
    expect(bad.code).toBe(ERROR.TEMPLATE_INVALID)
    const ok = memory.activate(r.id, { confirmedBy: 'a'.repeat(64) })
    expect(ok.ok).toBe(true)
    expect(ok.state).toBe('active')
    expect(memory.get(r.id).confirmedBy).toBe('a'.repeat(64))
  })

  it('非法流转拒绝：activate active → BAD_STATE；deprecate draft → BAD_STATE；disable active → BAD_STATE', () => {
    const { memory } = makeMemory()
    const r = memory.saveLearnt(fragmentArgs())
    expect(memory.deprecate(r.id, {}).code).toBe(ERROR.TEMPLATE_BAD_STATE)
    expect(memory.disable(r.id).code).toBe(ERROR.TEMPLATE_BAD_STATE)
    memory.activate(r.id, { confirmedBy: 'a'.repeat(64) })
    expect(memory.activate(r.id, { confirmedBy: 'a'.repeat(64) }).code).toBe(ERROR.TEMPLATE_BAD_STATE)
    expect(memory.disable(r.id).code).toBe(ERROR.TEMPLATE_BAD_STATE)
    memory.deprecate(r.id, { reason: 'test' })
    expect(memory.get(r.id).state).toBe('deprecated')
    expect(memory.deprecate(r.id, {}).code).toBe(ERROR.TEMPLATE_BAD_STATE)
    expect(memory.disable(r.id).ok).toBe(true)
    expect(memory.get(r.id).state).toBe('disabled')
  })
})

describe('prompt-memory: listActive / list / get', () => {
  it('listActive 仅 active + fingerprint 有效 + engine 过滤；draft/deprecated/disabled 不命中', () => {
    const { memory } = makeMemory()
    const r1 = memory.saveLearnt(fragmentArgs({ concept: 'AI 改变教育' }))
    const r2 = memory.saveLearnt(fragmentArgs({ concept: '医疗数字化转型', content: { compositionType: '概念隐喻', action: '融合', object: '数据' } }))
    expect(memory.listActive({ engine: 'image' })).toEqual([]) // 全是 draft
    memory.activate(r1.id, { confirmedBy: 'a'.repeat(64) })
    memory.activate(r2.id, { confirmedBy: 'a'.repeat(64) })
    expect(memory.listActive({ engine: 'image' }).map((x) => x.id).sort()).toEqual([r1.id, r2.id].sort())
    expect(memory.listActive({ engine: 'video' })).toEqual([])
    memory.deprecate(r1.id, {})
    expect(memory.listActive({ engine: 'image' }).map((x) => x.id)).toEqual([r2.id])
    memory.deprecate(r2.id, {})
    memory.disable(r2.id)
    expect(memory.listActive({ engine: 'image' })).toEqual([])
  })

  it('listActive 返回检索契约 {id, fingerprint, stats}', () => {
    const { memory } = makeMemory()
    const r = memory.saveLearnt(fragmentArgs({ concept: 'AI 改变教育' }))
    memory.activate(r.id, { confirmedBy: 'a'.repeat(64) })
    const active = memory.listActive({ engine: 'image' })
    expect(active[0]).toEqual({ id: r.id, fingerprint: memory.get(r.id).fingerprint, stats: expect.objectContaining({ acceptRate: 0 }) })
  })

  it('list 支持 state/engine/type 过滤', () => {
    const { memory } = makeMemory()
    const r1 = memory.saveLearnt(fragmentArgs({ concept: 'AI 改变教育' }))
    const r2 = memory.saveLearnt(fragmentArgs({ concept: '医疗数字化转型', content: { compositionType: '概念隐喻', action: '融合', object: '数据' } }))
    expect(memory.list({ state: 'draft' })).toHaveLength(2)
    memory.activate(r1.id, { confirmedBy: 'a'.repeat(64) })
    expect(memory.list({ state: 'active' }).map((x) => x.id)).toEqual([r1.id])
    expect(memory.list({ engine: 'video' })).toEqual([])
    expect(memory.list({ type: 'composition' })).toHaveLength(2)
    expect(memory.list({ type: 'full' })).toEqual([])
  })

  it('get(id) / get(id, version) / get 不存在 → null', () => {
    const { memory } = makeMemory()
    const r = memory.saveLearnt(fragmentArgs())
    memory.activate(r.id, { confirmedBy: 'a'.repeat(64) })
    const r2 = memory.saveLearnt(fragmentArgs({ content: { compositionType: '前后对比', action: '缩小', object: '书本' } }))
    expect(memory.get(r.id).version).toBe(2)
    expect(memory.get(r.id, 1).version).toBe(1)
    expect(memory.get(r.id, 99)).toBeNull()
    expect(memory.get('tpl_nonexistent0000')).toBeNull()
  })
})

describe('prompt-memory: 原子写与完整性', () => {
  it('保存后无 .tmp 残留，文件可解析', () => {
    const { root, memory } = makeMemory()
    memory.saveLearnt(fragmentArgs())
    memory.saveLearnt(fragmentArgs({ content: { compositionType: '前后对比', action: '缩小', object: '书本' } }))
    expect(findTmpFiles(root)).toEqual([])
    expect(findTmpFiles(templateDir(root))).toEqual([])
  })

  it('checkRollbacks：注入低 acceptRate → 自动 deprecate + 冷却幂等', () => {
    const { root, memory } = makeMemory({
      statsProvider: () => ({ acceptRateSeries: [0.1, 0.1, 0.1], avgScoreSeries: [] }),
    })
    const r = memory.saveLearnt(fragmentArgs())
    memory.activate(r.id, { confirmedBy: 'a'.repeat(64) })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const decisions = memory.checkRollbacks(now)
    expect(decisions).toHaveLength(1)
    expect(decisions[0].id).toBe(r.id)
    expect(decisions[0].reason).toBe('sliding-window-rollback')
    expect(memory.get(r.id).state).toBe('deprecated')
    expect(memory.get(r.id).cooldownUntil).toBe(decisions[0].cooldownUntil)
    // 冷却期幂等：再次运行不再产生决定（已 deprecated 不再参与 active 候选）
    expect(memory.checkRollbacks(now)).toEqual([])
  })

  it('升版继承父版本 cooldownUntil（W3 冷却语义不丢失）', () => {
    const { memory } = makeMemory({
      statsProvider: () => ({ acceptRateSeries: [0.1, 0.1, 0.1], avgScoreSeries: [] }),
    })
    const r1 = memory.saveLearnt(fragmentArgs())
    memory.activate(r1.id, { confirmedBy: 'a'.repeat(64) })
    const now = new Date('2026-08-13T12:00:00.000Z')
    memory.checkRollbacks(now)
    const cooldown = memory.get(r1.id).cooldownUntil
    expect(cooldown).toBeTruthy()
    const r2 = memory.saveLearnt(fragmentArgs({ content: { compositionType: '前后对比', action: '缩小', object: '书本' } }))
    expect(r2.ok).toBe(true)
    expect(r2.id).toBe(r1.id)
    expect(memory.get(r1.id).cooldownUntil).toBe(cooldown)
  })
})

function makeGov2() {
  return createGovernance({ log: silent })
}
