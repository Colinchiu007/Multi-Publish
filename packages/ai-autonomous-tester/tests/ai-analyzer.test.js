const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { AIAnalyzer } = require("../src/ai-analyzer");
const { AgentJudge } = require("../src/agent/agent-judge");

function fakeFacts(prdCount = 1) {
  const prdItems = Array.from({ length: prdCount }, (_, i) => ({
    id: `f${i}`, name: `功能${i + 1}`, type: "feature", source: "prd",
  }));
  const implItems = [{ name: "功能1 View", type: "route", file: "x.vue", source: "code" }];
  return { prdItems, implItems, evidence: implItems.map(i => ({ feature: i.name, file: i.file })), summary: { prdCount, implCount: 1 } };
}

describe("AIAnalyzer", () => {
  const a = new AIAnalyzer();

  it("analyze: 正常 verdict → coverageRate 正确", async () => {
    const testResults = {
      visual: { details: [] },
      functional: { details: [] },
      requirements: {
        _verdict: {
          _mode: "llm",
          decision: "PASS", score: 1.0,
          items: [{ prdFeature: "A", status: "COVERED" }],
          summary: { covered: 1, partial: 0, missing: 0, coverageRate: 1.0 },
        },
        coverageRate: 1.0,
        details: [{ testName: "A", status: "PASSED" }],
      },
    };
    const analysis = await a.analyze(testResults);
    assert.equal(analysis.requirements.verdictMode, "llm");
    assert.equal(analysis.requirements.covered.length, 1);
    assert.equal(analysis.requirements.coverageRate, 1.0);
  });

  it("analyze: prompt 包模式 → verdictMode=prompt", async () => {
    const testResults = {
      visual: { details: [] },
      functional: { details: [] },
      requirements: {
        _verdict: {
          _mode: "prompt",
          prompt: "请判断",
          instructions: "Output JSON",
        },
        details: [{ testName: "A", _agentRequired: true }],
        coverageRate: 0,
      },
    };
    const analysis = await a.analyze(testResults);
    assert.equal(analysis.requirements.verdictMode, "prompt");
    assert.equal(analysis.requirements.coverageRate, 0);
  });

  it("analyze: 无 requirements 时返回空", async () => {
    const analysis = await a.analyze({ visual: {}, functional: {} });
    assert.equal(analysis.requirements.coverageRate, 0);
  });

  it("decide: verdictMode=prompt → NEED_HUMAN", () => {
    const analysis = {
      visual: { regressions: [], expectedChanges: [] },
      functional: { failed: [] },
      requirements: { verdictMode: "prompt", uncovered: [], verdict: { prompt: "请判断" } },
    };
    const d = a.decide(analysis);
    assert.equal(d.action, "NEED_HUMAN");
    assert.ok(d.reason.includes("Agent verdict pending"));
  });

  it("decide: verdict=PASS → STOP_SUCCESS", () => {
    const analysis = {
      visual: { regressions: [], expectedChanges: [] },
      functional: { failed: [] },
      requirements: {
        verdictMode: "llm",
        verdict: { _mode: "llm", decision: "PASS" },
        covered: [{ testName: "A" }],
        uncovered: [],
        coverageRate: 1.0,
      },
    };
    const d = a.decide(analysis);
    assert.equal(d.action, "STOP_SUCCESS");
  });

  it("decide: verdict=FAIL → FIX_AND_RETRY", () => {
    const analysis = {
      visual: { regressions: [], expectedChanges: [] },
      functional: { failed: [] },
      requirements: {
        verdictMode: "llm",
        verdict: {
          _mode: "llm",
          decision: "FAIL",
          items: [{ prdFeature: "A", status: "NOT_IMPLEMENTED" }],
          recommendations: ["实现 A"],
        },
        covered: [],
        uncovered: [{ testName: "A" }],
        coverageRate: 0,
      },
    };
    const d = a.decide(analysis);
    assert.equal(d.action, "FIX_AND_RETRY");
    assert.ok(d.fixes.length > 0);
  });

  it("decide: verdict=NEED_HUMAN → NEED_HUMAN", () => {
    const analysis = {
      visual: { regressions: [], expectedChanges: [] },
      functional: { failed: [] },
      requirements: {
        verdictMode: "llm",
        verdict: { _mode: "llm", decision: "NEED_HUMAN", reasoning: "复杂模块" },
        covered: [],
        uncovered: [],
        coverageRate: 0.5,
      },
    };
    const d = a.decide(analysis);
    assert.equal(d.action, "NEED_HUMAN");
  });

  it("decide: visual regression → FIX_AND_RETRY", () => {
    const analysis = {
      visual: { regressions: [{ testName: "home", misMatchPercentage: "5.2" }], expectedChanges: [] },
      functional: { failed: [] },
      requirements: { verdictMode: "none", covered: [], uncovered: [], coverageRate: 1 },
    };
    const d = a.decide(analysis);
    assert.equal(d.action, "FIX_AND_RETRY");
  });

  it("decide: visual expectedChange → UPDATE_BASELINE", () => {
    const analysis = {
      visual: { regressions: [], expectedChanges: [{ testName: "home", misMatchPercentage: "3.1" }] },
      functional: { failed: [] },
      requirements: { verdictMode: "none", covered: [], uncovered: [], coverageRate: 1 },
    };
    const d = a.decide(analysis);
    assert.equal(d.action, "UPDATE_BASELINE");
  });

  it("analyzeVisual: 按 noise 阈值分类", () => {
    const v = a.analyzeVisual({
      details: [
        { testName: "home", misMatchPercentage: "0.1" },
        { testName: "dashboard", misMatchPercentage: "3.5" },
        { testName: "landing-form", misMatchPercentage: "15.0" },
      ],
    });
    assert.equal(v.noise.length, 1);   // 0.1 <= 0.5
    assert.equal(v.regressions.length, 1); // button + regression pattern
    // nav 3.5% 不确定，可能是 expectedChange
    assert.equal(v.expectedChanges.length, 1);
  });

  it("analyzeFunctional: 区分 passed / failed / flaky", () => {
    const f = a.analyzeFunctional({
      details: [
        { testName: "T1", status: "PASSED" },
        { testName: "T2", status: "FAILED" },
        { testName: "T3", status: "FLAKY" },
      ],
    });
    assert.equal(f.passed.length, 1);
    assert.equal(f.failed.length, 1);
    assert.equal(f.flaky.length, 1);
  });
});