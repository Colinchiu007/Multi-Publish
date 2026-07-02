#!/usr/bin/env node
/**
 * verify-platform-selectors.js
 *
 * V1.1 平台验证 — 各平台 RPA 选择器实际页面验证
 *
 * 用法:
 *   node scripts/verify-platform-selectors.js [--full]
 *
 * 默认快速模式只测试前 5 个平台。
 * --full 测试全部 15 个平台（可能被部分平台限流）。
 *
 * 要求:
 *   npm install playwright
 *   npx playwright install chromium
 */

const { chromium } = require("playwright");
const vm = require("vm");
const fs = require("fs");
const path = require("path");

// Load platform selectors
const selectorsPath = path.join(__dirname, "..", "packages", "rpa-engine", "src", "platform-selectors.js");
const content = fs.readFileSync(selectorsPath, "utf-8");
const sandbox = { module: { exports: {} } };
new vm.Script(content).runInContext(vm.createContext(sandbox));
const sel = sandbox.module.exports;

const ALL_PLATFORMS = Object.keys(sel.PLATFORM_LOGIN_URLS);
const isFull = process.argv.includes("--full");
const platforms = isFull ? ALL_PLATFORMS : ALL_PLATFORMS.slice(0, 5);

async function main() {
  console.log("=== Multi-Publish Platform Selector Verification (V1.1) ===\n");
  console.log(`Testing ${platforms.length}/${ALL_PLATFORMS.length} platforms (${isFull ? "FULL" : "QUICK"} mode)`);
  console.log(`Use --full to test all ${ALL_PLATFORMS.length} platforms\n`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  });

  const allResults = {};

  for (const p of platforms) {
    const url = sel.PLATFORM_LOGIN_URLS[p];
    console.log(`\n--- [${p}] ${sel.PLATFORM_NAMES[p] || p} ---`);
    console.log(`  URL: ${url}`);

    const page = await ctx.newPage();
    const result = {
      platform: p,
      name: sel.PLATFORM_NAMES[p] || p,
      loginUrl: url,
      loginSelectors: {},
      publishSelectors: {},
      pageTitle: "",
      finalUrl: "",
      reachable: false,
      error: null,
    };

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(3000);

      result.reachable = true;
      result.pageTitle = (await page.title()).slice(0, 80);
      result.finalUrl = page.url().slice(0, 120);

      console.log(`  Page: "${result.pageTitle}"`);
      console.log(`  Final URL: ${result.finalUrl.slice(0, 80)}...`);

      // Check login success selectors
      for (const s of sel.PLATFORM_LOGIN_SUCCESS_SELECTORS[p] || []) {
        try {
          result.loginSelectors[s] = !!(await page.$(s));
        } catch (e) {
          result.loginSelectors[s] = `ERROR: ${e.message.slice(0, 40)}`;
        }
      }

      // Check publish selectors (only first 2 per field to avoid noise)
      for (const [field, sels] of Object.entries(sel.PLATFORM_PUBLISH_SELECTORS[p] || {})) {
        if (!Array.isArray(sels)) continue;
        result.publishSelectors[field] = {};
        for (const s of sels.slice(0, 3)) {
          try {
            result.publishSelectors[field][s] = !!(await page.$(s));
          } catch (e) {
            result.publishSelectors[field][s] = `ERROR: ${e.message.slice(0, 40)}`;
          }
        }
      }

      // Check if login page requires auth (redirected to SSO)
      const isLoginPage = result.finalUrl.includes("login") || result.finalUrl.includes("signin") || result.finalUrl.includes("passport");
      const isAuthPage = result.finalUrl.includes("auth") || result.finalUrl.includes("accounts.google");
      const isLoggedIn = !isLoginPage && !isAuthPage;

      console.log(`  Status: ${isLoggedIn ? "✅ Already logged in" : isLoginPage ? "🔒 Login page" : "🔐 Auth redirect"}`);

      // Print selector match summary
      const lMatch = Object.values(result.loginSelectors).filter(v => v === true).length;
      const lTotal = Object.keys(result.loginSelectors).length;
      const pMatch = Object.values(result.publishSelectors).reduce((acc, v) => {
        if (typeof v === "object") return acc + Object.values(v).filter(x => x === true).length;
        return acc;
      }, 0);
      const pTotal = Object.values(result.publishSelectors).reduce((acc, v) => {
        if (typeof v === "object") return acc + Object.keys(v).length;
        return acc;
      }, 0);
      console.log(`  Login selectors: ${lMatch}/${lTotal} | Publish selectors: ${pMatch}/${pTotal}`);

    } catch (e) {
      result.reachable = false;
      result.error = e.message.slice(0, 150);
      console.log(`  ❌ FAILED: ${result.error}`);
    }

    allResults[p] = result;
    await page.close();
  }

  // Summary table
  console.log("\n\n" + "=".repeat(80));
  console.log("VERIFICATION SUMMARY");
  console.log("=".repeat(80));
  console.log(`${"Platform".padEnd(16)} ${"Status".padEnd(12)} ${"Login".padEnd(8)} ${"Page Title"}`);
  console.log("-".repeat(80));
  for (const [p, r] of Object.entries(allResults)) {
    const status = !r.reachable ? "❌ BLOCKED" : r.error ? "⚠ ERROR" : "✅ OK";
    const lMatch = Object.values(r.loginSelectors).filter(v => v === true).length;
    const lTotal = Object.keys(r.loginSelectors).length;
    const line = `${(r.name || p).padEnd(16)} ${status.padEnd(12)} ${lMatch}/${lTotal}`.padEnd(38) + (r.pageTitle || r.error?.slice(0, 40) || "");
    console.log(line);
  }
  console.log("-".repeat(80));
  console.log(`\nNote: Login selectors only match on POST-login pages.`);
  console.log(`Publish selectors only match on the actual publish page.`);
  console.log(`For full verification, use the manual checklist: docs/platform-verification-checklist.md`);

  await browser.close();
}

main().catch((e) => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
