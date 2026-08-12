const assert = require("assert");
const { AccessLogger } = require("../src/access-log");

var p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log("  \u2705 " + n); } catch (e) { f++; console.log("  \u274C " + n + ": " + e.message); } }
function eq(a, b) { assert.deepStrictEqual(a, b); }

console.log("--- Structure ---");
t("AccessLogger is exported", function() { eq(typeof AccessLogger, "function"); });

console.log("\n--- Structured output ---");
t("log outputs single-line JSON with required fields", function() {
  var lines = [];
  var logger = new AccessLogger({ writeFn: function(l) { lines.push(l); } });
  var req = { method: "GET", url: "/api/v1/health?x=1", socket: { remoteAddress: "127.0.0.1" }, headers: { "user-agent": "test-agent" } };
  var res = { statusCode: 200 };
  logger.log(req, res, Date.now() - 5, { requestId: "rid-1", path: "/api/v1/health" });
  eq(lines.length, 1);
  var entry = JSON.parse(lines[0]);
  eq(entry.method, "GET");
  eq(entry.path, "/api/v1/health");
  eq(entry.status, 200);
  eq(typeof entry.durationMs, "number");
  eq(entry.requestId, "rid-1");
  eq(entry.ip, "127.0.0.1");
  eq(entry.userAgent, "test-agent");
  eq(entry.errorCode, null);
  eq(typeof entry.ts, "string");
});

t("path falls back to url without query when info.path absent", function() {
  var lines = [];
  var logger = new AccessLogger({ writeFn: function(l) { lines.push(l); } });
  logger.log({ method: "GET", url: "/api/v1/publish?token=abc" }, { statusCode: 200 }, Date.now() - 1);
  var entry = JSON.parse(lines[0]);
  eq(entry.path, "/api/v1/publish");
});

t("errorCode captured when provided", function() {
  var lines = [];
  var logger = new AccessLogger({ writeFn: function(l) { lines.push(l); } });
  logger.log({ method: "GET", url: "/x" }, { statusCode: 404 }, Date.now() - 2, { errorCode: "Not found" });
  var entry = JSON.parse(lines[0]);
  eq(entry.errorCode, "Not found");
  eq(entry.status, 404);
});

t("log handles long duration", function() {
  var lines = [];
  var logger = new AccessLogger({ writeFn: function(l) { lines.push(l); } });
  logger.log({ method: "POST", url: "/api/v1/publish" }, { statusCode: 200 }, Date.now() - 1234);
  var entry = JSON.parse(lines[0]);
  eq(entry.durationMs >= 1234, true);
});

t("disabled logger does nothing", function() {
  var logger = new AccessLogger({ enabled: false });
  logger.log({ method: "GET", url: "/test" }, { statusCode: 200 }, Date.now());
});

console.log("\n========== Result: " + p + "/" + (p + f) + " ==========");
if (f) process.exit(1);
