const assert = require("assert");
const { BasePlatformAdapter, buildHeaders, HttpConfig } = require("../src/base-adapter");
const { formatContent } = require("../src/content-formatter");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✅ " + name); }
  catch (e) { failed++; console.log("  ❌ " + name + ": " + e.message); }
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
    { title: "a".repeat(40), content: "b".repeat(1500), tags: ["科技"] },
    "cookie"
  );
  assertEqual(r.success, true);
  // 验证 formatContent 被调用：title 应截断到 30
  assertEqual(capturedTaskData.title.length, 30);
  assertEqual(capturedTaskData.content.length, 1000);
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

console.log("\n========== Result ==========");
console.log("  Passed: " + passed + " / " + (passed + failed));
console.log("  Failed: " + failed + " / " + (passed + failed));
if (failed > 0) process.exit(1);