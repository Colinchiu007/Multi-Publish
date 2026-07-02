/**
 * 通用 GUI 测试辅助模块
 * 从 selectors.json 加载配置，避免硬编码选择器
 */
const path = require("path");
const fs = require("fs");
const http = require("http");

// Auto-detect project root: walk up from this file until package.json is found
const PROJECT_ROOT = (function findRoot() {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'apps', 'desktop'))) return dir.replace(/\\/g, '/');
    dir = path.dirname(dir);
  }
  return path.resolve(__dirname, '..', '..').replace(/\\/g, '/');
})();
const config = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "apps/desktop/tests/selectors.json"), "utf8"));

// 配置常量
// electron package exports platform-appropriate binary path
const EL = require('electron');
const MAIN = path.join(PROJECT_ROOT, config.urls.electronMain);
const SS = path.join(PROJECT_ROOT, config.urls.screenshotDir);
const ROUTES = config.routes;
const SEL = config.selectors;
const MOCK = config.mockAccounts;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 测试结果计数器
let pass = 0, fail = 0;
function assert(name, ok, detail = "") {
  if (ok) { pass++; console.log(`   ✅ ${name}`); }
  else { fail++; console.log(`   ❌ ${name}${detail ? ": " + detail : ""}`); }
}
function getResults() { return { pass, fail, total: pass + fail }; }
function resetResults() { pass = 0; fail = 0; }

// Vite 健康检查
async function checkVite() {
  return new Promise((resolve) => {
    http.get(config.urls.viteDevServer, { timeout: 3000 }, (res) => { res.resume(); resolve(true); })
      .on("error", () => resolve(false));
  });
}

// 查找主窗口
async function findMainWindow(app) {
  for (let i = 0; i < 15; i++) {
    const wins = app.windows();
    for (const w of wins) {
      try { if ((await w.url()).includes("5174")) return w; } catch (_) {}
    }
    await wait(1000);
  }
  return app.windows().pop();
}

// 注入 accounts store
async function injectAccounts(win, data) {
  data = data || MOCK;
  return await win.evaluate((mockData) => {
    try {
      const pinia = document.querySelector("#app").__vue_app__.config.globalProperties.$pinia;
      const store = pinia._s.get("accounts");
      if (!store) return false;
      store.$patch({ accounts: mockData });
      store.load = async function () { store.$patch({ accounts: mockData, loading: false, error: null }); };
      return true;
    } catch (e) { return false; }
  }, data);
}

// 确保 platform store 加载
async function ensurePlatformStore(win) {
  return await win.evaluate(() => {
    try {
      const pinia = document.querySelector("#app").__vue_app__.config.globalProperties.$pinia;
      const store = pinia._s.get("platforms");
      if (!store || store.loaded) return false;
      store.platforms = [
        { id: "wechat_mp", label: "微信公众号" }, { id: "zhihu", label: "知乎" },
        { id: "weibo", label: "微博" }, { id: "douyin", label: "抖音" },
        { id: "xiaohongshu", label: "小红书" }, { id: "bilibili", label: "B站" },
      ];
      store.loaded = true;
      return true;
    } catch (e) { return false; }
  });
}

// 通过 Vue proxy 激活/关闭批量模式
async function setBatchMode(win, on) {
  return await win.evaluate((enabled) => {
    const cb = document.querySelector('input[type="checkbox"]');
    if (!cb) return false;
    const comp = cb.__vueParentComponent;
    if (!comp || !comp.proxy) return false;
    comp.proxy.batchMode = enabled;
    return true;
  }, on);
}

// 页面标题断言
async function assertTitle(win, keyword) {
  const title = await win.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() || "", SEL.pageTitle);
  assert(`页面标题包含「${keyword}」`, title.includes(keyword), `got "${title}"`);
}

module.exports = {
  PROJECT_ROOT, EL, MAIN, SS, ROUTES, SEL, MOCK,
  config, wait, assert, getResults, resetResults,
  checkVite, findMainWindow, injectAccounts, ensurePlatformStore,
  setBatchMode, assertTitle,
};

