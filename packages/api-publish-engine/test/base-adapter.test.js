const assert = require("assert");
const { BasePlatformAdapter, buildHeaders, HttpConfig } = require("../src/base-adapter");
const { formatContent } = require("../src/content-formatter");
// 上限真源：shared-utils 发布能力注册表（与 content-formatter-registry-sync.test.js 同一取数先例）。
// 超限测试数据从注册表同源派生，禁止改回硬编码长度——2026-10-01 事故：douyin contentMax
// 1000→5000 后，按旧上限硬编码的期望值（1000）全部失真（nx @multi-publish/api-publish-engine:test 红）。
const fs = require("fs");
const path = require("path");
function sharedUtilsFile (name) {
  let dir = __dirname;
  for (let hop = 0; hop < 10; hop += 1) {
    const candidate = path.join(dir, "packages", "shared-utils", "src", name);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("找不到注册表锚点 packages/shared-utils/src/" + name + "（从 " + __dirname + " 上溯 10 级）");
}
const registry = require(sharedUtilsFile("publish-capabilities.js"));
const DOUYIN_CONTENT_MAX = registry.getPlatformContentLimit("douyin").contentMax;


let passed = 0, failed = 0, pending = 0, finished = false;
function test(name, fn) {
  let r;
  try { r = fn(); }
  catch (e) { failed++; console.log("  ❌ " + name + ": " + e.message); return; }
  if (r && typeof r.then === "function") {
    // async 用例：settle 后再计数；失败计入 failed，而不是未捕获 Promise 异常炸掉进程
    pending++;
    r.then(
      function () { pending--; passed++; console.log("  ✅ " + name); finish(); },
      function (e) { pending--; failed++; console.log("  ❌ " + name + ": " + (e && e.message)); finish(); }
    );
  } else { passed++; console.log("  ✅ " + name); }
}
function finish() {
  if (pending > 0 || finished) return;
  finished = true;
  console.log("\n========== Result ==========");
  console.log("  Passed: " + passed + " / " + (passed + failed));
  console.log("  Failed: " + failed + " / " + (passed + failed));
  if (failed > 0) process.exit(1);
}
function assertEqual(a, b) { assert.deepStrictEqual(a, b); }

// ---- buildHeaders ----
console.log("--- buildHeaders ---");
test("basic headers with cookie", () => {
  const h = buildHeaders("mycookie", "https://example.com", "https://example.com");
  assertEqual(h.Cookie, "mycookie");
  assertEqual(h.Referer, "https://example.com");
  assertEqual(h["User-Agent"], HttpConfig.userAgent);
});
test("without cookie", () => {
  const h = buildHeaders(null, "https://test.com", null);
  assertEqual(h.Cookie, undefined);
  assertEqual(h.Referer, "https://test.com");
});
test("with extra headers", () => {
  const h = buildHeaders("c", "r", "o", { "X-Custom": "val" });
  assertEqual(h["X-Custom"], "val");
});

// ---- BasePlatformAdapter abstract methods ----
console.log("\n--- BasePlatformAdapter ---");
test("getReferer throws", () => {
  const a = new BasePlatformAdapter("test");
  let err;
  try { a.getReferer(); } catch (e) { err = e; }
  assertEqual(!!err, true);
});
test("uploadVideo throws", async () => {
  const a = new BasePlatformAdapter("test");
  let err;
  try { await a.uploadVideo({}, ""); } catch (e) { err = e; }
  assertEqual(!!err, true);
});
test("buildPostData throws", () => {
  const a = new BasePlatformAdapter("test");
  let err;
  try { a.buildPostData({}); } catch (e) { err = e; }
  assertEqual(!!err, true);
});
test("publish throws", async () => {
  const a = new BasePlatformAdapter("test");
  let err;
  try { await a("", {}); } catch (e) { err = e; }
  assertEqual(!!err, true);
});
test("getOrigin from getReferer", () => {
  const a = new BasePlatformAdapter("test");
  // 覆写 getReferer 测试
  a.getReferer = () => "https://example.com/page";
  assertEqual(a.getOrigin(), "https://example.com");
});

// ---- execute with formatContent integration ----
console.log("\n--- execute formatContent integration ---");
test("execute calls formatContent for douyin platform", async () => {
  let capturedTaskData = null;
  class TestAdapter extends BasePlatformAdapter {
    constructor() { super("douyin"); }
    getReferer() { return "https://creator.douyin.com"; }
    async uploadVideo(td, cookie) { capturedTaskData = td; return { id: "v1" }; }
    async uploadCover(td, cookie) { return null; }
    buildPostData(td, ur) { return td; }
    async publish(cookie, pd) { return { success: true }; }
  }
  const a = new TestAdapter();
  const r = await a.execute(
    { title: "a".repeat(40), content: "b".repeat(DOUYIN_CONTENT_MAX + 100), tags: ["科技"] },
    "cookie"
  );
  assertEqual(r.success, true);
  // 验证 formatContent 被调用：title 40 字 ≤ 注册表 55 不截断（CCG W4：旧值 30 已同步注册表 55）
  assertEqual(capturedTaskData.title.length, 40);
  // 正文超限输入被 formatContent 截断到注册表 contentMax（同源派生，勿改回硬编码 1000）
  assertEqual(capturedTaskData.content.length, DOUYIN_CONTENT_MAX);
  assertEqual(capturedTaskData.tags[0], "#科技");
});

test("execute preserves non-content fields", async () => {
  let captured = null;
  class TestAdapter2 extends BasePlatformAdapter {
    constructor() { super("weibo"); }
    getReferer() { return "https://weibo.com"; }
    async uploadVideo(td, cookie) { captured = td; return { id: "v1" }; }
    async uploadCover(td, cookie) { return null; }
    buildPostData(td, ur) { return td; }
    async publish(cookie, pd) { return { success: true }; }
  }
  const a = new TestAdapter2();
  await a.execute({ title: "t", content: "c", tags: ["热点"], custom: "keep" }, "cookie");
  assertEqual(captured.custom, "keep");
  assertEqual(captured.tags[0], "#热点#");
});

// 同步用例已全部调度；若 async 用例未 settle，finish() 会延迟到全部结束后统一打印并判定
finish();