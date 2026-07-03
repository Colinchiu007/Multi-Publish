const assert = require("assert");
const { getCsdnSign, getXiaohongshuSign, buildDouyinParams, getKuaishouSign } = require("../src/signer-local");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  \u2705 " + name); }
  catch (e) { failed++; console.log("  \u274C " + name + ": " + e.message); }
}
function assertEqual(a, b) { assert.deepStrictEqual(a, b); }

console.log("--- getCsdnSign ---");
test("returns base64 string", () => {
  const s = getCsdnSign("/api/post", { title: "test" });
  assertEqual(typeof s, "string"); assertEqual(s.length > 0, true);
});
test("deterministic for same inputs", () => {
  assertEqual(getCsdnSign("/api/post", { title: "test" }), getCsdnSign("/api/post", { title: "test" }));
});
test("different bodies differ", () => {
  assertEqual(getCsdnSign("/api/post", { title: "a" }) !== getCsdnSign("/api/post", { title: "b" }), true);
});
test("without body", () => {
  assertEqual(typeof getCsdnSign("/api/post", {}), "string");
});

console.log("\n--- getXiaohongshuSign ---");
test("returns X-s and X-t", () => {
  const s = getXiaohongshuSign("/api/path", { foo: "bar" });
  assertEqual(typeof s["X-s"], "string"); assertEqual(typeof s["X-t"], "number");
  assertEqual(s["X-s"].length > 0, true);
});
test("X-t is recent", () => {
  const s = getXiaohongshuSign("/api/path", {});
  const now = Date.now();
  assertEqual(s["X-t"] > now - 5000 && s["X-t"] <= now, true);
});
test("without body", () => {
  assertEqual(typeof getXiaohongshuSign("/path", null)["X-s"], "string");
});
test("complex body", () => {
  assertEqual(typeof getXiaohongshuSign("/path", { a: [1,2,3], b: { c: "d" } })["X-s"], "string");
});
test("empty body", () => {
  assertEqual(typeof getXiaohongshuSign("/path", {})["X-s"], "string");
});

console.log("\n--- buildDouyinParams ---");
test("required fields", () => {
  const p = buildDouyinParams("Mozilla/5.0 Chrome");
  assertEqual(typeof p._signature, "string"); assertEqual(p.aid, "1128");
  assertEqual(p.browser_language, "zh-CN"); assertEqual(p.timezone_name, "Asia/Shanghai");
});
test("includes UA as browser_version", () => {
  assertEqual(buildDouyinParams("Custom UA").browser_version, "Custom UA");
});
test("without UA", () => { assertEqual(buildDouyinParams().browser_version, ""); });
test("all expected keys present", () => {
  const p = buildDouyinParams("UA");
  const expected = ["cookie_enabled","screen_width","screen_height","browser_language","browser_platform","browser_name","browser_version","browser_online","timezone_name","aid","_signature"];
  expected.forEach(function(k){ assertEqual(k in p, true, "Missing key: " + k); });
});

console.log("\n--- getKuaishouSign ---");
test("md5 hex when apiPh provided", () => {
  assertEqual(getKuaishouSign({ title: "test" }, "ph").length, 32);
});
test("empty without apiPh", () => { assertEqual(getKuaishouSign({ title: "test" }, null), ""); });
test("deterministic", () => {
  assertEqual(getKuaishouSign({ title: "t" }, "ph"), getKuaishouSign({ title: "t" }, "ph"));
});

console.log("\n========== Result ==========");
console.log("  Passed: " + passed + " / " + (passed + failed));
console.log("  Failed: " + failed + " / " + (passed + failed));
if (failed > 0) process.exit(1);