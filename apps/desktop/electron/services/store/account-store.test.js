import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import initSqlJs from "sql.js";

vi.mock("../logger", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import accountMethods from "./account-store.js";
import { SCHEMA_SQL } from "../store-schema.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAccountCredentialCrypto } from "../account-credential-crypto.js";

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

    expect(store.getAccount(1)).toMatchObject({ id: "1", platform: "github", name: "名称", avatar: "a.png" });
    expect(store.listAccounts("zhihu")).toEqual([
      expect.objectContaining({ platform: "zhihu", name: "知乎" }),
    ]);
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
        "INSERT INTO scheduled_tasks (owner_subject, id, platform, article) VALUES (?, ?, ?, ?)",
        ["__legacy__", id, platform, article],
      );
    }

    const history = [
      ["wechat_mp", '{"accountId":1}'],
      ["wechat_mp", '{ "result": { "account_id": "1" } }'],
      ["wechat_mp", '{"accountId":"10"}'],
      ["zhihu", '{"accountId":1}'],
    ];
    for (const [index, [platform, result]] of history.entries()) {
      rawDb.run(
        "INSERT INTO publish_history (owner_subject, id, platform, result) VALUES (?, ?, ?, ?)",
        ["__legacy__", `history-${index}`, platform, result],
      );
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
      "INSERT INTO scheduled_tasks (owner_subject, id, platform, article) VALUES (?, ?, ?, ?)",
      ["__legacy__", "task-1", "wechat_mp", '{"accountId":1}'],
    );
    const prepare = store.db.prepare;
    store.db.prepare = (sql) => {
      if (sql.startsWith("DELETE FROM scheduled_tasks")) throw new Error("模拟级联删除失败");
      return prepare(sql);
    };

    expect(store.deleteAccount(1)).toBe(false);
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

describe("account-store 凭证加密落盘（Stage -1.1）", () => {
  const tempDirs = [];
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  // 真实依赖：复用 account-credential-crypto + credential-store 主密钥（含 safeStorage 模拟）
  function createCryptoAdapter() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-acc-enc-"));
    tempDirs.push(dir);
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: value => Buffer.from(`protected:${value}`, "utf8"),
      decryptString: value => Buffer.from(value).toString("utf8").replace(/^protected:/, ""),
    };
    return createAccountCredentialCrypto({ userDataDir: dir, safeStorage });
  }

  it("加密可用时 addAccount 只落加密列，明文列清空", () => {
    const store = createStoreContext();
    store._accountCrypto = createCryptoAdapter();
    const cookies = [{ name: "session", value: "secret" }];
    const localStorage = { token: "private" };
    expect(store.addAccount({ id: 1, platform: "wechat_mp", name: "加密账号", cookies, localStorage })).toBe(true);
    const row = createStatement("SELECT cookies, localStorage, cookies_enc, localStorage_enc FROM accounts WHERE id = ?").get("1");
    expect(row.cookies).toBe("");
    expect(row.localStorage).toBe("");
    expect(row.cookies_enc).not.toBeNull();
    expect(row.localStorage_enc).not.toBeNull();
  });

  it("加密可用时 getAccount 能解密还原 cookies/localStorage", () => {
    const store = createStoreContext();
    store._accountCrypto = createCryptoAdapter();
    const cookies = [{ name: "session", value: "secret" }];
    const localStorage = { token: "private" };
    store.addAccount({ id: 1, platform: "zhihu", name: "知乎", cookies, localStorage });
    const account = store.getAccount(1);
    expect(account.cookies).toEqual(cookies);
    expect(account.localStorage).toEqual(localStorage);
  });

  it("加密可用时 OAuth 型 localStorage 凭证同样被加密落盘并还原", () => {
    const store = createStoreContext();
    store._accountCrypto = createCryptoAdapter();
    const tokenRecord = { accessToken: "at-secret", refreshToken: "rt-secret" };
    const accountId = "oauth-douyin-1";
    expect(store.addAccount({ id: accountId, platform: "douyin", name: "douyin (OAuth)", cookies: [], localStorage: { oauth_token: JSON.stringify(tokenRecord) } })).toBe(true);
    const account = store.getAccount(accountId);
    expect(account.localStorage.oauth_token).toBe(JSON.stringify(tokenRecord));
    const raw = createStatement("SELECT localStorage, localStorage_enc FROM accounts WHERE id = ?").get(accountId);
    expect(raw.localStorage).toBe("");
    expect(raw.localStorage_enc).not.toBeNull();
  });

  it("无加密适配器时保持明文列读写（向后兼容）", () => {
    const store = createStoreContext();
    const cookies = [{ name: "a", value: "b" }];
    store.addAccount({ id: 1, platform: "wechat_mp", name: "明文账号", cookies, localStorage: { k: "v" } });
    const row = createStatement("SELECT cookies, localStorage, cookies_enc FROM accounts WHERE id = ?").get("1");
    expect(JSON.parse(row.cookies)).toEqual(cookies);
    expect(row.cookies_enc).toBeNull();
    const account = store.getAccount(1);
    expect(account.cookies).toEqual(cookies);
  });

  it("cookies_enc 缺失（存量未迁移）时回退明文列解析", () => {
    const store = createStoreContext();
    rawDb.run(
      "INSERT INTO accounts (owner_subject, id, platform, name, cookies, localStorage) VALUES (?, ?, ?, ?, ?, ?)",
      ["__legacy__", "legacy-1", "wechat_mp", "存量账号", '[{"name":"old","value":"x"}]', '{"t":"1"}'],
    );
    store._accountCrypto = createCryptoAdapter();
    const account = store.getAccount("legacy-1");
    expect(account.cookies).toEqual([{ name: "old", value: "x" }]);
    expect(account.localStorage).toEqual({ t: "1" });
  });

  it("enc 列存在但解密失败（数据损坏/主密钥变更）时回退明文列", () => {
    const store = createStoreContext();
    store._accountCrypto = createCryptoAdapter();
    rawDb.run(
      "INSERT INTO accounts (owner_subject, id, platform, name, cookies, localStorage, cookies_enc, localStorage_enc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ["__legacy__", "bad-1", "wechat_mp", "损坏账号", '[{"name":"ok","value":"1"}]', '{"fallback":true}', new Uint8Array(Buffer.from("corrupted-ciphertext-abcdef")), new Uint8Array(Buffer.from("corrupted-ciphertext-abcdef"))],
    );
    const account = store.getAccount("bad-1");
    expect(account.cookies).toEqual([{ name: "ok", value: "1" }]);
    expect(account.localStorage).toEqual({ fallback: true });
  });

  it("migrateAccountCredentials 将存量明文迁移到加密列并清空明文，读取可解密", () => {
    const store = createStoreContext();
    store._accountCrypto = createCryptoAdapter();
    rawDb.run(
      "INSERT INTO accounts (owner_subject, id, platform, name, cookies, localStorage) VALUES (?, ?, ?, ?, ?, ?)",
      ["__legacy__", "m1", "wechat_mp", "存量1", '[{"name":"a","value":"b"}]', '{"token":"t1"}'],
    );
    rawDb.run(
      "INSERT INTO accounts (owner_subject, id, platform, name, cookies, localStorage) VALUES (?, ?, ?, ?, ?, ?)",
      ["__legacy__", "m2", "zhihu", "存量2", '[]', '{}'],
    );
    const result = store.migrateAccountCredentials();
    expect(result.migrated).toBe(1);
    expect(result.rows).toBe(1);
    const migrated = createStatement("SELECT cookies, localStorage, cookies_enc, localStorage_enc FROM accounts WHERE id = ?").get("m1");
    expect(migrated.cookies).toBe("");
    expect(migrated.localStorage).toBe("");
    expect(migrated.cookies_enc).not.toBeNull();
    expect(migrated.localStorage_enc).not.toBeNull();
    expect(store.getAccount("m1").cookies).toEqual([{ name: "a", value: "b" }]);
    // 空凭证行不迁移（仍为默认明文值）
    const untouched = createStatement("SELECT cookies, localStorage, cookies_enc FROM accounts WHERE id = ?").get("m2");
    expect(untouched.cookies).toBe("[]");
    expect(untouched.localStorage).toBe("{}");
    expect(untouched.cookies_enc).toBeNull();
  });

  it("加密不可用时 migrateAccountCredentials 跳过并保持明文", () => {
    const store = createStoreContext();
    store._accountCrypto = {
      isEncryptionAvailable: () => false,
      encrypt: () => null,
      decrypt: () => null,
    };
    rawDb.run(
      "INSERT INTO accounts (owner_subject, id, platform, name, cookies) VALUES (?, ?, ?, ?, ?)",
      ["__legacy__", "s1", "wechat_mp", "跳过", '[{"name":"a","value":"b"}]'],
    );
    const result = store.migrateAccountCredentials();
    expect(result.skipped).toBe(true);
    const row = createStatement("SELECT cookies FROM accounts WHERE id = ?").get("s1");
    expect(JSON.parse(row.cookies)).toEqual([{ name: "a", value: "b" }]);
  });

  it("无存量明文时 migrateAccountCredentials 返回 0 行", () => {
    const store = createStoreContext();
    store._accountCrypto = createCryptoAdapter();
    expect(store.migrateAccountCredentials()).toEqual({ migrated: 0, rows: 0 });
  });

  it("migrateAccountCredentials 在未就绪时安全返回", () => {
    const store = createStoreContext();
    store._ready = false;
    store._accountCrypto = createCryptoAdapter();
    expect(store.migrateAccountCredentials()).toEqual({ migrated: 0 });
  });
});
