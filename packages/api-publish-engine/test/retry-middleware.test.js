// retry-middleware unit tests
const assert = require("assert");
const { withRetry, withCache, clearCache, getCacheStats, isCircuitOpen, getCircuitState, CIRCUIT_THRESHOLD } = require("../src/retry-middleware");
let p = 0, f = 0;
function t(n, fn) { try { var r = fn(); if (r && typeof r.then === "function") { r.then(function() { p++; console.log("  \\u2705 " + n); }).catch(function(e) { f++; console.log("  \\u274C " + n + ": " + e.message); }); } else { p++; console.log("  \\u2705 " + n); } } catch(e) { f++; console.log("  \\u274C " + n + ": " + e.message); } }
function eq(a, b) { assert.deepStrictEqual(a, b); }

console.log("=== retry-middleware ===");

t("withRetry succeeds on first try", async function() {
  var callCount = 0;
  var result = await withRetry(function() { callCount++; return "ok"; });
  eq(result, "ok");
  eq(callCount, 1);
});

t("withRetry retries on failure", async function() {
  var callCount = 0;
  try {
    await withRetry(function() { callCount++; throw new Error("fail"); }, { maxRetries: 2, baseDelay: 10 });
  } catch(e) {}
  eq(callCount, 3);
});

t("withRetry succeeds after retry", async function() {
  var callCount = 0;
  var result = await withRetry(function() {
    callCount++;
    if (callCount < 3) throw new Error("transient");
    return "recovered";
  }, { maxRetries: 3, baseDelay: 10 });
  eq(result, "recovered");
  eq(callCount, 3);
});

t("withCache caches results", async function() {
  var callCount = 0;
  var r1 = await withCache(function() { callCount++; return "cached"; }, { cacheKey: "t1", ttl: 60000 });
  var r2 = await withCache(function() { callCount++; return "cached"; }, { cacheKey: "t1", ttl: 60000 });
  eq(r1, "cached");
  eq(r2, "cached");
  eq(callCount, 1);
});

t("clearCache removes entries", async function() {
  var callCount = 0;
  await withCache(function() { callCount++; return "data"; }, { cacheKey: "test_cache_2", ttl: 60000 });
  await withCache(function() { callCount++; return "data"; }, { cacheKey: "test_cache_2", ttl: 60000 });
  eq(callCount, 1);
  clearCache("test_cache_2");
  await withCache(function() { callCount++; return "data"; }, { cacheKey: "test_cache_2", ttl: 60000 });
  eq(callCount, 2);
});

t("getCacheStats returns current size", async function() {
  await withCache(function() { return "stats"; }, { cacheKey: "test_stats_1", ttl: 60000 });
  await withCache(function() { return "stats"; }, { cacheKey: "test_stats_2", ttl: 60000 });
  eq(getCacheStats().size, 4);
});

t("auth failure (401) not retried", async function() {
  var callCount = 0;
  try {
    await withRetry(function() {
      callCount++;
      var err = new Error("Unauthorized");
      err.status = 401;
      throw err;
    }, { maxRetries: 3, baseDelay: 10 });
  } catch(e) {}
  eq(callCount, 1);
});

setTimeout(function() { console.log("\\n========== " + p + "/" + (p + f) + " =========="); if (f) process.exit(1); }, 200);
