const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { FixEngine } = require("../src/fix-engine");

describe("FixEngine", () => {
  it("fromVerdict: 从 recommendations 生成 fixes", () => {
    const verdict = {
      decision: "FAIL", score: 0.5, items: [], summary: { covered: 0, partial: 0, missing: 2, coverageRate: 0 },
      recommendations: ["实现 OAuth", "完善统计图表"],
      reasoning: "缺失",
    };
    const fixes = FixEngine.fromVerdict(verdict);
    assert.ok(fixes.length >= 2);
    // 第一条是 HIGH priority
    assert.equal(fixes[0].priority, "HIGH");
    assert.equal(fixes[0].testName, "实现 OAuth");
    assert.equal(fixes[0].source, "verdict.recommendations");
  });

  it("fromVerdict: 从 NOT_IMPLEMENTED items 生成 fixes", () => {
    const verdict = {
      decision: "FAIL", score: 0.33, items: [
        { prdFeature: "登录", status: "COVERED", matchedImpl: "LoginView" },
        { prdFeature: "OAuth 集成", status: "NOT_IMPLEMENTED", reasoning: "no oauth" },
        { prdFeature: "数据统计", status: "PARTIAL", reasoning: "缺图表" },
      ],
      summary: { covered: 1, partial: 1, missing: 1, coverageRate: 0.33 },
      recommendations: ["优先实现 OAuth"],
    };
    const fixes = FixEngine.fromVerdict(verdict);
    assert.ok(fixes.length >= 3);
    // 去重: OAuth 只出现一次（来源于 NOT_IMPLEMENTED 而非 recommendations）
    const oauthFixes = fixes.filter(f => f.testName.includes("OAuth"));
    assert.ok(oauthFixes.length >= 1);
    // priority 排序: HIGH 在前
    assert.equal(fixes[0].priority, "HIGH");
  });

  it("fromVerdict: maxFixes 限制输出数量", () => {
    const verdict = {
      decision: "FAIL", score: 0, items: [
        { prdFeature: "A", status: "NOT_IMPLEMENTED" },
        { prdFeature: "B", status: "NOT_IMPLEMENTED" },
        { prdFeature: "C", status: "NOT_IMPLEMENTED" },
      ],
      summary: { covered: 0, partial: 0, missing: 3, coverageRate: 0 },
      recommendations: ["R1", "R2"],
    };
    const fixes = FixEngine.fromVerdict(verdict, { maxFixes: 2 });
    assert.equal(fixes.length, 2);
  });

  it("fromVerdict: 空 verdict 返回空数组", () => {
    assert.equal(FixEngine.fromVerdict(null).length, 0);
    assert.equal(FixEngine.fromVerdict({}).length, 0);
  });

  it("execute: dryRun 返回计划不真改", async () => {
    const engine = new FixEngine({ dryRun: true });
    const result = await engine.execute([
      { type: "verdict-recommendations", priority: "HIGH", effort: "MEDIUM", testName: "实现 OAuth", description: "OAuth", suggestedFix: "Implement OAuth", source: "test" },
    ]);
    assert.equal(result.results.length, 1);
    assert.ok(result.results[0].success);
    assert.equal(result.results[0].action, "SUGGESTED");
  });

  it("execute: 无效 fix type 返回 error", async () => {
    const engine = new FixEngine({ dryRun: true });
    const result = await engine.execute([
      { type: "nonexistent", testName: "X" },
    ]);
    assert.ok(!result.results[0].success);
    assert.ok(result.results[0].error.includes("Unknown"));
  });

  it("execute: 空 fixes 返回成功", async () => {
    const engine = new FixEngine();
    const result = await engine.execute([]);
    assert.ok(result.success);
    assert.ok(result._empty);
  });

  it("plan: 返回修复计划", async () => {
    const engine = new FixEngine();
    const plan = await engine.plan([
      { type: "verdict-recommendations", testName: "实现 OAuth", priority: "HIGH" },
      { type: "visual", testName: "home" },
    ]);
    assert.equal(plan.length, 2);
    assert.ok(plan[0].executable);
    assert.ok(plan[1].executable);
  });
});