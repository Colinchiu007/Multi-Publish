/**
 * knowledge-library-store 关键词检索回归测试
 *
 * Coverage:
 * - 长文查询提取关键词后多词 OR 命中（原整文 LIKE 永远空结果的 bug）
 * - 评分排序：关键词命中数优先，互动数加权
 * - 零命中条目不返回
 * - 检索即强化（access_count 递增）保留
 * - 个人库检索同修
 */
var path = require('path')
var Database = require('../electron/services/sqlite-wrapper')

describe('knowledge-library-store keyword search', function () {
  var store

  beforeAll(async function () {
    var db = new Database(null)
    await Database.ready
    if (!db._db) db._init()
    db.exec(`
      CREATE TABLE viral_library (
        id TEXT PRIMARY KEY, title TEXT, cover_url TEXT, author TEXT, url TEXT,
        content TEXT, tags TEXT, likes INTEGER DEFAULT 0, collections INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0, like_collect_ratio REAL DEFAULT 0, published_at TEXT,
        platform TEXT, source TEXT, created_at TEXT, updated_at TEXT,
        confidence REAL DEFAULT 0.5, status TEXT DEFAULT 'active',
        access_count INTEGER DEFAULT 0, last_accessed TEXT
      );
      CREATE TABLE personal_knowledge (
        id TEXT PRIMARY KEY, category TEXT, title TEXT, content TEXT,
        source_file TEXT, file_type TEXT, created_at TEXT, updated_at TEXT,
        confidence REAL DEFAULT 0.5, status TEXT DEFAULT 'active',
        access_count INTEGER DEFAULT 0, last_accessed TEXT
      );
      CREATE TABLE knowledge_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, target_table TEXT, target_id TEXT,
        event TEXT, old_status TEXT, new_status TEXT, old_confidence REAL, new_confidence REAL,
        actor TEXT, created_at TEXT
      );
    `)
    var mixin = require(path.resolve(__dirname, '../electron/services/store/knowledge-library-store'))
    store = Object.assign({}, mixin)
    store.db = db
    store._ready = true
  })

  function addViral(id, title, content, opts) {
    opts = opts || {}
    store.addViralItem(Object.assign({
      id: id, title: title, content: content, tags: opts.tags || [], likes: opts.likes || 0,
    }, opts))
  }

  test('长文查询命中同主题爆款（原 bug：整文 LIKE 永远空）', function () {
    addViral('v1', '自媒体内容质量方法论', '自媒体运营的核心是内容质量，内容质量决定账号天花板。')
    addViral('v2', '完全无关的美食菜谱', '今天教大家做红烧肉，先把五花肉焯水，加入冰糖炒糖色。')
    var longArticle = '在当下的内容行业里，自媒体运营的核心竞争力究竟是什么？' +
      '我认为是内容质量。内容质量决定了自媒体账号的长期天花板，' +
      '而不是短期流量。流量思维会让创作者忽视内容质量，最终账号越做越差。' +
      '所以我们要把内容质量放在第一位，持续打磨每一篇稿子。'
    var results = store.searchViralItems(longArticle, 10)
    expect(results.length).toBeGreaterThan(0)
    var ids = results.map(function (r) { return r.id })
    expect(ids).toContain('v1')
    expect(ids).not.toContain('v2')
  })

  test('评分排序：关键词命中数优先于互动数', function () {
    // v10 命中 2 个关键词但互动低；v11 命中 1 个关键词但互动高
    addViral('v10', '自媒体内容质量', '自媒体 内容质量 关键词甲', { likes: 10 })
    addViral('v11', '自媒体', '自媒体 关键词乙 丙 丁', { likes: 10000 })
    var results = store.searchViralItems('自媒体 内容质量', 10)
    expect(results.length).toBeGreaterThanOrEqual(2)
    // v10 命中「自媒体」+「内容质量」两个词，应排在前
    expect(results[0].id).toBe('v10')
  })

  test('检索即强化：access_count 递增', function () {
    var before = store.getViralItem('v1')
    var beforeCount = before.access_count || 0
    store.searchViralItems('自媒体 内容质量', 10)
    var after = store.getViralItem('v1')
    expect(Number(after.access_count)).toBeGreaterThan(Number(beforeCount))
  })

  test('个人库长文查询命中', function () {
    store.addPersonalItem({ id: 'p1', category: 'personal_stories', content: '我做过自媒体创业，三年时间从零做到十万粉丝，踩过很多内容质量的坑。' })
    store.addPersonalItem({ id: 'p2', category: 'family_stories', content: '我妈妈做的红烧肉是全世界最好吃的，先把五花肉焯水。' })
    var longArticle = '自媒体创业这条路我走了很久，内容质量一直是最大的挑战，十万粉丝不是终点。'
    var results = store.searchPersonalItems(longArticle, 10)
    expect(results.length).toBeGreaterThan(0)
    var ids = results.map(function (r) { return r.id })
    expect(ids).toContain('p1')
    expect(ids).not.toContain('p2')
  })

  test('空查询返回空数组', function () {
    expect(store.searchViralItems('', 10)).toEqual([])
    expect(store.searchPersonalItems('', 10)).toEqual([])
  })
})
