// @ts-check
/**
 * store-schema-publish-frequency — `publish_daily_count` 的 schema 片段（publish-frequency-policy-v2）
 *
 * 为什么单列一个文件：`store-schema.js` 被本次变更从 ≤499 推到 517 行，触到逐文件行数门禁的
 * 「新代码不得引入超大文件」（limit=500）。门禁给的正解是按既有范式拆分，故把本表的
 * DDL / 索引 / 列清单 / 主键列 / 列默认值整块外移，由 `store-schema.js` 展开引用。
 *
 * ⚠️ 表的**语义**仍是单一真源：两个计数器刻意分离 ——
 *   `count`          = 已**实际提交到平台**的次数（未提交失败回滚会幂等回补）
 *   `rollback_count` = **回滚尝试**次数（只增不减，用于防风上限）
 *   `day_key`        = 本机运营日 'YYYY-MM-DD'（不与平台日界换算）
 */
const TABLE = 'publish_daily_count'

const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS publish_daily_count (
    owner_subject  TEXT NOT NULL,
    key            TEXT NOT NULL,
    day_key        TEXT NOT NULL,
    count          INTEGER NOT NULL DEFAULT 0,
    rollback_count INTEGER NOT NULL DEFAULT 0,
    updated_at     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (owner_subject, key, day_key)
  )`

const INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_daily_owner_key ON publish_daily_count(owner_subject, key)`

const COLUMNS = ['owner_subject', 'key', 'day_key', 'count', 'rollback_count', 'updated_at']

// 复合主键的第三列 day_key 不参与 needsOwnerTableRebuild 的判定（判据只看 pk[0]/pk[1]），
// 故这里登记重建所需的第二列 key。
const KEY_COLUMN = 'key'

const COLUMN_DEFAULTS = {
  day_key: "''",
  count: '0',
  rollback_count: '0',
  updated_at: '0',
}

module.exports = { TABLE, SCHEMA_SQL, INDEX_SQL, COLUMNS, KEY_COLUMN, COLUMN_DEFAULTS }
