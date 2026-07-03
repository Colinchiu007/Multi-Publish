const { chromium } = require("playwright");
const vm = require("vm");
const fs2 = require("fs");
const path2 = require("path");

const platform = process.argv[2];
if (!platform) { process.exit(1); }

const pkgDir = path2.join(__dirname, "..", "packages");
function loadModule(fp) {
  const c2 = fs2.readFileSync(fp, "utf-8");
  const s = { module: { exports: {} } };
  new vm.Script(c2).runInContext(vm.createContext(s));
  return s.module.exports;
}
const sel = loadModule(path2.join(pkgDir, "rpa-engine", "src", "platform-selectors.js"));
const def = loadModule(path2.join(pkgDir, "shared-utils", "src", "platform-definitions.js"));

const name = sel.PLATFORM_NAMES[platform] || platform;
const pubNavUrl = def.PLATFORM_DASHBOARD_URLS[platform];
const pubCfg = sel.PLATFORM_PUBLISH_SELECTORS[platform];
const primaryUrl = pubNavUrl || sel.PLATFORM_LOGIN_URLS[platform];

console.log("Platform: " + name + " (" + platform + ")");
console.log("URL: " + primaryUrl);
console.log("Browser opens in 3s. Scan QR code or login.");
console.log("Script waits 2 minutes, then tests selectors.");

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: "zh-CN", timezoneId: "Asia/Shanghai" });
  const page = await ctx.newPage();
  await page.goto(primaryUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(e => {});
  await page.waitForTimeout(2000);
  console.log("Title: " + (await page.title()).slice(0,60));
  
  console.log("Waiting 120s for you to login...");
  let lastUrl = page.url();
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);
    const cur = page.url();
    if (cur !== lastUrl) { console.log("  URL: " + cur.slice(0,80)); lastUrl = cur; }
  }

  console.log("\nURL: " + page.url().slice(0,100));
  console.log("Title: " + (await page.title()).slice(0,60));

  // Navigate to publish page if needed
  const pubUrls = {
    douyin: "https://creator.douyin.com/creator-micro/studio/video",
    xiaohongshu: "https://creator.xiaohongshu.com/publish/publish",
    kuaishou: "https://cp.kuaishou.com/article/publish/video",
    toutiao: "https://mp.toutiao.com/profile_v4/works/article",
    baijiahao: "https://baijiahao.baidu.com/builder/rc/edit?type=0",
    tencent_video: "https://channels.weixin.qq.com/post",
  };
  const directUrl = pubUrls[platform];
  if (directUrl && !page.url().includes(directUrl.replace("https://",""))) {
    console.log("Navigating to publish page: " + directUrl);
    await page.goto(directUrl, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(e => {});
    await page.waitForTimeout(3000);
    console.log("Publish URL: " + page.url().slice(0,100));
  }

  console.log("\n--- Selector Results ---");
  let match = 0, total = 0;
  for (const [field, sels] of Object.entries(pubCfg)) {
    if (!Array.isArray(sels)) continue;
    for (const s of sels) {
      total++;
      try {
        const el = await page.$(s);
        if (el) {
          const ph = await el.evaluate(e => e.placeholder || "").catch(() => "");
          const tag = await el.evaluate(e => e.tagName).catch(() => "");
          match++;
          console.log("  + " + field.padEnd(14) + " " + s.slice(0,55) + " -> " + tag + (ph ? " [ph:" + ph.slice(0,25) + "]" : ""));
        } else {
          console.log("  - " + field.padEnd(14) + " " + s.slice(0,55));
        }
      } catch(e) {
        console.log("  ! " + field.padEnd(14) + " " + s.slice(0,50));
      }
    }
  }
  console.log("\nResult: " + match + "/" + total);
  console.log("Closing in 10s...");
  await page.waitForTimeout(10000);
  await browser.close();
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
