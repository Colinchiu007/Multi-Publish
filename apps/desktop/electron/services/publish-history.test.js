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
    expect(typeof ph.updateRecordAudit).toBe("function");
  });

  // P0-1 审核状态：监控结论回写**原记录**（就地更新），不新增行。
  // 用独立临时目录，避免污染上方按 owner 精确断言集合的用例。
  describe("updateRecordAudit（审核状态回写）", () => {
    const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-audit-test-"));
    afterAll(() => {
      try { fs.rmSync(auditDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });
    function freshHistory () {
      vi.resetModules();
      process.env.PH_TEST_DATA_DIR = auditDir;
      return require("../services/publish-history");
    }
    function lines (ph) {
      const p = path.join(auditDir, "publish-history.jsonl");
      return fs.existsSync(p) ? fs.readFileSync(p, "utf-8").split(/\r?\n/).filter(Boolean) : [];
    }

    it("明确结论就地更新原记录且不新增行", () => {
      const ph = freshHistory();
      const rec = ph.addRecord({ platform: "douyin", title: "审核", status: "success" }, "user-a");
      const before = lines(ph).length;

      const { updated, record } = ph.updateRecordAudit(
        rec.id,
        { auditStatus: "deny", monitorStatus: "rejected", platformWorkId: "aweme-9", auditedAt: "2026-10-09T00:00:00.000Z" },
        "user-a",
      );

      expect(updated).toBe(true);
      expect(record.auditStatus).toBe("deny");
      expect(record.platformWorkId).toBe("aweme-9");
      // 行数不变（旧形态 addRecord 会追加第二条）
      expect(lines(ph).length).toBe(before);
      // 落盘可读回，且主流程字段未被污染
      const reread = ph.listRecords({ limit: 50 }, "user-a").records.find(r => r.id === rec.id);
      expect(reread.auditStatus).toBe("deny");
      expect(reread.status).toBe("success");
      expect(reread.monitorStatus).toBe("rejected");
    });

    it("无定论/非法 auditStatus 一律不改任何字节（单向证据规则）", () => {
      const ph = freshHistory();
      const rec = ph.addRecord({ platform: "weibo", title: "不变", status: "success" }, "user-a");
      const before = lines(ph).join("\n");

      for (const bad of [null, undefined, "unknown", "bogus", "", 42]) {
        const r = ph.updateRecordAudit(rec.id, { auditStatus: bad, platformWorkId: "x" }, "user-a");
        expect(r.updated, String(bad)).toBe(false);
      }
      expect(lines(ph).join("\n")).toBe(before);
    });

    it("只吸收白名单键（监控响应不得越权改写 status/result/error）", () => {
      const ph = freshHistory();
      const rec = ph.addRecord({ platform: "weibo", title: "T", status: "success", success: true }, "user-a");

      ph.updateRecordAudit(rec.id, {
        auditStatus: "withdrawn",
        status: "failed",
        success: false,
        error: "注入",
        result: { hacked: true },
        platformWorkId: "w-1",
      }, "user-a");

      const reread = ph.listRecords({ limit: 50 }, "user-a").records.find(r => r.id === rec.id);
      expect(reread.auditStatus).toBe("withdrawn");
      expect(reread.platformWorkId).toBe("w-1");
      expect(reread.status).toBe("success");
      expect(reread.success).toBe(true);
      expect(reread.error).toBeUndefined();
      expect(reread.result).toBeUndefined();
    });

    it("owner 不匹配/记录不存在/非法 id 一律不改", () => {
      const ph = freshHistory();
      const rec = ph.addRecord({ platform: "zhihu", title: "隔离", status: "success" }, "user-b");
      const patch = { auditStatus: "deny", platformWorkId: "x" };

      expect(ph.updateRecordAudit(rec.id, patch, "user-c").updated).toBe(false);
      expect(ph.updateRecordAudit("nonexistent", patch, "user-b").updated).toBe(false);
      expect(ph.updateRecordAudit("", patch, "user-b").updated).toBe(false);
      expect(ph.updateRecordAudit(null, patch, "user-b").updated).toBe(false);
      const reread = ph.listRecords({ limit: 50 }, "user-b").records.find(r => r.id === rec.id);
      expect(reread.auditStatus).toBeUndefined();
    });
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
