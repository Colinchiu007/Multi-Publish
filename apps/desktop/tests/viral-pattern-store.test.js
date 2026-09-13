/**
 * viral-pattern-store 测试 — 模式卡片 CRUD / 状态机 / attempts 上限
 */
var Database = require('../electron/services/sqlite-wrapper')

var SCHEMA = `
CREATE TABLE viral_library (
  id TEXT PRIMARY KEY, title TEXT DEFAULT '', cover_url TEXT DEFAULT '', author TEXT DEFAULT '',
  url TEXT DEFAULT '', content TEXT NOT NULL, tags TEXT DEFAULT '[]',
  likes INTEGER DEFAULT 0, collections INTEGER DEFAULT 0, comments INTEGER DEFAULT 0,
  like_collect_ratio REAL DEFAULT 0, published_at TEXT DEFAULT '', platform TEXT DEFAULT '',
  source TEXT DEFAULT 'manual', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  confidence REAL DEFAULT 0.5, status TEXT DEFAULT 'active',
  access_count INTEGER DEFAULT 0, last_accessed TEXT
);
CREATE TABLE viral_pattern_cards (
  viral_item_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  hook_type TEXT DEFAULT '',
  hook_analysis TEXT DEFAULT '',
  emotion_curve TEXT DEFAULT '',
  narrative_structure TEXT DEFAULT '',
  cta_style TEXT DEFAULT '',
  golden_quotes TEXT DEFAULT '[]',
  title_formula TEXT DEFAULT '',
  schema_version INTEGER NOT NULL DEFAULT 1,
  extracted_at TEXT,
  last_error TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`

describe('viral-pattern-store', function () {
  var store

  beforeAll(async function () {
    var db = new Database(null)
    await Database.ready
    db.exec(SCHEMA)
    var patternMixin = require('../electron/services/store/viral-pattern-store')
    var knowledgeMixin = require('../electron/services/store/knowledge-library-store')
    store = Object.assign({}, knowledgeMixin, patternMixin)
    store.db = db
    store._ready = true
    store.addViralItem({ id: 'v1', title: '测试爆款', content: '这是一条测试爆款内容，用于模式卡片测试。' })
  })

  test('入库后建 pending 卡片', function () {
    store.ensurePatternCard('v1')
    var card = store.getPatternCard('v1')
    expect(card).not.toBeNull()
    expect(card.status).toBe('pending')
    expect(card.attempts).toBe(0)
  })

  test('ensurePatternCard 幂等（已存在不重置）', function () {
    store.updatePatternCard('v1', { status: 'done', hook_type: 'suspense' })
    store.ensurePatternCard('v1')
    var card = store.getPatternCard('v1')
    expect(card.status).toBe('done')
    expect(card.hook_type).toBe('suspense')
  })

  test('updatePatternCard 更新字段并解析 golden_quotes', function () {
    store.updatePatternCard('v1', {
      status: 'done',
      emotion_curve: 'rise_fall',
      narrative_structure: 'problem_solution',
      cta_style: 'question',
      golden_quotes: ['金句一', '金句二'],
      title_formula: '{年龄}{事件}后我才明白{道理}',
      extracted_at: new Date().toISOString(),
    })
    var card = store.getPatternCard('v1')
    expect(card.emotion_curve).toBe('rise_fall')
    expect(card.golden_quotes).toEqual(['金句一', '金句二'])
    expect(card.title_formula).toContain('{年龄}')
  })

  test('listPendingPatternCards 过滤 attempts 上限', function () {
    store.addViralItem({ id: 'v2', title: '爆款2', content: '第二条测试爆款内容。' })
    store.addViralItem({ id: 'v3', title: '爆款3', content: '第三条测试爆款内容。' })
    store.ensurePatternCard('v2')
    store.ensurePatternCard('v3')
    store.updatePatternCard('v2', { attempts: 3, status: 'failed' })
    var pending = store.listPendingPatternCards()
    var ids = pending.map(function (c) { return c.viral_item_id })
    expect(ids).toContain('v3')
    expect(ids).not.toContain('v2')
  })

  test('recordPatternAttempt 递增 attempts', function () {
    var before = store.getPatternCard('v3').attempts
    store.recordPatternAttempt('v3', 'LLM timeout')
    var after = store.getPatternCard('v3')
    expect(after.attempts).toBe(before + 1)
    expect(after.last_error).toBe('LLM timeout')
  })

  test('deleteViralItem 级联清理卡片', function () {
    store.addViralItem({ id: 'v4', title: '爆款4', content: '第四条测试爆款内容。' })
    store.ensurePatternCard('v4')
    expect(store.getPatternCard('v4')).not.toBeNull()
    store.deleteViralItem('v4')
    expect(store.getPatternCard('v4')).toBeNull()
  })

  test('listPatternCards 分页', function () {
    var page = store.listPatternCards({ page: 1, pageSize: 2 })
    expect(page.items.length).toBeLessThanOrEqual(2)
    expect(page.total).toBeGreaterThanOrEqual(3)
  })
})
