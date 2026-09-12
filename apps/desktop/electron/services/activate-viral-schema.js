// @ts-check
/**
 * activate-viral-library schema 迁移 — 模式卡片 + 效果闭环
 *
 * 从 store-schema.js 拆出（债务熔断：filesOver500 不允许新增超限文件）。
 * 依赖：store-schema 的 execSchemaSql（经参数注入，避免循环依赖）。
 */

/**
 * 模式卡片 schema（PR-2）：viral_pattern_cards 与 viral_library 一对一；存量回填 pending。
 */
function migrateViralPatternSchema(db, execSchemaSql) {
  execSchemaSql(db, `CREATE TABLE IF NOT EXISTS viral_pattern_cards (
    viral_item_id        TEXT PRIMARY KEY,
    status               TEXT NOT NULL DEFAULT 'pending',
    attempts             INTEGER NOT NULL DEFAULT 0,
    hook_type            TEXT DEFAULT '',
    hook_analysis        TEXT DEFAULT '',
    emotion_curve        TEXT DEFAULT '',
    narrative_structure  TEXT DEFAULT '',
    cta_style            TEXT DEFAULT '',
    golden_quotes        TEXT DEFAULT '[]',
    title_formula        TEXT DEFAULT '',
    schema_version       INTEGER NOT NULL DEFAULT 1,
    extracted_at         TEXT,
    last_error           TEXT DEFAULT '',
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
  )`)
  execSchemaSql(db, "CREATE INDEX IF NOT EXISTS idx_pattern_status ON viral_pattern_cards(status)")
  execSchemaSql(db, "CREATE INDEX IF NOT EXISTS idx_pattern_created ON viral_pattern_cards(created_at)")

  // 存量爆款条目回填 pending 卡片（幂等：INSERT OR IGNORE）
  try {
    const now = new Date().toISOString()
    db.prepare(`
      INSERT OR IGNORE INTO viral_pattern_cards (viral_item_id, status, attempts, schema_version, created_at, updated_at)
      SELECT id, 'pending', 0, 1, ?, ? FROM viral_library
    `).run(now, now)
  } catch (e) {
    // viral_library 表不存在（全新库）时静默跳过
  }
}

/**
 * 效果闭环 schema（PR-3）：rewrite_history / tracked_content / performance_snapshot /
 * pattern_performance；publish_history 加 rewrite_history_id 关联列。
 */
function migratePerformanceLoopSchema(db, execSchemaSql) {
  execSchemaSql(db, `CREATE TABLE IF NOT EXISTS rewrite_history (
    id                  TEXT PRIMARY KEY,
    mode                TEXT DEFAULT '',
    original_excerpt    TEXT DEFAULT '',
    rewritten_content   TEXT NOT NULL,
    strategy_id         TEXT DEFAULT '',
    knowledge_refs      TEXT DEFAULT '[]',
    matched_keywords    TEXT DEFAULT '[]',
    owner_subject       TEXT,
    created_at          TEXT NOT NULL
  )`)
  execSchemaSql(db, "CREATE INDEX IF NOT EXISTS idx_rewrite_history_created ON rewrite_history(created_at)")

  execSchemaSql(db, `CREATE TABLE IF NOT EXISTS tracked_content (
    id                  TEXT PRIMARY KEY,
    platform            TEXT NOT NULL,
    post_id             TEXT DEFAULT '',
    url                 TEXT DEFAULT '',
    publish_history_id  TEXT,
    rewrite_history_id  TEXT,
    recrawl_status      TEXT NOT NULL DEFAULT 'pending',
    last_recrawl_at     TEXT,
    next_recrawl_at     TEXT,
    owner_subject       TEXT,
    created_at          TEXT NOT NULL
  )`)
  execSchemaSql(db, "CREATE INDEX IF NOT EXISTS idx_tracked_status ON tracked_content(recrawl_status)")
  execSchemaSql(db, "CREATE INDEX IF NOT EXISTS idx_tracked_next ON tracked_content(next_recrawl_at)")

  execSchemaSql(db, `CREATE TABLE IF NOT EXISTS performance_snapshot (
    id                  TEXT PRIMARY KEY,
    tracked_content_id  TEXT NOT NULL,
    source              TEXT NOT NULL DEFAULT 'auto',
    views               INTEGER DEFAULT 0,
    likes               INTEGER DEFAULT 0,
    comments            INTEGER DEFAULT 0,
    favorites           INTEGER DEFAULT 0,
    shares              INTEGER DEFAULT 0,
    raw                 TEXT DEFAULT '{}',
    captured_at         TEXT NOT NULL
  )`)
  execSchemaSql(db, "CREATE INDEX IF NOT EXISTS idx_snapshot_tracked ON performance_snapshot(tracked_content_id, captured_at)")

  execSchemaSql(db, `CREATE TABLE IF NOT EXISTS pattern_performance (
    id                  TEXT PRIMARY KEY,
    dimension           TEXT NOT NULL,
    value               TEXT NOT NULL,
    platform            TEXT DEFAULT '',
    sample_count        INTEGER DEFAULT 0,
    avg_views           REAL DEFAULT 0,
    avg_likes           REAL DEFAULT 0,
    avg_comments        REAL DEFAULT 0,
    avg_favorites       REAL DEFAULT 0,
    engagement_score    REAL DEFAULT 0,
    computed_at         TEXT NOT NULL
  )`)
  execSchemaSql(db, "CREATE INDEX IF NOT EXISTS idx_pattern_perf_dim ON pattern_performance(dimension, engagement_score)")

  // publish_history 加关联列（幂等）
  try {
    const cols = db.prepare("PRAGMA table_info(publish_history)").all().map(c => c.name)
    if (!cols.includes('rewrite_history_id')) {
      if (typeof db.execOrThrow === 'function') db.execOrThrow('ALTER TABLE publish_history ADD COLUMN rewrite_history_id TEXT')
      else db.exec('ALTER TABLE publish_history ADD COLUMN rewrite_history_id TEXT')
    }
  } catch (e) { /* publish_history 不存在（全新库由 SCHEMA_SQL 建）时跳过 */ }
}

module.exports = { migrateViralPatternSchema, migratePerformanceLoopSchema }
