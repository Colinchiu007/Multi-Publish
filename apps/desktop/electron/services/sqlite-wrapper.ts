import * as fs from "fs";
import * as path from "path";

let SQL: any = null;
let _initError: string | null = null;

try {
  const initSqlJs: any = require("sql.js");
  if (typeof initSqlJs === "function") {
    initSqlJs().then((m: any) => { SQL = m; }).catch((e: Error) => { _initError = e.message; });
  }
} catch (e: unknown) {
  _initError = `sql.js not installed: ${(e as Error).message}`;
}

class Statement {
  private _db: any;
  private _sql: string;

  constructor(db: any, sql: string) {
    this._db = db;
    this._sql = sql;
  }

  run(...params: any[]): { changes: number } {
    try {
      const stmt = this._db.prepare(this._sql);
      if (params.length > 0) stmt.bind(params);
      stmt.step();
      stmt.free();
    } catch (_e) { /* ignore */ }
    return { changes: 0 };
  }

  get(...params: any[]): any {
    try {
      const stmt = this._db.prepare(this._sql);
      if (params.length > 0) stmt.bind(params);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
      }
      stmt.free();
    } catch (_e) { return undefined; }
    return undefined;
  }

  all(...params: any[]): any[] {
    const rows: any[] = [];
    try {
      const stmt = this._db.prepare(this._sql);
      if (params.length > 0) stmt.bind(params);
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
    } catch (_e) { /* ignore */ }
    return rows;
  }
}

export class Database {
  private _dbPath: string;
  private _ready: boolean = false;
  private _db: any = null;

  constructor(dbPath: string) {
    this._dbPath = dbPath;
    this._init();
  }

  private _init(): void {
    if (!SQL) {
      if (_initError) console.warn("[sqlite-wrapper]", _initError);
      return;
    }
    try {
      this._db = new SQL.Database();
      if (fs.existsSync(this._dbPath)) {
        const buffer = fs.readFileSync(this._dbPath);
        this._db = new SQL.Database(buffer);
      }
      this._ready = true;
    } catch (e: unknown) {
      console.warn("[sqlite-wrapper] Failed to open DB:", (e as Error).message);
    }
  }

  pragma(sql: string): void {
    if (this._db) {
      try { this._db.exec(`PRAGMA ${sql}`); } catch (_e) { /* ignore */ }
    }
  }

  prepare(sql: string): Statement {
    if (!this._db) return new Statement(null, sql);
    return new Statement(this._db, sql);
  }

  exec(sql: string): void {
    if (this._db) {
      try { this._db.exec(sql); } catch (_e) { /* ignore */ }
    }
  }

  close(): void {
    if (this._db && this._dbPath) {
      try {
        const data = this._db.export();
        const dir = path.dirname(this._dbPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this._dbPath, Buffer.from(data));
      } catch (e: unknown) {
        console.warn("[sqlite-wrapper] Failed to save DB:", (e as Error).message);
      }
    }
    if (this._db) this._db.close();
  }
}