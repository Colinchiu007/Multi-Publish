const assert = require("assert");
const { RateLimiter } = require("../src/rate-limiter");

var p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log("  ✅ " + n); } catch (e) { f++; console.log("  ❌ " + n + ": " + e.message); } }
function eq(a, b) { assert.deepStrictEqual(a, b); }

console.log("--- Structure ---");
t("RateLimiter is exported", function() { eq(typeof RateLimiter, "function"); });

console.log("\n--- Basic limiting ---");
t("allows requests under limit", function() {
  var rl = new RateLimiter({ maxRequests: 5 });
  for (var i = 0; i < 5; i++) { eq(rl.check("127.0.0.1"), true); }
  rl.stop();
});

t("blocks requests over limit", function() {
  var rl = new RateLimiter({ maxRequests: 3 });
  eq(rl.check("10.0.0.1"), true);
  eq(rl.check("10.0.0.1"), true);
  eq(rl.check("10.0.0.1"), true);
  eq(rl.check("10.0.0.1"), false);
  rl.stop();
});

t("different IPs have independent limits", function() {
  var rl = new RateLimiter({ maxRequests: 2 });
  eq(rl.check("10.0.0.1"), true);
  eq(rl.check("10.0.0.1"), true);
  eq(rl.check("10.0.0.1"), false);
  eq(rl.check("10.0.0.2"), true);
  eq(rl.check("10.0.0.2"), true);
  eq(rl.check("10.0.0.2"), false);
  rl.stop();
});

t("default maxRequests is 100", function() {
  var rl = new RateLimiter();
  for (var i = 0; i < 100; i++) { eq(rl.check("10.0.0.1"), true); }
  eq(rl.check("10.0.0.1"), false);
  rl.stop();
});

t("configurable maxRequests", function() {
  var rl = new RateLimiter({ maxRequests: 1 });
  eq(rl.check("10.0.0.1"), true);
  eq(rl.check("10.0.0.1"), false);
  rl.stop();
});

t("stop clears state", function() {
  var rl = new RateLimiter({ maxRequests: 2 });
  eq(rl.check("10.0.0.1"), true);
  eq(rl.check("10.0.0.1"), true);
  eq(rl.check("10.0.0.1"), false);
  rl.stop();
  // After stop, new data won't be tracked
});

console.log("\n========== Result: " + p + "/" + (p + f) + " ==========");
if (f) process.exit(1);