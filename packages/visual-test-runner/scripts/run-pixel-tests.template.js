/**
 * 像素对比测试 - 模板文件
 *
 * 使用方式:
 *   1. 复制本文件为 run-pixel-tests.js
 *   2. 修改 pixelTests 数组，换成目标项目的路由
 *   3. 设置环境变量 TEST_URL (可选，默认 http://localhost:5173)
 *   4. 运行: node scripts/run-pixel-tests.js
 *
 * 环境变量:
 *   TEST_URL           测试目标 URL (默认 http://localhost:5173)
 *   TEST_HEADLESS      是否无头模式 (默认 true)
 *   TEST_SCREENSHOT_DIR  截图目录 (默认 screenshots)
 *   TEST_BASELINE_DIR  基线目录 (默认 base-screenshots)
 *   TEST_REPORT_DIR    报告目录 (默认 reports)
 */

const { VisualTestRunner } = require("../index.js");

// ====== 修改这里 ======
const pixelTests = [
  { name: "home-baseline", route: "/" },
  { name: "login-form", route: "/login" },
  { name: "dashboard", route: "/dashboard" },
  // 添加更多测试路由...
];
// ======================

async function run() {
  console.log("\n visual-test-runner pixel tests\n");
  const runner = new VisualTestRunner();
  await runner.launch();
  let passed = 0, failed = 0;
  for (const test of pixelTests) {
    console.log(" " + test.name + "...");
    try {
      await runner.pixelRegressionTest(test.name, test.route);
      passed++;
    } catch (err) {
      console.log("   FAIL: " + err.message);
      failed++;
    }
  }
  const reportPath = await runner.close();
  console.log("\n Results: " + passed + " passed / " + failed + " failed");
  console.log(" Report: " + reportPath);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error("Runner failed:", err.message); process.exit(1); });