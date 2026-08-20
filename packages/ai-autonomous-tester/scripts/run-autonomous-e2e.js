/**
 * run-autonomous-e2e.js — 统一端到端自主测试 (v0.12.0)
 *
 * 三个新方向：
 *   1. 多轮循环：--iterations N 启用 TestOrchestrator 全自主测试-修复循环
 *   2. 多文档匹配：--docs "PRD.md,README.md,ARCHITECTURE.md" 多来源需求审计
 *   3. 功能测试集成：--functional 启用 Playwright 交互测试
 *
 * 使用方式:
 *   # 简单模式（兼容 v0.11）
 *   node scripts/run-autonomous-e2e.js
 *
 *   # 全自主循环（3 轮，含功能测试）
 *   node scripts/run-autonomous-e2e.js --iterations=3 --functional --docs="01-docs/PRD.md,README.md"
 *
 *   # CI 模式
 *   node scripts/run-autonomous-e2e.js --skip-server --skip-visual --llm=openai
 */

const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const { createDevServerController } = require("../src/dev-server-controller");

const ROOT = path.resolve(__dirname, "../..", "..");
const APPS_DIR = path.join(ROOT, "apps/desktop");
const REPORT_DIR = path.join(APPS_DIR, "tests/visual-testing/reports");
const DEFAULT_DOCS = [path.join(ROOT, "01-docs/PRD.md")];

// ==== Arg parsing ====
const args = Object.fromEntries(
  process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; })
);

const TARGET_PORT = args.port || process.env.TEST_PORT || "5173";
const TEST_URL = `http://127.0.0.1:${TARGET_PORT}`;
const DEV_DIR = args.dev ? path.resolve(args.dev) : APPS_DIR;
const SRC_DIR = args.src ? path.resolve(args.src) : path.join(APPS_DIR, "src");
const LLM_PROVIDER = args.llm || process.env.LLM_PROVIDER || null;
const COVERAGE_THRESHOLD = parseFloat(args.threshold ?? process.env.COVERAGE_THRESHOLD) || 0.5;
const REQUIRED_FEATURE_IDS = (args["required-feature-ids"] || process.env.REQUIRED_FEATURE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
const PR_MODE = (args["pr-mode"] || process.env.PR_MODE || "full").toLowerCase();
const MAX_WAIT = parseInt(args.wait, 10) || 30;
const MAX_ITERATIONS = parseInt(args.iterations, 10) || 1;
const SKIP_VISUAL = args["skip-visual"] === true || args["skip-visual"] === "true";
const SKIP_COVERAGE = args["skip-coverage"] === true || args["skip-coverage"] === "true";
const SKIP_SERVER = args["skip-server"] === true || args["skip-server"] === "true";
const ENABLE_FUNCTIONAL = args.functional === true || args.functional === "true";
const ENABLE_MULTI_ROUND = MAX_ITERATIONS > 1;

// Parse doc paths
const DOC_PATHS = (() => {
  const raw = args.docs || process.env.DOC_PATHS || "";
  if (!raw) return DEFAULT_DOCS;
  return raw.split(",").map(p => p.trim()).filter(Boolean).map(p => path.resolve(ROOT, p));
})();

// Parse functional targets
const FUNCTIONAL_TARGETS = (() => {
  if (!ENABLE_FUNCTIONAL) return [];
  const raw = args["functional-targets"] || process.env.FUNCTIONAL_TARGETS || "";
  if (raw) return raw.split(",").map(t => t.trim()).filter(Boolean);
  return ["navigation", "login", "publish", "accounts", "settings"];
})();

let devServerController = null;

// ===== Logging =====
function log(tag, msg) { const ts = new Date().toISOString().slice(11, 19); console.log(`[${ts}] [${tag}] ${msg}`); }
function logBox(title, lines) {
  const b = "=".repeat(60);
  console.log(`\n${b}\n  ${title}\n${b}`);
  for (const l of lines) console.log(`  ${l}`);
  console.log(`${b}\n`);
}

// ===== Dev Server =====
async function startDevServer() {
  if (SKIP_SERVER) { log("SKIP", "跳过 dev server"); return; }
  log("SERVER", `启动 Vite dev server (port ${TARGET_PORT})...`);
  if (!fs.existsSync(DEV_DIR)) throw new Error(`Dev dir not found: ${DEV_DIR}`);
  devServerController = createDevServerController({
    cwd: DEV_DIR,
    port: TARGET_PORT,
    maxWaitMs: MAX_WAIT * 1000,
    onStderr: (text) => {
      if (text.includes("Error")) log("VITE", text.trim().slice(0, 120));
    },
  });
  log("SERVER", `等待 Vite 就绪 (最多 ${MAX_WAIT}s)...`);
  await devServerController.start();
  log("SERVER", "Vite 已就绪");
}

// ===== Visual Tests (Phase 2, Simple Mode) =====
function formatCommandFailure(label, error) {
  const stderr = error?.stderr?.toString?.().trim();
  const detail = stderr || error?.message || String(error);
  return `${label}失败: ${detail}`;
}

async function runVisualTests(options = {}) {
  if (SKIP_VISUAL) return { type: "visual", summary: { total: 0, passed: 0, failed: 0 }, skipped: true };
  const appsDir = options.appsDir || APPS_DIR;
  const reportDir = options.reportDir || REPORT_DIR;
  const execute = options.execute || execSync;
  // 像素套件子进程默认探测 TEST_URL / TEST_PORT，必须显式继承本循环启动的 Vite 端口，
  // 否则子进程会回退到 127.0.0.1:5174 导致全部路由连接失败（历史 17/17 秒挂根因）。
  const pixelExecEnv = { ...process.env, TEST_URL, TEST_PORT: TARGET_PORT };
  log("VISUAL", "启动像素对比测试...");
  fs.mkdirSync(reportDir, { recursive: true });
  try {
    const commandFailures = [];
    try {
      execute(`cd "${appsDir}" && npm run test:visual:pixel`, { stdio: "pipe", timeout: 120000, env: pixelExecEnv });
    } catch (error) {
      commandFailures.push(formatCommandFailure("像素对比测试", error));
    }
    try {
      execute(`node "${path.join(appsDir, "tests/visual-testing/scripts/agent-visual-judge.js")}"`, {
        cwd: appsDir,
        stdio: "pipe",
        timeout: 30000,
      });
    } catch (error) {
      commandFailures.push(formatCommandFailure("Agent 视觉判断", error));
    }

    const diffDir = path.join(appsDir, "tests/visual-testing/reports/pixel-diff");
    let diffCount = 0;
    if (fs.existsSync(diffDir)) diffCount = fs.readdirSync(diffDir).filter(f => f.endsWith(".png")).length;
    const error = commandFailures.length > 0 ? commandFailures.join("；") : undefined;
    log("VISUAL", error ? `失败: ${error}` : `完成, diffs: ${diffCount}`);
    return {
      type: "visual",
      summary: { total: -1, passed: -1, failed: diffCount },
      details: [{ testName: "pixel-diff", status: diffCount > 0 || error ? "FAILED" : "PASSED" }],
      diffCount,
      ...(error ? { error } : {}),
    };
  } catch (e) { log("VISUAL", `失败: ${e.message}`); return { type: "visual", summary: { total: 0, passed: 0, failed: 0 }, details: [], error: e.message }; }
}

// ===== Coverage Audit (Phase 3, Simple Mode / Multi-Doc) =====
async function runCoverageAudit() {
  if (SKIP_COVERAGE) return { type: "requirements", summary: { total: 0, passed: 0, failed: 0 }, skipped: true };
  if (PR_MODE === "report-only") {
    log("COVERAGE", "report-only: 按 PR 类型跳过全量需求覆盖审计");
    return { type: "requirements", summary: { total: 0, passed: 0, failed: 0 }, details: [], coverageRate: 0, skipped: true, filtered: true, _verdict: { decision: "PASS" }, docSources: [] };
  }
  log("COVERAGE", `需求覆盖审计... docs: ${DOC_PATHS.length} 个文件`);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  try {
    const { RequirementsTestRunner } = require("../src/runners/requirements-runner");
    const runner = new RequirementsTestRunner({ llmFn: makeLlmFn(LLM_PROVIDER) });
    const result = await runner.runTests({
      docPaths: DOC_PATHS,
      srcDir: SRC_DIR,
      llmFn: makeLlmFn(LLM_PROVIDER),
      task: "coverage",
      featureIds: REQUIRED_FEATURE_IDS,
    });
    const v = result._verdict || {};
    const coverageStatus = classifyCoverageResult(result);
    log("COVERAGE", `verdict: ${v.decision || coverageStatus}, score: ${v.score ?? "N/A"}, items: ${result.details.length}`);
    return result;
  } catch (e) { log("COVERAGE", `失败: ${e.message}`); return { type: "requirements", summary: { total: 0, passed: 0, failed: 0 }, error: e.message, verdict: { decision: "INFRA_ERROR" }, mode: "error" }; }
}

function classifyCoverageResult(coverageResult) {
  if (!coverageResult || coverageResult.error) return "FAIL";

  const verdict = coverageResult._verdict;
  const decision = verdict?.decision;
  const requiresAgent = coverageResult._mode === "agent-required" || verdict?._mode === "prompt";

  if (coverageResult.skipped === true) {
    if (verdict?.decision === "PASS" || (!verdict && !requiresAgent)) return "SKIPPED";
    return (verdict || requiresAgent) ? "FAIL" : "SKIPPED";
  }
  if (decision === "FAIL") return "FAIL";
  if (decision === "NEED_HUMAN") return "NEED_HUMAN";
  if (decision === "PASS") return requiresAgent ? "FAIL" : "PASS";
  if (decision !== undefined && decision !== null) return "FAIL";
  if (requiresAgent) return "NEED_HUMAN";
  return "FAIL";
}

function isValidCount(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function evaluateRunResults(visualResult, coverageResult, functionalResult) {
  const visualFail = !visualResult || Boolean(visualResult.error) || (
    visualResult.skipped !== true
    && (
      !isValidCount(visualResult.diffCount)
      || !isValidCount(visualResult.summary?.failed)
      || visualResult.diffCount > 0
      || visualResult.summary.failed > 0
    )
  );
  const coverageStatus = classifyCoverageResult(coverageResult);
  const functionalSummary = functionalResult?.summary;
  const functionalFail = !functionalResult || Boolean(functionalResult.error) || (
    functionalResult.skipped !== true
    && (
      !isValidCount(functionalSummary?.total)
      || functionalSummary.total === 0
      || !isValidCount(functionalSummary?.passed)
      || !isValidCount(functionalSummary?.failed)
      || functionalSummary.passed + functionalSummary.failed !== functionalSummary.total
      || functionalSummary.failed > 0
    )
  );
  const exitCodes = [];

  if (visualFail) exitCodes.push("VISUAL_FAIL");
  if (coverageStatus === "FAIL") exitCodes.push("COVERAGE_FAIL");
  if (coverageStatus === "NEED_HUMAN") exitCodes.push("COVERAGE_NEED_HUMAN");
  if (functionalFail) exitCodes.push("FUNCTIONAL_FAIL");

  const hasFailure = exitCodes.some(code => code !== "COVERAGE_NEED_HUMAN");
  const overall = hasFailure ? "FAIL" : coverageStatus === "NEED_HUMAN" ? "NEED_HUMAN" : "PASS";
  return { coverageStatus, exitCodes, overall };
}

// ===== Functional Tests (Simple Mode) =====
async function runFunctionalTests() {
  if (!ENABLE_FUNCTIONAL) return { type: "functional", summary: { total: 0, passed: 0, failed: 0 }, skipped: true };
  log("FUNCTIONAL", `启动功能测试: ${FUNCTIONAL_TARGETS.join(", ")}`);
  try {
    const { FunctionalTestRunner } = require("../src/runners/functional-runner");
    const runner = new FunctionalTestRunner({ url: TEST_URL });
    await runner.launch();
    try {
      const result = await runner.runTests({ targets: buildFunctionalTargets(FUNCTIONAL_TARGETS) });
      log("FUNCTIONAL", `完成: ${result.summary.passed}/${result.summary.total} 通过`);
      return result;
    } finally { await runner.close(); }
  } catch (e) { log("FUNCTIONAL", `失败: ${e.message}`); return { type: "functional", summary: { total: 0, passed: 0, failed: 0 }, error: e.message }; }
}

function buildFunctionalTargets(names) {
  const TARGET_MAP = {
    navigation: {
      name: "navigation", description: "页面导航测试",
      steps: [{ action: "goto", url: "/" }, { action: "waitMs", value: 1000 }],
      assertions: [{ type: "urlContains", text: "localhost" }],
    },
    login: {
      name: "login", description: "登录页面测试",
      steps: [{ action: "goto", url: "/login" }, { action: "waitMs", value: 1000 }],
      assertions: [{ type: "elementVisible", selector: "[data-testid=login-form], form, input[type=password]" }],
    },
    publish: {
      name: "publish", description: "发布页面测试",
      steps: [{ action: "goto", url: "/publish" }, { action: "waitMs", value: 1000 }],
      assertions: [{ type: "urlContains", text: "publish" }],
    },
    accounts: {
      name: "accounts", description: "账号管理页面测试",
      steps: [{ action: "goto", url: "/accounts" }, { action: "waitMs", value: 1000 }],
      assertions: [{ type: "urlContains", text: "account" }],
    },
    settings: {
      name: "settings", description: "设置页面测试",
      steps: [{ action: "goto", url: "/settings" }, { action: "waitMs", value: 1000 }],
      assertions: [{ type: "urlContains", text: "setting" }],
    },
  };
  return names.filter(n => TARGET_MAP[n]).map(n => TARGET_MAP[n]);
}

// ===== Orchestrator Mode (Multi-Round Loop) =====
async function runOrchestratorLoop() {
  logBox("全自主多轮循环", [`最大迭代: ${MAX_ITERATIONS}`, `功能测试: ${ENABLE_FUNCTIONAL ? FUNCTIONAL_TARGETS.join(", ") : "关闭"}`,
    `多文档: ${DOC_PATHS.map(p => path.basename(p)).join(", ")}`, `LLM: ${LLM_PROVIDER || "(无)"}`]);
  const { TestOrchestrator, AutonomousTestRunner, RequirementsTestRunner, FunctionalTestRunner, VisualTestRunner, FixEngine } = require("../index");
  const llmFn = makeLlmFn(LLM_PROVIDER);
  const visualRunner = SKIP_VISUAL ? null : new VisualTestRunner({ url: TEST_URL, headless: true, threshold: COVERAGE_THRESHOLD });
  const functionalRunner = ENABLE_FUNCTIONAL ? new FunctionalTestRunner({ url: TEST_URL, headless: true }) : null;
  const requirementsRunner = new RequirementsTestRunner({ llmFn });
  const testRunner = new AutonomousTestRunner({
    llmFn, visualRunner: visualRunner || undefined, functionalRunner: functionalRunner || undefined,
    requirementsRunner,
  });
      const fixEngine = new FixEngine({ logger: console, dryRun: false, llmFn });
    const orchestrator = new TestOrchestrator({ maxIterations: MAX_ITERATIONS, testRunner, fixEngine, iterationDelay: 3000, stopOnSuccess: true });
  const context = {
    visual: { targets: [{ name: "home-baseline", route: "/" }, { name: "accounts-list", route: "/accounts" }, { name: "publish-form", route: "/publish" }] },
    functional: functionalRunner ? { targets: buildFunctionalTargets(FUNCTIONAL_TARGETS) } : {},
    requirements: { docPaths: DOC_PATHS, srcDir: SRC_DIR, llmFn },
  };
  const report = await orchestrator.start(context);
  const reportPath = path.join(REPORT_DIR, `autonomous-loop-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log("LOOP", `报告: ${reportPath}`);
  return report;
}

// ===== Report (Simple Mode) =====
function generateReport(visualResult, coverageResult, functionalResult, options = {}) {
  const reportDir = options.reportDir || REPORT_DIR;
  const ts = (options.now || new Date()).toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(reportDir, `autonomous-e2e-report-${ts}.json`);
  const mdPath = path.join(reportDir, `autonomous-e2e-report-${ts}.md`);

  const evaluation = evaluateRunResults(visualResult, coverageResult, functionalResult);
  const { coverageStatus, exitCodes, overall } = evaluation;
  const visualFail = exitCodes.includes("VISUAL_FAIL");
  const functionalFail = exitCodes.includes("FUNCTIONAL_FAIL");
  const visualStatus = visualFail ? "失败" : visualResult?.skipped === true ? "跳过" : "通过";
  const functionalStatus = functionalFail ? "失败" : functionalResult?.skipped === true ? "跳过" : "通过";

  const report = { timestamp: ts, mode: "e2e-simple", overall, coverageStatus, exitCodes,
    visual: visualResult, coverage: coverageResult, functional: functionalResult,
    docSources: coverageResult?.docSources || (coverageResult?._facts?.docSources || undefined) };

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md = [];
  md.push(`# 端到端自主测试报告\n`);
  md.push(`**时间**: ${ts}  **状态**: ${overall}\n\n`);
  md.push(`## 视觉回归\n| 项目 | 值 |\n|------|----|\n`);
  md.push(`| Diff 数 | ${visualResult?.diffCount ?? "N/A"} |\n`);
  md.push(`| 状态 | ${visualStatus} |\n`);
  if (visualResult?.error) md.push(`| 错误 | ${visualResult.error} |\n`);
  md.push("\n");
  if (coverageResult?.docSources?.length > 0) {
    md.push(`## 多文档覆盖审计\n`);
    md.push(`| 文档 | 类型 | 提取项 |\n|------|------|------:|\n`);
    for (const s of coverageResult.docSources) md.push(`| ${path.basename(s.path)} | ${s.label} | ${s.itemCount} |\n`);
    md.push("\n");
  }
  md.push(`## 需求覆盖\n| 项目 | 值 |\n|------|----|\n`);
  md.push(`| 覆盖率 | ${((coverageResult?.coverageRate ?? 0) * 100).toFixed(1)}% |\n`);
  md.push(`| Verdict | ${coverageStatus} |\n`);
  const rawCoverageDecision = coverageResult?._verdict?.decision;
  if (rawCoverageDecision && rawCoverageDecision !== coverageStatus) {
    md.push(`| 原始 Verdict | ${rawCoverageDecision} |\n`);
  }
  md.push("\n");
  if (ENABLE_FUNCTIONAL || functionalResult?.skipped !== true) {
    md.push(`## 功能测试\n| 项 | 值 |\n|----|----|\n`);
    md.push(`| 总数 | ${functionalResult?.summary?.total ?? 0} |\n`);
    md.push(`| 通过 | ${functionalResult?.summary?.passed ?? 0} |\n`);
    md.push(`| 失败 | ${functionalResult?.summary?.failed ?? 0} |\n`);
    md.push(`| 状态 | ${functionalStatus} |\n`);
    if (functionalResult?.error) md.push(`| 错误 | ${functionalResult.error} |\n`);
    md.push("\n");
  }
  md.push("---\n*由 run-autonomous-e2e.js v0.12.0 自动生成*\n");
  fs.writeFileSync(mdPath, md.join(""));
  return { jsonPath, mdPath, report, evaluation };
}

// ===== Cleanup =====
async function cleanup() {
  if (devServerController) {
    log("CLEAN", "关闭 Vite...");
    const controller = devServerController;
    devServerController = null;
    await controller.stop();
  }
}

// ===== LLM Factory =====
function makeLlmFn(provider) {
  if (!provider) return null;
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { log("LLM", "未设置 API Key，回退 prompt 包"); return null; }
  const model = process.env.LLM_MODEL || (provider === "openai" ? "gpt-4o-mini" : "claude-3-5-sonnet-latest");
  if (provider === "openai") {
    const baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
    return async prompt => {
      const res = await fetch(`${baseUrl}/chat/completions`, { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "system", content: "You are a QA engineer. Respond with ONLY valid JSON." }, { role: "user", content: prompt }], temperature: 0 }) });
      const data = await res.json(); return data.choices?.[0]?.message?.content || "";
    };
  }
  if (provider === "anthropic") {
    return async prompt => {
      const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: "user", content: prompt }] }) });
      const data = await res.json(); return data.content?.[0]?.text || "";
    };
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== Main =====
async function main() {
  const handleSignal = async () => {
    await cleanup();
    process.exit(1);
  };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  logBox("自主测试端到端循环 v0.12.0", [
    `模式: ${ENABLE_MULTI_ROUND ? "多轮循环" : "单次直通"}`, `迭代: ${MAX_ITERATIONS}`,
    `功能测试: ${ENABLE_FUNCTIONAL ? "开启" : "关闭"}`, `文档数: ${DOC_PATHS.length}`,
    `LLM: ${LLM_PROVIDER || "(无)"}`, `URL: ${TEST_URL}`,
  ]);

  try {
    // === MULTI-ROUND MODE ===
    if (ENABLE_MULTI_ROUND) {
      if (!SKIP_SERVER) await startDevServer();
      const report = await runOrchestratorLoop();
      const success = report.finalStatus === "SUCCESS";
      logBox(success ? "循环通过" : "循环失败", [`状态: ${report.finalStatus}`, `迭代: ${report.iterations}`]);

      // 生成可执行修复脚本（Agent 可以在下一轮运行前执行）
      const fixScriptPath = path.join(REPORT_DIR, "auto-fix-commands.bat");
      const fixLines = ["@echo off", "REM Auto-generated fix commands from autonomous loop", ""];
      for (const h of (report.iterationHistory || [])) {
        if (h.fixResult?.results) {
          for (const r of h.fixResult.results) {
            if (!r.success) continue;
            const fix = r.fix || {};
            if (fix.type === "baseline" && fix.testName) {
              const src = path.join(APPS_DIR, "tests/visual-testing/screenshots", fix.testName + "-current.png");
              const dst = path.join(APPS_DIR, "tests/visual-testing/base-screenshots", fix.testName + ".png");
              fixLines.push("REM Update baseline for " + fix.testName);
              fixLines.push('copy /Y "' + src + '" "' + dst + '" 2>nul');
            }
          }
        }
      }
      if (fixLines.length > 3) {
        fs.writeFileSync(fixScriptPath, fixLines.join("\r\n"));
        log("FIX", "修复脚本已生成: " + fixScriptPath);
      }
      return success ? 0 : 1;
    }

    // === SIMPLE MODE ===
    if (!SKIP_SERVER) await startDevServer();
    const [visualResult, functionalResult] = await Promise.all([
      runVisualTests(),
      ENABLE_FUNCTIONAL ? runFunctionalTests() : Promise.resolve({ type: "functional", summary: { total: 0, passed: 0, failed: 0 }, skipped: true }),
    ]);
    const coverageResult = await runCoverageAudit();
    const { jsonPath, mdPath, evaluation } = generateReport(visualResult, coverageResult, functionalResult);
    log("REPORT", `JSON: ${jsonPath}  MD: ${mdPath}`);

    const reason = evaluation.exitCodes.length === 0 ? "无阻断项" : evaluation.exitCodes.join(" + ");
    logBox("完成", [`状态: ${evaluation.overall}`, `原因: ${reason}`]);
    return evaluation.exitCodes.length === 0 ? 0 : 1;

  } catch (e) { log("FATAL", e.message); return 2; }
  finally { await cleanup(); }
}

if (require.main === module) {
  main()
    .then((exitCode) => { process.exitCode = exitCode; })
    .catch((error) => {
      log("FATAL", error.message);
      process.exitCode = 2;
    });
}

module.exports = {
  classifyCoverageResult,
  cleanup,
  evaluateRunResults,
  generateReport,
  main,
  startDevServer,
  runVisualTests,
};
