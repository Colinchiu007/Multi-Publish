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
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it("exports all 4 functions", () => {
    const ph = require("../services/publish-history");
    expect(typeof ph.addRecord).toBe("function");
    expect(typeof ph.listRecords).toBe("function");
    expect(typeof ph.getRecord).toBe("function");
    expect(typeof ph.getStats).toBe("function");
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

  it("handles empty state", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-empty-"));
    process.env.PH_TEST_DATA_DIR = emptyDir;
    vi.resetModules();
    const ph = require("../services/publish-history");
    const result = ph.listRecords();
    expect(result.total).toBe(0);
    expect(result.records).toEqual([]);
    try { fs.rmSync(emptyDir, { recursive: true, force: true }); } catch {}
  });
});