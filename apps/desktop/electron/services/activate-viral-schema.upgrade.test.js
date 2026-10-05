// @vitest-environment node
/**
 * 存量库升级路径（QM-6 后端轴 C-1 的回归锁）
 *
 * 为什么单开一个文件：本仓其余效果闭环测试都**从空库起步**，
 * 而空库上 CREATE TABLE 就把列带全了 —— 于是「先建 owner 索引、后 ALTER 补列」这种
 * 只在存量库上炸的排序错误，四层测试全绿也发现不了（实测由外部评审复现：
 * migration failed: no such column: owner_subject）。
 * 炸的下游不是"少一个索引"，而是 store.init() 返回 false ⇒ 应用无法启动。
 *
 * 判据必须用**会抛错**的 execSchemaSql（生产 sqlite-wrapper 走 execOrThrow），
 * 用吞错的 (t, sql) => t.exec(sql) 跑不出这条红。
 */
const { DatabaseSync } = require('node:sqlite')
const { migratePerformanceLoopSchema } = require('./activate-viral-schema')

/** 升级前的旧库形态：pattern_performance 没有 owner_subject（P2-6d 之前的 DDL） */
const OLD_DDL = `
CREATE TABLE rewrite_history (
  id TEXT PRIMARY KEY, mode TEXT DEFAULT '', original_excerpt TEXT DEFAULT '',
  rewritten_content TEXT NOT NULL, strategy_id TEXT DEFAULT '',
  knowledge_refs TEXT DEFAULT '[]', matched_keywords TEXT DEFAULT '[]',
  owner_subject TEXT, created_at TEXT NOT NULL
);
CREATE TABLE tracked_content (
  id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT DEFAULT '', url TEXT DEFAULT '',
  publish_history_id TEXT, rewrite_history_id TEXT,
  recrawl_status TEXT NOT NULL DEFAULT 'pending', last_recrawl_at TEXT, next_recrawl_at TEXT,
  owner_subject TEXT, created_at TEXT NOT NULL
);
CREATE TABLE performance_snapshot (
  id TEXT PRIMARY KEY, tracked_content_id TEXT NOT NULL, source TEXT DEFAULT 'auto',
  views INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, comments INTEGER DEFAULT 0,
  favorites INTEGER DEFAULT 0, shares INTEGER DEFAULT 0, raw TEXT DEFAULT '{}',
  captured_at TEXT NOT NULL
);
CREATE TABLE pattern_performance (
  id TEXT PRIMARY KEY, dimension TEXT NOT NULL, value TEXT NOT NULL, platform TEXT DEFAULT '',
  sample_count INTEGER DEFAULT 0, avg_views REAL DEFAULT 0, avg_likes REAL DEFAULT 0,
  avg_comments REAL DEFAULT 0, avg_favorites REAL DEFAULT 0,
  engagement_score REAL DEFAULT 0, computed_at TEXT NOT NULL
);
CREATE INDEX idx_pattern_perf_dim ON pattern_performance(dimension, engagement_score);
`

function oldShapeDb () {
  const db = new DatabaseSync(':memory:')
  db.exec(OLD_DDL)
  // 存量数据必须在迁移前后都还在：迁移不得吃掉已算好的行（幂等语义的另一半）
  db.prepare(`INSERT INTO pattern_performance
    (id, dimension, value, platform, sample_count, avg_views, avg_likes, avg_comments, avg_favorites, engagement_score, computed_at)
    VALUES ('legacy-row','hook_type','suspense','',1,10,1,1,1,4,'2026-10-01T00:00:00.000Z')`).run()
  return db
}

// 生产用的 sqlite-wrapper 有 execOrThrow ⇒ 迁移里每条 SQL 都真的会抛；夹具必须同形
const throwingExec = (target, sql) => target.exec(sql)

describe('效果闭环 schema 升级路径（存量库）', () => {
  it('旧库（无 owner_subject）跑迁移必须成功，并补出列与 owner 索引', () => {
    const db = oldShapeDb()
    expect(() => migratePerformanceLoopSchema(db, throwingExec)).not.toThrow()

    const cols = db.prepare('PRAGMA table_info(pattern_performance)').all().map(c => c.name)
    expect(cols, 'ALTER 必须把归属列补上，否则读侧按归属筛就是 no such column').toContain('owner_subject')

    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='pattern_performance'").all().map(r => r.name)
    expect(idx).toContain('idx_pattern_perf_owner_dim')

    // 存量行必须还在，且归属读得到（ALTER 加列对既有行是 NULL = legacy 桶）
    const rows = db.prepare('SELECT id, owner_subject FROM pattern_performance').all()
    expect(rows.map(r => r.id)).toEqual(['legacy-row'])
    expect(rows[0].owner_subject).toBeNull()
  })

  it('迁移可重复执行（启动两次不得因索引/列已存在而抛错）', () => {
    const db = oldShapeDb()
    migratePerformanceLoopSchema(db, throwingExec)
    expect(() => migratePerformanceLoopSchema(db, throwingExec)).not.toThrow()
    expect(() => migratePerformanceLoopSchema(db, throwingExec)).not.toThrow()
  })

  it('新库路径同样成立（CREATE 带列，ALTER 走"已存在"分支）', () => {
    const db = new DatabaseSync(':memory:')
    expect(() => migratePerformanceLoopSchema(db, throwingExec)).not.toThrow()
    const cols = db.prepare('PRAGMA table_info(pattern_performance)').all().map(c => c.name)
    expect(cols).toContain('owner_subject')
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='pattern_performance'").all().map(r => r.name)
    expect(idx).toContain('idx_pattern_perf_owner_dim')
  })

  it('排序守卫：owner 索引的建表语句必须排在 ALTER 之后（回到前面即 C-1 复发）', () => {
    const fs = require('fs')
    const src = fs.readFileSync(require.resolve('./activate-viral-schema'), 'utf8')
    const atIndex = src.indexOf('idx_pattern_perf_owner_dim')
    const atAlter = src.indexOf('ALTER TABLE pattern_performance ADD COLUMN owner_subject')
    expect(atIndex, 'owner 索引创建语句必须存在').toBeGreaterThan(-1)
    expect(atAlter, '归属列的幂等 ALTER 必须存在').toBeGreaterThan(-1)
    expect(atIndex, 'owner 索引一旦被排到 ALTER 之前，存量库升级就会在 prepare 阶段抛 no such column').toBeGreaterThan(atAlter)
  })
})
