import { describe, it, expect, vi, afterAll } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-test-"));

describe("publish-history", () => {
  beforeAll(() => {
    process.env.PH_TEST_DATA_DIR = testDir;
    // 清除模块缓存，确保重新加载 publish-history
    vi.resetModules();
  });

  afterAll(() => {
    delete process.env.PH_TEST_DATA_DIR;
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("exports history deletion alongside the read APIs", () => {
    const ph = require("../services/publish-history");
    expect(typeof ph.addRecord).toBe("function");
    expect(typeof ph.listRecords).toBe("function");
    expect(typeof ph.getRecord).toBe("function");
    expect(typeof ph.getStats).toBe("function");
    expect(typeof ph.deleteRecords).toBe("function");
  });

  it("addRecord returns object with id, timestamp, and merged fields", () => {
    vi.resetModules();
    process.env.PH_TEST_DATA_DIR = testDir;
    const ph = require("../services/publish-history");
    const r = ph.addRecord({ platform: "wechat_mp", title: "test", success: true });
    expect(r).toHaveProperty("id");
    expect(r).toHaveProperty("timestamp");
    expect(r.platform).toBe("wechat_mp");
    expect(r.title).toBe("test");
    expect(r.success).toBe(true);
  });

  it("addRecord persists to disk", () => {
    vi.resetModules();
    process.env.PH_TEST_DATA_DIR = testDir;
    const ph = require("../services/publish-history");
    ph.addRecord({ platform: "test", data: "xyz" });
    const jsonlPath = path.join(testDir, "publish-history.jsonl");
    expect(fs.existsSync(jsonlPath)).toBe(true);
    const content = fs.readFileSync(jsonlPath, "utf-8");
    expect(content.trim().split("\n").length).toBeGreaterThanOrEqual(1);
  });

  it("listRecords returns { total, records }", () => {
    vi.resetModules();
    process.env.PH_TEST_DATA_DIR = testDir;
    const ph = require("../services/publish-history");
    const result = ph.listRecords();
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("records");
    expect(Array.isArray(result.records)).toBe(true);
  });

  it("listRecords filters by platform", () => {
    vi.resetModules();
    process.env.PH_TEST_DATA_DIR = testDir;
    const ph = require("../services/publish-history");
    const result = ph.listRecords({ platform: "nonexistent" });
    expect(result.total).toBe(0);
  });

  it("getRecord finds by id", () => {
    vi.resetModules();
    process.env.PH_TEST_DATA_DIR = testDir;
    const ph = require("../services/publish-history");
    const added = ph.addRecord({ platform: "findme", value: 42 });
    const found = ph.getRecord(added.id);
    expect(found).not.toBeNull();
    expect(found.id).toBe(added.id);
    expect(found.value).toBe(42);
  });

  it("getRecord returns null for missing id", () => {
    vi.resetModules();
    process.env.PH_TEST_DATA_DIR = testDir;
    const ph = require("../services/publish-history");
    expect(ph.getRecord("no-such-id")).toBeNull();
  });

  it("getStats returns stats object", () => {
    vi.resetModules();
    process.env.PH_TEST_DATA_DIR = testDir;
    const ph = require("../services/publish-history");
    const stats = ph.getStats();
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("success");
    expect(stats).toHaveProperty("failed");
    expect(stats).toHaveProperty("successRate");
    expect(stats).toHaveProperty("perPlatform");
    expect(stats).toHaveProperty("daily");
  });

  it("success + failed = total", () => {
    vi.resetModules();
    process.env.PH_TEST_DATA_DIR = testDir;
    const ph = require("../services/publish-history");
    const stats = ph.getStats();
    expect(stats.success + stats.failed).toBe(stats.total);
  });

  it("按 owner_subject 隔离读取、单条查询和统计", () => {
    vi.resetModules();
    process.env.PH_TEST_DATA_DIR = testDir;
    const ph = require("../services/publish-history");
    const recordA = ph.addRecord({ platform: "wechat_mp", title: "用户 A" }, "user-a");
    const recordB = ph.addRecord({ platform: "douyin", title: "用户 B" }, "user-b");

    expect(ph.listRecords({}, "user-a").records).toEqual([
      expect.objectContaining({ id: recordA.id, owner_subject: "user-a" }),
    ]);
    expect(ph.getRecord(recordB.id, "user-a")).toBeNull();
    expect(ph.getStats("user-b")).toMatchObject({ total: 1, perPlatform: { douyin: { total: 1 } } });
    expect(ph.listRecords({}, null)).toEqual({ total: 0, records: [] });
  });

  it("按 owner_subject 批量删除且保留其他用户记录", () => {
    vi.resetModules();
    process.env.PH_TEST_DATA_DIR = testDir;
    const ph = require("../services/publish-history");
    const recordA = ph.addRecord({ platform: "wechat_mp", title: "用户 A" }, "user-a");
    const recordB = ph.addRecord({ platform: "douyin", title: "用户 B" }, "user-b");

    expect(ph.deleteRecords([recordA.id], "user-a")).toEqual({ deleted: 1 });
    expect(ph.getRecord(recordA.id, "user-a")).toBeNull();
    expect(ph.getRecord(recordB.id, "user-b")).toEqual(expect.objectContaining({ id: recordB.id }));
    expect(ph.deleteRecords([recordB.id], "user-a")).toEqual({ deleted: 0 });
  });

  it("删除空列表或不存在记录时不改写历史", () => {
    vi.resetModules();
    process.env.PH_TEST_DATA_DIR = testDir;
    const ph = require("../services/publish-history");
    const record = ph.addRecord({ platform: "wechat_mp", title: "保留" }, "user-a");

    expect(ph.deleteRecords([], "user-a")).toEqual({ deleted: 0 });
    expect(ph.deleteRecords(["missing"], "user-a")).toEqual({ deleted: 0 });
    expect(ph.getRecord(record.id, "user-a")).toEqual(expect.objectContaining({ id: record.id }));
  });

  it("未启用身份服务时兼容显式 legacy 历史记录", () => {
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-legacy-"));
    const legacyRecord = {
      id: "legacy-record",
      platform: "wechat_mp",
      title: "迁移前发布记录",
      owner_subject: "__legacy__",
      timestamp: "2026-07-22T00:00:00.000Z",
    };

    try {
      fs.writeFileSync(
        path.join(legacyDir, "publish-history.jsonl"),
        JSON.stringify(legacyRecord) + "\n",
        "utf8",
      );
      process.env.PH_TEST_DATA_DIR = legacyDir;
      vi.resetModules();
      const ph = require("../services/publish-history");

      expect(ph.listRecords()).toEqual({ total: 1, records: [legacyRecord] });
      expect(ph.getRecord(legacyRecord.id)).toEqual(legacyRecord);
      expect(ph.getStats()).toMatchObject({ total: 1, perPlatform: { wechat_mp: { total: 1 } } });
    } finally {
      process.env.PH_TEST_DATA_DIR = testDir;
      try { fs.rmSync(legacyDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it("handles empty state", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-empty-"));
    process.env.PH_TEST_DATA_DIR = emptyDir;
    vi.resetModules();
    const ph = require("../services/publish-history");
    const result = ph.listRecords();
    expect(result.total).toBe(0);
    expect(result.records).toEqual([]);
    try { fs.rmSync(emptyDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });
});
