const assert = require("assert");
const { createProxyAgent } = require("../src/proxy-manager");
const { TaskPool } = require("../src/task-pool");
const { videoPublishUrls, imagePublishUrls, getPublishUrl } = require("../src/platform-entries");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  \u2705 " + name); }
  catch (e) { failed++; console.log("  \u274C " + name + ": " + e.message); }
}
function assertEqual(a, b) { assert.deepStrictEqual(a, b); }

console.log("--- proxy-manager ---");
test("creates proxy agent with valid config", () => {
  const r = createProxyAgent({ host: "127.0.0.1", port: 8080 });
  assertEqual(r !== null, true);
  assertEqual(r.httpAgent !== undefined, true);
  assertEqual(r.httpsAgent !== undefined, true);
});
test("returns null for null input", () => {
  assertEqual(createProxyAgent(null), null);
});
test("returns null for missing host", () => {
  assertEqual(createProxyAgent({ port: 8080 }), null);
});
test("supports auth", () => {
  const r = createProxyAgent({ host: "proxy.com", port: 3128, username: "u", password: "p" });
  assertEqual(r !== null, true);
});

console.log("\n--- task-pool ---");
test("creates with default concurrency", () => {
  const p = new TaskPool();
  assertEqual(p.concurrency, 3);
});
test("creates with custom concurrency", () => {
  const p = new TaskPool({ concurrency: 5 });
  assertEqual(p.concurrency, 5);
});
test("runs tasks and returns results", async () => {
  const p = new TaskPool({ concurrency: 2 });
  p.add(() => Promise.resolve(1));
  p.add(() => Promise.resolve(2));
  const r = await p.waitAll();
  assertEqual(r.length, 2);
  assertEqual(r.includes(1), true);
  assertEqual(r.includes(2), true);
});
test("handles task errors gracefully", async () => {
  const p = new TaskPool({ concurrency: 1 });
  p.add(() => Promise.reject(new Error("fail")));
  p.add(() => Promise.resolve("ok"));
  const r = await p.waitAll();
  assertEqual(r.length, 2);
  assertEqual(r[0].error, "fail");
  assertEqual(r[1], "ok");
});

console.log("\n--- platform-entries ---");
test("getPublishUrl returns video URL", () => {
  const r = getPublishUrl("douyin", "video");
  assertEqual(r.includes("creator.douyin.com"), true);
});
test("getPublishUrl returns image URL", () => {
  const r = getPublishUrl("xiaohongshu", "image");
  assertEqual(r.includes("xiaohongshu.com"), true);
});
test("getPublishUrl returns null for unknown platform", () => {
  assertEqual(getPublishUrl("unknown", "video"), null);
});
test("videoPublishUrls has common platforms", () => {
  assertEqual(videoPublishUrls.douyin !== undefined, true);
  assertEqual(videoPublishUrls.bilibili !== undefined, true);
  assertEqual(videoPublishUrls.zhihu !== undefined, true);
});

console.log("\n========== Result ==========");
console.log("  Passed: " + passed + " / " + (passed + failed));
console.log("  Failed: " + failed + " / " + (passed + failed));
if (failed > 0) process.exit(1);