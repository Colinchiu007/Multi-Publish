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

  it("success + failed + unclassified = total", () => {
    // 原断言是 `success + failed === total`，它把「本轮没有定论」（skipped / timeout / 缺 status）
    // 一起算成成功或失败 —— 而那正是 getStats 用 `r.success !== false` 判成功时的必然结果。
    // 活库里确实存在第三类（实测 skipped=13 / timeout=1），所以两类相加不等于总数才是正确行为。
    vi.resetModules();
    process.env.PH_TEST_DATA_DIR = testDir;
    const ph = require("../services/publish-history");
    const stats = ph.getStats();
    expect(stats.success + stats.failed + stats.unclassified).toBe(stats.total);
    expect(stats.success + stats.failed + stats.unclassified).toBeGreaterThanOrEqual(0);
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

  // P2-6a：发布统计的终态口径。
  // 缺陷是 `records.filter(r => r.success !== false)` —— 两个生产写入点
  // （bootstrap/phase4-events.js 的 task:success / task:failed）**只写 `status`，从不写顶层 `success`**，
  // 于是每条记录都被判成功。实测本机真数据 165 条：success=68 / failed=83 / skipped=13 / timeout=1，
  // 顶层 `success` 字段存在数 = 0 ⇒ 界面长期显示 failed=0、成功率 100%，
  // 且 Home.vue:195 那条「失败待办」永远不出现。
  describe("getStats 终态口径（没有定论 ≠ 成功）", () => {
    const statsDir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-stats-test-"));
    function freshHistory () {
      fs.rmSync(path.join(statsDir, "publish-history.jsonl"), { force: true });
      vi.resetModules();
      process.env.PH_TEST_DATA_DIR = statsDir;
      return require("../services/publish-history");
    }
    afterAll(() => {
      delete process.env.PH_TEST_DATA_DIR;
      try { fs.rmSync(statsDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it("status=failed 必须计入 failed，不得被当成成功", () => {
      const ph = freshHistory();
      ph.addRecord({ platform: "douyin", title: "成", status: "success" });
      ph.addRecord({ platform: "douyin", title: "败", status: "failed", error: "boom" });
      const stats = ph.getStats();
      expect(stats).toMatchObject({ total: 2, success: 1, failed: 1, unclassified: 0, successRate: 50 });
    });

    it("skipped / timeout / 缺 status 的记录既不算成功也不算失败，必须如实进 unclassified", () => {
      // 活库里真有这些终态（publish-monitor 的回写路径），把它们并进 success 就是造假。
      const ph = freshHistory();
      ph.addRecord({ platform: "weibo", title: "a", status: "success" });
      ph.addRecord({ platform: "weibo", title: "b", status: "skipped" });
      ph.addRecord({ platform: "weibo", title: "c", status: "timeout" });
      ph.addRecord({ platform: "weibo", title: "d" });
      const stats = ph.getStats();
      expect(stats).toMatchObject({ total: 4, success: 1, failed: 0, unclassified: 3 });
      // 如实不变量：三类之和等于总数；旧断言「success + failed = total」正是把第三类吞进成功的化石
      expect(stats.success + stats.failed + stats.unclassified).toBe(stats.total);
      // 分母只算「有定论」的，不得因为存在无定论记录就把成功率压低或抹成 100%
      expect(stats.successRate).toBe(100);
    });

    it("全无定论时成功率不得显示 100%（空分母不能当成全成功）", () => {
      const ph = freshHistory();
      ph.addRecord({ platform: "zhihu", title: "a", status: "skipped" });
      const stats = ph.getStats();
      expect(stats).toMatchObject({ total: 1, success: 0, failed: 0, unclassified: 1, successRate: 0 });
    });

    it("perPlatform 与 daily 必须和顶层同一判据（不得只有顶层是对的）", () => {
      const ph = freshHistory();
      const today = new Date().toISOString().slice(0, 10);
      ph.addRecord({ platform: "kuaishou", title: "a", status: "success", timestamp: `${today}T00:00:00.000Z` });
      ph.addRecord({ platform: "kuaishou", title: "b", status: "failed", timestamp: `${today}T00:00:00.000Z` });
      ph.addRecord({ platform: "kuaishou", title: "c", status: "timeout", timestamp: `${today}T00:00:00.000Z` });
      const stats = ph.getStats();
      expect(stats.perPlatform.kuaishou).toEqual({ total: 3, success: 1, failed: 1, unclassified: 1 });
      const day = stats.daily.find(d => d.date === today);
      expect(day).toBeDefined();
      expect(day.total).toBe(3);
      expect(day.success).toBe(1);
      expect(day.failed).toBe(1);
      // 顶层与分平台/分日三处必须互相自洽，否则第四处漂移随时可以发生而不被发现
      expect(stats.perPlatform.kuaishou.success).toBe(stats.success);
      expect(day.success).toBe(stats.success);
    });

    it("接线守卫：源码里不得再出现「顶层 success 字段」判据", () => {
      // 结构锁：判据只准有一份（按 status 分类）。留这条是因为同一个表达式在 getStats 里出现过三次，
      // 只在顶层修好就等于没修——下一次有人在第四处照抄就悄悄回退。
      // 必须先剥注释：本文件 §分类函数的注释里就**原样引用**了这个错误写法来解释为什么不能用它，
      // 不剥的话守卫会把注释当成代码命中（本仓既有口径：注释里的字样不算声明）。
      const src = fs.readFileSync(path.join(__dirname, "publish-history.js"), "utf8");
      const codeOnly = src
        .split(/\r?\n/)
        .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join("\n");
      // 按**语义形态**禁，不按字面量禁。只写 `r.success !== false` 的话，改个变量名
      // （record.success !== false）、换成 `!=` / `=== true`、或倒过来写成 `!.success`
      // 都能整条绕过 —— 锁守的是文本而不是语义。这三种变体是外部评审（后端轴）指出的
      // Critical，且实测都能骗过旧锁。
      const SEMANTIC_RETURNS = [
        [/\.\s*success\s*[!=]==?\s*(?:false|true)/, "按顶层 success 字段做布尔比较"],
        [/!\s*[A-Za-z_$][\w$]*\.success\b/, "按顶层 success 字段取反判存在"],
      ];
      for (const [re, why] of SEMANTIC_RETURNS) {
        const hit = codeOnly.match(re);
        expect(hit, `publish-history.js 出现「${why}」写法：${hit && hit[0]} —— 终态判据只能读 status`).toBeNull();
      }
      // 2 = 1 处定义 + 1 处调用。三档统计（顶层 / perPlatform / daily）共用**同一次**分类结果，
      // 所以调用点只有一处；出现第二处调用点＝有人绕开这个循环另算一份，要重新审。
      expect(codeOnly.match(/classifyPublishStatus\s*\(/g) || []).toHaveLength(2);
    });

    it("孤儿孪生实现不得被任何源码接线（否则同一错判据会随第二份实现复活）", () => {
      // 外部评审（前端轴）指出：上面那条结构锁只守**本文件**，所以「终态判据只有一份」
      // 这句话此前只在单文件内成立 —— `packages/shared-utils/src/publish-history.js`
      // 里还留着同一判据（实测 3 处），当前全仓零引用，因此它只是一颗未爆的雷：
      // 谁 import 它，统计口径立刻分叉，而两侧各自的单测都会绿。
      // 与其删它（跨包清理，另开 PR 说理由），先加一道**接线棘轮**：接线即红。
      const { execFileSync } = require("child_process");
      // 先取**真实仓库根**再搜：pathspec 是相对 cwd 解析的，而 vitest 的 cwd 是 apps/desktop，
      // 直接给 `apps packages scripts` 会指向根本不存在的 apps/desktop/apps ⇒ git grep 返回 rc=1
      // （"无命中"），被下面的空结果分支吞掉 ⇒ 棘轮恒绿。实测正是这样骗过了一个真实的接线者。
      const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
      expect(root.length, "取不到仓库根 —— 无根的搜索结果是空集，不得当「零引用」用").toBeGreaterThan(3);
      // 盲区自检：被禁的孪生文件必须真的在那个根下，否则"没人引用"只是因为"没有那个文件"。
      expect(fs.existsSync(path.join(root.replace(/\\/g, "/"), "packages/shared-utils/src/publish-history.js")),
        `孪生文件不在 ${root} 下：搜索域失效，本条判据不可信`).toBe(true);
      let out; // 两条分支各自赋值，初值永不被读（no-useless-assignment）
      try {
        out = execFileSync("git", ["-C", root, "grep", "-l", "shared-utils/src/publish-history",
          "--", "apps", "packages", "scripts", ":(exclude)*.md"], { encoding: "utf8" });
      } catch (e) {
        if (e.status === 1) out = ""; // git grep 无命中时 rc=1，属正常空结果
        else throw e;
      }
      const importers = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        .filter(f => !f.endsWith("shared-utils/src/publish-history.js")) // 孪生本体
        .filter(f => !f.endsWith("electron/services/publish-history.test.js")); // 本文件的注释里有这个路径
      expect(importers, `publish-history 出现第二份实现的接线者：${importers.join(",")} —— 终态判据必须留在唯一实现里`).toEqual([]);
    });
  });
});

/**
 * 关联键契约（docs/PRD-AUDIT-WRITEBACK-TASKID-KEY-2026-10-07.md）
 *
 * 真机现场：B 站投稿回查拿到 published，但 history 里 auditStatus 始终缺席，
 * 日志只有 `audit-update-skipped`。根因是生产调用点传的是**队列任务 id**
 * （phase4-events.js:91 `updateRecordAudit(task.id, ...)`），而实现只按 `record.id` 匹配。
 * 规范键由读侧与注释共同确立：PublishHistory.vue:633 按 `record.taskId || record.id` join，
 * phase4-events.js:151-153 明写「关联键的语义＝发布任务 id」。
 *
 * 上方既有用例调的是 `updateRecordAudit(rec.id, ...)` —— 走的是**生产从不使用**的那条键，
 * 所以它全绿而真机红。本块补的正是 taskId 那条唯一被真实走到的路径。
 */
describe("updateRecordAudit 关联键契约（taskId 为规范键）", () => {
  const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-key-test-"));
  afterAll(() => {
    try { fs.rmSync(keyDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });
  function fresh () {
    vi.resetModules();
    process.env.PH_TEST_DATA_DIR = keyDir;
    return require("../services/publish-history");
  }
  function rawRecords () {
    const p = path.join(keyDir, "publish-history.jsonl");
    return fs.existsSync(p)
      ? fs.readFileSync(p, "utf-8").split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l))
      : [];
  }
  function wipe () {
    const p = path.join(keyDir, "publish-history.jsonl");
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  const PATCH = { auditStatus: "published", monitorStatus: "published", platformWorkId: "BV1HyHC6mExS", auditedAt: "2026-10-07T08:32:33.631Z" };

  // K1：生产实际传的键是队列任务 id —— 这条路径此前完全没人测过
  it("K1 生产实际传的键（taskId）必须能命中并真的落盘", () => {
    wipe();
    const ph = fresh();
    const rec = ph.addRecord(
      { platform: "bilibili", title: "取证稿", status: "success", taskId: "task_1_1791361909906" },
      "user-a",
    );
    // 前提自证：addRecord 生成的主键与队列 id 确实不同（否则本用例测不出错配）
    expect(rec.id).not.toBe("task_1_1791361909906");

    const { updated, record } = ph.updateRecordAudit("task_1_1791361909906", PATCH, "user-a");
    expect(updated, "传队列 task id 必须能命中 —— 真机现场就是这里恒 false").toBe(true);
    expect(record.auditStatus).toBe("published");

    // 独立回读落盘文件，而不是只看返回值（返回值可以由内存拼出来）
    const onDisk = rawRecords().find(r => r.taskId === "task_1_1791361909906");
    expect(onDisk.auditStatus).toBe("published");
    expect(onDisk.monitorStatus).toBe("published");
    expect(onDisk.auditedAt).toBe("2026-10-07T08:32:33.631Z");
    expect(onDisk.status).toBe("success"); // 主流程字段不得被污染
    expect(rawRecords()).toHaveLength(1); // 就地更新，不追加第二条
  });

  // K2：存量记录可能没有 taskId，id 路径必须继续可用（兜底不得被"修规范键"顺手删掉）
  it("K2 记录无 taskId 时，仍可按 record.id 命中回写", () => {
    wipe();
    const ph = fresh();
    const rec = ph.addRecord({ platform: "douyin", title: "无队列键", status: "success" }, "user-a");
    const { updated } = ph.updateRecordAudit(rec.id, PATCH, "user-a");
    expect(updated).toBe(true);
    expect(rawRecords()[0].auditStatus).toBe("published");
  });

  // K3：夹具必须对不同输入返回不同内容，否则"按键区分"这一整类缺陷对它结构性免疫
  it("K3 两条相邻记录：传 A 的 taskId 只改到 A，绝不串到 B", () => {
    wipe();
    const ph = fresh();
    ph.addRecord({ platform: "weibo", title: "A", status: "success", taskId: "task-A" }, "user-a");
    ph.addRecord({ platform: "weibo", title: "B", status: "success", taskId: "task-B" }, "user-a");

    const { updated, record } = ph.updateRecordAudit("task-A", PATCH, "user-a");
    expect(updated).toBe(true);
    expect(record.taskId).toBe("task-A");

    const all = rawRecords();
    const a = all.find(r => r.taskId === "task-A");
    const b = all.find(r => r.taskId === "task-B");
    expect(a.auditStatus).toBe("published");
    expect(b.auditStatus, "B 不得被串改").toBeUndefined();
  });

  // K4：修键不得顺手放宽归属边界
  it("K4 taskId 命中但 owner 不符 ⇒ 不回写（多租户边界不因这次修键而失守）", () => {
    wipe();
    const ph = fresh();
    ph.addRecord({ platform: "zhihu", title: "别人的", status: "success", taskId: "task-own" }, "user-a");
    // 正向对照：同一记录、同一键，owner 正确时**必须**改到 ——
    // 否则"owner 不符 ⇒ false"会因为"谁都改不到"而恒真，这条锁就没有区分力。
    const ok = ph.updateRecordAudit("task-own", PATCH, "user-a");
    expect(ok.updated, "owner 正确时必须命中（否则下面的负断言是恒真式）").toBe(true);
    wipe();
    const ph2 = fresh();
    ph2.addRecord({ platform: "zhihu", title: "别人的", status: "success", taskId: "task-own" }, "user-a");
    const { updated } = ph2.updateRecordAudit("task-own", PATCH, "user-b");
    expect(updated).toBe(false);
    expect(rawRecords()[0].auditStatus).toBeUndefined();
  });

  // K6：退化键 "undefined" 不得命中「没有 taskId」的记录 ——
  // 空值保护（String(x || "")）唯一的可观测面就在这里，不测等于没锁。
  it("K6 传入退化键 \"undefined\" 时不回写（否则 String(undefined) 会冒充缺字段记录）", () => {
    wipe();
    const ph = fresh();
    ph.addRecord({ platform: "bilibili", title: "缺队列键", status: "success" }, "user-a");

    const { updated } = ph.updateRecordAudit("undefined", PATCH, "user-a");
    expect(updated, "调用方把 undefined 字符串化后传来的键，不得被当成有效匹配").toBe(false);
    expect(rawRecords()[0].auditStatus).toBeUndefined();
  });
});
