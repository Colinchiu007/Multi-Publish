/**
 * Pixel comparison test runner (full version)
 * Uses local test-runner (supports hash routing)
 */
try { require("dotenv").config({ path: __dirname + "/../.env" }); } catch (_) {}

const { VisualTestRunner } = require("../test-runner");

const pixelTests = [
  { name: "home-baseline", route: "/" },
  { name: "accounts-list", route: "/accounts" },
  { name: "publish-form", route: "/publish" },
  { name: "monitor-dashboard", route: "/monitor", electronOnly: true },
  { name: "analytics-overview", route: "/analytics" },
  { name: "settings-general", route: "/settings" },
  { name: "login-form", route: "/login" },
  { name: "create-editor", route: "/create" },
  { name: "model-providers", route: "/model-providers" },
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
  { name: "comments", route: "/comments", electronOnly: true },
];

async function run() {
  console.log("\nPixel Comparison Tests - Full\n");
  console.log("  Target: " + (process.env.TEST_URL || "http://127.0.0.1:5174") + "\n");

  const runner = new VisualTestRunner({
    url: process.env.TEST_URL || "http://127.0.0.1:5174",
  });

  await runner.launch();

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let baselined = 0;

  for (const test of pixelTests) {
    if (test.electronOnly && !process.env.ELECTRON_TEST) {
      console.log(test.name + " (" + test.route + ")... SKIPPED (electron-only)");
      skipped++;
      continue;
    }

    console.log(test.name + " (" + test.route + ")...");
    try {
      const result = await runner.pixelRegressionTest(test.name, test.route, {
        waitMs: test.waitMs
      });
      if (result && result.status === "BASELINE_CREATED") {
        baselined++;
        console.log("  BASELINE_CREATED");
      } else {
        passed++;
        console.log("  PASSED (" + result.misMatchPercentage + "%)");
      }
    } catch (err) {
      console.log("  FAILED: " + err.message.split("\n")[0]);
      failed++;
    }
  }

  await runner.close();

  const tested = passed + baselined + failed;
  console.log("\nPixel Diff: " + (passed + baselined) + "/" + tested + " passed (" + baselined + " new baselines), " + failed + " failed, " + skipped + " skipped (electron-only)\n");
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error("Runner failed:", err.message);
  process.exit(1);
});