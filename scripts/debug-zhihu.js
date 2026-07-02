const { chromium } = require("playwright");
const vm = require("vm");
const fs = require("fs");

const content = fs.readFileSync("D:/Data/projects/Multi-Publish/packages/rpa-engine/src/platform-selectors.js", "utf-8");
const sandbox = { module: { exports: {} } };
new vm.Script(content).runInContext(vm.createContext(sandbox));
const sel = sandbox.module.exports;

async function main() {
  console.log("=== 知乎发布页调试 ===\n");

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: "zh-CN" });
  const page = await ctx.newPage();

  // Step 1: Login
  console.log("1. 打开知乎登录页...");
  await page.goto("https://www.zhihu.com/signin", { waitUntil: "domcontentloaded" });

  console.log("⏳ 请在浏览器中扫码登录...");
  let prevUrl = "";
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(3000);
    const curUrl = page.url();
    if (curUrl !== prevUrl) {
      console.log(`  [${i * 3}s] ${curUrl.slice(0, 100)}`);
      prevUrl = curUrl;
    }
    if (!curUrl.includes("signin") && !curUrl.includes("login") && curUrl.includes("zhihu")) {
      console.log("\n✅ 检测到登录状态！");
      break;
    }
  }

  // Step 2: Debug current page
  console.log(`\n2. 当前页面分析`);
  console.log(`  URL: ${page.url()}`);
  console.log(`  标题: ${await page.title()}`);

  // Print body elements
  const bodyInfo = await page.evaluate(() => {
    return {
      bodyChildren: document.body?.children?.length || 0,
      bodyHTML: (document.body?.innerHTML || "").substring(0, 500),
      visibleText: (document.body?.innerText || "").substring(0, 200),
    };
  });
  console.log(`  body 子元素数: ${bodyInfo.bodyChildren}`);
  console.log(`  可见文本: ${bodyInfo.visibleText}`);

  // Step 3: Navigate to creator/write
  console.log(`\n3. 跳转到发布页...`);
  try {
    const resp = await page.goto("https://www.zhihu.com/creator/write", { timeout: 15000 });
    await page.waitForTimeout(3000);
    console.log(`  URL: ${page.url()}`);
    console.log(`  标题: ${await page.title()}`);
    console.log(`  HTTP 状态: ${resp?.status()}`);
    console.log(`  重定向链: ${resp?.request()?.redirectChain()?.length || 0}`);

    // Debug: print some elements
    const debug = await page.evaluate(() => {
      const sel = [
        ".WriteIndex-titleInput", ".DraftEditor-title", ".title-input",
        "button:has-text('发布')", ".PublishPanel-publish",
        "input", "textarea", "[contenteditable]",
      ];
      const results = {};
      for (const s of sel) {
        try {
          const el = document.querySelector(s);
          results[s] = el ? el.tagName + (el.id ? "#" + el.id : "") : null;
        } catch(e) { results[s] = "ERR: " + e.message; }
      }
      return results;
    });
    console.log(`  选择器调试:`);
    for (const [s, r] of Object.entries(debug)) {
      if (r) console.log(`    ${s}: ${r}`);
    }

  } catch (e) {
    console.log(`  ❌ 失败: ${e.message.slice(0, 100)}`);
  }

  console.log(`\n✅ 调试完成`);
  await browser.close();
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
