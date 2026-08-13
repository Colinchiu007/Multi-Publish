// @ts-check
// @vitest-environment node
/**
 * prompt-evolution.integration.test.js — memory.listActive → fingerprint.findSimilarTemplates 全链路（任务 4）
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createPromptMemory } = require('./prompt-memory')
const { createGovernance } = require('./governance')
const { findSimilarTemplates } = require('./fingerprint')

const silent = { info: () => {}, warn: () => {}, error: () => {} }

function makeEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-int-' + process.pid + '-'))
  const gov = createGovernance({ log: silent })
  const memory = createPromptMemory({ libraryRoot: root, governance: gov, log: silent })
  memory.load()
  return { root, gov, memory }
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

describe('integration: memory.listActive → fingerprint.findSimilarTemplates', () => {
  it('active 模板被检索命中（HIGH/full）；draft 不参与', () => {
    const { memory } = makeEnv()
    const r = memory.saveLearnt(fragmentArgs({ concept: 'AI 改变教育' }))
    // draft 阶段：检索不到
    let hits = findSimilarTemplates('AI 改变教育', memory.listActive({ engine: 'image' }), { rand: () => 0.5 })
    expect(hits[0].tier).toBe('NONE')
    memory.activate(r.id, { confirmedBy: 'a'.repeat(64) })
    hits = findSimilarTemplates('AI 改变教育', memory.listActive({ engine: 'image' }), { rand: () => 0.5 })
    expect(hits[0].templateId).toBe(r.id)
    expect(hits[0].tier).toBe('HIGH')
    expect(hits[0].refType).toBe('full')
  })

  it('deprecated 模板即使高分也不命中（置 deprecated 后 listActive 排除）', () => {
    const { memory } = makeEnv()
    const r = memory.saveLearnt(fragmentArgs({ concept: 'AI 改变教育' }))
    memory.activate(r.id, { confirmedBy: 'a'.repeat(64) })
    expect(findSimilarTemplates('AI 改变教育', memory.listActive({ engine: 'image' }), { rand: () => 0.5 })[0].templateId).toBe(r.id)
    memory.deprecate(r.id, { reason: 'manual' })
    const hits = findSimilarTemplates('AI 改变教育', memory.listActive({ engine: 'image' }), { rand: () => 0.5 })
    expect(hits[0].tier).toBe('NONE')
    expect(hits[0].templateId).toBe(null)
  })

  it('fingerprint 缺失模板不参与检索（fail-close），其余正常', () => {
    const { root, memory } = makeEnv()
    const r1 = memory.saveLearnt(fragmentArgs({ concept: 'AI 改变教育' }))
    const r2 = memory.saveLearnt(fragmentArgs({ concept: '医疗数字化转型', content: { compositionType: '概念隐喻', action: '融合', object: '数据' } }))
    memory.activate(r1.id, { confirmedBy: 'a'.repeat(64) })
    memory.activate(r2.id, { confirmedBy: 'a'.repeat(64) })
    const file = path.join(root, 'templates', r1.id + '@1.json')
    const tpl = JSON.parse(fs.readFileSync(file, 'utf8'))
    delete tpl.fingerprint
    fs.writeFileSync(file, JSON.stringify(tpl, null, 2), 'utf8')
    const mem2 = createPromptMemory({ libraryRoot: root, governance: makeGov2(), log: silent })
    mem2.load()
    const hits = findSimilarTemplates('AI 改变教育', mem2.listActive({ engine: 'image' }), { rand: () => 0.5 })
    // r1 被排除；r2（概念隐喻）对「AI 改变教育」无意图重叠 → NONE
    expect(hits[0].tier).toBe('NONE')
    expect(hits.some((h) => h.templateId === r1.id)).toBe(false)
  })

  it('engine 过滤：video 模板不污染 image 检索', () => {
    const { memory } = makeEnv()
    const img = memory.saveLearnt(fragmentArgs({ concept: 'AI 改变教育' }))
    const vid = memory.saveLearnt(fragmentArgs({ engine: 'video', mode: 'storyboard', eventId: 'evt_videotemplate001', concept: 'AI 改变教育', content: { compositionType: '前后对比', action: '放大', object: '书本' } }))
    memory.activate(img.id, { confirmedBy: 'a'.repeat(64) })
    memory.activate(vid.id, { confirmedBy: 'a'.repeat(64) })
    const imageHits = findSimilarTemplates('AI 改变教育', memory.listActive({ engine: 'image' }), { rand: () => 0.5 })
    expect(imageHits[0].templateId).toBe(img.id)
    const videoHits = findSimilarTemplates('AI 改变教育', memory.listActive({ engine: 'video' }), { rand: () => 0.5 })
    expect(videoHits[0].templateId).toBe(vid.id)
  })
})

function makeGov2() {
  return createGovernance({ log: silent })
}
