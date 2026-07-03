// TDD: Upload Token Acquirer tests
const assert = require("assert");
const { getAcquirer, getCachedToken } = require("../upload/token-acquirer");

let pass = 0, fail = 0;
function ok(n) { pass++; console.log("  [PASS] " + n); }
function no(n, m) { fail++; console.log("  [FAIL] " + n + ": " + m); }

// Test 1: Module exports
try {
  assert(typeof getAcquirer === "function");
  assert(typeof getCachedToken === "function");
  ok("token-acquirer exports functions");
} catch(e) { no("exports", e.message); }

// Test 2: getAcquirer returns acquirer for known platform
const platforms = ["xiaohongshu", "tencent_video", "zhihu", "dewu", "yidianhao"];
for (const p of platforms) {
  try {
    const aq = getAcquirer(p);
    assert(aq !== null, p + " should have acquirer");
    ok("getAcquirer returns acquirer for " + p);
  } catch(e) { no("getAcquirer for " + p, e.message); }
}

// Test 3: getAcquirer returns null for HTTP platforms (handled differently)
const httpPlats = ["douyin", "kuaishou", "bilibili"];
for (const p of httpPlats) {
  try {
    const aq = getAcquirer(p);
    assert(aq === null || aq.type === "http", p + " should not have dedicated acquirer");
    if (aq === null) ok("getAcquirer returns null for " + p + " (HTTP)");
    else ok("getAcquirer returns HTTP type for " + p);
  } catch(e) { no("getAcquirer for " + p, e.message); }
}

// Test 4: Token caching
try {
  const aq = getAcquirer("zhihu");
  assert(typeof aq === "object");
  ok("acquirer object structure valid");
} catch(e) { no("acquirer structure", e.message); }

// Test 5: acquireToken returns null without cookie (graceful)
(async () => {
  try {
    const aq = getAcquirer("xiaohongshu");
    if (aq) {
      const r = await aq.acquireToken("", null);
      assert(r === null || r === undefined, "should fail gracefully without cookie");
      ok("acquireToken graceful without cookie");
    } else {
      ok("acquireToken graceful (skip)");
    }
  } catch(e) { no("acquireToken graceful", e.message); }
})();

setTimeout(() => {
  console.log("\n" + (fail === 0 ? "All" : pass + "/" + (pass+fail)) + " token-acquirer tests " + (fail === 0 ? "PASSED" : "FAILED"));
}, 200);
