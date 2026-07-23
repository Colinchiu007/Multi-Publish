const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
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
  it("CLI 将 none provider 作为 prompt 模式并兼容 --threshold", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-judge-cli-"));
    const prdPath = path.join(tempDir, "PRD.md");
    const srcDir = path.join(tempDir, "src");
    const outDir = path.join(tempDir, "reports");
    const cliPath = path.join(__dirname, "..", "scripts", "run-agent-judge.js");

    fs.mkdirSync(srcDir);
    fs.writeFileSync(prdPath, "# PRD\n\n## 功能需求\n\n- F1 登录\n");
    fs.writeFileSync(path.join(srcDir, "login.js"), "export const login = () => true;\n");

    try {
      const result = spawnSync(process.execPath, [
        cliPath,
        `--prd=${prdPath}`,
        `--src=${srcDir}`,
        "--llm=none",
        "--threshold=0.75",
        `--out=${outDir}`,
      ], { encoding: "utf8" });

      assert.equal(result.status, 2, result.stderr || result.stdout);
      assert.match(result.stdout, /LLM:\s+\(none, will output prompt package\)/);
      assert.match(result.stdout, /Threshold:\s+0\.75/);
      assert.ok(fs.readdirSync(outDir).some(file => file.startsWith("agent-judge-prompt-")));

      const summaryFile = fs.readdirSync(outDir).find(file => file.startsWith("agent-judge-summary-"));
      const summary = JSON.parse(fs.readFileSync(path.join(outDir, summaryFile), "utf8"));
      assert.equal(summary.llmProvider, null);
      assert.equal(summary.coverageThreshold, 0.75);
      assert.equal(summary.finalReport.mode, "prompt");
      assert.equal(summary.exitCode, 2);

      const envOutDir = path.join(tempDir, "env-reports");
      const envResult = spawnSync(process.execPath, [
        cliPath,
        `--prd=${prdPath}`,
        `--src=${srcDir}`,
        "--coverageThreshold=0.65",
        `--out=${envOutDir}`,
      ], {
        encoding: "utf8",
        env: { ...process.env, LLM_PROVIDER: " NONE " },
      });

      assert.equal(envResult.status, 2, envResult.stderr || envResult.stdout);
      const envSummaryFile = fs.readdirSync(envOutDir).find(file => file.startsWith("agent-judge-summary-"));
      const envSummary = JSON.parse(fs.readFileSync(path.join(envOutDir, envSummaryFile), "utf8"));
      assert.equal(envSummary.llmProvider, null);
      assert.equal(envSummary.coverageThreshold, 0.65);
      assert.equal(envSummary.finalReport.mode, "prompt");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

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
