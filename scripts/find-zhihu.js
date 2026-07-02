const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: "zh-CN" });
  const page = await ctx.newPage();

  console.log("1. 登录知乎...");
  await page.goto("https://www.zhihu.com/signin", { waitUntil: "domcontentloaded" });
  let prevUrl = "";
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(3000);
    const curUrl = page.url();
    if (curUrl !== prevUrl) {
      console.log(`  [${i * 3}s] ${curUrl.slice(0, 100)}`);
      prevUrl = curUrl;
    }
    if (!curUrl.includes("signin") && !curUrl.includes("login") && curUrl.includes("zhihu")) break;
  }

  console.log("\n2. 查找创作中心按钮...");
  // Try common creator URLs
  const urls = [
    "https://www.zhihu.com/creator",
    "https://www.zhihu.com/creator/write",
    "https://zhuanlan.zhihu.com/write",
    "https://www.zhihu.com/write",
    "https://www.zhihu.com/editor",
  ];
  for (const u of urls) {
    try {
      const resp = await page.goto(u, { timeout: 10000 });
      await page.waitForTimeout(1000);
      const title = await page.title();
      const finalUrl = page.url();
      console.log(`  ${u}`);
      console.log(`    → ${finalUrl.slice(0, 80)} | ${title.slice(0, 50)}`);
    } catch (e) {
      console.log(`  ${u}: ❌ ${e.message.slice(0, 40)}`);
    }
  }

  // Try clicking "写文章" on the homepage
  console.log("\n3. 回到首页点击「写文章」...");
  await page.goto("https://www.zhihu.com/", { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.waitForTimeout(2000);

  const writeBtns = await page.evaluate(() => {
    const all = document.querySelectorAll("a, button, span");
    const results = [];
    for (const el of all) {
      const text = el.textContent?.trim() || "";
      if (text.includes("写文章") || text.includes("创作") || text.includes("发文章")) {
        results.push({ tag: el.tagName, text: text.slice(0, 20), href: el.href || "", onclick: el.getAttribute?.("onclick") || "" });
      }
    }
    return results;
  });
  console.log(`  找到 ${writeBtns.length} 个匹配元素:`);
  for (const b of writeBtns) {
    console.log(`    <${b.tag}> text="${b.text}" href="${b.href.slice(0, 60)}"`);
  }

  // Also check what element selector the current page has
  console.log("\n4. 页面中的 <a> 链接（包含"文章"或"write"）:");
  const links = await page.evaluate(() => {
    const all = document.querySelectorAll("a[href]");
    const results = [];
    for (const el of all) {
      const h = el.href;
      if (h.includes("write") || h.includes("article") || h.includes("creator") || h.includes("zhuanlan")) {
        results.push({ text: (el.textContent || "").slice(0, 30), href: h.slice(0, 80) });
      }
    }
    return results.slice(0, 15);
  });
  for (const l of links) console.log(`    ${l.text}: ${l.href}`);

  await browser.close();
  console.log("\n✅ 完成");
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
