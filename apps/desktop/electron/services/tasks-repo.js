// @ts-check
/**
 * TasksRepo 鈥?鎸佷箙鍖栦换鍔′粨搴?
 *
 * 浠?MediaTrace TasksRepo 绉绘锛?
 * - 6 绉嶇姸鎬? pending/running/completed/failed/canceled/paused
 * - 璋冨害绛栫暐: 涓€娆℃€?once)/寰幆(interval)
 * - findDueSchedules() 鈥?鏌ユ壘鍒版湡鐨勫畾鏃朵换鍔?
 * - 鎸佷箙鍖栬繘搴︾粺璁?
 * - updateStatus() 閮ㄥ垎鏇存柊妯″紡
 *
 * 鏂囦欢浣嶇疆: apps/desktop/electron/services/tasks-repo.js
 * 娉ㄦ剰: 鐩存帴浣跨敤 sql.js锛堥潪 sqlite-wrapper锛夛紝閬垮厤寮傛鍒濆鍖栭棶棰?
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
   * @param {string} dbPath - SQLite 鏁版嵁搴撴枃浠惰矾寰?
   */
  constructor(dbPath) {
    this.dbPath = dbPath;
    this._db = null;
    this._ready = false;
    this._initPromise = null;
  }

  /**
   * 鍒濆鍖栨暟鎹簱杩炴帴鍜岃〃缁撴瀯锛堝箓绛夛級
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

      // 鍔犺浇鎴栧垱寤烘暟鎹簱
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this._db = new SQL.Database(buffer);
      } else {
        this._db = new SQL.Database();
        // 纭繚鐩綍瀛樺湪
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
   * 淇濆瓨鍒扮鐩樺苟鍏抽棴杩炴帴
   */
  close() {
    if (this._db) {
      try {
        const data = this._db.export();
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        // 安全：原子写（写临时文件后 rename），防止崩溃中断损坏数据库
        const tmpPath = this.dbPath + '.tmp.' + process.pid;
        fs.writeFileSync(tmpPath, Buffer.from(data));
        fs.renameSync(tmpPath, this.dbPath);
      } catch (err) {
        log.warn("TasksRepo", "save on close failed: " + err.message);
      }
      this._db.close();
    }
    this._db = null;
    this._ready = false;
    this._initPromise = null;
  }

  // 鈹€鈹€鈹€ CRUD 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  /**
   * 鍒涘缓浠诲姟
   * @param {object} fields - { type, platform, payload, schedule }
   * @returns {object} 鍒涘缓鐨勪换鍔?
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
   * 鏍规嵁 ID 鑾峰彇浠诲姟
   * @param {string} id
   * @returns {object|null}
   */
  get(id) {
    this._ensureReady();
    const stmt = this._db.prepare("SELECT * FROM tasks WHERE id = ?");
    try {
      stmt.bind([id]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        return _deserialize(row);
      }
      return null;
    } finally {
      try { stmt.free(); } catch (_) { /* ignore */ }
    }
  }

  /**
   * 鍒楀嚭浠诲姟锛屾敮鎸佺瓫閫?
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
    try {
      stmt.bind(params);

      const rows = [];
      while (stmt.step()) {
        rows.push(_deserialize(stmt.getAsObject()));
      }
      return rows;
    } finally {
      try { stmt.free(); } catch (_) { /* ignore */ }
    }
  }

  /**
   * 绉婚櫎浠诲姟
   * @param {string} id
   * @returns {boolean}
   */
  /**
   * 绉婚櫎浠诲姟
   * @param {string} id
   * @returns {boolean}
   */
  remove(id) {
    this._ensureReady();
    this._db.run("DELETE FROM tasks WHERE id = ?", [id]);
    return this._db.getRowsModified() > 0;
  }

  // 鈹€鈹€鈹€ 鐘舵€佺鐞?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  /**
   * 鏇存柊浠诲姟鐘舵€侊紙閮ㄥ垎鏇存柊妯″紡锛?
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
   * 鍙栨秷浠诲姟
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
   * 鏆傚仠杩愯涓殑浠诲姟
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
   * 鎭㈠琚殏鍋滅殑浠诲姟
   * @param {string} id
   * @returns {boolean}
   */
  resume(id) {
    const task = this.get(id);
    if (!task || task.status !== TASK_STATUS.PAUSED) return false;
    this.updateStatus(id, TASK_STATUS.RUNNING);
    return true;
  }

  // 鈹€鈹€鈹€ 璋冨害 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  /**
   * 鏌ユ壘鍒版湡闇€鎵ц鐨勪换鍔?
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
    try {
      stmt.bind([TASK_STATUS.PENDING, now, TASK_STATUS.RUNNING, now]);

      const rows = [];
      while (stmt.step()) {
        rows.push(_deserialize(stmt.getAsObject()));
      }
      return rows;
    } finally {
      try { stmt.free(); } catch (_) { /* ignore */ }
    }
  }

  // 鈹€鈹€鈹€ 缁熻 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  /**
   * 浠诲姟缁熻
   * @returns {{ total: number, by_status: object }}
   */
  statistics() {
    this._ensureReady();
    const stmt = this._db.prepare("SELECT status, COUNT(*) as count FROM tasks GROUP BY status");
    try {
      const byStatus = {};
      let total = 0;
      while (stmt.step()) {
        const row = stmt.getAsObject();
        byStatus[row.status] = row.count;
        total += row.count;
      }
      return { total, by_status: byStatus };
    } finally {
      try { stmt.free(); } catch (_) { /* ignore */ }
    }
  }

  // 鈹€鈹€鈹€ 鍐呴儴 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  _ensureReady() {
    if (!this._ready || !this._db) throw new Error("TasksRepo not initialized. Call init() first.");
  }
}

// 鈹€鈹€鈹€ 鍐呴儴甯姪鍑芥暟 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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
