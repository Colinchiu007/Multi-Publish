const { chromium } = require("playwright");
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const selPath = path.join(__dirname, "..", "packages", "rpa-engine", "src", "platform-selectors.js");
const content = fs.readFileSync(selPath, "utf-8");
const sandbox = { module: { exports: {} } };
new vm.Script(content).runInContext(vm.createContext(sandbox));
const sel = sandbox.module.exports;

const defPath = path.join(__dirname, "..", "packages", "shared-utils", "src", "platform-definitions.js");
const defContent = fs.readFileSync(defPath, "utf-8");
const defSandbox = { module: { exports: {} } };
new vm.Script(defContent).runInContext(vm.createContext(defSandbox));
const def = defSandbox.module.exports;

async function testSelectors(page, pubCfg) {
  console.log("\nTesting publish selectors...");
  let match = 0, total = 0;
  for (const [field, sels] of Object.entries(pubCfg)) {
    if (!Array.isArray(sels)) continue;
    for (const s of sels) {
      total++;
      const selInfo = s;
      try {
        const el = await page.$(selInfo);
        if (el) {
          const tag = await el.evaluate(e => e.tagName + (e.placeholder ? " [ph:" + e.placeholder.slice(0,25) + "]" : ""));
          match++;
          console.log("  [" + field.padEnd(14) + "] " + selInfo.slice(0,60) + " -> " + tag);
        } else {
          console.log("  [" + field.padEnd(14) + "] " + selInfo.slice(0,60));
        }
      } catch(e) {
        console.log("  [" + field.padEnd(14) + "] ..." + e.message.slice(0,40));
      }
    }
  }
  return { match, total };
}

async function verifyOne(platform) {
  const loginUrl = sel.PLATFORM_LOGIN_URLS[platform];
  const name = sel.PLATFORM_NAMES[platform] || platform;
  const pubCfg = sel.PLATFORM_PUBLISH_SELECTORS[platform];
  const patterns = def.PLATFORM_LOGIN_SUCCESS_PATTERNS[platform] || [];

  console.log("\n" + "=".repeat(60));
  console.log(name + " (" + platform + ")");
  console.log("=".repeat(60));
  console.log("Login URL: " + loginUrl);

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: "zh-CN", timezoneId: "Asia/Shanghai" });
  const page = await ctx.newPage();

  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(e => console.log("Nav: " + e.message.slice(0,50)));

  console.log("\nLogin in the browser window... (polling URL every 3s)");

  // First check if already logged in
  let loggedIn = false;
  for (const selItem of (def.PLATFORM_LOGIN_SUCCESS_SELECTORS[platform] || [])) {
    try { if (await page.$(selItem)) { loggedIn = true; break; } } catch {}
  }
  if (loggedIn) { console.log("Already logged in (selector match)"); }
  
  if (!loggedIn) {
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(3000);
      const curUrl = page.url();
      // Prefer SELECTOR-based detection (works for same-host platforms)
      for (const selItem of (def.PLATFORM_LOGIN_SUCCESS_SELECTORS[platform] || [])) {
        try { if (await page.$(selItem)) { loggedIn = true; break; } } catch {}
      }
      if (loggedIn) { console.log("Login detected!"); break; }
      // URL-based detection as fallback (only if host CHANGES)
      if (!loggedIn && patterns.length > 0) {
        try {
          const curHost = new URL(curUrl).host;
          const loginHost = new URL(loginUrl).host;
          if (curHost !== loginHost) {
            loggedIn = true;
            console.log("Login detected (host changed to " + curHost + ")");
            break;
          }
        } catch {}
      }
      if (i % 5 === 4) console.log("  Waiting... URL: " + curUrl.slice(0,80));
      // Fallback: if URL no longer looks like a login/signin page, likely logged in
      if (!loggedIn && !curUrl.includes("login") && !curUrl.includes("signin") && !curUrl.includes("passport") && !curUrl.includes("auth") && curUrl !== loginUrl) {
        try {
          const loginHost = new URL(loginUrl).host;
          const curHost = new URL(curUrl).host;
          if (curHost === loginHost && (curUrl.includes("jingxuan") || curUrl.includes("home") || curUrl.includes("creator") || curUrl.includes("profile"))) {
            loggedIn = true;
            console.log("Login detected (post-login URL pattern)");
            break;
          }
        } catch {}
      }
    }
  }

  console.log("URL: " + page.url().slice(0,100));
  console.log("Title: " + (await page.title()).slice(0,60));

  // Navigate to publish page
  const pubUrl = def.PLATFORM_DASHBOARD_URLS[platform];
  if (pubUrl && !page.url().includes(pubUrl.replace("https://","").replace("http://",""))) {
    console.log("Navigating to publish page: " + pubUrl);
    try {
      await page.goto(pubUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(e => console.log("Nav2: " + e.message.slice(0,50)));
      await page.waitForTimeout(3000);
      console.log("Publish URL: " + page.url().slice(0,100));
      console.log("Publish Title: " + (await page.title()).slice(0,60));
    } catch(e) {
      console.log("Publish nav failed: " + e.message.slice(0,60));
    }
  } else {
    console.log("Already on publish page (or no dashboard URL config)");
  }

  const r = await testSelectors(page, pubCfg);
  console.log("Result: " + r.match + "/" + r.total);

  console.log("\nPress ENTER to close browser and continue to next platform...");
  await new Promise(r2 => process.stdin.once("data", () => r2()));
  await browser.close();
  return r;
}

async function main() {
  const ALL = ["douyin","xiaohongshu","tencent_video","kuaishou","toutiao","baijiahao"];
  const results = {};
  for (const p of ALL) {
    results[p] = await verifyOne(p);
  }
  console.log("\n" + "=".repeat(60));
  console.log("FINAL RESULTS");
  console.log("=".repeat(60));
  for (const [p, r] of Object.entries(results)) {
    console.log("  " + (sel.PLATFORM_NAMES[p]||p).padEnd(14) + " " + r.match + "/" + r.total);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });