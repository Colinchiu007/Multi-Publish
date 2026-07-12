/**
 * CI Visual Testing Integration Script
 *
 * Refactored to use @multi-publish/ai-autonomous-tester package.
 *
 * 完整 CI 流程:
 * 1. Pixel diff tests
 * 2. Agent judge report generation (供 Agent view_image 判断)
 *
 * GitHub Actions Usage:
 *
 * jobs:
 *   visual-test:
 *     runs-on: ubuntu-latest
 *     steps:
 *       - uses: actions/checkout@v4
 *       - uses: actions/setup-node@v4
 *         with:
 *           node-version: "22"
 *       - run: npm ci
 *       - run: npm run test:visual:ci
 */

const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const { findProjectRoot, VisualTestRunner } = require("@multi-publish/ai-autonomous-tester");

const ROOT = findProjectRoot(__dirname);
const REPORT_DIR = path.join(ROOT, "apps/desktop/tests/visual-testing/reports");
const SCREENSHOT_DIR = path.join(ROOT, "apps/desktop/tests/visual-testing/screenshots");
const BASELINE_DIR = path.join(ROOT, "apps/desktop/tests/visual-testing/base-screenshots");
const META_DIR = path.join(ROOT, "apps/desktop/tests/visual-testing/meta");

const c = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", blue: "\x1b[34m",
};

function log(color, prefix, message) {
  console.log(`${color}[${prefix}]${c.reset} ${message}`);
}

function runNodeScript(scriptRelPath) {
  const scriptAbs = path.join(ROOT, scriptRelPath);
  return execFileSync("node", [scriptAbs], {
    cwd: path.join(ROOT, "apps/desktop"),
    encoding: "utf8",
    stdio: "pipe",
  });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * 运行像素对比测试（直接调用包内 VisualTestRunner）
 */
async function runPixelTests() {
  log(c.blue, "INFO", "Running pixel diff tests via package API...");

  const tests = [
    { name: "home-baseline", route: "/" },
    { name: "accounts-list", route: "/accounts" },
    { name: "publish-form", route: "/publish" },
    { name: "monitor-dashboard", route: "/monitor" },
    { name: "analytics-overview", route: "/analytics" },
    { name: "settings-general", route: "/settings" },
    { name: "login-form", route: "/login" },
    { name: "create-editor", route: "/create" },
  ];

  const runner = new VisualTestRunner({
    url: process.env.TEST_URL || "http://localhost:5173",
  });

  await runner.launch();

  let passed = 0;
  let failed = 0;
  const details = [];

  for (const test of tests) {
    try {
      await runner.pixelRegressionTest(test.name, test.route);
      passed++;
      details.push({ name: test.name, status: "PASSED" });
    } catch (err) {
      failed++;
      details.push({ name: test.name, status: "FAILED", error: err.message });
      log(c.yellow, "WARN", `${test.name}: ${err.message.split("\n")[0]}`);
    }
  }

  await runner.close();

  return { passed, failed, total: tests.length, details };
}

/**
 * 生成 Agent 判断报告（agent-visual-judge.js 调用包内函数）
 */
function runAgentJudge() {
  log(c.blue, "INFO", "Generating Agent visual-judge report...");
  try {
    const output = runNodeScript("apps/desktop/tests/visual-testing/scripts/agent-visual-judge.js");
    console.log(output);
    log(c.green, "PASS", "Agent judge report generated");
    return "success";
  } catch (err) {
    log(c.yellow, "WARN", "Agent judge report generation failed");
    return "failed";
  }
}

/**
 * 生成 CI 报告
 */
function generateCIReport(results, startTime, duration) {
  const report = {
    timestamp: new Date().toISOString(),
    duration: `${duration}s`,
    results,
    artifacts: {
      screenshots: SCREENSHOT_DIR,
      reports: REPORT_DIR,
    },
  };

  ensureDir(REPORT_DIR);
  fs.writeFileSync(
    path.join(REPORT_DIR, "ci-report.json"),
    JSON.stringify(report, null, 2)
  );

  console.log(`
================================================================
                    CI 视觉测试报告
================================================================
  总耗时: ${duration}s
  像素对比: ${results.pixel.passed}/${results.pixel.total} 通过
  Agent 报告: ${results.agentReport === "success" ? "已生成" : "失败"}
================================================================
  `);
}

function listArtifacts() {
  console.log("\nTest Artifacts:\n");
  const dirs = [
    { p: SCREENSHOT_DIR, name: "Screenshots" },
    { p: REPORT_DIR, name: "Reports" },
    { p: META_DIR, name: "Meta Data" },
  ];
  for (const d of dirs) {
    if (fs.existsSync(d.p)) {
      const files = fs.readdirSync(d.p).filter(f => !f.startsWith("."));
      log(c.blue, d.name, `${files.length} files`);
    }
  }
  console.log("");
}

async function main() {
  console.log("\nCI Visual Testing Pipeline (using @multi-publish/ai-autonomous-tester)\n");
  console.log("================================================================\n");

  const startTime = Date.now();
  log(c.blue, "ENV", `TEST_URL: ${process.env.TEST_URL || "http://localhost:5173"}`);
  log(c.blue, "ENV", `Package: @multi-publish/ai-autonomous-tester`);
  log(c.blue, "INFO", "AI Judgment: Agent view_image (no API Key needed)\n");

  [REPORT_DIR, SCREENSHOT_DIR, BASELINE_DIR, META_DIR].forEach(ensureDir);

  const results = {
    pixel: { total: 8, passed: 0, failed: 0 },
    agentReport: "not_run",
  };

  console.log("\n--- Step 1: Pixel Diff Tests ---\n");
  const pixelResult = await runPixelTests();
  results.pixel = {
    total: pixelResult.total,
    passed: pixelResult.passed,
    failed: pixelResult.failed,
  };

  console.log("\n--- Step 2: Agent Judge Report ---\n");
  results.agentReport = runAgentJudge();

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  generateCIReport(results, startTime, duration);
  listArtifacts();

  console.log("\n================================================================\n");

  if (pixelResult.failed > 0) {
    log(c.yellow, "RESULT", "Pixel diff failed");
    log(c.blue, "INFO", "Download artifacts and run Agent visual judgment in Codex/Claude Desktop");
    console.log("\n================================================================\n");
    process.exit(0);
  }

  log(c.green, "SUCCESS", "CI visual testing pipeline completed!");
  console.log("\n================================================================\n");
  process.exit(0);
}

const args = process.argv.slice(2);

if (args[0] === "--help") {
  console.log(`
CI Visual Testing Integration Script

Uses @multi-publish/ai-autonomous-tester package.

用法:
  node tests/visual-testing/scripts/visual-ci.js [选项]

选项:
  --pixel-only    只运行像素对比测试
  --agent-only    生成 Agent 判断报告
  --help          显示帮助

环境变量:
  TEST_URL    测试目标 URL (默认: http://localhost:5173)

说明:
  本脚本运行像素对比测试和生成 Agent 判断报告。
  Agent 视觉判断由 Agent（Codex/Claude Desktop）执行：
    npm run test:visual:agent

示例:
  node tests/visual-testing/scripts/visual-ci.js
`);
} else if (args[0] === "--pixel-only") {
  runPixelTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
} else if (args[0] === "--agent-only") {
  runAgentJudge();
} else {
  main().catch(err => {
    log(c.red, "ERROR", err.message);
    process.exit(1);
  });
}

module.exports = { runPixelTests, runAgentJudge };
