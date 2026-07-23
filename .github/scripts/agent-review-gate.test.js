const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  evaluateAgentJudgeGate,
  evaluateAutonomousGate,
} = require("./agent-review-gate");

function withReportDir(run) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-review-gate-"));
  try {
    run(reportDir);
  } finally {
    fs.rmSync(reportDir, { recursive: true, force: true });
  }
}

function writeJson(reportDir, fileName, value) {
  fs.writeFileSync(path.join(reportDir, fileName), JSON.stringify(value));
}

test("Agent Judge 仅在无模型且存在 prompt 包时降级为审计告警", () => {
  withReportDir(reportDir => {
    fs.writeFileSync(path.join(reportDir, "agent-judge-prompt-1.md"), "人工审计包");

    const advisory = evaluateAgentJudgeGate({ reportDir, llmProvider: " NONE " });
    assert.equal(advisory.exitCode, 0);
    assert.equal(advisory.status, "PROMPT_REVIEW_REQUIRED");

    const missing = evaluateAgentJudgeGate({ reportDir, llmProvider: "openai" });
    assert.equal(missing.exitCode, 1);
    assert.equal(missing.status, "MISSING_VERDICT");
  });
});

test("Agent Judge 的真实 verdict 继续阻塞 FAIL 和 NEED_HUMAN", () => {
  withReportDir(reportDir => {
    writeJson(reportDir, "agent-judge-verdict-pass.json", { decision: "PASS" });
    const pass = evaluateAgentJudgeGate({ reportDir, llmProvider: "openai" });
    assert.equal(pass.exitCode, 0);
    assert.equal(pass.status, "PASS");

    fs.rmSync(path.join(reportDir, "agent-judge-verdict-pass.json"));
    writeJson(reportDir, "agent-judge-verdict-fail.json", { decision: "FAIL" });
    const failure = evaluateAgentJudgeGate({ reportDir, llmProvider: "openai" });
    assert.equal(failure.exitCode, 1);
    assert.equal(failure.status, "FAIL");

    fs.rmSync(path.join(reportDir, "agent-judge-verdict-fail.json"));
    writeJson(reportDir, "agent-judge-verdict-human.json", { decision: "NEED_HUMAN" });
    const needHuman = evaluateAgentJudgeGate({ reportDir, llmProvider: "openai" });
    assert.equal(needHuman.exitCode, 1);
    assert.equal(needHuman.status, "NEED_HUMAN");

    fs.rmSync(path.join(reportDir, "agent-judge-verdict-human.json"));
    writeJson(reportDir, "agent-judge-verdict-a.json", { decision: "FAIL" });
    writeJson(reportDir, "agent-judge-verdict-b.json", { decision: "PASS" });
    const sameTime = new Date("2026-07-23T00:00:00.000Z");
    fs.utimesSync(path.join(reportDir, "agent-judge-verdict-a.json"), sameTime, sameTime);
    fs.utimesSync(path.join(reportDir, "agent-judge-verdict-b.json"), sameTime, sameTime);
    assert.equal(evaluateAgentJudgeGate({ reportDir, llmProvider: "openai" }).status, "PASS");
  });
});

test("Agent Judge 只接受本轮开始后生成的报告", () => {
  withReportDir(reportDir => {
    const startedAfterMs = Date.now();
    const stalePath = path.join(reportDir, "agent-judge-verdict-stale.json");
    writeJson(reportDir, "agent-judge-verdict-stale.json", { decision: "PASS" });
    const staleTime = new Date(startedAfterMs - 60_000);
    fs.utimesSync(stalePath, staleTime, staleTime);

    const staleOnly = evaluateAgentJudgeGate({ reportDir, llmProvider: "openai", startedAfterMs });
    assert.equal(staleOnly.exitCode, 1);
    assert.equal(staleOnly.status, "MISSING_VERDICT");

    const freshPath = path.join(reportDir, "agent-judge-prompt-fresh.md");
    fs.writeFileSync(freshPath, "本轮人工审计包");
    const freshTime = new Date(startedAfterMs + 1_000);
    fs.utimesSync(freshPath, freshTime, freshTime);
    const freshPrompt = evaluateAgentJudgeGate({ reportDir, llmProvider: "none", startedAfterMs });
    assert.equal(freshPrompt.exitCode, 0);
    assert.equal(freshPrompt.status, "PROMPT_REVIEW_REQUIRED");
  });
});

test("要求本轮时间时，缺失或非法时间必须阻断审计门禁", () => {
  withReportDir(reportDir => {
    fs.writeFileSync(path.join(reportDir, "agent-judge-prompt-current.md"), "人工审计包");

    for (const startedAfterMs of [undefined, "not-a-timestamp", -1]) {
      const result = evaluateAgentJudgeGate({
        reportDir,
        llmProvider: "none",
        startedAfterMs,
        requireCurrentRun: true,
      });
      assert.equal(result.exitCode, 1);
      assert.equal(result.status, "INVALID_REPORT_START");
    }
  });
});

test("Agent Judge CLI 将 prompt 审计状态输出为告警并以零退出", () => {
  withReportDir(reportDir => {
    fs.writeFileSync(path.join(reportDir, "agent-judge-prompt-1.md"), "人工审计包");
    const scriptPath = path.join(__dirname, "agent-review-gate.js");
    const result = spawnSync(process.execPath, [
      scriptPath,
      "agent-judge",
      `--report-dir=${reportDir}`,
      "--started-after=0",
      "--llm-provider=none",
    ], { encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /::warning::PROMPT_REVIEW_REQUIRED/);
  });
});

test("Agent Judge CLI 在缺少本轮时间时 fail closed", () => {
  withReportDir(reportDir => {
    fs.writeFileSync(path.join(reportDir, "agent-judge-prompt-1.md"), "人工审计包");
    const scriptPath = path.join(__dirname, "agent-review-gate.js");
    const result = spawnSync(process.execPath, [
      scriptPath,
      "agent-judge",
      `--report-dir=${reportDir}`,
      "--llm-provider=none",
    ], { encoding: "utf8" });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stdout, /::error::INVALID_REPORT_START/);
  });
});

test("自主审计的零退出码仍要求一份 PASS 报告", () => {
  withReportDir(reportDir => {
    const missingOnSuccess = evaluateAutonomousGate({ reportDir, auditExitCode: 0, hasOpenAiKey: false });
    assert.equal(missingOnSuccess.exitCode, 1);
    assert.equal(missingOnSuccess.status, "MISSING_REPORT");

    writeJson(reportDir, "autonomous-e2e-report-inconsistent.json", { overall: "NEED_HUMAN" });
    const inconsistentSuccess = evaluateAutonomousGate({ reportDir, auditExitCode: 0, hasOpenAiKey: false });
    assert.equal(inconsistentSuccess.exitCode, 1);
    assert.equal(inconsistentSuccess.status, "INCONSISTENT_REPORT");

    fs.rmSync(path.join(reportDir, "autonomous-e2e-report-inconsistent.json"));
    writeJson(reportDir, "autonomous-e2e-report-pass.json", { overall: "PASS" });
    assert.equal(evaluateAutonomousGate({ reportDir, auditExitCode: 0, hasOpenAiKey: false }).status, "PASS");

    fs.rmSync(path.join(reportDir, "autonomous-e2e-report-pass.json"));
    assert.equal(evaluateAutonomousGate({ reportDir, auditExitCode: 1, hasOpenAiKey: false }).status, "MISSING_REPORT");
    writeJson(reportDir, "autonomous-e2e-report-1.json", { overall: "NEED_HUMAN" });

    const advisory = evaluateAutonomousGate({ reportDir, auditExitCode: 1, hasOpenAiKey: false });
    assert.equal(advisory.exitCode, 0);
    assert.equal(advisory.status, "PROMPT_REVIEW_REQUIRED");

    const llmFailure = evaluateAutonomousGate({ reportDir, auditExitCode: 1, hasOpenAiKey: true });
    assert.equal(llmFailure.exitCode, 1);

    fs.rmSync(path.join(reportDir, "autonomous-e2e-report-1.json"));
    writeJson(reportDir, "autonomous-e2e-report-2.json", { overall: "FAIL" });
    assert.equal(evaluateAutonomousGate({ reportDir, auditExitCode: 1, hasOpenAiKey: false }).exitCode, 1);
    assert.equal(evaluateAutonomousGate({ reportDir, auditExitCode: 2, hasOpenAiKey: false }).exitCode, 2);
  });
});

test("自主审计忽略本轮开始前残留的 NEED_HUMAN 报告", () => {
  withReportDir(reportDir => {
    const startedAfterMs = Date.now();
    const reportPath = path.join(reportDir, "autonomous-e2e-report-stale.json");
    writeJson(reportDir, "autonomous-e2e-report-stale.json", { overall: "NEED_HUMAN" });
    const staleTime = new Date(startedAfterMs - 60_000);
    fs.utimesSync(reportPath, staleTime, staleTime);

    const result = evaluateAutonomousGate({
      reportDir,
      auditExitCode: 1,
      hasOpenAiKey: false,
      startedAfterMs,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, "MISSING_REPORT");

    const successWithStaleReport = evaluateAutonomousGate({
      reportDir,
      auditExitCode: 0,
      hasOpenAiKey: false,
      startedAfterMs,
    });
    assert.equal(successWithStaleReport.exitCode, 1);
    assert.equal(successWithStaleReport.status, "MISSING_REPORT");
  });
});
