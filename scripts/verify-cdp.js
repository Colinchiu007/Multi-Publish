const { chromium } = require("playwright");
const vm = require("vm");
const fs2 = require("fs");
const path2 = require("path");

const platform = process.argv[2];
if (!platform) { console.log("Usage: node verify-cdp.js <platform>"); process.exit(1); }

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
const loginUrl = sel.PLATFORM_LOGIN_URLS[platform];
const pubNavUrl = def.PLATFORM_DASHBOARD_URLS[platform];
const pubCfg = sel.PLATFORM_PUBLISH_SELECTORS[platform];
const primaryUrl = pubNavUrl || loginUrl;

console.log("====== " + name + " (" + platform + ") ======");
console.log("1. Open your Chrome with: chrome.exe --remote-debugging-port=9222");
console.log("2. Navigate to: " + primaryUrl);
console.log("3. Log in to the platform");
console.log("4. Press ENTER in the terminal here when ready");
console.log("");

(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  if (!ctx) { console.log("No context found"); await browser.close(); process.exit(1); }

  // Find or create a page on the target URL
  let page = ctx.pages().find(p => p.url().includes(platform));
  if (!page) {
    page = await ctx.newPage();
    await page.goto(primaryUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(e => {});
    await page.waitForTimeout(2000);
  }

  console.log("Current URL: " + page.url().slice(0,100));
  console.log("Title: " + (await page.title()).slice(0,60));

  // Test selectors
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

  await browser.close();
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
