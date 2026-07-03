const assert = require("assert");
const { AccessLogger } = require("../src/access-log");

var p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log("  ✅ " + n); } catch (e) { f++; console.log("  ❌ " + n + ": " + e.message); } }
function eq(a, b) { assert.deepStrictEqual(a, b); }

console.log("--- Structure ---");
t("AccessLogger is exported", function() { eq(typeof AccessLogger, "function"); });

console.log("\n--- Log output ---");
t("log formats with method, path, status, duration", function() {
  var lines = [];
  var logger = new AccessLogger({ writeFn: function(l) { lines.push(l); } });
  var req = { method: "GET", url: "/api/v1/health" };
  var res = { statusCode: 200 };
  logger.log(req, res, Date.now() - 5);
  eq(lines.length, 1);
  eq(lines[0].indexOf("GET") >= 0, true);
  eq(lines[0].indexOf("/api/v1/health") >= 0, true);
  eq(lines[0].indexOf("200") >= 0, true);
  eq(lines[0].indexOf("ms") >= 0, true);
});

t("log handles long duration", function() {
  var lines = [];
  var logger = new AccessLogger({ writeFn: function(l) { lines.push(l); } });
  var req = { method: "POST", url: "/api/v1/publish" };
  var res = { statusCode: 200 };
  logger.log(req, res, Date.now() - 1234);
  eq(lines[0].indexOf("1234") >= 0 || lines[0].indexOf("1235") >= 0, true);
});

t("log handles error status", function() {
  var lines = [];
  var logger = new AccessLogger({ writeFn: function(l) { lines.push(l); } });
  var req = { method: "GET", url: "/api/v1/unknown" };
  var res = { statusCode: 404 };
  logger.log(req, res, Date.now() - 2);
  eq(lines[0].indexOf("404") >= 0, true);
});

t("disabled logger does nothing", function() {
  var logger = new AccessLogger({ enabled: false });
  // Should not crash
  logger.log({ method: "GET", url: "/test" }, { statusCode: 200 }, Date.now());
});

console.log("\n========== Result: " + p + "/" + (p + f) + " ==========");
if (f) process.exit(1);