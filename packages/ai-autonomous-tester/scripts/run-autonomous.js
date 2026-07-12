/**
 * run-autonomous.js - 自主测试循环 CLI 入口
 *
 * 使用方式:
 *   node scripts/run-autonomous.js [--prd=./PRD.md] [--src=./src] [--iterations=5] [--targets=home,accounts,publish]
 */

const path = require("path");
const fs = require("fs");
const { AutonomousTestRunner, TestOrchestrator } = require("../index");

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const ROOT = path.resolve(__dirname, "../..", "..");
const prdPath = args.prd
  ? path.resolve(args.prd)
  : path.join(ROOT, "01-docs/PRD.md");
const srcDir = args.src
  ? path.resolve(args.src)
  : path.join(ROOT, "apps/desktop/src");
const iterations = parseInt(args.iterations, 10) || 3;
const targetArg = args.targets || "home-baseline,accounts-list,publish-form";
const targets = targetArg.split(",").map(t => t.trim()).filter(Boolean).map(name => ({
  name,
  route: inferRoute(name),
}));

function inferRoute(name) {
  const map = {
    "home-baseline": "/",
    "accounts-list": "/accounts",
    "publish-form": "/publish",
    "monitor-dashboard": "/monitor",
    "analytics-overview": "/analytics",
    "settings-general": "/settings",
    "login-form": "/login",
    "create-editor": "/create",
  };
  return map[name] || `/${name}`;
}

async function main() {
  console.log("================================================================");
  console.log("  AI Autonomous Testing Loop");
  console.log("================================================================");
  console.log(`PRD:      ${prdPath}`);
  console.log(`Source:   ${srcDir}`);
  console.log(`Targets:  ${targets.map(t => t.name).join(", ")}`);
  console.log(`Max iter: ${iterations}`);
  console.log("================================================================\n");

  if (!fs.existsSync(prdPath)) {
    console.warn(`[WARN] PRD not found: ${prdPath}, requirements verification will be skipped`);
  }

  const url = process.env.TEST_URL || "http://localhost:5173";
  console.log(`App URL: ${url}`);
  console.log(`(If app is not running, tests will fail. Start dev server first.)\n`);

  const runner = new AutonomousTestRunner({ url });
  const orchestrator = new TestOrchestrator({
    maxIterations: iterations,
    testRunner: runner,
  });

  const report = await orchestrator.start({
    visual: { targets },
    functional: { targets: [] },
    requirements: { prdPath, srcDir },
  });

  const reportPath = path.join(
    ROOT,
    "apps/desktop/tests/visual-testing/reports",
    `autonomous-report-${Date.now()}.json`
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n================================================================`);
  console.log(`Final Status: ${report.finalStatus}`);
  console.log(`Iterations:   ${report.iterations}/${report.maxIterations}`);
  console.log(`Report saved: ${reportPath}`);
  console.log(`================================================================`);

  const exitCode = report.finalStatus === "SUCCESS" ? 0 : 1;
  process.exit(exitCode);
}

main().catch(err => {
  console.error("Fatal error:", err.message);
  console.error(err.stack);
  process.exit(2);
});
