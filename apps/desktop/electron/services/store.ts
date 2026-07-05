/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 store.js (JS 版) 替代。
 */

import * as path from "path";
import { app } from "electron";
import { default as logger } from "./logger";
import { Database } from "./sqlite-wrapper";

interface Account {
  id: string;
  platform: string;
  name?: string;
  avatar?: string;
  cookies?: any[];
  localStorage?: any;
  status?: string;
}

interface PublishRecord {
  id: string;
  platform: string;
  title?: string;
  content?: string;
  task_id?: string;
  status?: string;
  result?: any;
  error?: string;
}

interface ScheduledTask {
  id: string;
  platform: string;
  article: any;
  publish_time: string;
  status: string;
}

interface BatchJob {
  id: string;
  name: string;
  articles: any[];
  total: number;
  completed: number;
  failed: number;
  status: string;
}

let _Database: any = null;
try {
  _Database = require("./sqlite-wrapper");
} catch (e: unknown) {
  logger.error("Store", `sql.js failed to load: ${(e as Error).message}`);
}

export class Store {
  db: any = null;
  _ready: boolean = false;

  init(): boolean {
    if (this._ready) return true;
    if (!_Database) {
      logger.warn("Store", "sql.js not available, store disabled");
      return false;
    }

    const dbPath = path.join(app.getPath("userData"), "multi-publish.db");
    logger.info("Store", `Opening database: ${dbPath}`);

    try {
      this.db = new _Database(dbPath);
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("foreign_keys = ON");
      this._createTables();
      this._ready = true;
      logger.info("Store", "Database initialized successfully");
      return true;
    } catch (e: unknown) {
      logger.error("Store", `Failed to initialize: ${(e as Error).message}`);
      return false;
    }
  }

  private _createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY, platform TEXT NOT NULL, name TEXT, avatar TEXT,
        cookies TEXT DEFAULT '[]', localStorage TEXT DEFAULT '{}',
        status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS publish_history (
        id TEXT PRIMARY KEY, platform TEXT NOT NULL, title TEXT, content TEXT,
        task_id TEXT, status TEXT DEFAULT 'pending', result TEXT DEFAULT '{}', error TEXT, created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY, platform TEXT NOT NULL, article TEXT DEFAULT '{}',
        publish_time TEXT NOT NULL, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS callback_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, source TEXT,
        payload TEXT, created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS publish_timeline (key TEXT PRIMARY KEY, last_publish_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS batch_jobs (
        id TEXT PRIMARY KEY, name TEXT, articles TEXT DEFAULT '[]', total INTEGER DEFAULT 0,
        completed INTEGER DEFAULT 0, failed INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    try {
      this.db.exec("ALTER TABLE accounts ADD COLUMN is_default INTEGER DEFAULT 0");
    } catch (_e) { /* ignore - column may already exist */ }
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_history_platform ON publish_history(platform)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_history_created ON publish_history(created_at)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_scheduled_time ON scheduled_tasks(publish_time)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_callback_created ON callback_logs(created_at)");
    } catch (_e) { /* ignore */ }
  }

  // --- Accounts ---
  addAccount(account: Account): boolean {
    if (!this._ready) return false;
    this.db.prepare("INSERT OR REPLACE INTO accounts (id, platform, name, avatar, cookies, localStorage, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))")
      .run(account.id, account.platform, account.name || "", account.avatar || "",
        JSON.stringify(account.cookies || []), JSON.stringify(account.localStorage || {}), account.status || "active");
    return true;
  }

  getAccount(id: string): Account | null {
    if (!this._ready) return null;
    const row = this.db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
    if (!row) return null;
    try { row.cookies = JSON.parse(row.cookies); } catch (_e) { row.cookies = []; }
    try { row.localStorage = JSON.parse(row.localStorage); } catch (_e) { row.localStorage = {}; }
    return row;
  }

  listAccounts(platform?: string): Account[] {
    if (!this._ready) return [];
    const sql = platform ? "SELECT * FROM accounts WHERE platform = ? ORDER BY created_at DESC" : "SELECT * FROM accounts ORDER BY created_at DESC";
    const rows = platform ? this.db.prepare(sql).all(platform) : this.db.prepare(sql).all();
    return rows.map((r: any) => {
      try { r.cookies = JSON.parse(r.cookies); } catch (_e) { r.cookies = []; }
      try { r.localStorage = JSON.parse(r.localStorage); } catch (_e) { r.localStorage = {}; }
      return r;
    });
  }

  deleteAccount(id: string): boolean {
    if (!this._ready) return false;
    this.db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
    return true;
  }

  updateAccount(id: string, fields: Partial<Account>): boolean {
    if (!this._ready) return false;
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(fields)) {
      if (k === "cookies" || k === "localStorage") {
        sets.push(`${k} = ?`); vals.push(JSON.stringify(v));
      } else { sets.push(`${k} = ?`); vals.push(v); }
    }
    if (sets.length === 0) return false;
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    this.db.prepare(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    return true;
  }

  // --- Publish History ---
  addHistory(record: PublishRecord): boolean {
    if (!this._ready) return false;
    this.db.prepare("INSERT OR REPLACE INTO publish_history (id, platform, title, content, task_id, status, result, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(record.id, record.platform, record.title || "", record.content || "", record.task_id || "",
        record.status || "pending", JSON.stringify(record.result || {}), record.error || "");
    return true;
  }

  getHistory(id: string): PublishRecord | null {
    if (!this._ready) return null;
    const row = this.db.prepare("SELECT * FROM publish_history WHERE id = ?").get(id);
    if (!row) return null;
    try { row.result = JSON.parse(row.result); } catch (_e) { row.result = {}; }
    return row;
  }

  listHistory(platform?: string, limit = 50): PublishRecord[] {
    if (!this._ready) return [];
    const sql = platform ? "SELECT * FROM publish_history WHERE platform = ? ORDER BY created_at DESC LIMIT ?" : "SELECT * FROM publish_history ORDER BY created_at DESC LIMIT ?";
    const rows = platform ? this.db.prepare(sql).all(platform, limit) : this.db.prepare(sql).all(limit);
    return rows.map((r: any) => { try { r.result = JSON.parse(r.result); } catch (_e) { r.result = {}; } return r; });
  }

  // --- Scheduled Tasks ---
  addTask(task: ScheduledTask): boolean {
    if (!this._ready) return false;
    this.db.prepare("INSERT OR REPLACE INTO scheduled_tasks (id, platform, article, publish_time, status) VALUES (?, ?, ?, ?, ?)")
      .run(task.id, task.platform, JSON.stringify(task.article || {}), task.publish_time, task.status || "pending");
    return true;
  }

  getPendingTasks(): ScheduledTask[] {
    if (!this._ready) return [];
    return this.db.prepare("SELECT * FROM scheduled_tasks WHERE status = 'pending' AND publish_time <= datetime('now') ORDER BY publish_time ASC").all()
      .map((r: any) => ({ ...r, article: _safeJson(r.article) }));
  }

  updateTaskStatus(id: string, status: string): boolean {
    if (!this._ready) return false;
    this.db.prepare("UPDATE scheduled_tasks SET status = ? WHERE id = ?").run(status, id);
    return true;
  }

  deleteTask(id: string): boolean {
    if (!this._ready) return false;
    this.db.prepare("DELETE FROM scheduled_tasks WHERE id = ?").run(id);
    return true;
  }

  // --- Settings ---
  getSetting(key: string, defaultValue: any = null): any {
    if (!this._ready) return defaultValue;
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    if (!row) return defaultValue;
    try { return JSON.parse(row.value); } catch (_e) { return row.value; }
  }

  setSetting(key: string, value: any): void {
    if (!this._ready) return;
    const str = typeof value === "string" ? value : JSON.stringify(value);
    this.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, str);
  }

  // --- Callback Logs ---
  addCallbackLog(type: string, source: string, payload: any): void {
    if (!this._ready) return;
    this.db.prepare("INSERT INTO callback_logs (type, source, payload) VALUES (?, ?, ?)").run(type, source || "", JSON.stringify(payload || {}));
  }

  listCallbackLogs(limit = 50): any[] {
    if (!this._ready) return [];
    return this.db.prepare("SELECT * FROM callback_logs ORDER BY created_at DESC LIMIT ?").all(limit)
      .map((r: any) => ({ ...r, payload: _safeJson(r.payload) }));
  }

  // --- Batch Jobs ---
  addBatchJob(job: BatchJob): boolean {
    if (!this._ready) return false;
    this.db.prepare("INSERT OR REPLACE INTO batch_jobs (id, name, articles, total, completed, failed, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(job.id, job.name, JSON.stringify(job.articles || []), job.total, job.completed || 0, job.failed || 0, job.status || "pending");
    return true;
  }

  getBatchJob(id: string): BatchJob | null {
    if (!this._ready) return null;
    const row = this.db.prepare("SELECT * FROM batch_jobs WHERE id = ?").get(id);
    if (!row) return null;
    try { row.articles = JSON.parse(row.articles); } catch (_e) { row.articles = []; }
    return row;
  }

  listBatchJobs(): BatchJob[] {
    if (!this._ready) return [];
    return this.db.prepare("SELECT * FROM batch_jobs ORDER BY created_at DESC").all().map((r: any) => {
      try { r.articles = JSON.parse(r.articles); } catch (_e) { r.articles = []; }
      return r;
    });
  }

  updateBatchJob(id: string, fields: Partial<BatchJob>): boolean {
    if (!this._ready) return false;
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(fields)) {
      if (k === "articles") { sets.push("articles = ?"); vals.push(JSON.stringify(v)); }
      else { sets.push(`${k} = ?`); vals.push(v); }
    }
    vals.push(id);
    this.db.prepare(`UPDATE batch_jobs SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    return true;
  }

  deleteBatchJob(id: string): boolean {
    if (!this._ready) return false;
    this.db.prepare("DELETE FROM batch_jobs WHERE id = ?").run(id);
    return true;
  }

  // --- Publish Timeline ---
  getPublishTimeline(key: string): number | null {
    if (!this._ready) return null;
    const row = this.db.prepare("SELECT last_publish_at FROM publish_timeline WHERE key = ?").get(key);
    return row ? row.last_publish_at : null;
  }

  setPublishTimeline(key: string, timestamp: number): void {
    if (!this._ready) return;
    this.db.prepare("INSERT OR REPLACE INTO publish_timeline (key, last_publish_at) VALUES (?, ?)").run(key, timestamp);
  }

  close(): void {
    if (this.db) {
      try { this.db.close(); } catch (_e) { /* ignore */ }
      this.db = null;
      this._ready = false;
    }
  }
}

function _safeJson(str: string): any {
  try { return JSON.parse(str); } catch (_e) { return str; }
}