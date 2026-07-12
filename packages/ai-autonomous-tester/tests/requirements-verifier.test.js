const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const { RequirementsVerifier } = require("../src/verifier/requirements-verifier");

describe("RequirementsVerifier", () => {
  it("collectFacts: 采集 PRD items + code features + evidence", async () => {
    const mockPrdParser = {
      parse: async () => [{ id: "1", name: "登录", type: "feature", source: "prd" }],
    };
    const mockDetector = {
      detect: async () => [
        { name: "LoginView", type: "route", path: "/login", file: "src/Login.vue", source: "code" },
      ],
    };
    const v = new RequirementsVerifier({ prdParser: mockPrdParser, featureDetector: mockDetector });
    const facts = await v.collectFacts({ prdPath: "fake.md" });
    assert.equal(facts.prdItems.length, 1);
    assert.equal(facts.implItems.length, 1);
    assert.equal(facts.evidence.length, 1);
    assert.equal(facts.evidence[0].feature, "LoginView");
    assert.equal(facts.summary.prdCount, 1);
    assert.equal(facts.summary.implCount, 1);
  });

  it("collectFacts: 无 prdPath 时只采集 code", async () => {
    const mockDetector = {
      detect: async () => [{ name: "X", type: "route", source: "code" }],
    };
    const v = new RequirementsVerifier({ featureDetector: mockDetector });
    const facts = await v.collectFacts({});
    assert.equal(facts.prdItems.length, 0);
    assert.equal(facts.implItems.length, 1);
  });

  it("assessCoverage: 调用 LLM 并解析", async () => {
    const v = new RequirementsVerifier();
    const facts = {
      prdItems: [{ id: "1", name: "Login", source: "prd" }],
      implItems: [{ name: "LoginView", type: "route", file: "x.vue" }],
      evidence: [{ feature: "LoginView", file: "x.vue" }],
      summary: { prdCount: 1, implCount: 1 },
    };
    const llmFn = async () => JSON.stringify({
      coverage: [{ prdFeature: "Login", status: "COVERED", matchedImpl: "LoginView", reasoning: "ok" }],
      summary: { covered: 1, partial: 0, missing: 0, coverageRate: 1.0 },
      recommendations: [],
    });
    const result = await v.assessCoverage(facts, llmFn);
    assert.equal(result.summary.coverageRate, 1.0);
    assert.equal(result.summary.covered, 1);
  });

  it("assessCoverage: LLM 输出带 markdown 代码块也能解析", async () => {
    const facts = {
      prdItems: [{ id: "1", name: "A" }],
      implItems: [{ name: "A View" }],
      evidence: [], summary: { prdCount: 1, implCount: 1 },
    };
    const llmFn = async () => "```json\n{\"summary\":{\"covered\":1,\"partial\":0,\"missing\":0,\"coverageRate\":1.0},\"coverage\":[],\"recommendations\":[]}\n```";
    const v = new RequirementsVerifier();
    const result = await v.assessCoverage(facts, llmFn);
    assert.equal(result.summary.coverageRate, 1.0);
  });

  it("verify (deprecated): 返回旧格式但标记 _deprecated", async () => {
    const mockPrdParser = { parse: async () => [{ id: "1", name: "用户登录", type: "feature", source: "prd" }] };
    const mockDetector = { detect: async () => [{ name: "LoginView", type: "route", path: "/login", file: "x.js", source: "code" }] };
    const v = new RequirementsVerifier({ prdParser: mockPrdParser, featureDetector: mockDetector });
    const result = await v.verify("fake.md", { srcDir: "." });
    assert.ok(result._deprecated);
    assert.equal(result.totalPrdFeatures, 1);
    assert.equal(result.totalImplementedFeatures, 1);
  });
});