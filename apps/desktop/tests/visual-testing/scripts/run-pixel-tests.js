/**
 * 像素对比测试运行器（完整版）
 *
 * 使用本地 test-runner（支持 hash 路由）
 */

try { require('dotenv').config({ path: __dirname + '/../.env' }); } catch (_) {}

const { VisualTestRunner } = require('../test-runner');

const pixelTests = [
  // ==================== 核心视图 ====================
  { name: "home-baseline", route: "/" },
  { name: "accounts-list", route: "/accounts" },
  { name: "publish-form", route: "/publish" },
  { name: "monitor-dashboard", route: "/monitor" },
  { name: "analytics-overview", route: "/analytics" },
  { name: "settings-general", route: "/settings" },
  { name: "login-form", route: "/login" },
  { name: "create-editor", route: "/create" },
  { name: "model-providers", route: "/model-providers" },
  // ==================== 补充视图 ====================
  { name: "first-run", route: "/first-run", waitMs: 1500 },
  { name: "dashboard", route: "/dashboard", waitMs: 1500 },
  { name: "calendar", route: "/calendar", waitMs: 1500 },
  { name: "cloud-publish", route: "/cloud-publish", waitMs: 1500 },
  { name: "viral-analysis", route: "/viral-analysis", waitMs: 1500 },
  { name: "create-result", route: "/create/result", waitMs: 1500 },
  { name: "create-pipeline", route: "/create/pipeline", waitMs: 1500 },
  { name: "create-history", route: "/create/history", waitMs: 1500 },
  { name: "intelligence", route: "/intelligence", waitMs: 1500 },
  { name: "keyword-monitor", route: "/keywords", waitMs: 1500 },
  { name: "collection", route: "/collection", waitMs: 1500 },
  { name: "comments", route: "/comments", waitMs: 1500 },
];

async function run() {
  console.log("\nPixel Comparison Tests — 完整版 (local runner with hash routing)\n");
  console.log(`  Target: ${process.env.TEST_URL || 'http://127.0.0.1:5174'}\n`);

  const runner = new VisualTestRunner({
    url: process.env.TEST_URL || 'http://127.0.0.1:5174',
  });

  await runner.launch();

  let passed = 0;
  let failed = 0;
  let baselined = 0;

  for (const test of pixelTests) {
    console.log(`${test.name} (${test.route})...`);
    try {
      const result = await runner.pixelRegressionTest(test.name, test.route, {
        waitMs: test.waitMs
      });
      if (result && result.status === "BASELINE_CREATED") {
        baselined++;
        console.log(`  BASELINE_CREATED`);
      } else {
        passed++;
        console.log(`  PASSED (${result.misMatchPercentage}%)`);
      }
    } catch (err) {
      console.log(`  FAILED: ${err.message.split("\n")[0]}`);
      failed++;
    }
  }

  await runner.close();

  console.log(`\nPixel Diff: ${passed + baselined}/${pixelTests.length} passed (${baselined} new baselines), ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error("Runner failed:", err.message);
  process.exit(1);
});
