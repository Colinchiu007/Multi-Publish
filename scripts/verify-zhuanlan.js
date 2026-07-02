const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: "zh-CN" });
  const page = await ctx.newPage();

  console.log("Login...");
  await page.goto("https://www.zhihu.com/signin", { waitUntil: "domcontentloaded" });
  let prevUrl = "";
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(3000);
    const curUrl = page.url();
    if (curUrl !== prevUrl) { console.log("  [" + (i*3) + "s] " + curUrl.slice(0, 100)); prevUrl = curUrl; }
    if (!curUrl.includes("signin") && !curUrl.includes("login") && curUrl.includes("zhihu")) break;
  }

  console.log("\n=== zhuanlan.zhihu.com/write ===");
  await page.goto("https://zhuanlan.zhihu.com/write", { timeout: 15000 });
  await page.waitForTimeout(3000);
  console.log("URL: " + page.url().slice(0, 80));
  console.log("Title: " + (await page.title()).slice(0, 60));

  // Test ALL possible selectors
  const selectors = {
    title_input: [
      ".WriteIndex-titleInput", ".DraftEditor-title", ".title-input", ".Editable-title",
      "input[placeholder]", "[contenteditable]", "div[contenteditable]",
      ".Post-Title", ".Draft-title", "h1[contenteditable]", ".css-1m0ykdm",
      "[class*=title]", "[class*=Title]", "[class*=editor] input",
      ".CssComponent-101-101-101 input",
    ],
    editor: [
      ".DraftEditor-root", ".Editable-editor", ".ql-editor", "[contenteditable='true']",
      ".Draft-editor", ".NotRichTextEditable", "[class*=editor]",
      ".public-DraftEditor-content", ".DraftEditor-editorContainer",
    ],
    publish_btn: [
      "button:has-text('\u53d1\u5e03')", "button:has-text('\u53d1\u8868')",
      "button:has-text('\u63d0\u4ea4')", ".PublishPanel-publish",
      "[class*=publish] button", "[class*=submit]", "[class*=Publish]",
    ],
  };

  const results = {};
  for (const [field, sels] of Object.entries(selectors)) {
    console.log("\n--- " + field + " ---");
    for (const s of sels) {
      try {
        const el = await page.$(s);
        const status = el ? "✅" : "❌";
        let info = "";
        if (el) {
          info = await el.evaluate((e) => {
            return e.tagName + (e.id ? "#" + e.id : "") + (e.placeholder ? "[ph:" + e.placeholder.slice(0, 15) + "]" : "") + (e.textContent ? " text:" + e.textContent.trim().slice(0, 20) : "");
          });
        }
        console.log("  " + status + " " + s.slice(0, 55) + (info ? " -> " + info : ""));
      } catch(e) {
        console.log("  ⚠ " + s.slice(0, 50));
      }
    }
  }

  // Analyze page structure
  console.log("\n--- Page Structure ---");
  const structure = await page.evaluate(() => {
    const items = [];
    for (const el of document.querySelectorAll("input, textarea, [contenteditable], button, [role=textbox]")) {
      const tag = el.tagName;
      const type = el.type || "";
      const ph = el.placeholder || "";
      const text = el.textContent?.trim().slice(0, 30) || "";
      const cls = (el.className || "").slice(0, 30);
      const id = el.id || "";
      const ariaLabel = el.getAttribute("aria-label") || "";
      items.push({ tag, type, ph: ph.slice(0, 20), text: text.slice(0, 20), cls, id, ariaLabel: ariaLabel.slice(0, 20) });
    }
    return items.slice(0, 30);
  });
  for (const s of structure) {
    console.log("  <" + s.tag + "> type=" + s.type + " ph=" + s.ph + " text=" + s.text + " aria=" + s.ariaLabel);
  }

  await browser.close();
  console.log("\nDone.");
}
main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
