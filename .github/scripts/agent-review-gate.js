const fs = require("node:fs");
const path = require("node:path");

function normalizeLlmProvider(provider) {
  if (typeof provider !== "string") return provider || null;
  const normalized = provider.trim().toLowerCase();
  return normalized === "" || normalized === "none" ? null : normalized;
}

function normalizeStartedAfter(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function requiresValidReportStart(requireCurrentRun, startedAfterMs) {
  return Boolean(requireCurrentRun) && normalizeStartedAfter(startedAfterMs) === null;
}

function latestFile(reportDir, prefix, extension, startedAfterMs = null) {
  if (!reportDir || !fs.existsSync(reportDir)) return null;
  const startedAfter = normalizeStartedAfter(startedAfterMs);

  return fs.readdirSync(reportDir)
    .filter(file => file.startsWith(prefix) && file.endsWith(extension))
    .map(file => {
      const filePath = path.join(reportDir, file);
      return { file, filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .filter(({ mtimeMs }) => startedAfter === null || mtimeMs >= startedAfter)
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.file.localeCompare(a.file))[0]?.filePath || null;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return { error: error.message };
  }
}

function evaluation(exitCode, status, message) {
  return { exitCode, status, message };
}

function evaluateAgentJudgeGate({ reportDir, llmProvider, startedAfterMs, requireCurrentRun = false }) {
  if (requiresValidReportStart(requireCurrentRun, startedAfterMs)) {
    return evaluation(1, "INVALID_REPORT_START", "A valid current-run report start time is required.");
  }
  const verdictPath = latestFile(reportDir, "agent-judge-verdict-", ".json", startedAfterMs);

  if (!verdictPath) {
    const promptPath = latestFile(reportDir, "agent-judge-prompt-", ".md", startedAfterMs);
    if (!normalizeLlmProvider(llmProvider) && promptPath) {
      return evaluation(0, "PROMPT_REVIEW_REQUIRED", "No LLM configured; the prompt package was uploaded for manual review.");
    }
    return evaluation(1, "MISSING_VERDICT", "No Agent Judge verdict was produced.");
  }

  const verdict = readJson(verdictPath);
  if (verdict.error) {
    return evaluation(1, "INVALID_VERDICT", `Could not parse ${path.basename(verdictPath)}: ${verdict.error}`);
  }
  if (verdict.decision === "PASS") {
    return evaluation(0, "PASS", "Agent Judge verdict is PASS.");
  }
  if (verdict.decision === "FAIL" || verdict.decision === "NEED_HUMAN") {
    return evaluation(1, verdict.decision, `Agent Judge verdict is ${verdict.decision}.`);
  }
  return evaluation(1, "INVALID_VERDICT", "Agent Judge verdict has an unsupported decision.");
}

function evaluateAutonomousGate({ reportDir, auditExitCode, hasOpenAiKey, startedAfterMs, requireCurrentRun = false }) {
  if (requiresValidReportStart(requireCurrentRun, startedAfterMs)) {
    return evaluation(1, "INVALID_REPORT_START", "A valid current-run report start time is required.");
  }
  if (auditExitCode !== 0 && auditExitCode !== 1) {
    return evaluation(auditExitCode || 2, "INFRA_ERROR", `Autonomous coverage audit exited with ${auditExitCode}.`);
  }

  const reportPath = latestFile(reportDir, "autonomous-e2e-report-", ".json", startedAfterMs);
  if (!reportPath) {
    return evaluation(1, "MISSING_REPORT", "Autonomous coverage audit did not produce a report.");
  }

  const report = readJson(reportPath);
  if (report.error) {
    return evaluation(1, "INVALID_REPORT", `Could not parse ${path.basename(reportPath)}: ${report.error}`);
  }
  if (auditExitCode === 0) {
    if (report.overall === "PASS") {
      return evaluation(0, "PASS", "Autonomous coverage audit passed.");
    }
    return evaluation(1, "INCONSISTENT_REPORT", `Autonomous coverage audit exited with 0 but ${path.basename(reportPath)} is ${report.overall || "missing an overall result"}.`);
  }
  if (!hasOpenAiKey && report.overall === "NEED_HUMAN") {
    return evaluation(0, "PROMPT_REVIEW_REQUIRED", "No OpenAI key configured; the autonomous audit report was uploaded for manual review.");
  }
  if (report.overall === "PASS") {
    return evaluation(1, "INCONSISTENT_REPORT", `Autonomous coverage audit exited with 1 but ${path.basename(reportPath)} is PASS.`);
  }
  return evaluation(1, report.overall || "FAIL", "Autonomous coverage audit did not pass.");
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map(arg => {
    const [key, value = ""] = arg.replace(/^--/, "").split(/=(.*)/, 2);
    return [key, value];
  }));
}

function parseBoolean(value) {
  return String(value).trim().toLowerCase() === "true";
}

function main() {
  const [mode, ...rawArgs] = process.argv.slice(2);
  const args = parseArgs(rawArgs);
  let result;

  if (mode === "agent-judge") {
    result = evaluateAgentJudgeGate({
      reportDir: args["report-dir"],
      llmProvider: args["llm-provider"],
      startedAfterMs: args["started-after"],
      requireCurrentRun: true,
    });
  } else if (mode === "autonomous") {
    result = evaluateAutonomousGate({
      reportDir: args["report-dir"],
      auditExitCode: Number(args["audit-exit-code"]),
      hasOpenAiKey: parseBoolean(args["has-openai-key"]),
      startedAfterMs: args["started-after"],
      requireCurrentRun: true,
    });
  } else {
    result = evaluation(2, "INVALID_MODE", "Expected mode: agent-judge or autonomous.");
  }

  const annotation = result.exitCode === 0 ? "warning" : "error";
  console.log(`::${annotation}::${result.status}: ${result.message}`);
  process.exit(result.exitCode);
}

if (require.main === module) main();

module.exports = {
  evaluateAgentJudgeGate,
  evaluateAutonomousGate,
};
