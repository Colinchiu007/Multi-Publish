// @ts-check
// @vitest-environment node
/**
 * prompt-memory.integration.test.js — 记忆库 → 指纹检索全链路集成测试
 *
 * 规格：openspec/changes/prompt-engine-evolution-p1b-memory §9 集成
 * 覆盖：memory.listActive → fingerprint.findSimilarTemplates 全链路
 *       （active 命中 / deprecated 不命中 / fingerprint 缺失不参与）
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createPromptMemory } = require('./prompt-memory')
const { findSimilarTemplates } = require('./fingerprint')

function tmpRoot () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mp-prompt-memory-int-'))
}

function makeMemory () {
  const root = tmpRoot()
  const memory = createPromptMemory({
    libraryRoot: path.join(root, 'prompt-library'),
    config: {},
    statsProvider: () => null,
    log: { info: () => {}, warn: () => {}, error: () => {} },
  })
  memory.load()
  return { memory, root }
}

function saveAndActivate (memory, overrides = {}) {
  const r = memory.saveLearnt({
    engine: 'image',
    mode: 'storyboard',
    type: 'fragment',
    content: { compositionType: '前后对比', action: '放大', object: '书本', creativeLevel: 7 },
    concept: 'AI 改变教育',
    eventId: 'evt_' + Math.random().toString(16).slice(2, 18),
    ...overrides,
  })
  expect(r.ok).toBe(true)
  memory.activate(r.id, { confirmedBy: 'user-hash' })
  return r.id
}

describe('prompt-memory → fingerprint 全链路', () => {
  it('active 模板可被 findSimilarTemplates 命中', () => {
    const { memory } = makeMemory()
    const id = saveAndActivate(memory)
    // 从记忆库取 active 模板，喂给指纹检索
    const activeTemplates = memory.listActive({ engine: 'image' })
    expect(activeTemplates.length).toBe(1)
    const results = findSimilarTemplates('AI 改变教育', activeTemplates, { rand: () => 0.9 })
    // 概念与模板指纹相似，应命中
    expect(results[0].templateId).toBe(id)
    expect(results[0].tier).not.toBe('NONE')
  })

  it('deprecated 模板不参与检索', () => {
    const { memory } = makeMemory()
    const id = saveAndActivate(memory)
    memory.deprecate(id, { reason: 'test' })
    const activeTemplates = memory.listActive({ engine: 'image' })
    expect(activeTemplates.length).toBe(0)
    const results = findSimilarTemplates('AI 改变教育', activeTemplates, { rand: () => 0.9 })
    expect(results[0].templateId).toBeNull()
    expect(results[0].tier).toBe('NONE')
  })

  it('fingerprint 缺失模板不参与检索', () => {
    const { memory } = makeMemory()
    const id = saveAndActivate(memory)
    // 破坏 fingerprint
    const tpl = memory.get(id)
    delete tpl.fingerprint
    memory._writeTemplate(tpl)
    memory.load()
    const activeTemplates = memory.listActive({ engine: 'image' })
    // fingerprint 缺失 → 标 stale → 不在 active
    expect(activeTemplates.length).toBe(0)
    const results = findSimilarTemplates('AI 改变教育', activeTemplates, { rand: () => 0.9 })
    expect(results[0].templateId).toBeNull()
  })

  it('空库返回 none 结果', () => {
    const { memory } = makeMemory()
    const activeTemplates = memory.listActive({ engine: 'image' })
    expect(activeTemplates.length).toBe(0)
    const results = findSimilarTemplates('AI 改变教育', activeTemplates, { rand: () => 0.9 })
    expect(results[0].templateId).toBeNull()
    expect(results[0].tier).toBe('NONE')
  })

  it('listActive 返回的模板结构可直接喂给 findSimilarTemplates', () => {
    const { memory } = makeMemory()
    saveAndActivate(memory, { concept: '医疗健康管理' })
    saveAndActivate(memory, {
      concept: 'AI 改变教育',
      content: { compositionType: '前后对比', action: '缩小', object: '书本', creativeLevel: 8 },
    })
    const activeTemplates = memory.listActive({ engine: 'image' })
    expect(activeTemplates.length).toBe(2)
    // 每个模板都有 id/fingerprint/stats 字段
    for (const t of activeTemplates) {
      expect(typeof t.id).toBe('string')
      expect(t.fingerprint).toBeTruthy()
      expect(t.stats).toBeTruthy()
    }
    // 检索不抛错
    expect(() => findSimilarTemplates('AI 改变教育', activeTemplates, { rand: () => 0.9 })).not.toThrow()
  })
})