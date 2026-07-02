const { chromium } = require("playwright");
const vm = require("vm");
const fs = require("fs");

const content = fs.readFileSync("D:/Data/projects/Multi-Publish/packages/rpa-engine/src/platform-selectors.js", "utf-8");
const sandbox = { module: { exports: {} } };
new vm.Script(content).runInContext(vm.createContext(sandbox));
const sel = sandbox.module.exports;

const SUCCESS_URLS = {
  zhihu: ["zhihu.com/people", "zhihu.com/home", "www.zhihu.com", "zhihu.com/creator"],
};

async function verify(platform) {
  const url = sel.PLATFORM_LOGIN_URLS[platform];
  const name = sel.PLATFORM_NAMES[platform] || platform;
  const pubCfg = sel.PLATFORM_PUBLISH_SELECTORS[platform];
  const patterns = SUCCESS_URLS[platform] || [];

  console.log(`=== ${name} (${platform}) ===`);
  console.log(`打开浏览器，请在浏览器中扫码/登录`);
  console.log(`URL: ${url}\n`);

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: "zh-CN" });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });

  console.log("⏳ 等待登录... (每 3 秒显示当前 URL)");
  let prevUrl = "";
  let success = false;
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(3000);
    const curUrl = page.url();
    if (curUrl !== prevUrl) {
      console.log(`  [${i * 3}s] ${curUrl.slice(0, 100)}`);
      prevUrl = curUrl;
    }
    success = patterns.some((p) => curUrl.includes(p));
    if (success) {
      console.log(`\n✅ 登录成功!`);
      break;
    }
  }

  if (!success) console.log(`⏰ 超时等待，使用当前页面 (${page.url().slice(0, 80)})`);
  await page.waitForTimeout(2000);

  console.log(`\n--- 登录成功选择器 ---`);
  for (const s of (sel.PLATFORM_LOGIN_SUCCESS_SELECTORS[platform] || [])) {
    try { const el = await page.$(s); console.log(`  ${s}: ${el ? "✅" : "❌"}`); }
    catch (e) { console.log(`  ${s}: ⚠`); }
  }

  console.log(`\n--- 发布选择器 (当前页) ---`);
  for (const [field, sels] of Object.entries(pubCfg || {})) {
    if (!Array.isArray(sels)) continue;
    for (const s of sels) {
      try { const el = await page.$(s); console.log(`  ${field.padEnd(16)}: ${el ? "✅" : "❌"} ${s.slice(0, 55)}`); }
      catch (e) { console.log(`  ${field.padEnd(16)}: ⚠ ${s.slice(0, 40)}`); }
    }
  }

  console.log(`\n--- 发布页验证 ---`);
  try {
    await page.goto("https://www.zhihu.com/creator/write", { timeout: 15000 });
    await page.waitForTimeout(3000);
    console.log(`  URL: ${page.url().slice(0, 80)}`);
    for (const [field, sels] of Object.entries(pubCfg || {})) {
      if (!Array.isArray(sels)) continue;
      for (const s of sels) {
        try {
          const el = await page.$(s);
          let tag = "";
          if (el) tag = " " + (await el.evaluate((e) => e.tagName + (e.id ? "#" + e.id : "") + (e.placeholder ? '[placeholder="' + String(e.placeholder).slice(0, 20) + '"]' : "")));
          console.log(`  ${field.padEnd(16)}: ${el ? "✅" : "❌"} ${s.slice(0, 50)}${tag}`);
        } catch (e) { console.log(`  ${field.padEnd(16)}: ⚠ ${s.slice(0, 40)}`); }
      }
    }
  } catch (e) { console.log(`  ❌ 发布页: ${e.message.slice(0, 60)}`); }

  console.log(`\n✅ ${name} 验证完成`);
  await browser.close();
}

const platform = process.argv[2] || "zhihu";
verify(platform).catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
