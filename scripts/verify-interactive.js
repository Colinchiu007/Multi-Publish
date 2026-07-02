const { chromium } = require("playwright");
const vm = require("vm");
const fs = require("fs");
const path = require("path");

// Load platform selectors
const content = fs.readFileSync(
  "D:/Data/projects/Multi-Publish/packages/rpa-engine/src/platform-selectors.js", "utf-8"
);
const sandbox = { module: { exports: {} } };
new vm.Script(content).runInContext(vm.createContext(sandbox));
const sel = sandbox.module.exports;

async function main() {
  const browser = await chromium.launch({ headless: false, channel: "chromium" });
  const ctx = await browser.newContext({
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  });

  // Test all platforms one by one
  const testPlatforms = process.argv[2] ? [process.argv[2]] : ["zhihu"];

  for (const platform of testPlatforms) {
    const url = sel.PLATFORM_LOGIN_URLS[platform];
    const pubCfg = sel.PLATFORM_PUBLISH_SELECTORS[platform];
    const name = sel.PLATFORM_NAMES[platform] || platform;

    console.log(`\n=== ${name} (${platform}) ===`);
    console.log(`请扫码/登录: ${url}`);
    console.log(`登录完成后，在控制台会检查以下选择器...\n`);

    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    console.log("⏳ 等待你登录...");
    console.log("登录后请按 Enter 键继续...");
    await new Promise((resolve) => {
      process.stdin.once("data", () => resolve());
    });

    const finalUrl = page.url();
    const pageTitle = await page.title();
    console.log(`\n当前页面: ${pageTitle}`);
    console.log(`URL: ${finalUrl.slice(0, 100)}`);

    // Test login success selectors
    console.log(`\n--- 登录成功选择器 ---`);
    for (const s of (sel.PLATFORM_LOGIN_SUCCESS_SELECTORS[platform] || [])) {
      try {
        const el = await page.$(s);
        console.log(`  ${s}: ${el ? "✅ FOUND" : "❌ NOT FOUND"}`);
      } catch (e) {
        console.log(`  ${s}: ⚠ ERROR: ${e.message.slice(0, 40)}`);
      }
    }

    // Test publish selectors
    console.log(`\n--- 发布选择器 (字段: 优先选择器) ---`);
    for (const [field, sels] of Object.entries(pubCfg || {})) {
      if (!Array.isArray(sels) || sels.length === 0) continue;
      for (const s of sels.slice(0, 2)) {
        try {
          const el = await page.$(s);
          const status = el ? "✅" : "❌";
          const tag = el ? (await el.evaluate((e) => e.tagName + (e.id ? "#" + e.id : "") + (e.placeholder ? '[placeholder="' + String(e.placeholder).slice(0, 20) + '"]' : ""))) : "";
          console.log(`  ${field.padEnd(16)}: ${status} ${s.slice(0, 50)}${tag ? " → " + tag : ""}`);
        } catch (e) {
          console.log(`  ${field.padEnd(16)}: ⚠ ERR ${s.slice(0, 40)}`);
        }
      }
    }

    // Navigate to publish page if available
    console.log(`\n--- 跳转到发布页 ---`);
    try {
      await page.goto("https://www.zhihu.com/creator/write", { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(3000);
      console.log(`  当前: ${page.url().slice(0, 80)}`);

      for (const [field, sels] of Object.entries(pubCfg || {})) {
        if (!Array.isArray(sels) || sels.length === 0) continue;
        for (const s of sels.slice(0, 2)) {
          try {
            const el = await page.$(s);
            const status = el ? "✅" : "❌";
            console.log(`  ${field.padEnd(16)}: ${status} ${s.slice(0, 50)}${el ? " [FOUND]" : ""}`);
          } catch (e) {
            console.log(`  ${field.padEnd(16)}: ⚠ ERR ${s.slice(0, 40)}`);
          }
        }
      }
    } catch (e) {
      console.log(`  ⚠ 无法访问发布页: ${e.message.slice(0, 60)}`);
    }

    await page.close();
  }

  await browser.close();
  console.log("\n✅ 验证完成");
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
