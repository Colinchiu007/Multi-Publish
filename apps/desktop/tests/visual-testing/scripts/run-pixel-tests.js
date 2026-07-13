/**
 * 像素对比测试运行器
 *
 * Refactored to use @multi-publish/ai-autonomous-tester package.
 */

const { VisualTestRunner } = require("@multi-publish/ai-autonomous-tester");

const pixelTests = [
  { name: "home-baseline", route: "/" },
  { name: "accounts-list", route: "/accounts" },
  { name: "publish-form", route: "/publish" },
  { name: "monitor-dashboard", route: "/monitor" },
  { name: "analytics-overview", route: "/analytics" },
  { name: "settings-general", route: "/settings" },
  { name: "login-form", route: "/login" },
  { name: "create-editor", route: "/create" },
  { name: "model-providers", route: "/model-providers" },
];

async function run() {
  console.log("\nPixel Comparison Tests (using @multi-publish/ai-autonomous-tester)\n");

  const runner = new VisualTestRunner({
    url: process.env.TEST_URL || "http://localhost:5173",
  });

  await runner.launch();

  let passed = 0;
  let failed = 0;

  for (const test of pixelTests) {
    console.log(`${test.name} (${test.route})...`);
    try {
      await runner.pixelRegressionTest(test.name, test.route);
      passed++;
      console.log(`  PASSED`);
    } catch (err) {
      console.log(`  FAILED: ${err.message.split("\n")[0]}`);
      failed++;
    }
  }

  await runner.close();

  console.log(`\nPixel Diff: ${passed}/${pixelTests.length} passed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error("Runner failed:", err.message);
  process.exit(1);
});
