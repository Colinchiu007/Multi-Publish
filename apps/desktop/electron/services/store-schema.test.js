import { describe, it, expect } from "vitest";

describe("store-schema", () => {
  it("exports SCHEMA_SQL array", async () => {
    const { SCHEMA_SQL } = await import("../services/store-schema");
    expect(Array.isArray(SCHEMA_SQL)).toBe(true);
    expect(SCHEMA_SQL.length).toBeGreaterThanOrEqual(8);
  });

  it("each SQL statement starts with CREATE", async () => {
    const { SCHEMA_SQL, TABLE_NAMES } = await import("../services/store-schema");
    for (const sql of SCHEMA_SQL) {
      expect(sql.trim().startsWith("CREATE")).toBe(true);
    }
  });

  it("exports TABLE_NAMES with all expected tables", async () => {
    const { TABLE_NAMES } = await import("../services/store-schema");
    expect(TABLE_NAMES).toHaveProperty("accounts");
    expect(TABLE_NAMES).toHaveProperty("publish_history");
    expect(TABLE_NAMES).toHaveProperty("scheduled_tasks");
    expect(TABLE_NAMES).toHaveProperty("settings");
    expect(TABLE_NAMES).toHaveProperty("callback_logs");
    expect(TABLE_NAMES).toHaveProperty("batch_jobs");
    expect(TABLE_NAMES).toHaveProperty("publish_timeline");
    expect(TABLE_NAMES).toHaveProperty("model_providers");
    // Phase 2+：调用日志表
    expect(TABLE_NAMES).toHaveProperty("model_provider_logs");
  });

  it("SCHEMA_SQL 包含 model_provider_logs 表创建语句", async () => {
    const { SCHEMA_SQL } = await import("../services/store-schema");
    const tableSql = SCHEMA_SQL.find(s => s.includes("model_provider_logs"));
    expect(tableSql).toBeDefined();
    expect(tableSql).toContain("provider_id");
    expect(tableSql).toContain("category");
    expect(tableSql).toContain("action");
    expect(tableSql).toContain("status");
    expect(tableSql).toContain("latency_ms");
  });

  it("SCHEMA_SQL 包含 model_provider_logs 索引", async () => {
    const { SCHEMA_SQL } = await import("../services/store-schema");
    const indexSqls = SCHEMA_SQL.filter(s => s.includes("idx_model_provider_logs"));
    expect(indexSqls.length).toBeGreaterThanOrEqual(2);
  });

  it("safeJsonParse parses JSON strings safely", async () => {
    const { safeJsonParse } = await import("../services/store-schema");
    expect(safeJsonParse("[1,2,3]")).toEqual([1, 2, 3]);
    expect(safeJsonParse("invalid", [])).toEqual([]);
    expect(safeJsonParse("hello")).toBe("hello");
  });

  it("safeJsonStringify handles objects", async () => {
    const { safeJsonStringify } = await import("../services/store-schema");
    expect(safeJsonStringify({ a: 1 })).toBe("{\"a\":1}");
    expect(safeJsonStringify("hello")).toBe("hello");
  });

  it("buildUpdateQuery generates SET clause", async () => {
    const { buildUpdateQuery } = await import("../services/store-schema");
    const result = buildUpdateQuery({ name: "test", count: 5 });
    expect(result.sets).toEqual(["name = ?", "count = ?"]);
    expect(result.vals).toEqual(["test", 5]);
  });

  it("buildUpdateQuery serializes JSON keys", async () => {
    const { buildUpdateQuery } = await import("../services/store-schema");
    const result = buildUpdateQuery({ articles: [1, 2] });
    expect(result.sets).toEqual(["articles = ?"]);
    expect(JSON.parse(result.vals[0])).toEqual([1, 2]);
  });

  it("sanitizeUpdateFields rejects unknown field names (SQL injection prevention)", async () => {
    const { sanitizeUpdateFields } = await import("../services/store-schema");
    // 合法字段通过
    const ok = sanitizeUpdateFields("accounts", { name: "x", status: "active" });
    expect(ok.name).toBe("x");
    expect(ok.status).toBe("active");
    // 非法字段被过滤（防止 SQL 注入：字段名不能拼接到 SQL）
    const filtered = sanitizeUpdateFields("accounts", { "id = 1 OR 1=1 --": "x", name: "y" });
    expect(filtered).toEqual({ name: "y" });
  });

  it("sanitizeUpdateFields returns empty object when all fields unknown", async () => {
    const { sanitizeUpdateFields } = await import("../services/store-schema");
    const result = sanitizeUpdateFields("accounts", { "malicious--": 1, "drop table": 2 });
    expect(result).toEqual({});
  });

  it("sanitizeUpdateFields 不允许通用更新接口覆盖账号凭证", async () => {
    const { sanitizeUpdateFields } = await import("../services/store-schema");

    const result = sanitizeUpdateFields("accounts", {
      name: "安全名称",
      cookies: [{ name: "session", value: "attacker" }],
      localStorage: { token: "attacker" },
    });

    expect(result).toEqual({ name: "安全名称" });
  });

  it("sanitizeUpdateFields handles unknown table gracefully", async () => {
    const { sanitizeUpdateFields } = await import("../services/store-schema");
    const result = sanitizeUpdateFields("nonexistent_table", { name: "x" });
    expect(result).toEqual({});
  });

  it("TABLE_NAMES values match SCHEMA_SQL table names", async () => {
    const { TABLE_NAMES, SCHEMA_SQL } = await import("../services/store-schema");
    for (const [key, name] of Object.entries(TABLE_NAMES)) {
      const matches = SCHEMA_SQL.filter(s => s.includes(name));
      expect(matches.length).toBeGreaterThanOrEqual(1);
    }
  });
});
