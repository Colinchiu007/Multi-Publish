/**
 * run-e2e-tests.js - Multi-Publish E2E Test Runner
 *
 * Usage:
 *   node scripts/run-e2e-tests.js                  # run all platforms
 *   node scripts/run-e2e-tests.js --interactive    # interactive login mode
 *   node scripts/run-e2e-tests.js --platform douyin # single platform
 *
 * Prerequisites:
 *   1. Copy config/e2e-credentials.template.json to config/e2e-credentials.json
 *   2. Fill in real cookies for each platform
 *   3. Ensure Playwright is installed (npm install playwright)
 *   4. Ensure dev server is running (npm run dev)
 */

// --- Dependency Check ----------------------------------------------------
let chromium;
try {
  chromium = require('playwright').chromium;
} catch (_) {
  console.error('❌ Playwright is not installed. Run: npm install playwright');
  console.error('   Then: npx playwright install chromium');
  process.exit(1);
}

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// --- Configuration -------------------------------------------------------
const PROJECT_ROOT = (function findRoot() {
  var dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir.replace(/\\\\/g, '/');
    dir = path.dirname(dir);
  }
  return path.resolve(__dirname, '..').replace(/\\\\/g, '/');
})();

const CREDENTIALS_PATH = path.join(PROJECT_ROOT, 'config', 'e2e-credentials.json');
const SCREENSHOT_DIR = path.join(PROJECT_ROOT, 'test-results', 'screenshots');
const DEV_SERVER_URL = 'http://127.0.0.1:5174/';

// All 15 platforms with metadata
const PLATFORMS = [
  { id: 'wechat_mp',      name: '\u5fae\u4fe1\u516c\u4f17\u53f7',     category: 'mixed',      loginUrl: 'https://mp.weixin.qq.com/',                 hasApi: false },
  { id: 'zhihu',          name: '\u77e5\u4e4e',           category: 'image_text', loginUrl: 'https://www.zhihu.com/signin',              hasApi: false },
  { id: 'weibo',          name: '\u5fae\u535a',           category: 'image_text', loginUrl: 'https://weibo.com/login',                  hasApi: true  },
  { id: 'douyin',         name: '\u6296\u97f3',           category: 'video',      loginUrl: 'https://creator.douyin.com/',              hasApi: true  },
  { id: 'xiaohongshu',    name: '\u5c0f\u7ea2\u4e66',          category: 'image_text', loginUrl: 'https://creator.xiaohongshu.com/',         hasApi: false },
  { id: 'tencent_video',  name: '\u89c6\u9891\u53f7',          category: 'video',      loginUrl: 'https://channels.weixin.qq.com/',           hasApi: false },
  { id: 'kuaishou',       name: '\u5feb\u624b',           category: 'video',      loginUrl: 'https://cp.kuaishou.com/',                 hasApi: false },
  { id: 'toutiao',        name: '\u4eca\u65e5\u5934\u6761',        category: 'mixed',      loginUrl: 'https://mp.toutiao.com/',                  hasApi: false },
  { id: 'youtube',        name: 'YouTube',        category: 'video',      loginUrl: 'https://studio.youtube.com/',              hasApi: true  },
  { id: 'tiktok',         name: 'TikTok',         category: 'video',      loginUrl: 'https://www.tiktok.com/upload/',           hasApi: true  },
  { id: 'bilibili',       name: 'B\u7ad9',            category: 'video',      loginUrl: 'https://passport.bilibili.com/login',      hasApi: true  },
  { id: 'baijiahao',      name: '\u767e\u5bb6\u53f7',          category: 'image_text', loginUrl: 'https://baijiahao.baidu.com/',             hasApi: false },
  { id: 'twitter',        name: 'Twitter/X',      category: 'image_text', loginUrl: 'https://x.com/i/flow/login',              hasApi: true  },
  { id: 'instagram',      name: 'Instagram',      category: 'image_text', loginUrl: 'https://www.instagram.com/accounts/login/', hasApi: false },
  { id: 'facebook',       name: 'Facebook',        category: 'mixed',     loginUrl: 'https://www.facebook.com/login/',          hasApi: false },
];

// Interactivity helpers
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(q) { return new Promise(function(r) { rl.question(q, r); }); }
function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// --- Test Results ------------------------------------------------------------
var results = { passed: [], failed: [], skipped: [], total: 0 };
function record(p, status, detail) {
  results.total++;
  results[status].push({ platform: p.id, name: p.name, detail: detail || '' });
  var icon = status === 'passed' ? '\u2705' : status === 'failed' ? '\u274c' : '\u23ed\ufe0f';
  console.log('  ' + icon + ' [' + status.toUpperCase() + '] ' + p.name + (detail ? ': ' + detail : ''));
}

// --- Credential Loading -------------------------------------------------------
function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.log('\u26a0\ufe0f  config/e2e-credentials.json not found.');
    console.log('   Copy config/e2e-credentials.template.json to config/e2e-credentials.json');
    console.log('   and fill in real cookies for each platform you want to test.\n');
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  } catch (e) {
    console.log('\u274c Failed to parse credentials: ' + e.message + '\n');
    return null;
  }
}

// --- Cookie Verification ------------------------------------------------------
async function verifyWithCookies(browser, platform, credentials) {
  var account = credentials.accounts[platform.id];
  if (!account || !account.cookie) {
    record(platform, 'skipped', 'No cookie configured');
    return;
  }

  var cookieData;
  try {
    cookieData = JSON.parse(account.cookie);
  } catch (_) {
    var cookiePath = path.resolve(PROJECT_ROOT, account.cookie);
    if (fs.existsSync(cookiePath)) {
      try {
        cookieData = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      } catch (e) {
        record(platform, 'failed', 'Invalid cookie file: ' + cookiePath);
        return;
      }
    } else {
      record(platform, 'failed', 'Cookie is not valid JSON nor a file path');
      return;
    }
  }

  var ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });

  try {
    await ctx.addCookies(cookieData);
    var page = await ctx.newPage();
    await page.goto(platform.loginUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);

    var url = page.url();
    var stillOnLogin = url.includes('login') || url.includes('signin') || url.includes('passport');

    if (stillOnLogin) {
      record(platform, 'failed', 'Cookie expired, redirected to login page');
      if (credentials.settings && credentials.settings.screenshot_on_failure) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, platform.id + '-cookie-fail.png') });
      }
    } else {
      record(platform, 'passed', 'Cookie valid, logged in successfully');
    }
    await page.close();
  } catch (e) {
    record(platform, 'failed', e.message);
  } finally {
    await ctx.close();
  }
}

// --- Interactive Login ---------------------------------------------------------
async function interactiveLogin(browser, platform) {
  console.log('\n--- Interactive Login: ' + platform.name + ' ---');
  var page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    await page.goto(platform.loginUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);
    var ssPath = path.join(SCREENSHOT_DIR, platform.id + '-login-page.png');
    await page.screenshot({ path: ssPath, fullPage: false });
    console.log('  \ud83d\udcf8 Login page screenshot: ' + ssPath);
    console.log('  \ud83c\udf10 URL: ' + page.url());
    console.log('  \ud83d\udc46 Please manually log in (scan QR code / enter credentials)...');
    await ask('  Press ENTER after logging in successfully...');

    var currentUrl = page.url();
    var stillOnLogin = currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl.includes('passport');

    if (!stillOnLogin) {
      var cookies = await page.context().cookies();
      var cookieFile = path.join(PROJECT_ROOT, 'config', platform.id + '-cookies.json');
      fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2));
      console.log('  \u2705 Login successful! Cookies saved to ' + cookieFile);
      record(platform, 'passed', 'Interactive login OK');
    } else {
      console.log('  \u274c Still on login page. Login may have failed.');
      record(platform, 'failed', 'Interactive login: still on login page');
    }
  } catch (e) {
    record(platform, 'failed', 'Interactive login error: ' + e.message);
  } finally {
    await page.close();
  }
}

// --- Manual Instructions -------------------------------------------------------
function printManualInstructions(platforms) {
  console.log('\n--- Manual Test Instructions (for platforms without credentials) ---\n');
  for (var i = 0; i < platforms.length; i++) {
    var p = platforms[i];
    console.log('  ' + p.name + ' (' + p.id + '):');
    console.log('    Login URL: ' + p.loginUrl);
    console.log('    Category:  ' + p.category);
    console.log('    API mode:  ' + (p.hasApi ? '\u2705 Available' : '\u274c RPA only'));
    console.log('');
  }
}

// --- Report -------------------------------------------------------------------
function printReport() {
  console.log('\n=== E2E Test Report ===\n');
  console.log('  Total:     ' + results.total);
  console.log('  \u2705 Passed:  ' + results.passed.length);
  console.log('  \u274c Failed:  ' + results.failed.length);
  console.log('  \u23ed\ufe0f  Skipped: ' + results.skipped.length);
  console.log('');

  if (results.passed.length > 0) {
    console.log('  \u2705 Passed Platforms:');
    for (var i = 0; i < results.passed.length; i++) {
      console.log('    - ' + results.passed[i].name + ' (' + results.passed[i].platform + ')');
    }
    console.log('');
  }
  if (results.failed.length > 0) {
    console.log('  \u274c Failed Platforms:');
    for (var i = 0; i < results.failed.length; i++) {
      console.log('    - ' + results.failed[i].name + ' (' + results.failed[i].platform + '): ' + results.failed[i].detail);
    }
    console.log('');
  }
  if (results.skipped.length > 0) {
    console.log('  \u23ed\ufe0f  Skipped Platforms:');
    for (var i = 0; i < results.skipped.length; i++) {
      console.log('    - ' + results.skipped[i].name + ' (' + results.skipped[i].platform + '): ' + results.skipped[i].detail);
    }
    console.log('');
  }
}

// --- Main ---------------------------------------------------------------------
async function main() {
  console.log('=== Multi-Publish E2E Test Runner ===\n');

  var args = process.argv.slice(2);
  var interactiveMode = args.indexOf('--interactive') !== -1;
  var platIdx = args.indexOf('--platform');
  var singlePlatform = platIdx !== -1 ? args[platIdx + 1] : null;

  var platforms = PLATFORMS;
  if (singlePlatform) {
    platforms = platforms.filter(function(p) { return p.id === singlePlatform; });
    if (platforms.length === 0) {
      console.log('\u274c Unknown platform: ' + singlePlatform);
      console.log('   Available: ' + PLATFORMS.map(function(p) { return p.id; }).join(', '));
      process.exit(1);
    }
  }

  var credentials = loadCredentials();
  if (!fs.existsSync(SCREENSHOT_DIR)) { fs.mkdirSync(SCREENSHOT_DIR, { recursive: true }); }

  if (interactiveMode || !credentials) {
    console.log('Interactive Login Mode\n');
    var browser = await chromium.launch({ headless: false, args: ['--no-sandbox', '--disable-gpu'] });
    try {
      for (var i = 0; i < platforms.length; i++) {
        await interactiveLogin(browser, platforms[i]);
      }
    } finally {
      await browser.close();
    }
    printManualInstructions(platforms);
  } else {
    console.log('Automated Cookie Verification Mode\n');
    var browser = await chromium.launch({
      headless: credentials.settings && credentials.settings.headless !== undefined ? credentials.settings.headless : false,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });
    try {
      for (var i = 0; i < platforms.length; i++) {
        await verifyWithCookies(browser, platforms[i], credentials);
      }
    } finally {
      await browser.close();
    }
    var skipped = [];
    for (var i = 0; i < results.skipped.length; i++) {
      var found = null;
      for (var j = 0; j < PLATFORMS.length; j++) {
        if (PLATFORMS[j].id === results.skipped[i].platform) { found = PLATFORMS[j]; break; }
      }
      if (found) skipped.push(found);
    }
    if (skipped.length > 0) printManualInstructions(skipped);
  }

  // Check dev server
  try {
    var http = require('http');
    await new Promise(function(resolve, reject) {
      http.get(DEV_SERVER_URL, { timeout: 3000 }, function(res) { res.resume(); resolve(); }).on('error', reject);
    });
    console.log('  \u2705 Dev server is running at ' + DEV_SERVER_URL);
  } catch (_) {
    console.log('  \u26a0\ufe0f Dev server not detected at ' + DEV_SERVER_URL);
    console.log('     Start it with: npm run dev\n');
  }

  printReport();
  rl.close();
  process.exit(results.failed.length > 0 ? 1 : 0);
}

main();
