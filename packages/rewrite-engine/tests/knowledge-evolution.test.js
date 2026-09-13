// @ts-check
const { scoreQuality, consolidate, decayCheck, feedbackBoost } = require('../src/knowledge-evolution')

describe('scoreQuality', function () {
  it('well-structured content scores above 0.5', function () {
    var mid = 'x'.repeat(200)
    var c = '# Title\n\n' + mid + '\n\n- Item 1\n- Item 2\n\n> Quote text\n\n' + mid
    var r = scoreQuality(c, 'notes.md')
    expect(r.quality).toBeGreaterThan(0.5)
    expect(r.structure).toBeGreaterThan(0.5)
  })

  it('plain text without structure scores low', function () {
    var c = 'just plain text without any formatting'
    var r = scoreQuality(c, null)
    expect(r.quality).toBeLessThan(0.4)
  })

  it('wikilinks boost citation', function () {
    var c = 'ref [[A]] and [[B]] and [[C]]'
    var r = scoreQuality(c, null)
    expect(r.citation).toBeGreaterThanOrEqual(0.3)
  })

  it('source file boosts citation', function () {
    var c = 'some content with a source file'
    var r = scoreQuality(c, 'notes.md')
    expect(r.citation).toBeGreaterThanOrEqual(0.4)
  })
})

describe('decayCheck', function () {
  it('returns empty with no store', function () {
    expect(decayCheck(null)).toEqual([])
  })

  it('advances active to stale (2 tables)', function () {
    var store = makeDecayStore([{ id: 'a1', status: 'active', access_count: 5, last_accessed: '2026-01-01' }])
    var changes = decayCheck(store)
    expect(changes.length).toBe(2)
    expect(changes[0].newStatus).toBe('stale')
  })

  it('recently accessed stays active', function () {
    var now = new Date().toISOString()
    var store = makeDecayStore([{ id: 'a4', status: 'active', access_count: 1, last_accessed: now }])
    var changes = decayCheck(store)
    expect(changes.length).toBe(0)
  })
})

describe('consolidate', function () {
  it('reinforces high-confidence items (2 tables)', function () {
    var store = makeConsolidateStore([{ id: 'h1' }, { id: 'h2' }], [])
    var r = consolidate(store)
    expect(r.reinforced).toBe(4)
  })

  it('archives deprecated low-access items (2 tables)', function () {
    var store = makeConsolidateStore([], [{ id: 'd1' }])
    var r = consolidate(store)
    expect(r.archived).toBe(2)
  })
})

describe('feedbackBoost', function () {
  it('boosts adopted refs', function () {
    var calls = []
    var store = { db: { prepare: function (sql) { return { run: function () { calls.push({ d: 0.1 }) } } } } }
    feedbackBoost(store, [{ table: 'viral_library', id: 'v1' }], [])
    expect(calls.length).toBe(1)
  })

  it('penalizes rejected refs', function () {
    var calls = []
    var store = { db: { prepare: function (sql) { return { run: function () { calls.push({ d: -0.05 }) } } } } }
    feedbackBoost(store, null, [{ table: 'personal_knowledge', id: 'p1' }])
    expect(calls.length).toBe(1)
  })
})


describe('KnowledgeContextBuilder touched items (P2 feedback loop)', function () {
  it('collects touched viral and personal item ids', async function () {
    var { KnowledgeContextBuilder } = require('../src/knowledge-context-builder')
    var builder = new KnowledgeContextBuilder({
      viralLibrary: { search: function () { return [{ id: 'v1', content: 'viral content' }] } },
      personalKnowledgeBase: { search: function () { return [{ id: 'p1', content: 'personal content' }] } },
    })
    await builder.buildFullContext('query', { useViralLibrary: true, usePersonalKnowledge: true })
    var touched = builder.getTouchedItems()
    expect(touched).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'viral_library', id: 'v1' }),
      expect.objectContaining({ table: 'personal_knowledge', id: 'p1' }),
    ]))
  })

  it('returns empty touched items when no knowledge used', async function () {
    var { KnowledgeContextBuilder } = require('../src/knowledge-context-builder')
    var builder = new KnowledgeContextBuilder({})
    await builder.buildFullContext('query', {})
    expect(builder.getTouchedItems()).toEqual([])
  })
})

describe('RewriteEngine knowledgeRefs (P2 feedback loop)', function () {
  it('rewrite() returns knowledgeRefs from touched knowledge items', async function () {
    var { RewriteEngine } = require('../src/rewrite-engine-core')
    var { KnowledgeContextBuilder } = require('../src/knowledge-context-builder')
    var { KnowledgeBase } = require('../src/knowledge-base')
    var kb = new KnowledgeBase()
    var knowledgeLibrary = new KnowledgeContextBuilder({
      knowledgeBase: kb,
      viralLibrary: { search: function () { return [{ id: 'v1', content: 'viral' }] } },
      personalKnowledgeBase: { search: function () { return [{ id: 'p1', content: 'personal' }] } },
    })
    var engine = new RewriteEngine({
      llmClient: { chat: async function () { return 'rewritten content' } },
      knowledgeBase: kb,
      knowledgeLibrary: knowledgeLibrary,
    })
    var strat = { id: 't', name: 't', category: 'imitate', systemPrompt: 'p', userPromptTemplate: 'rewrite: {content} {knowledgeContext}', industry: ['g'], tone: ['c'], platforms: ['g'], postProcess: { removeAITaste: false, maxLength: 6000 } }
    engine._strategyManager._strategies = [strat]
    engine._strategyManager.listEnabled = function () { return [strat] }
    engine._strategyManager.get = function () { return strat }
    engine._strategyManager.clearRemote = function () {}
    engine._strategyManager.mergeRemote = function () {}
    var result = await engine.rewrite({ mode: 'imitate', content: 'original content long enough to pass validation', userSettings: { knowledgeOptions: { useViralLibrary: true, usePersonalKnowledge: true } } })
    expect(result.success).toBe(true)
    expect(result.knowledgeRefs).toBeDefined()
    expect(result.knowledgeRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'viral_library', id: 'v1' }),
      expect.objectContaining({ table: 'personal_knowledge', id: 'p1' }),
    ]))
  })
})
// === mock helpers ===

function makeDecayStore(rows) {
  return {
    db: {
      prepare: function () {
        return {
          all: function () { return rows },
          run: function () {}
        }
      }
    }
  }
}

function makeConsolidateStore(high, deprecated) {
  return {
    db: {
      prepare: function (sql) {
        return {
          all: function () {
            if (sql.indexOf('confidence >= 0.7') > -1) return high
            if (sql.indexOf('deprecated') > -1) return deprecated
            return []
          },
          run: function () {}
        }
      }
    }
  }
}
