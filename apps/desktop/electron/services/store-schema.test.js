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

  it("TABLE_NAMES values match SCHEMA_SQL table names", async () => {
    const { TABLE_NAMES, SCHEMA_SQL } = await import("../services/store-schema");
    for (const [key, name] of Object.entries(TABLE_NAMES)) {
      const matches = SCHEMA_SQL.filter(s => s.includes(name));
      expect(matches.length).toBeGreaterThanOrEqual(1);
    }
  });
});
