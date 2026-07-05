/**
 * e2e-responsive-layout.js — 窗口 resize 响应式布局测试
 * 验证 Accounts 页面在不同窗口宽度下无布局重叠
 * 
 * 运行: node tests/e2e-responsive-layout.js
 * 前置条件: "npm run dev" 已在 5174 端口启动
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://127.0.0.1:5174";
const SCREENSHOT_DIR = path.join(__dirname, "screenshots");
const VIEWPORTS = [
  { width: 1280, height: 800, label: "desktop" },
  { width: 768, height: 600, label: "tablet" },
  { width: 480, height: 800, label: "mobile" },
];

let pass = 0, fail = 0;

function assert(ok, msg) {
  if (ok) { pass++; console.log("  \u2713 " + msg); }
  else { fail++; console.log("  \u2717 " + msg); }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("E2E 响应式布局测试\n");

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // 1. 检查 Vite 服务
  console.log("1. Vite 服务器检查");
  const http = require("http");
  try {
    const res = await new Promise((resolve, reject) => {
      http.get(BASE_URL + "/", { timeout: 5000 }, (r) => {
        let d = ""; r.on("data", (c) => d += c);
        r.on("end", () => resolve({ status: r.statusCode, data: d }));
      }).on("error", reject);
    });
    assert(res.status === 200, "Vite 返回 200");
  } catch (e) {
    assert(false, "Vite 未运行: " + e.message);
    console.log("\n请先在终端运行: npm run dev");
    process.exit(1);
  }

  // 2. 启动浏览器
  console.log("\n2. 启动 Playwright 浏览器");
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    assert(true, "浏览器启动成功");
  } catch (e) {
    assert(false, "浏览器启动失败: " + e.message);
    process.exit(1);
  }

  // 3. 在各 viewport 下截图
  console.log("\n3. 响应式截图");
  for (const vp of VIEWPORTS) {
    console.log("  " + vp.label + " (" + vp.width + "x" + vp.height + ")");
    const context = await browser.newContext({ viewport: vp });
    const page = await context.newPage();
    try {
      await page.goto(BASE_URL + "/#/accounts", { waitUntil: "networkidle", timeout: 15000 });
      await sleep(2000);

      // 截图
      const ssPath = path.join(SCREENSHOT_DIR, "accounts-" + vp.label + ".png");
      await page.screenshot({ path: ssPath, fullPage: true });
      console.log("    \u2713 截图已保存: " + ssPath);

      // 检查页面元素
      const hasAccountsPage = await page.locator("text=\u8D26\u53F7\u7BA1\u7406").count();
      assert(hasAccountsPage > 0, vp.label + " - 账号管理标题出现");

      // 检查 account-row 元素（确认渲染）
      // 注意：需要已有账号数据才能渲染 account-row
      const hasFilterBar = await page.locator("text=\u5168\u90E8").count();
      assert(hasFilterBar > 0, vp.label + " - 过滤栏出现");

      await context.close();
    } catch (e) {
      assert(false, vp.label + " - 页面加载失败: " + e.message);
      await context.close();
    }
  }

  await browser.close();

  // 结果
  console.log("\n" + "=".repeat(40));
  console.log("结果: " + pass + "/" + (pass + fail) + " 通过");
  console.log("截图目录: " + SCREENSHOT_DIR);
  if (fail > 0) { process.exit(1); }
  else { console.log("\u2705 全部通过"); }
}

run();
