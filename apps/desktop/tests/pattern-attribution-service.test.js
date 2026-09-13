/**
 * PatternAttributionService 测试 — 归因重算 / 空数据 / 幂等
 */
var path = require('path')
var { PatternAttributionService } = require(path.resolve(__dirname, '../electron/services/pattern-attribution-service'))

describe('PatternAttributionService', function () {
  var store
  var svc

  beforeEach(function () {
    store = {
      getRewriteHistory: vi.fn(function (id) {
        if (id === 'r1') return { knowledge_refs: [{ table: 'viral_library', id: 'v1' }, { table: 'personal_knowledge', id: 'p1' }] }
        return null
      }),
      getLatestSnapshot: vi.fn(function (tid) {
        if (tid === 't1') return { views: 1000, likes: 100, comments: 20, favorites: 30, shares: 5 }
        return null
      }),
      getPatternCard: vi.fn(function (vid) {
        if (vid === 'v1') return { status: 'done', hook_type: 'suspense', emotion_curve: 'rise_fall', narrative_structure: 'problem_solution', cta_style: 'question' }
        return null
      }),
      replacePatternPerformance: vi.fn(function () { return true }),
      db: {
        prepare: vi.fn(function () {
          return {
            all: vi.fn(function () {
              return [{ id: 't1', rewrite_history_id: 'r1' }]
            }),
          }
        }),
      },
    }
    svc = new PatternAttributionService({ store: store })
  })

  test('完整链路：tracked → history → card → snapshot → 聚合', function () {
    var res = svc.recomputeAll()
    expect(res.code).toBe(0)
    expect(res.data.rows).toBe(4) // 四维各 1 行
    expect(store.replacePatternPerformance).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ dimension: 'hook_type', value: 'suspense', sampleCount: 1, avgViews: 1000 }),
        expect.objectContaining({ dimension: 'cta_style', value: 'question' }),
      ])
    )
  })

  test('无 tracked 内容 → 零行', function () {
    store.db.prepare = vi.fn(function () {
      return { all: vi.fn(function () { return [] }) }
    })
    var res = svc.recomputeAll()
    expect(res.code).toBe(0)
    expect(res.data.rows).toBe(0)
    expect(store.replacePatternPerformance).toHaveBeenCalledWith([])
  })

  test('failed 卡片不参与归因', function () {
    store.getPatternCard = vi.fn(function () { return { status: 'failed', hook_type: 'suspense' } })
    var res = svc.recomputeAll()
    expect(res.data.rows).toBe(0)
  })

  test('无快照的内容跳过', function () {
    store.getLatestSnapshot = vi.fn(function () { return null })
    var res = svc.recomputeAll()
    expect(res.data.rows).toBe(0)
  })
})
