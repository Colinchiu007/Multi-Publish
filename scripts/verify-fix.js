const { chromium } = require("playwright");
const vm = require("vm");
const fs = require("fs");

const content = fs.readFileSync("D:/Data/projects/Multi-Publish/packages/rpa-engine/src/platform-selectors.js", "utf-8");
const sandbox = { module: { exports: {} } };
new vm.Script(content).runInContext(vm.createContext(sandbox));
const sel = sandbox.module.exports;

async function main() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: "zh-CN" });
  const page = await ctx.newPage();

  console.log("Login to Zhihu...");
  await page.goto("https://www.zhihu.com/signin", { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(3000);
    const cur = page.url();
    if (cur.includes("zhuanlan") || (cur.includes("zhihu") && !cur.includes("signin"))) break;
  }

  console.log("Go to zhuanlan.zhihu.com/write");
  await page.goto("https://zhuanlan.zhihu.com/write", { timeout: 15000 });
  await page.waitForTimeout(3000);

  console.log("URL: " + page.url().slice(0, 80));
  console.log("Title: " + (await page.title()).slice(0, 60));

  // Test the NEW selectors
  const zhihuSel = sel.PLATFORM_PUBLISH_SELECTORS.zhihu;
  for (const [field, sels] of Object.entries(zhihuSel)) {
    if (!Array.isArray(sels)) continue;
    for (const s of sels) {
      try {
        const el = await page.$(s);
        let info = "";
        if (el) {
          info = await el.evaluate((e) => e.tagName + (e.placeholder ? "[ph:" + e.placeholder.slice(0,20) + "]" : ""));
        }
        console.log("  " + (el ? "✅" : "❌") + " " + field.padEnd(14) + " " + s.slice(0, 55) + (info ? " -> " + info : ""));
      } catch(e) {
        console.log("  ⚠ " + field.padEnd(14) + " " + s.slice(0, 50));
      }
    }
  }

  console.log("\nDone.");
  await browser.close();
}
main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
