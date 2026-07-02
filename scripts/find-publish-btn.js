const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: "zh-CN" });
  const page = await ctx.newPage();

  await page.goto("https://www.zhihu.com/signin", { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(3000);
    const cur = page.url();
    if (!cur.includes("signin") && !cur.includes("login") && cur.includes("zhihu")) break;
  }

  console.log("Go to zhuanlan write page...");
  await page.goto("https://zhuanlan.zhihu.com/write", { timeout: 15000 });
  await page.waitForTimeout(3000);

  // Find the publish button
  console.log("\nAll buttons:");
  const btns = await page.evaluate(() => {
    const items = [];
    for (const b of document.querySelectorAll("button, [role=button], a[href]")) {
      const t = (b.textContent || "").trim().slice(0, 30);
      const cls = (b.className || "").slice(0, 40);
      const id = b.id || "";
      const type = b.getAttribute("type") || "";
      const href = b.href || "";
      const aria = b.getAttribute("aria-label") || "";
      if (t || aria || href) {
        items.push({ tag: b.tagName, text: t, cls, id, type, aria: aria.slice(0, 20), href: href.slice(0, 40) });
      }
    }
    return items;
  });
  for (const b of btns) {
    console.log("  <" + b.tag + "> type=" + b.type + " id=" + b.id + " text=" + b.text + " cls=" + b.cls + " aria=" + b.aria);
  }

  // Find the exact publish/dropdown buttons
  console.log("\nButtons containing '发布':");
  const pubBtns = await page.evaluate(() => {
    const items = [];
    for (const b of document.querySelectorAll("button, [role=button]")) {
      if (b.textContent?.includes("\u53d1\u5e03")) {
        const rect = b.getBoundingClientRect();
        const style = window.getComputedStyle(b);
        items.push({
          text: b.textContent.trim().slice(0, 30),
          display: style.display,
          visibility: style.visibility,
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          cls: (b.className || "").slice(0, 40),
          tag: b.tagName,
          parent: b.parentElement?.tagName || "",
          parentCls: (b.parentElement?.className || "").slice(0, 30),
        });
      }
    }
    return items;
  });
  for (const b of pubBtns) {
    console.log("  " + b.text + " display=" + b.display + " vis=" + b.visibility + " rect=" + JSON.stringify(b.rect) + " cls=" + b.cls);
  }

  await browser.close();
  console.log("\nDone.");
}
main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
