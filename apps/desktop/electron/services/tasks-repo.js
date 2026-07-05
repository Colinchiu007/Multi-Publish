/**
 * TasksRepo — 持久化任务仓库
 *
 * 从 MediaTrace TasksRepo 移植：
 * - 6 种状态: pending/running/completed/failed/canceled/paused
 * - 调度策略: 一次性(once)/循环(interval)
 * - findDueSchedules() — 查找到期的定时任务
 * - 持久化进度统计
 * - updateStatus() 部分更新模式
 *
 * 文件位置: apps/desktop/electron/services/tasks-repo.js
 * 注意: 直接使用 sql.js（非 sqlite-wrapper），避免异步初始化问题
 */

const path = require("path");
const fs = require("fs");
const log = require("./logger");

const TASK_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELED: "canceled",
  PAUSED: "paused",
};

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    platform    TEXT DEFAULT '',
    payload     TEXT DEFAULT '{}',
    status      TEXT DEFAULT 'pending',
    schedule    TEXT,
    progress    INTEGER DEFAULT 0,
    message     TEXT DEFAULT '',
    next_run    TEXT,
    result      TEXT DEFAULT '{}',
    stats       TEXT DEFAULT '{}',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  )
`;

class TasksRepo {
  /**
   * @param {string} dbPath - SQLite 数据库文件路径
   */
  constructor(dbPath) {
    this.dbPath = dbPath;
    this._db = null;
    this._ready = false;
    this._initPromise = null;
  }

  /**
   * 初始化数据库连接和表结构（幂等）
   */
  async init() {
    if (this._ready) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._doInit();
    return this._initPromise;
  }

  async _doInit() {
    try {
      const initSqlJs = require("sql.js");
      const SQL = await initSqlJs();

      // 加载或创建数据库
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this._db = new SQL.Database(buffer);
      } else {
        this._db = new SQL.Database();
        // 确保目录存在
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      this._db.exec(CREATE_TABLE_SQL);
      this._ready = true;
      log.info("TasksRepo", "initialized at " + this.dbPath);
    } catch (err) {
      log.error("TasksRepo", "init failed: " + err.message);
      throw err;
    }
  }

  /**
   * 保存到磁盘并关闭连接
   */
  close() {
    if (this._db) {
      try {
        const data = this._db.export();
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.dbPath, Buffer.from(data));
      } catch (err) {
        log.warn("TasksRepo", "save on close failed: " + err.message);
      }
      this._db.close();
    }
    this._db = null;
    this._ready = false;
    this._initPromise = null;
  }

  // ─── CRUD ─────────────────────────────────────────────

  /**
   * 创建任务
   * @param {object} fields - { type, platform, payload, schedule }
   * @returns {object} 创建的任务
   */
  create(fields) {
    this._ensureReady();
    const id = _generateId();
    const now = new Date().toISOString();
    const schedule = fields.schedule ? JSON.stringify(fields.schedule) : null;
    const payload = fields.payload ? JSON.stringify(fields.payload) : "{}";

    this._db.run(
      "INSERT INTO tasks (id, type, platform, payload, status, schedule, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, fields.type, fields.platform || "", payload, TASK_STATUS.PENDING, schedule, now, now]
    );

    return this.get(id);
  }

  /**
   * 根据 ID 获取任务
   * @param {string} id
   * @returns {object|null}
   */
  get(id) {
    this._ensureReady();
    const stmt = this._db.prepare("SELECT * FROM tasks WHERE id = ?");
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return _deserialize(row);
    }
    stmt.free();
    return null;
  }

  /**
   * 列出任务，支持筛选
   * @param {object} [filters] - { status, type }
   * @returns {object[]}
   */
  list(filters = {}) {
    this._ensureReady();
    let sql = "SELECT * FROM tasks WHERE 1=1";
    const params = [];

    if (filters.status) {
      sql += " AND status = ?";
      params.push(filters.status);
    }
    if (filters.type) {
      sql += " AND type = ?";
      params.push(filters.type);
    }

    sql += " ORDER BY created_at DESC";
    const stmt = this._db.prepare(sql);
    stmt.bind(params);

    const rows = [];
    while (stmt.step()) {
      rows.push(_deserialize(stmt.getAsObject()));
    }
    stmt.free();
    return rows;
  }

  /**
   * 移除任务
   * @param {string} id
   * @returns {boolean}
   */
  /**
   * 移除任务
   * @param {string} id
   * @returns {boolean}
   */
  remove(id) {
    this._ensureReady();
    this._db.run("DELETE FROM tasks WHERE id = ?", [id]);
    return this._db.getRowsModified() > 0;
  }

  // ─── 状态管理 ─────────────────────────────────────────

  /**
   * 更新任务状态（部分更新模式）
   * @param {string} id
   * @param {string} status
   * @param {object} [extra] - { progress, message, result, stats, nextRun }
   */
  updateStatus(id, status, extra = {}) {
    this._ensureReady();
    const sets = ["status = ?", "updated_at = ?"];
    const params = [status, new Date().toISOString()];

    if (extra.progress !== undefined) {
      sets.push("progress = ?");
      params.push(extra.progress);
    }
    if (extra.message !== undefined) {
      sets.push("message = ?");
      params.push(extra.message);
    }
    if (extra.result !== undefined) {
      sets.push("result = ?");
      params.push(typeof extra.result === "string" ? extra.result : JSON.stringify(extra.result));
    }
    if (extra.stats !== undefined) {
      sets.push("stats = ?");
      params.push(typeof extra.stats === "string" ? extra.stats : JSON.stringify(extra.stats));
    }
    if (extra.nextRun !== undefined) {
      sets.push("next_run = ?");
      params.push(extra.nextRun);
    }

    params.push(id);
    this._db.run("UPDATE tasks SET " + sets.join(", ") + " WHERE id = ?", params);
  }

  /**
   * 取消任务
   * @param {string} id
   * @returns {boolean}
   */
  cancel(id) {
    const task = this.get(id);
    if (!task) return false;
    if (task.status === TASK_STATUS.COMPLETED || task.status === TASK_STATUS.CANCELED) return false;
    this.updateStatus(id, TASK_STATUS.CANCELED);
    return true;
  }

  /**
   * 暂停运行中的任务
   * @param {string} id
   * @returns {boolean}
   */
  pause(id) {
    const task = this.get(id);
    if (!task || task.status !== TASK_STATUS.RUNNING) return false;
    this.updateStatus(id, TASK_STATUS.PAUSED);
    return true;
  }

  /**
   * 恢复被暂停的任务
   * @param {string} id
   * @returns {boolean}
   */
  resume(id) {
    const task = this.get(id);
    if (!task || task.status !== TASK_STATUS.PAUSED) return false;
    this.updateStatus(id, TASK_STATUS.RUNNING);
    return true;
  }

  // ─── 调度 ─────────────────────────────────────────────

  /**
   * 查找到期需执行的任务
   * @returns {object[]}
   */
  findDueSchedules() {
    this._ensureReady();
    const now = new Date().toISOString();
    const stmt = this._db.prepare(`
      SELECT * FROM tasks
      WHERE (
        (status = ? AND schedule IS NOT NULL AND json_extract(schedule, '$.type') = 'once' AND json_extract(schedule, '$.runAt') <= ?)
        OR
        (status = ? AND schedule IS NOT NULL AND json_extract(schedule, '$.type') = 'interval' AND next_run IS NOT NULL AND next_run <= ?)
      )
    `);
    stmt.bind([TASK_STATUS.PENDING, now, TASK_STATUS.RUNNING, now]);

    const rows = [];
    while (stmt.step()) {
      rows.push(_deserialize(stmt.getAsObject()));
    }
    stmt.free();
    return rows;
  }

  // ─── 统计 ─────────────────────────────────────────────

  /**
   * 任务统计
   * @returns {{ total: number, by_status: object }}
   */
  statistics() {
    this._ensureReady();
    const stmt = this._db.prepare("SELECT status, COUNT(*) as count FROM tasks GROUP BY status");
    const byStatus = {};
    let total = 0;
    while (stmt.step()) {
      const row = stmt.getAsObject();
      byStatus[row.status] = row.count;
      total += row.count;
    }
    stmt.free();
    return { total, by_status: byStatus };
  }

  // ─── 内部 ─────────────────────────────────────────────

  _ensureReady() {
    if (!this._ready || !this._db) throw new Error("TasksRepo not initialized. Call init() first.");
  }
}

// ─── 内部帮助函数 ──────────────────────────────────────

function _generateId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function _deserialize(row) {
  return {
    ...row,
    payload: _safeJson(row.payload, {}),
    schedule: row.schedule ? _safeJson(row.schedule, null) : null,
    result: _safeJson(row.result, {}),
    stats: _safeJson(row.stats, {}),
  };
}

function _safeJson(str, fallback) {
  if (!str || typeof str !== "string") return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = { TasksRepo, TASK_STATUS };