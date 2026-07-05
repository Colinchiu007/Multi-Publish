/**
 * store-schema — Store 的 SQL schema 定义 + 帮助函数
 * 从 store.js 提取，可独立测试。
 */

const TABLE_NAMES = {
  accounts: "accounts",
  publish_history: "publish_history",
  scheduled_tasks: "scheduled_tasks",
  settings: "settings",
  callback_logs: "callback_logs",
  batch_jobs: "batch_jobs",
  publish_timeline: "publish_timeline",
};

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    platform      TEXT NOT NULL,
    account_name  TEXT,
    cookies       TEXT DEFAULT "[]",
    localStorage  TEXT DEFAULT "{}",
    avatar_url    TEXT,
    status        TEXT DEFAULT "active",
    created_at    TEXT DEFAULT (datetime("now")),
    updated_at    TEXT DEFAULT (datetime("now"))
  )`,
  `CREATE TABLE IF NOT EXISTS publish_history (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    platform      TEXT NOT NULL,
    article_id    TEXT,
    title         TEXT,
    content       TEXT,
    status        TEXT DEFAULT "pending",
    result        TEXT DEFAULT "{}",
    created_at    TEXT DEFAULT (datetime("now"))
  )`,
  `CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id            TEXT PRIMARY KEY,
    platform      TEXT NOT NULL,
    article       TEXT DEFAULT "{}",
    publish_time  TEXT,
    status        TEXT DEFAULT "pending",
    created_at    TEXT DEFAULT (datetime("now"))
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key           TEXT PRIMARY KEY,
    value         TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS callback_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    type          TEXT NOT NULL,
    source        TEXT DEFAULT "",
    payload       TEXT DEFAULT "{}",
    created_at    TEXT DEFAULT (datetime("now"))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform)`,
  `CREATE INDEX IF NOT EXISTS idx_history_platform ON publish_history(platform)`,
  `CREATE INDEX IF NOT EXISTS idx_history_created ON publish_history(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_scheduled_time ON scheduled_tasks(publish_time)`,
  `CREATE INDEX IF NOT EXISTS idx_callback_created ON callback_logs(created_at)`,
  `CREATE TABLE IF NOT EXISTS publish_timeline (
    key             TEXT PRIMARY KEY,
    last_publish_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS batch_jobs (
    id            TEXT PRIMARY KEY,
    name          TEXT,
    articles      TEXT DEFAULT "[]",
    total         INTEGER DEFAULT 0,
    completed     INTEGER DEFAULT 0,
    failed        INTEGER DEFAULT 0,
    status        TEXT DEFAULT "pending",
    created_at    TEXT DEFAULT (datetime("now"))
  )`,
];

function safeJsonParse(str, fallback = null) {
  if (!str || typeof str !== "string") return fallback;
  // eslint-disable-next-line no-unused-vars
  try { return JSON.parse(str); } catch (e) { return fallback || str; }
}

function safeJsonStringify(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function buildUpdateQuery(fields, jsonKeys = ["articles"]) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    vals.push(jsonKeys.includes(k) ? JSON.stringify(v) : v);
  }
  return { sets, vals };
}

module.exports = { TABLE_NAMES, SCHEMA_SQL, safeJsonParse, safeJsonStringify, buildUpdateQuery };
