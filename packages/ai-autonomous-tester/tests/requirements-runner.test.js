const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { RequirementsTestRunner } = require("../src/runners/requirements-runner");
const { filterPrdItemsByFeatureIds } = require("../src/runners/requirements-runner");

describe("filterPrdItemsByFeatureIds", () => {
  const items = [
    { id: "feat_aaa", name: "A", source: "prd" },
    { id: "feat_bbb", name: "B", source: "prd" },
    { id: "feat_ccc", name: "C", source: "prd" },
    { name: "no-id", source: "prd" },
  ];

  it("requiredIds 为空时保持全量（兼容旧行为）", () => {
    assert.equal(filterPrdItemsByFeatureIds(items, []).length, items.length);
    assert.equal(filterPrdItemsByFeatureIds(items, undefined).length, items.length);
  });

  it("只保留本 PR 关联的需求项", () => {
    const result = filterPrdItemsByFeatureIds(items, ["feat_bbb"]);
    assert.deepEqual(result.map((i) => i.id), ["feat_bbb"]);
  });

  it("未命中时返回空数组（调用方据此报告型跳过，历史需求不再算失败）", () => {
    assert.equal(filterPrdItemsByFeatureIds(items, ["feat_zzz"]).length, 0);
  });
});

describe("RequirementsTestRunner", () => {
  it("constructor: sets options", () => {
    const r = new RequirementsTestRunner({ useAgentJudge: false });
    assert.ok(r);
    assert.equal(r.useAgentJudge, false);
  });

  it("runTests: no prdPath or facts returns skipped", async () => {
    const r = new RequirementsTestRunner();
    const result = await r.runTests({});
    assert.ok(result.skipped);
  });

  it("runTests: with prdPath calls _runWithAgentJudge", async () => {
    const mockVerifier = {
      collectFacts: async () => ({ prdItems: [{ id: "1", name: "??", source: "prd" }], implItems: [], evidence: [], summary: {} }),
    };
    const mockJudge = {
      judge: async () => ({ _mode: "prompt", prompt: "test", instructions: "test", facts: {} }),
    };
    const r = new RequirementsTestRunner({ verifier: mockVerifier, judge: mockJudge });
    const result = await r.runTests({ prdPath: "/fake/prd.md", srcDir: "./src" });
    assert.equal(result._mode, "agent-required");
  });

  it("runTests: with facts uses them directly", async () => {
    const mockJudge = {
      judge: async () => ({ _mode: "prompt", prompt: "test", facts: {} }),
    };
    const r = new RequirementsTestRunner({ judge: mockJudge });
    const facts = { prdItems: [{ id: "1", name: "A", source: "prd" }], implItems: [], evidence: [] };
    const result = await r.runTests({ facts });
    assert.equal(result._mode, "agent-required");
    assert.ok(result._facts);
  });

  it("runTests: llmFn produces verdict with COVERED items", async () => {
    const fakeVerdict = {
      _mode: "llm",
      decision: "PASS",
      score: 1.0,
      items: [{ prdFeature: "????", status: "COVERED", matchedImpl: "LoginView" }],
      summary: { covered: 1, partial: 0, missing: 0, coverageRate: 1.0 },
    };
    const mockJudge = { judge: async () => fakeVerdict };
    const r = new RequirementsTestRunner({ judge: mockJudge });
    const facts = { prdItems: [{ id: "1", name: "????", source: "prd" }], implItems: [{ name: "LoginView" }], evidence: [] };
    const result = await r.runTests({ facts });
    assert.equal(result._decision, "PASS");
    assert.equal(result.coverageRate, 1.0);
    assert.equal(result.details.length, 1);
    assert.equal(result.details[0].status, "PASSED");
  });

  it("runTests: llmFn with NOT_IMPLEMENTED items", async () => {
    const fakeVerdict = {
      _mode: "llm",
      decision: "FAIL",
      score: 0.5,
      items: [{ prdFeature: "????", status: "NOT_IMPLEMENTED", reasoning: "missing" }],
      summary: { covered: 0, partial: 0, missing: 1, coverageRate: 0 },
    };
    const mockJudge = { judge: async () => fakeVerdict };
    const r = new RequirementsTestRunner({ judge: mockJudge });
    const facts = { prdItems: [{ id: "1", name: "????", source: "prd" }], implItems: [], evidence: [] };
    const result = await r.runTests({ facts });
    assert.equal(result._decision, "FAIL");
    assert.equal(result.details[0].status, "FAILED");
    assert.equal(result.details[0].type, "not-implemented");
  });
});
