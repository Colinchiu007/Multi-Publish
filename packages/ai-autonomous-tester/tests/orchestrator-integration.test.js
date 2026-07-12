/**
 * orchestrator-integration.test.js
 *
 * 集成测试：覆盖整个自主循环的三条主路径。
 * 使用 mock Visual/Functional runner，验证：
 *   - Scenario 1: 无 LLM → NEED_HUMAN（prompt 包模式）
 *   - Scenario 2: LLM verdict FAIL → FIX_AND_RETRY + FixEngine 自动生成 fixes
 *   - Scenario 3: LLM verdict PASS → STOP_SUCCESS
 *   - Scenario 4: Visual regression → FIX_AND_RETRY
 *   - Scenario 5: 视觉判断报告生成
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const BASE = path.resolve(__dirname, "..");

// ===== Mock Runners =====
class MockVisualRunner {
  constructor(result) { this.result = result || { type:"visual", summary:{total:0,passed:0,failed:0}, details:[] }; }
  async runTests() { return this.result; }
  async launch() {}
  async close() {}
}

class MockFunctionalRunner {
  constructor(result) { this.result = result || { type:"functional", summary:{total:0,passed:0,failed:0}, details:[] }; }
  async runTests() { return this.result; }
  async launch() {}
  async close() {}
}

describe("Orchestrator 集成测试", () => {
  const TMPDIR = path.join(__dirname, ".tmp-int");
  const REPORT_DIR = path.join(TMPDIR, "reports");

  before(() => {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  });

  after(() => {
    // fs.rmSync(TMPDIR, { recursive: true, force: true });
  });

  // ===============================================
  // Scenario 1: 无 LLM → prompt 包 → NEED_HUMAN
  // ===============================================
  it("Scenario 1: 无 LLM 时 verdict._mode=prompt → NEED_HUMAN", async () => {
    const { RequirementsVerifier, AgentJudge, AIAnalyzer } = require(BASE);

    const fakeFacts = {
      prdItems: [{ id:"1", name:"用户登录", type:"feature", source:"prd" }],
      implItems: [{ name:"LoginView", type:"route", path:"/login", file:"x.js", source:"code" }],
      evidence: [{ feature:"LoginView", file:"x.js" }],
      summary: { prdCount:1, implCount:1 },
    };

    const judge = new AgentJudge();
    const pkg = await judge.judge({ facts: fakeFacts, task:"coverage" });

    assert.equal(pkg._mode, "prompt");
    assert.equal(pkg._action, "AGENT_REQUIRED");
    assert.ok(pkg.prompt.length > 500);
    assert.ok(pkg.instructions);
    assert.ok(pkg.facts);

    // AIAnalyzer.decide 认出 verdictMode=prompt → NEED_HUMAN
    const analyzer = new AIAnalyzer();
    const analysis = await analyzer.analyze({
      visual: { details: [] },
      functional: { details: [] },
      requirements: {
        _verdict: { _mode:"prompt", prompt:pkg.prompt, instructions:pkg.instructions },
        details: [{ testName:"用户登录", _agentRequired:true }],
        coverageRate: 0,
      },
    });
    assert.equal(analysis.requirements.verdictMode, "prompt");

    const decision = analyzer.decide(analysis);
    assert.equal(decision.action, "NEED_HUMAN");
    assert.ok(decision.reason.includes("Agent verdict pending"));
  });

  // ===============================================
  // Scenario 2: LLM FAIL → FIX_AND_RETRY + FixEngine
  // ===============================================
  it("Scenario 2: LLM verdict FAIL → FIX_AND_RETRY + fixes", async () => {
    const { RequirementsVerifier, AgentJudge, FixEngine, TestOrchestrator, AutonomousTestRunner, RequirementsTestRunner, VisualTestRunner, FunctionalTestRunner } = require(BASE);

    const fakeFacts = {
      prdItems: [
        { id:"1", name:"用户登录", type:"feature", source:"prd" },
        { id:"2", name:"OAuth 集成", type:"feature", source:"prd" },
      ],
      implItems: [{ name:"LoginView", type:"route", file:"x.js", source:"code" }],
      evidence: [{ feature:"LoginView", file:"x.js" }],
      summary: { prdCount:2, implCount:1 },
    };

    const llmFn = async () => JSON.stringify({
      task:"coverage", decision:"FAIL", score:0.5,
      items: [
        { prdFeature:"用户登录", status:"COVERED", matchedImpl:"LoginView", evidence:"x.js", reasoning:"ok" },
        { prdFeature:"OAuth 集成", status:"NOT_IMPLEMENTED", reasoning:"no oauth" },
      ],
      summary: { covered:1, partial:0, missing:1, coverageRate:0.5 },
      recommendations: ["实现 OAuth 流程"],
      reasoning: "1/2 覆盖",
    });

    const testRunner = new AutonomousTestRunner({
      llmFn,
      visualRunner: new MockVisualRunner(),
      functionalRunner: new MockFunctionalRunner(),
      requirementsRunner: new RequirementsTestRunner({ llmFn, verifier: { collectFacts: async () => fakeFacts } }),
    });

    const orchestrator = new TestOrchestrator({
      testRunner,
      maxIterations: 1,
      iterationDelay: 1,
    });

    const report = await orchestrator.start({
      visual: {}, functional: {}, requirements: { prdPath:"fake.md" },
    });

    const history = report.iterationHistory[0];
    assert.equal(history.decision, "FIX_AND_RETRY");
    assert.ok(history.fixResult);
    assert.equal(history.fixResult.summary.total, 2);
    assert.equal(history.fixResult.summary.success, 2);

    // FixEngine.fromVerdict 也能生成对应 fixes
    const verdict = {
      decision:"FAIL", score:0.5, items:[
        { prdFeature:"OAuth 集成", status:"NOT_IMPLEMENTED", reasoning:"missing" },
      ],
      recommendations: ["实现 OAuth"],
      summary: { covered:1, partial:0, missing:1, coverageRate:0.5 },
    };
    const fixes = FixEngine.fromVerdict(verdict);
    assert.ok(fixes.length >= 2);
  });

  // ===============================================
  // Scenario 3: LLM PASS → STOP_SUCCESS
  // ===============================================
  it("Scenario 3: LLM verdict PASS → STOP_SUCCESS", async () => {
    const { TestOrchestrator, AutonomousTestRunner, RequirementsTestRunner, AgentJudge } = require(BASE);

    const fakeFacts = {
      prdItems: [{ id:"1", name:"用户登录", type:"feature", source:"prd" }],
      implItems: [{ name:"LoginView", type:"route", file:"x.js", source:"code" }],
      evidence: [{ feature:"LoginView", file:"x.js" }],
      summary: { prdCount:1, implCount:1 },
    };

    const llmFn = async () => JSON.stringify({
      task:"coverage", decision:"PASS", score:1.0,
      items: [{ prdFeature:"用户登录", status:"COVERED", matchedImpl:"LoginView", evidence:"x.js", reasoning:"ok" }],
      summary: { covered:1, partial:0, missing:0, coverageRate:1.0 },
      recommendations: [],
      reasoning: "全部覆盖",
    });

    const testRunner = new AutonomousTestRunner({
      llmFn,
      visualRunner: new MockVisualRunner(),
      functionalRunner: new MockFunctionalRunner(),
      requirementsRunner: new RequirementsTestRunner({ llmFn, verifier: { collectFacts: async () => fakeFacts } }),
    });

    const orchestrator = new TestOrchestrator({
      testRunner,
      maxIterations: 1,
      iterationDelay: 1,
    });

    const report = await orchestrator.start({
      visual: {}, functional: {}, requirements: { prdPath:"fake.md" },
    });

    assert.equal(report.finalStatus, "SUCCESS");
    assert.equal(report.iterationHistory[0].decision, "STOP_SUCCESS");
  });

  // ===============================================
  // Scenario 4: Visual regression → FIX_AND_RETRY
  // ===============================================
  it("Scenario 4: 像素回归 → FIX_AND_RETRY", async () => {
    const { TestOrchestrator, AutonomousTestRunner, AIAnalyzer } = require(BASE);

    const visualWithRegression = {
      type:"visual",
      summary: { total:1, passed:0, failed:1 },
      details: [
        { testName:"nav-bar", misMatchPercentage:"10.5", status:"FAILED" },
      ],
    };

    const analyzer = new AIAnalyzer();
    const analysis = await analyzer.analyze({
      visual: visualWithRegression,
      functional: { details: [] },
      requirements: null,
    });

    // Regression 检测：home 不是已知 change，mismatch > 2 → 回归
    assert.equal(analysis.visual.regressions.length, 1);
    assert.equal(analysis.visual.regressions[0].testName, "nav-bar");

    const decision = analyzer.decide(analysis);
    assert.equal(decision.action, "FIX_AND_RETRY");
    assert.ok(decision.fixes.length > 0);
  });

  // ===============================================
  // Scenario 5: 视觉判断报告生成 (agent-visual-judge.js 风格)
  // ===============================================
  it("Scenario 5: 视觉 diff 报告生成 + AgentJudge 判断", async () => {
    const { AIAnalyzer, AgentJudge } = require(BASE);

    // 模拟像素对比失败后有 diff 图的场景
    const testResults = {
      visual: {
        details: [
          { testName:"login-form", misMatchPercentage:"8.2", status:"FAILED" },
          { testName:"sidebar", misMatchPercentage:"1.1", status:"FAILED" },
        ],
      },
      functional: { details: [] },
      requirements: null,
    };

    const analyzer = new AIAnalyzer({ noiseThreshold: 0.5 });
    const analysis = await analyzer.analyze(testResults);

    // home 8.2% > 2 → regression
    // profile 1.1% - 不在噪声阈值内（> 0.5），也不在回归模式中 → uncertain → expectedChanges
    // 但 profile 不匹配回归 pattern，也不是已知变更，所以 → expectedChanges
    assert.ok(analysis.visual.regressions.some(r => r.testName === "login-form"));
    assert.equal(analysis.overallRisk, "HIGH");

    // 模拟 Agent 视觉判断 verdict（对应 Agent 用 view_image 看截图后给出判断）
    const visualVerdict = {
      task: "bug-classify",
      decision: "FAIL",
      score: 0.8,
      items: [
        { prdFeature:"login-form", status:"NOT_IMPLEMENTED", matchedImpl:"", evidence:"screenshots/login-form-current.png", reasoning:"登录按钮位置偏移" },
      ],
      summary: { covered:0, partial:0, missing:1, coverageRate:0 },
      recommendations: ["修复 login-form 页面按钮位置"],
      reasoning: "像素 diff 8.2% 是真实 bug",
    };

    const judge = new AgentJudge();
    const parsed = judge.parseVerdict(JSON.stringify(visualVerdict));
    assert.equal(parsed.decision, "FAIL");
    assert.equal(parsed.items[0].reasoning, "登录按钮位置偏移");
    assert.ok(parsed.valid);

    // 通过 AIAnalyzer 走 verdict FAIL 决策
    const visualAnalysis = await analyzer.analyze({
      visual: testResults,
      functional: { details: [] },
      requirements: {
        _verdict: { _mode:"llm", decision:"FAIL", items:visualVerdict.items, summary:visualVerdict.summary, recommendations:visualVerdict.recommendations },
        details: parsed.items.map(i => ({ testName:i.prdFeature, status:"FAILED" })),
        coverageRate: 0,
      },
    });
    const visualDecision = analyzer.decide(visualAnalysis);
    assert.equal(visualDecision.action, "FIX_AND_RETRY");
  });
});