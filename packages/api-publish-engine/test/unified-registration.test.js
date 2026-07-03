// ??????? + ?????? + ?? API ?? ? ????
const assert = require("assert");
const { errorCode, getMsg, isSuccess } = require("../src/error-codes");
let p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log("  \u2705 " + n); } catch(e) { f++; console.log("  \u274C " + n + ": " + e.message); } }
function eq(a, b) { assert.deepStrictEqual(a, b); }

console.log("=== ??????? + ?????? + ?? API ?? ===");

const index = require("../src/index");
t("REGISTRY has all 29+ adapters", function() {
  var count = Object.keys(index.REGISTRY).length;
  eq(count >= 29, true);
});

t("getAdapter returns instance for zhihu", function() {
  var a = index.getAdapter("zhihu");
  eq(a !== null, true);
  eq(typeof a.execute, "function");
});

t("supportsApi matches REGISTRY keys", function() {
  eq(index.supportsApi("zhihu"), true);
  eq(index.supportsApi("nonexistent"), false);
});

const router = require("../src/api-router");
t("api-router reads platforms.yaml has_api:true", function() {
  var platforms = router.listApiPlatforms();
  eq(Array.isArray(platforms), true);
  eq(platforms.indexOf("weibo") >= 0, true);
  eq(platforms.indexOf("douyin") >= 0, true);
});

t("api-router.supportsApi is dynamic", function() {
  eq(router.supportsApi("youtube"), true);
  eq(router.supportsApi("zhihu"), true);
});

const { BasePlatformAdapter } = require("../src/base-adapter");
t("base-adapter execute catches errors with standardized format", async function() {
  var TestAdapter = class extends BasePlatformAdapter {
    constructor() { super("test"); }
    getReferer() { return "https://test.com"; }
    async uploadVideo() { return null; }
    async uploadCover() { return null; }
    buildPostData(t) { return {}; }
    async publish() { throw new Error("Network error"); }
  };
  var a = new TestAdapter();
  var result = await a.execute({}, "cookie");
  eq(result.success, false);
  eq(typeof result.error, "string");
  eq(result.platform, "test");
});

t("error-codes.js exports all expected constants", function() {
  eq(errorCode.success, 0);
  eq(errorCode.request_error, -1);
  eq(errorCode.data_error, -2);
  eq(errorCode.unknown_error, -3);
});

t("getMsg covers all error codes", function() {
  Object.keys(errorCode).forEach(function(k) {
    eq(typeof getMsg(errorCode[k]), "string");
  });
});

t("isSuccess handles both code and success fields", function() {
  eq(isSuccess({ code: 0, success: true }), true);
  eq(isSuccess({ code: 0, success: false }), true);
  eq(isSuccess({}), false);
});

console.log("\n========== " + p + "/" + (p + f) + " ==========");
if (f) process.exit(1);
