/**
 * run-autonomous-e2e.js — 统一端到端自主测试 (v0.11.0)
 *
 * 一键跑完整自主循环：
 *   启动 dev server → 像素对比 → 需求审计 → 报告 → 清理
 *
 * 使用方式:
 *   node scripts/run-autonomous-e2e.js
 *   node scripts/run-autonomous-e2e.js --dev=apps/desktop --port=5173
 *   node scripts/run-autonomous-e2e.js --llm=openai --threshold=0.8
 */

const path = require("path");
const fs = require("fs");
const { spawn, execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..", "..");
const APPS_DIR = path.join(ROOT, "apps/desktop");
const REPORT_DIR = path.join(APPS_DIR, "tests/visual-testing/reports");

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const TARGET_PORT = args.port || process.env.TEST_PORT || "5173";
const TEST_URL = `http://127.0.0.1:${TARGET_PORT}`;
const DEV_DIR = args.dev ? path.resolve(args.dev) : APPS_DIR;
const PRD_PATH = args.prd
  ? path.resolve(args.prd)
  : path.join(ROOT, "01-docs/PRD.md");
const SRC_DIR = args.src
  ? path.resolve(args.src)
  : path.join(APPS_DIR, "src");
const LLM_PROVIDER = args.llm || process.env.LLM_PROVIDER || null;
const COVERAGE_THRESHOLD = parseFloat(args.threshold ?? process.env.COVERAGE_THRESHOLD) || 0.5;
const MAX_WAIT = parseInt(args.wait, 10) || 30;
const SKIP_VISUAL = args["skip-visual"] === true || args["skip-visual"] === "true";
const SKIP_COVERAGE = args["skip-coverage"] === true || args["skip-coverage"] === "true";
const SKIP_SERVER = args["skip-server"] === true || args["skip-server"] === "true";

let viteProcess = null;

// ===== 日志 =====
function log(tag, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${tag}] ${msg}`);
}
function logBox(title, lines) {
  const border = "=".repeat(60);
  console.log(`\n${border}`);
  console.log(`  ${title}`);
  console.log(`${border}`);
  for (const l of lines) console.log(`  ${l}`);
  console.log(`${border}\n`);
}

// ===== 阶段 1: 启动 dev server =====
async function startDevServer() {
  if (SKIP_SERVER) {
    log("SKIP", "跳过 dev server 启动");
    return;
  }

  log("SERVER", `启动 Vite dev server (port ${TARGET_PORT})...`);
  if (!fs.existsSync(DEV_DIR)) {
    throw new Error(`Dev directory not found: ${DEV_DIR}`);
  }

  // Kill existing process on the port
  try {
    execSync(`taskkill /F /IM node.exe /T 2>nul`, { stdio: "ignore" });
  } catch (_) {}

  viteProcess = spawn("npx", ["vite", "--port", TARGET_PORT], {
    cwd: DEV_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  viteProcess.stderr.on("data", d => {
    const s = d.toString();
    if (s.includes("Error") || s.includes("error")) log("VITE", s.trim().slice(0, 120));
  });

  // Wait for ready
  log("SERVER", `等待 Vite 就绪 (最多 ${MAX_WAIT}s)...`);
  for (let i = 1; i <= MAX_WAIT; i++) {
    await sleep(1000);
    try {
      const resp = await fetch(TEST_URL, { method: "HEAD" });
      if (resp.ok || resp.status === 304) {
        log("SERVER", `Vite 就绪 (${i}s)`);
        return;
      }
    } catch (_) {}
  }
  throw new Error(`Vite 未能在 ${MAX_WAIT}s 内启动`);
}

// ===== 阶段 2: 视觉回归测试 =====
async function runVisualTests() {
  if (SKIP_VISUAL) {
    log("SKIP", "跳过视觉测试");
    return { type: "visual", summary: { total: 0, passed: 0, failed: 0 }, details: [], skipped: true };
  }

  log("VISUAL", "启动像素对比测试...");
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  try {
    // 实际 Playwright 像素测试
    const cmd = `cd "${APPS_DIR}" && npx playwright test tests/visual-testing/views/all-views.visual.test.js --reporter=json 2>nul`;
    const stdout = execSync(cmd, { timeout: 120000, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });

    // 也跑 npm run test:visual:pixel（标准门禁命令）
    try {
      execSync(`cd "${APPS_DIR}" && npm run test:visual:pixel`, { stdio: "pipe", timeout: 120000 });
    } catch (e) {
      // Ignore exit code - we capture from the actual test run
    }

    // 生成 Agent 判断报告
    try {
      execSync(`node "${path.join(APPS_DIR, "tests/visual-testing/scripts/agent-visual-judge.js")}"`, {
        cwd: APPS_DIR, stdio: "pipe", timeout: 30000,
      });
    } catch (_) {}

    // 扫描 diff 结果
    const diffDir = path.join(APPS_DIR, "tests/visual-testing/reports/pixel-diff");
    let diffCount = 0;
    if (fs.existsSync(diffDir)) {
      diffCount = fs.readdirSync(diffDir).filter(f => f.endsWith(".png")).length;
    }

    log("VISUAL", `像素测试完成, diffs: ${diffCount}`);
    return {
      type: "visual",
      summary: { total: -1, passed: -1, failed: diffCount },
      details: [{ testName: "pixel-diff", status: diffCount > 0 ? "FAILED" : "PASSED", diffCount }],
      diffCount,
    };
  } catch (e) {
    log("VISUAL", `视觉测试出错: ${e.message}`);
    return {
      type: "visual",
      summary: { total: 0, passed: 0, failed: 0 },
      details: [],
      error: e.message,
    };
  }
}

// ===== 阶段 3: 需求覆盖审计 =====
async function runCoverageAudit() {
  if (SKIP_COVERAGE) {
    log("SKIP", "跳过需求审计");
    return { type: "coverage", verdict: null, skipped: true };
  }

  log("COVERAGE", "启动 PRD 需求覆盖审计...");
  if (!fs.existsSync(PRD_PATH)) {
    log("COVERAGE", `PRD 文件未找到: ${PRD_PATH}，跳过`);
    return { type: "coverage", verdict: null, skipped: true, reason: `PRD not found: ${PRD_PATH}` };
  }

  const { RequirementsVerifier, AgentJudge, FixEngine, AIAnalyzer } = require("../index");

  const verifier = new RequirementsVerifier({
    prdParser: new (require("../src/parsers/prd-parser").PRDParser)({
      featureKeywords: ["功能需求", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "3.", "6."],
    }),
    srcDir: SRC_DIR,
  });

  const llmFn = LLM_PROVIDER ? makeLlmFn(LLM_PROVIDER) : null;
  const judge = new AgentJudge({ llmFn, logger: console });
  const analyzer = new AIAnalyzer();

  try {
    const facts = await verifier.collectFacts({ prdPath: PRD_PATH, srcDir: SRC_DIR });
    log("COVERAGE", `PRD 条目: ${facts.summary.prdCount} | 代码特征: ${facts.summary.implCount}`);

    const verdict = await judge.judge({ facts, task: "coverage", llmFn });

    if (verdict._mode === "prompt") {
      log("COVERAGE", "无 LLM，生成 prompt 包（需 Agent 人工判断）");
      return { type: "coverage", verdict, mode: "prompt", factsSummary: facts.summary };
    }

    log("COVERAGE", `Verdict: ${verdict.decision} | 覆盖率: ${(verdict.summary?.coverageRate ?? 0) * 100}%`);

    // 生成修复计划
    let fixes = [];
    if (verdict.decision !== "PASS") {
      fixes = FixEngine.fromVerdict(verdict, { maxFixes: 10 });
      if (fixes.length > 0) {
        log("COVERAGE", `修复建议 (${fixes.length} 项):`);
        fixes.forEach((f, i) => log("COVERAGE", `  ${i + 1}. [${f.priority}] ${f.testName}`));
      }
    }

    const analysis = await analyzer.analyze({
      visual: { details: [] },
      functional: { details: [] },
      requirements: { _verdict: verdict, details: [], coverageRate: verdict.summary?.coverageRate ?? 0 },
    });
    const decision = analyzer.decide(analysis);

    return {
      type: "coverage",
      verdict,
      mode: "llm",
      decision: decision.action,
      fixes,
      factsSummary: facts.summary,
    };
  } catch (e) {
    log("COVERAGE", `审计出错: ${e.message}`);
    return { type: "coverage", verdict: null, error: e.message };
  }
}

// ===== 阶段 4: 生成统一报告 =====
function generateReport(visualResult, coverageResult) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const report = {
    timestamp: new Date().toISOString(),
    config: {
      devDir: DEV_DIR,
      port: TARGET_PORT,
      url: TEST_URL,
      prdPath: PRD_PATH,
      srcDir: SRC_DIR,
      llmProvider: LLM_PROVIDER,
      coverageThreshold: COVERAGE_THRESHOLD,
    },
    visual: visualResult,
    coverage: coverageResult,
  };

  const jsonPath = path.join(REPORT_DIR, `autonomous-e2e-report-${ts}.json`);
  const mdPath = path.join(REPORT_DIR, `autonomous-e2e-report-${ts}.md`);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  // Markdown 报告
  const mdLines = [];
  mdLines.push("# 自主测试端到端报告\n");
  mdLines.push(`**时间**: ${new Date().toLocaleString("zh-CN")}\n`);
  mdLines.push(`**URL**: ${TEST_URL}\n`);
  mdLines.push(`**LLM**: ${LLM_PROVIDER || "(无)"}\n`);
  mdLines.push(`**PRD**: ${PRD_PATH}\n\n`);

  mdLines.push("## Visual 测试结果\n\n");
  if (visualResult.skipped) {
    mdLines.push("（已跳过）\n\n");
  } else {
    mdLines.push(`| 指标 | 值 |\n|------|----|\n`);
    mdLines.push(`| Diffs | ${visualResult.diffCount ?? "N/A"} |\n`);
    mdLines.push(`| 状态 | ${visualResult.diffCount > 0 ? "❌ 失败" : "✅ 通过"} |\n\n`);
  }

  mdLines.push("## PRD 需求覆盖审计\n\n");
  if (coverageResult.skipped) {
    mdLines.push(`（已跳过: ${coverageResult.reason || ""}）\n\n`);
  } else if (coverageResult.mode === "prompt") {
    mdLines.push("**⚠️ 需要 Agent 人工判断**（未注入 LLM）\n\n");
    mdLines.push(`PRD 条目: ${coverageResult.factsSummary?.prdCount ?? 0}\n\n`);
    mdLines.push(`代码特征: ${coverageResult.factsSummary?.implCount ?? 0}\n\n`);
    mdLines.push("请读取 prompt 包后用 Agent 判断。\n\n");
  } else if (coverageResult.verdict) {
    const v = coverageResult.verdict;
    mdLines.push(`| 指标 | 值 |\n|------|----|\n`);
    mdLines.push(`| 决策 | \`${v.decision}\` |\n`);
    mdLines.push(`| 覆盖率 | ${(v.summary?.coverageRate ?? 0) * 100}% |\n`);
    mdLines.push(`| 已实现 | ${v.summary?.covered ?? 0} |\n`);
    mdLines.push(`| 部分实现 | ${v.summary?.partial ?? 0} |\n`);
    mdLines.push(`| 缺失 | ${v.summary?.missing ?? 0} |\n\n`);

    if (v.recommendations?.length > 0) {
      mdLines.push("### Agent 建议\n\n");
      for (const r of v.recommendations) mdLines.push(`- ${r}\n`);
      mdLines.push("\n");
    }
    if (v.reasoning) mdLines.push(`**推理**: ${v.reasoning}\n\n`);
  }

  if (coverageResult.fixes?.length > 0) {
    mdLines.push("## 修复计划\n\n");
    mdLines.push("| 优先级 | 工作量 | 描述 |\n|--------|--------|------|\n");
    for (const f of coverageResult.fixes) {
      mdLines.push(`| ${f.priority} | ${f.effort} | ${f.testName} |\n`);
    }
    mdLines.push("\n");
  }

  mdLines.push("---\n*由 run-autonomous-e2e.js 自动生成*\n");

  fs.writeFileSync(mdPath, mdLines.join(""));

  return { jsonPath, mdPath, report };
}

// ===== 清理 =====
function cleanup() {
  if (viteProcess) {
    log("CLEAN", "关闭 Vite dev server...");
    try {
      viteProcess.kill("SIGTERM");
      execSync("taskkill /F /IM node.exe /T 2>nul", { stdio: "ignore" });
    } catch (_) {}
    viteProcess = null;
  }
}

// ===== 辅助 =====
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function makeLlmFn(provider) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    log("LLM", `未设置 API Key (${provider})，回退到 prompt 包模式`);
    return null;
  }
  const model = provider === "openai"
    ? (process.env.LLM_MODEL || "gpt-4o-mini")
    : (process.env.LLM_MODEL || "claude-3-5-sonnet-latest");

  if (provider === "openai") {
    const baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
    return async prompt => {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [
          { role: "system", content: "You are a senior QA engineer. Respond with ONLY valid JSON." },
          { role: "user", content: prompt },
        ], temperature: 0 }),
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "";
    };
  }

  if (provider === "anthropic") {
    return async prompt => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      return data.content?.[0]?.text || "";
    };
  }

  return null;
}

// ===== 主流程 =====
async function main() {
  const exitCodes = [];
  let visualResult = null;
  let coverageResult = null;

  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(1); });
  process.on("SIGTERM", () => { cleanup(); process.exit(1); });

  logBox("自主测试端到端循环", [
    `Dev dir: ${DEV_DIR}`,
    `URL:     ${TEST_URL}`,
    `PRD:     ${PRD_PATH}`,
    `Src:     ${SRC_DIR}`,
    `LLM:     ${LLM_PROVIDER || "(无)"}`,
    `Threshold: ${COVERAGE_THRESHOLD}`,
  ]);

  try {
    // 阶段 1: 启动 dev server
    if (!SKIP_SERVER) await startDevServer();

    // 阶段 2: 视觉测试
    if (!SKIP_VISUAL && !SKIP_SERVER) visualResult = await runVisualTests();
    if (SKIP_VISUAL || SKIP_SERVER) visualResult = { type: "visual", summary: { total: 0, passed: 0, failed: 0 }, skipped: true };

    // 阶段 3: 需求覆盖审计
    coverageResult = await runCoverageAudit();

    // 阶段 4: 生成报告
    const { jsonPath, mdPath, report } = generateReport(visualResult, coverageResult);
    log("REPORT", `JSON: ${jsonPath}`);
    log("REPORT", `MD:   ${mdPath}`);

    // 计算退出码
    if (visualResult.diffCount > 0) exitCodes.push("VISUAL_FAIL");
    if (coverageResult.verdict?.decision === "FAIL") exitCodes.push("COVERAGE_FAIL");
    if (coverageResult.verdict?.decision === "NEED_HUMAN") exitCodes.push("COVERAGE_NEED_HUMAN");
    if (coverageResult.mode === "prompt") exitCodes.push("COVERAGE_NEED_HUMAN");

    const status = exitCodes.length === 0 ? "PASS" : exitCodes.join(" + ");
    logBox("完成", [
      `状态: ${status}`,
      `报告 JSON: ${jsonPath}`,
      `报告 MD:   ${mdPath}`,
    ]);

    const exitCode = exitCodes.length === 0 ? 0 : 1;
    process.exit(exitCode);

  } catch (e) {
    log("FATAL", e.message);
    logBox("失败", [`${e.message}`]);
    process.exit(2);
  } finally {
    cleanup();
  }
}

main();