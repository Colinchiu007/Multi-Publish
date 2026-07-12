const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { AgentVisualJudge } = require("../src/agent/agent-visual-judge");

describe("AgentVisualJudge", () => {
  const judge = new AgentVisualJudge();

  it("noise: diff <0.5% returns noise", async () => {
    const r = await judge.judge({ testName: "home", misMatchPercentage: 0.3 });
    assert.equal(r.verdict, "noise");
    assert.equal(r.confidence, "high");
  });

  it("regression: interactive component >2% returns regression", async () => {
    const r = await judge.judge({ testName: "login-button", misMatchPercentage: 3.5 });
    assert.equal(r.verdict, "regression");
    assert.equal(r.confidence, "medium");
  });

  it("need_review: large diff >5% returns need_review", async () => {
    const r = await judge.judge({ testName: "home-page", misMatchPercentage: 8.0 });
    assert.equal(r.verdict, "need_review");
  });

  it("expected: moderate diff on non-interactive returns expected", async () => {
    const r = await judge.judge({ testName: "banner-image", misMatchPercentage: 1.5 });
    assert.equal(r.verdict, "noise");
  });

  it("LLM mode: when llmFn provided, returns parsed verdict", async () => {
    const judgeWithLLM = new AgentVisualJudge({
      llmFn: async () => JSON.stringify({ verdict: "expected", reasoning: "Intentional color change", confidence: "high" }),
    });
    const r = await judgeWithLLM.judge({ testName: "theme-update", misMatchPercentage: 12.0 });
    assert.equal(r.verdict, "expected");
    assert.equal(r.confidence, "high");
    assert.ok(r.reasoning);
  });

  it("LLM mode: handles malformed JSON gracefully", async () => {
    const judgeWithLLM = new AgentVisualJudge({
      llmFn: async () => "not json at all",
    });
    const r = await judgeWithLLM.judge({ testName: "broken", misMatchPercentage: 5.0 });
    assert.equal(r.verdict, "need_review");
  });

  it("judgeBatch: handles empty array", async () => {
    const results = await judge.judgeBatch([]);
    assert.deepEqual(results, []);
  });

  it("judgeBatch: handles multiple diffs", async () => {
    const diffs = [
      { testName: "noise", misMatchPercentage: 0.1 },
      { testName: "regression-button", misMatchPercentage: 3.0 },
    ];
    const results = await judge.judgeBatch(diffs);
    assert.equal(results.length, 2);
    assert.equal(results[0].verdict, "noise");
    assert.equal(results[1].verdict, "regression");
  });
});
