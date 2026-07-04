const assert = require("assert");
const { videoPublishUrls, imagePublishUrls, getPublishUrl } = require("../src/platform-entries");
let passed = 0, failed = 0;
function test(n, fn) { try { fn(); passed++; } catch(e) { failed++; console.error(n + ': ' + e.message); } }
test("douyin video URL", () => { assert.ok(getPublishUrl("douyin", "video").includes("creator.douyin.com")); });
test("xhs image URL", () => { assert.ok(getPublishUrl("xiaohongshu", "image").includes("xiaohongshu.com")); });
test("unknown platform", () => { assert.strictEqual(getPublishUrl("unknown", "video"), null); });
test("videoPublishUrls has common platforms", () => {
  assert.ok(videoPublishUrls.douyin); assert.ok(videoPublishUrls.bilibili); assert.ok(videoPublishUrls.zhihu);
});
console.log("platform-entries: " + passed + "/" + (passed + failed) + " passed" + (failed ? " FAILED" : ""));
if (failed) process.exit(1);