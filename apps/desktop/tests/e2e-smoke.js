/**
 * E2E Smoke Test — 无头运行，无需 Electron
 * 测试 API 层基础功能是否正常
 * 
 * 运行: node tests/e2e-smoke.js
 */
const http = require("http");
const path = require("path");
const fs = require("fs");

const PORT = 5174;
const BASE = "http://127.0.0.1:" + PORT;
let pass = 0, fail = 0;

function assert(ok, msg) {
  if (ok) { pass++; console.log("  \u2713 " + msg); }
  else { fail++; console.log("  \u2717 " + msg); }
}

async function fetchUrl(pathname) {
  return new Promise((resolve, reject) => {
    http.get(BASE + pathname, { timeout: 5000 }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => resolve({ status: res.statusCode, data }));
    }).on("error", reject);
  });
}

async function run() {
  console.log("E2E Smoke Test\n");

  // 1. Vite dev server
  console.log("1. Vite 服务器");
  try {
    const res = await fetchUrl("/");
    assert(res.status === 200, "Vite 返回 200 (status=" + res.status + ")");
    assert(res.data.length > 100, "HTML 内容有效 (len=" + res.data.length + ")");
  } catch (e) {
    assert(false, "Vite 未运行: " + e.message);
  }

  // 2. Selectors config
  console.log("\n2. 配置验证");
  const selPath = path.join(__dirname, "selectors.json");
  try {
    const sel = JSON.parse(fs.readFileSync(selPath, "utf-8"));
    assert(!!sel, "selectors.json 可解析");
    assert(sel.selectors?.platformGroup, "selectors.platformGroup 存在");
    assert(sel.selectors?.accountRow, "selectors.accountRow 存在");
    assert(sel.routes?.accounts, "routes.accounts 存在");
  } catch (e) {
    assert(false, "selectors.json 读取失败: " + e.message);
  }

  // 3. Credentials template
  console.log("\n3. 凭据配置");
  const credPath = path.join(__dirname, "..", "..", "..", "config", "e2e-credentials.template.json");
  try {
    const cred = JSON.parse(fs.readFileSync(credPath, "utf-8"));
    assert(!!cred.accounts, "accounts 存在");
    const pc = Object.keys(cred.accounts).length;
    assert(pc >= 12, "至少 12 个平台 (" + pc + ")");
  } catch (e) {
    assert(false, "凭据模板读取失败: " + e.message);
  }

  // 4. Helpers module
  console.log("\n4. 测试辅助模块");
  try {
    const helpers = require("./test-helpers.js");
    assert(typeof helpers.assert === "function", "assert 函数");
    assert(typeof helpers.findMainWindow === "function", "findMainWindow");
    assert(typeof helpers.checkVite === "function", "checkVite");
    assert(typeof helpers.PROJECT_ROOT === "string", "PROJECT_ROOT 字符串");
  } catch (e) {
    assert(false, "test-helpers.js 加载失败: " + e.message);
  }

  // Results
  console.log("\n" + "=".repeat(40));
  console.log("结果: " + pass + "/" + (pass + fail) + " 通过");
  if (fail > 0) { process.exit(1); }
  else { console.log("\u2705 全部通过"); }
}

run();
