const assert = require("assert");
const { cropCover, REQUIREMENTS } = require("../src/cover-cropper");
let passed = 0, failed = 0;
function test(n, fn) { try { fn(); passed++; } catch(e) { failed++; console.error(n + ': ' + e.message); } }
test("REQUIREMENTS has bilibili (1146x717)", () => {
  assert.strictEqual(REQUIREMENTS.bilibili.width, 1146);
  assert.strictEqual(REQUIREMENTS.bilibili.height, 717);
});
test("REQUIREMENTS has weibo (1080x1080)", () => {
  assert.strictEqual(REQUIREMENTS.weibo.width, 1080);
});
test("REQUIREMENTS has douyin", () => {
  assert.ok(REQUIREMENTS.douyin);
});
test("REQUIREMENTS has at least 8 platforms", () => {
  assert.ok(Object.keys(REQUIREMENTS).length >= 8);
});
test("cropCover returns original path for unsupported platform", async () => {
  const r = await cropCover("/path/img.jpg", "unknown");
  assert.strictEqual(r, "/path/img.jpg");
});
console.log("cover-cropper: " + passed + "/" + (passed + failed) + " passed" + (failed ? " FAILED" : ""));
if (failed) process.exit(1);