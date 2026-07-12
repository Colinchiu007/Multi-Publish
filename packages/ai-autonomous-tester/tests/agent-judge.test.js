const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { AgentJudge } = require("../src/agent/agent-judge");

function fakeFacts(prdCount = 2) {
  const prdItems = Array.from({ length: prdCount }, (_, i) => ({
    id: `f${i}`, name: `功能${i + 1}`, type: "feature", source: "prd",
  }));
  const implItems = [
    { name: "功能1 View", type: "route", path: "/func1", file: "src/Func1.vue", source: "code" },
  ];
  return { prdItems, implItems, evidence: implItems.map(i => ({ feature: i.name, file: i.file })), summary: { prdCount, implCount: 1 } };
}

describe("AgentJudge", () => {
  it("无 LLM 时返回 prompt 包", async () => {
    const j = new AgentJudge();
    const result = await j.judge({ facts: fakeFacts(2) });
    assert.equal(result._mode, "prompt");
    assert.equal(result._action, "AGENT_REQUIRED");
    assert.ok(result.prompt.length > 100);
    assert.ok(result.instructions);
    assert.ok(result.facts);
  });

  it("buildVerdictPrompt 含 PRD items + code features", () => {
    const j = new AgentJudge();
    const prompt = j.buildVerdictPrompt({ facts: fakeFacts(3), task: "coverage" });
    assert.ok(prompt.includes("PRD Features (3)"));
    assert.ok(prompt.includes("Detected Code Features (1)"));
    assert.ok(prompt.includes("Output JSON Schema"));
    assert.ok(prompt.includes("Judging Rules"));
  });

  it("parseVerdict: 标准 JSON", () => {
    const j = new AgentJudge();
    const input = JSON.stringify({
      task: "coverage", decision: "PASS", score: 1.0, items: [
        { prdFeature: "登录", status: "COVERED", matchedImpl: "LoginView", evidence: "file.js", reasoning: "ok" },
      ],
      summary: { covered: 1, partial: 0, missing: 0, coverageRate: 1.0 },
      recommendations: [], reasoning: "all good",
    });
    const v = j.parseVerdict(input, { task: "coverage" });
    assert.equal(v.decision, "PASS");
    assert.equal(v.score, 1.0);
    assert.ok(v.valid);
    assert.equal(v.items.length, 1);
    assert.equal(v.items[0].prdFeature, "登录");
    assert.equal(v.summary.coverageRate, 1.0);
  });

  it("parseVerdict: 夹在 markdown 代码块中", () => {
    const j = new AgentJudge();
    const md = "```json\n{ \"task\":\"coverage\", \"decision\":\"FAIL\", \"score\":0.3, \"items\":[], \"summary\":{\"covered\":0,\"partial\":0,\"missing\":3,\"coverageRate\":0}, \"recommendations\":[\"修复 A\"], \"reasoning\":\"缺失\" }\n```";
    const v = j.parseVerdict(md, { task: "coverage" });
    assert.equal(v.decision, "FAIL");
    assert.equal(v.score, 0.3);
    assert.ok(v.valid);
  });

  it("parseVerdict: 决策归一化", () => {
    const j = new AgentJudge();
    const cases = { ACCEPT: "PASS", APPROVED: "PASS", OK: "PASS", REJECT: "FAIL", BLOCK: "FAIL", REVIEW: "NEED_HUMAN", MANUAL: "NEED_HUMAN" };
    for (const [input, expected] of Object.entries(cases)) {
      const json = JSON.stringify({ decision: input });
      const v = j.parseVerdict(json);
      assert.equal(v.decision, expected, `输入 ${input} 应归一化为 ${expected}`);
    }
  });

  it("parseVerdict: malformed 输入兜底", () => {
    const j = new AgentJudge();
    const v = j.parseVerdict("这不是 JSON", { task: "coverage" });
    assert.equal(v.decision, "NEED_HUMAN");
    assert.ok(!v.valid);
    assert.ok(v._parseError);
    assert.ok(v._rawOutput);
  });

  it("parseVerdict: null/undefined 输入", () => {
    const j = new AgentJudge();
    const v1 = j.parseVerdict(null, { task: "coverage" });
    assert.equal(v1.decision, "NEED_HUMAN");
    const v2 = j.parseVerdict(undefined, { task: "coverage" });
    assert.equal(v2.decision, "NEED_HUMAN");
  });

  it("validateVerdict: 有效 verdict 返回 true", () => {
    const j = new AgentJudge();
    assert.ok(j.validateVerdict({ task: "coverage", decision: "PASS", score: 1.0 }));
    assert.ok(j.validateVerdict({ task: "coverage", decision: "FAIL", score: 0 }));
    assert.ok(j.validateVerdict({ task: "coverage", decision: "NEED_HUMAN", score: 0.5 }));
  });

  it("validateVerdict: 无效 verdict 返回 false", () => {
    const j = new AgentJudge();
    assert.ok(!j.validateVerdict(null));
    assert.ok(!j.validateVerdict({}));
    assert.ok(!j.validateVerdict({ task: "abc", decision: "INVALID", score: 0 }));
    assert.ok(!j.validateVerdict({ task: "abc", decision: "PASS" })); // 缺 score
  });

  it("注入 LLM 模式: 自动调用并解析", async () => {
    const llm = async () => JSON.stringify({
      task: "coverage", decision: "PASS", score: 0.9, items: [],
      summary: { covered: 1, partial: 0, missing: 0, coverageRate: 1.0 },
      recommendations: [], reasoning: "mock",
    });
    const j = new AgentJudge({ llmFn: llm });
    const v = await j.judge({ facts: fakeFacts(1) });
    assert.equal(v.decision, "PASS");
    assert.equal(v.score, 0.9);
    assert.ok(v.valid);
  });

  it("注入 LLM 上下文 llmFn: 优先于构造函数", async () => {
    const ctorLlm = async () => "should not be called";
    const ctxLlm = async () => JSON.stringify({
      task: "coverage", decision: "FAIL", score: 0, items: [],
      summary: { covered: 0, partial: 0, missing: 1, coverageRate: 0 },
      recommendations: ["fix"], reasoning: "mock",
    });
    const j = new AgentJudge({ llmFn: ctorLlm });
    const v = await j.judge({ facts: fakeFacts(1), llmFn: ctxLlm });
    assert.equal(v.decision, "FAIL");
  });
});