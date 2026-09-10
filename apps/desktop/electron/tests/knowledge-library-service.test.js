// @ts-check
const KnowledgeLibraryService = require('../services/knowledge-library-service')
const { ERROR } = require('../core/error-codes')

describe('KnowledgeLibraryService.applyFeedback (P2 feedback loop)', function () {
  function makeStore() {
    var calls = []
    return {
      calls: calls,
      addViralItem: function () { return true },
      db: {
        prepare: function (sql) {
          return { run: function () { calls.push(sql) } }
        },
      },
    }
  }

  it('boosts adopted refs via feedbackBoost', function () {
    var store = makeStore()
    var svc = new KnowledgeLibraryService({ store: store })
    var res = svc.applyFeedback('adopted', [{ table: 'viral_library', id: 'v1' }, { table: 'personal_knowledge', id: 'p1' }])
    expect(res.code).toBe(ERROR.SUCCESS)
    expect(res.data.boosted).toBe(2)
    expect(res.data.penalized).toBe(0)
    expect(store.calls.length).toBe(2)
  })

  it('penalizes rejected refs via feedbackBoost', function () {
    var store = makeStore()
    var svc = new KnowledgeLibraryService({ store: store })
    var res = svc.applyFeedback('rejected', [{ table: 'personal_knowledge', id: 'p1' }])
    expect(res.code).toBe(ERROR.SUCCESS)
    expect(res.data.penalized).toBe(1)
    expect(res.data.boosted).toBe(0)
    expect(store.calls.length).toBe(1)
  })

  it('rejects invalid action', function () {
    var store = makeStore()
    var svc = new KnowledgeLibraryService({ store: store })
    var res = svc.applyFeedback('unknown', [{ table: 'viral_library', id: 'v1' }])
    expect(res.code).toBe(ERROR.VALIDATION_ERROR)
  })

  it('filters invalid table refs (SQL injection guard)', function () {
    var store = makeStore()
    var svc = new KnowledgeLibraryService({ store: store })
    var res = svc.applyFeedback('adopted', [{ table: 'viral_library; DROP TABLE', id: 'x' }])
    expect(res.code).toBe(ERROR.SUCCESS)
    expect(res.data.boosted).toBe(0)
    expect(store.calls.length).toBe(0)
  })

  it('returns success with zero refs', function () {
    var store = makeStore()
    var svc = new KnowledgeLibraryService({ store: store })
    var res = svc.applyFeedback('adopted', [])
    expect(res.code).toBe(ERROR.SUCCESS)
    expect(res.data.boosted).toBe(0)
  })
})
