const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: "zh-CN" });
  const page = await ctx.newPage();

  console.log("1. Login...");
  await page.goto("https://www.zhihu.com/signin", { waitUntil: "domcontentloaded" });
  let prevUrl = "";
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(3000);
    const curUrl = page.url();
    if (curUrl !== prevUrl) { console.log("  [" + (i*3) + "s] " + curUrl.slice(0,100)); prevUrl = curUrl; }
    if (!curUrl.includes("signin") && !curUrl.includes("login") && curUrl.includes("zhihu")) break;
  }

  console.log("\n2. Try creator URLs...");
  const urls = ["https://www.zhihu.com/creator", "https://www.zhihu.com/creator/write", "https://zhuanlan.zhihu.com/write", "https://www.zhihu.com/write", "https://www.zhihu.com/question/submit", "https://www.zhihu.com/editor"];
  for (const u of urls) {
    try {
      const resp = await page.goto(u, { timeout: 10000 });
      await page.waitForTimeout(1000);
      console.log("  " + u + " -> " + page.url().slice(0, 80) + " | " + (await page.title()).slice(0, 50));
    } catch (e) {
      console.log("  " + u + " : FAIL " + e.message.slice(0, 40));
    }
  }

  console.log("\n3. Find write button on homepage...");
  await page.goto("https://www.zhihu.com/", { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.waitForTimeout(2000);

  const btns = await page.evaluate(() => {
    const items = [];
    for (const el of document.querySelectorAll("a[href], button")) {
      const t = (el.textContent || "").trim();
      const h = el.href || "";
      if (t.includes("\u5199\u6587\u7ae0") || t.includes("\u521b\u4f5c") || h.includes("write") || h.includes("creator")) {
        items.push({ tag: el.tagName, text: t.slice(0, 20), href: h.slice(0, 80), cls: (el.className || "").slice(0, 30) });
      }
    }
    return items;
  });
  console.log("  Found " + btns.length + " buttons:");
  for (const b of btns) console.log("    <" + b.tag + "> " + b.text + " href=" + b.href + " class=" + b.cls);

  // Check all links
  console.log("\n4. All links with article/write/creator:");
  const links = await page.evaluate(() => {
    const items = [];
    for (const el of document.querySelectorAll("a[href]")) {
      const h = el.href;
      if (h.includes("write") || h.includes("article") || h.includes("creator") || h.includes("zhuanlan")) {
        items.push({ text: (el.textContent || "").slice(0, 30), href: h.slice(0, 80) });
      }
    }
    return items.slice(0, 20);
  });
  for (const l of links) console.log("    " + l.text + " : " + l.href);

  await browser.close();
  console.log("\nDone.");
}
main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
