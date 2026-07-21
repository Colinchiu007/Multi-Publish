import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import initSqlJs from "sql.js";

vi.mock("../logger", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import accountMethods from "./account-store.js";
import { SCHEMA_SQL } from "../store-schema.js";

let SQL;
let rawDb;

function createStatement(sql) {
  return {
    run(...params) {
      rawDb.run(sql, params);
      return { changes: rawDb.getRowsModified() };
    },
    get(...params) {
      const statement = rawDb.prepare(sql);
      try {
        statement.bind(params);
        return statement.step() ? statement.getAsObject() : undefined;
      } finally {
        statement.free();
      }
    },
    all(...params) {
      const statement = rawDb.prepare(sql);
      const rows = [];
      try {
        statement.bind(params);
        while (statement.step()) rows.push(statement.getAsObject());
        return rows;
      } finally {
        statement.free();
      }
    },
  };
}

function createStoreContext() {
  const db = {
    prepare: createStatement,
    transaction(fn) {
      return () => {
        rawDb.run("BEGIN");
        try {
          const result = fn();
          rawDb.run("COMMIT");
          return result;
        } catch (error) {
          rawDb.run("ROLLBACK");
          throw error;
        }
      };
    },
  };
  return { ...accountMethods, db, _ready: true };
}

beforeEach(async () => {
  SQL ||= await initSqlJs();
  rawDb = new SQL.Database();
  for (const sql of SCHEMA_SQL) rawDb.run(sql);
});

afterEach(() => {
  rawDb?.close();
});

describe("account-store 默认账号约束", () => {
  it("只允许把指定平台下真实存在的账号设为默认账号", () => {
    const store = createStoreContext();
    store.addAccount({ id: 1, platform: "wechat_mp", name: "公众号" });
    store.addAccount({ id: 2, platform: "zhihu", name: "知乎" });

    expect(store.setDefaultAccount("wechat_mp", 1)).toBe(true);
    expect(store.getAccount(1).is_default).toBe(1);

    expect(store.setDefaultAccount("wechat_mp", 2)).toBe(false);
    expect(store.getAccount(1).is_default).toBe(1);
    expect(store.getAccount(2).is_default).toBe(0);
  });

  it("账号不存在时保持现有默认账号不变", () => {
    const store = createStoreContext();
    store.addAccount({ id: 1, platform: "wechat_mp", name: "公众号" });
    expect(store.setDefaultAccount("wechat_mp", 1)).toBe(true);

    expect(store.setDefaultAccount("wechat_mp", 999)).toBe(false);
    expect(store.getAccount(1).is_default).toBe(1);
  });
});

describe("account-store 创建账号输入校验", () => {
  it("空账号或非法平台不写入数据库", () => {
    const store = createStoreContext();

    expect(store.addAccount(null)).toBe(false);
    expect(store.addAccount({ id: "acc-1", platform: "" })).toBe(false);
    expect(store.addAccount({ id: "acc-2", platform: 123 })).toBe(false);

    expect(createStatement("SELECT COUNT(*) AS count FROM accounts").get()).toEqual({ count: 0 });
  });

  it("接受显式数字 ID 或自动生成 ID，并保留必要的公开字段", () => {
    const store = createStoreContext();

    expect(store.addAccount({ id: 1, platform: "github", name: "名称", avatar: "a.png", status: "active" })).toBe(true);
    expect(store.addAccount({ platform: "zhihu", name: "知乎" })).toBe(true);

    expect(store.getAccount(1)).toMatchObject({ id: 1, platform: "github", name: "名称", avatar: "a.png" });
    expect(store.getAccount(2)).toMatchObject({ id: 2, platform: "zhihu", name: "知乎" });
  });
});

describe("account-store 删除账号级联", () => {
  it("按解析后的账号 ID 精确删除 JSON 关联数据，不受数值、空格或嵌套格式影响", () => {
    const store = createStoreContext();
    store.addAccount({ id: 1, platform: "wechat_mp", name: "目标账号" });
    store.addAccount({ id: 10, platform: "wechat_mp", name: "前缀账号" });

    const tasks = [
      ["task-number", "wechat_mp", '{"accountId":1}'],
      ["task-string", "wechat_mp", '{"accountId":"1"}'],
      ["task-space", "wechat_mp", '{ "accountId" : "1" }'],
      ["task-nested", "wechat_mp", '{"target":{"account_id":"1"}}'],
      ["task-prefix", "wechat_mp", '{"accountId":"10"}'],
      ["task-other-platform", "zhihu", '{"accountId":1}'],
      ["task-invalid", "wechat_mp", '{invalid-json'],
    ];
    for (const [id, platform, article] of tasks) {
      rawDb.run(
        "INSERT INTO scheduled_tasks (id, platform, article) VALUES (?, ?, ?)",
        [id, platform, article],
      );
    }

    const history = [
      ["wechat_mp", '{"accountId":1}'],
      ["wechat_mp", '{ "result": { "account_id": "1" } }'],
      ["wechat_mp", '{"accountId":"10"}'],
      ["zhihu", '{"accountId":1}'],
    ];
    for (const [platform, result] of history) {
      rawDb.run("INSERT INTO publish_history (platform, result) VALUES (?, ?)", [platform, result]);
    }
    rawDb.run("INSERT INTO settings (key, value) VALUES (?, ?)", ["default_account:wechat_mp", "1"]);
    rawDb.run("INSERT INTO settings (key, value) VALUES (?, ?)", ["custom:1", "保留"]);

    expect(store.deleteAccount(1)).toBe(true);

    const remainingTasks = createStatement("SELECT id FROM scheduled_tasks ORDER BY id").all().map(row => row.id);
    expect(remainingTasks).toEqual(["task-invalid", "task-other-platform", "task-prefix"]);
    const remainingHistory = createStatement("SELECT platform, result FROM publish_history ORDER BY id").all();
    expect(remainingHistory).toEqual([
      { platform: "wechat_mp", result: '{"accountId":"10"}' },
      { platform: "zhihu", result: '{"accountId":1}' },
    ]);
    expect(createStatement("SELECT value FROM settings WHERE key = ?").get("default_account:wechat_mp")).toBeUndefined();
    expect(createStatement("SELECT value FROM settings WHERE key = ?").get("custom:1")).toEqual({ value: "保留" });
  });

  it("级联清理中途失败时回滚账号和关联数据", () => {
    const store = createStoreContext();
    store.addAccount({ id: 1, platform: "wechat_mp", name: "目标账号" });
    rawDb.run(
      "INSERT INTO scheduled_tasks (id, platform, article) VALUES (?, ?, ?)",
      ["task-1", "wechat_mp", '{"accountId":1}'],
    );
    const prepare = store.db.prepare;
    store.db.prepare = (sql) => {
      if (sql.startsWith("DELETE FROM scheduled_tasks")) throw new Error("模拟级联删除失败");
      return prepare(sql);
    };

    expect(() => store.deleteAccount(1)).toThrow("模拟级联删除失败");
    expect(store.getAccount(1)).not.toBeNull();
    expect(createStatement("SELECT id FROM scheduled_tasks WHERE id = ?").get("task-1")).toEqual({ id: "task-1" });
  });

  it("删除非默认账号时保留同平台默认账号设置", () => {
    const store = createStoreContext();
    store.addAccount({ id: 1, platform: "wechat_mp", name: "普通账号" });
    store.addAccount({ id: 2, platform: "wechat_mp", name: "默认账号" });
    rawDb.run("INSERT INTO settings (key, value) VALUES (?, ?)", ["default_account:wechat_mp", "2"]);

    store.deleteAccount(1);

    expect(createStatement("SELECT value FROM settings WHERE key = ?").get("default_account:wechat_mp")).toEqual({ value: "2" });
  });
});
