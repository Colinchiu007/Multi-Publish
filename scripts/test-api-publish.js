const { chromium } = require("playwright");
const { publishViaApi } = require("@multi-publish/api-publish-engine");

const platform = process.argv[2] || "zhihu";
const loginUrl = {
  zhihu: "https://www.zhihu.com/signin",
  douyin: "https://creator.douyin.com/",
  xiaohongshu: "https://creator.xiaohongshu.com/login",
  tencent_video: "https://channels.weixin.qq.com/login.html",
  kuaishou: "https://cp.kuaishou.com/",
  baijiahao: "https://baijiahao.baidu.com/",
}[platform] || "https://www.zhihu.com/signin";

console.log("=== API Publish Test: " + platform + " ===");
console.log("1. Browser opens for login");
console.log("2. Login, then script extracts cookies");
console.log("3. Publishes a test article via API");

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: "zh-CN" });
  const page = await ctx.newPage();

  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(e => {});
  console.log("\\nLogin in the browser... (waiting 120s)");
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);
    const cur = page.url();
    if (!cur.includes("signin") && !cur.includes("login") && !cur.includes("passport") && i > 2) {
      console.log("  Login detected: " + cur.slice(0, 80));
      break;
    }
    if (i % 5 === 4) console.log("  [" + ((i + 1) * 3) + "s] " + cur.slice(0, 80));
  }

  // Extract cookies
  const cookies = await ctx.cookies();
  const cookieStr = cookies.map(c => c.name + "=" + c.value).join("; ");
  console.log("\\nCookies extracted: " + cookies.length + " items");

  // Build test article
  const article = {
    title: "API 发布测试 - " + new Date().toISOString().slice(0, 19).replace("T", " "),
    content: "<p>这是一条通过 Multi-Publish API 引擎自动发布的测试内容。</p><p>发布时间: " + new Date().toLocaleString("zh-CN") + "</p>",
    tags: ["测试", "API"],
    draft: true, // Save as draft first
  };

  console.log("\\nPublishing via API...");
  console.log("Title: " + article.title);

  const result = await publishViaApi(platform, article, cookieStr, {
    onProgress: (pct, msg) => console.log("  [" + pct + "%] " + msg),
  });

  console.log("\\n=== Result ===");
  console.log(JSON.stringify(result, null, 2));

  console.log("\\nBrowser stays open 15s for inspection.");
  await page.waitForTimeout(15000);
  await browser.close();
})().catch(e => { console.error("Error:", e.message); process.exit(1); });