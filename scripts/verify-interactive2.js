const { chromium } = require("playwright");
const vm = require("vm");
const fs = require("fs");

const content = fs.readFileSync(
  "D:/Data/projects/Multi-Publish/packages/rpa-engine/src/platform-selectors.js", "utf-8"
);
const sandbox = { module: { exports: {} } };
new vm.Script(content).runInContext(vm.createContext(sandbox));
const sel = sandbox.module.exports;

// Login success patterns from platform-definitions
const LOGIN_PATTERNS = {
  zhihu: ["zhihu.com/people", "zhihu.com/home"],
  wechat_mp: ["mp.weixin.qq.com/cgi-bin/home"],
  weibo: ["weibo.com/home", "weibo.com/u/"],
  douyin: ["douyin.com"],
  xiaohongshu: ["creator.xiaohongshu.com"],
  tencent_video: ["channels.weixin.qq.com"],
  kuaishou: ["cp.kuaishou.com"],
  toutiao: ["mp.toutiao.com"],
  youtube: ["studio.youtube.com"],
  tiktok: ["tiktok.com/upload"],
  bilibili: ["member.bilibili.com"],
  baijiahao: ["baijiahao.baidu.com"],
  twitter: ["x.com/home", "twitter.com/home"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com"],
};

async function verifyPlatform(platform) {
  const url = sel.PLATFORM_LOGIN_URLS[platform];
  const patterns = LOGIN_PATTERNS[platform] || [];
  const pubCfg = sel.PLATFORM_PUBLISH_SELECTORS[platform];
  const name = sel.PLATFORM_NAMES[platform] || platform;

  console.log(`\n=== ${name} (${platform}) ===`);
  console.log(`在打开的浏览器中登录: ${url}`);
  console.log(`自动检测登录状态，无需手动操作\n`);

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: "zh-CN", timezoneId: "Asia/Shanghai" });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Poll for login success
  console.log("⏳ 等待登录完成（请扫码或输入密码）...");
  let loggedIn = false;
  for (let i = 0; i < 300; i++) { // 10 minutes max
    await page.waitForTimeout(2000);
    const curUrl = page.url();
    const matched = patterns.some((p) => curUrl.includes(p));
    if (matched) {
      console.log(`✅ 登录成功! (${curUrl.slice(0, 80)})`);
      loggedIn = true;
      break;
    }
    if (i % 10 === 9) console.log(`  ⏳ 仍在等待... (${Math.round((i + 1) * 2 / 60)}分钟)`);
  }

  if (!loggedIn) {
    console.log("❌ 登录超时（10分钟）");
    await browser.close();
    return;
  }

  await page.waitForTimeout(3000);

  // Test login success selectors
  console.log(`\n--- 登录成功选择器 ---`);
  for (const s of (sel.PLATFORM_LOGIN_SUCCESS_SELECTORS[platform] || [])) {
    try { const el = await page.$(s); console.log(`  ${s}: ${el ? "✅" : "❌"}`); }
    catch (e) { console.log(`  ${s}: ⚠ ERR`); }
  }

  // Test publish selectors on current page
  console.log(`\n--- 发布选择器 (当前页) ---`);
  for (const [field, sels] of Object.entries(pubCfg || {})) {
    if (!Array.isArray(sels) || sels.length === 0) continue;
    for (const s of sels.slice(0, 2)) {
      try { const el = await page.$(s); console.log(`  ${field.padEnd(16)}: ${el ? "✅" : "❌"} ${s.slice(0, 55)}`); }
      catch (e) { console.log(`  ${field.padEnd(16)}: ⚠ ${s.slice(0, 40)}`); }
    }
  }

  // Try to navigate to publish page
  if (platform === "zhihu") {
    console.log(`\n--- 发布页面验证 (zhihu.com/creator/write) ---`);
    try {
      await page.goto("https://www.zhihu.com/creator/write", { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(3000);
      for (const [field, sels] of Object.entries(pubCfg || {})) {
        if (!Array.isArray(sels) || sels.length === 0) continue;
        for (const s of sels.slice(0, 2)) {
          try { const el = await page.$(s); console.log(`  ${field.padEnd(16)}: ${el ? "✅" : "❌"} ${s.slice(0, 55)}`); }
          catch (e) { console.log(`  ${field.padEnd(16)}: ⚠ ${s.slice(0, 40)}`); }
        }
      }
    } catch (e) { console.log(`  ⚠ 发布页: ${e.message.slice(0, 60)}`); }
  }

  console.log(`\n✅ ${name} 验证完成`);
  await browser.close();
  await ctx.close();
}

const platform = process.argv[2] || "zhihu";
verifyPlatform(platform).catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
