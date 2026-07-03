const assert = require("assert");
const path = require("path");
const fs = require("fs");
const { AuditLog } = require("../src/audit-log");

var globalSf = path.join(__dirname, ".audit-" + Date.now() + ".json");
var p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log("  ✅ " + n); } catch (e) { f++; console.log("  ❌ " + n + ": " + e.message); } }
function eq(a, b) { assert.deepStrictEqual(a, b); }

console.log("--- Structure ---");
t("AuditLog is exported", function() { eq(typeof AuditLog, "function"); });

console.log("\n--- Log operations ---");
t("log creates entry with required fields", async function() {
  var al = new AuditLog(); // no file = in-memory only
  var entry = await al.log({ type: "publish", platform: "zhihu", title: "Test", status: "success" });
  eq(typeof entry.id, "string"); eq(entry.type, "publish"); eq(entry.platform, "zhihu"); eq(entry.status, "success");
});

t("log accepts all optional fields", async function() {
  var al = new AuditLog();
  var entry = await al.log({ type: "batch", platform: ["zhihu","douyin"], title: "Batch", status: "failed", error: "timeout" });
  eq(Array.isArray(entry.platform), true); eq(entry.error, "timeout");
});

t("list returns newest first", async function() {
  var al = new AuditLog();
  await al.log({ type: "publish", platform: "a", title: "1st", status: "success" });
  await new Promise(function(r) { setTimeout(r, 10); });
  await al.log({ type: "publish", platform: "b", title: "2nd", status: "success" });
  var list = al.list();
  eq(list.length, 2);
  eq(list[0].title, "2nd"); eq(list[1].title, "1st");
});

t("list supports pagination", async function() {
  var al = new AuditLog();
  for (var i = 0; i < 5; i++) { await al.log({ type: "publish", platform: "x", title: "E" + i, status: "success" }); }
  eq(al.list(2).length, 2);
  eq(al.list(10, 2).length, 3);
});

t("get returns entry by id", async function() {
  var al = new AuditLog();
  var e = await al.log({ type: "publish", platform: "zhihu", title: "Find me", status: "success" });
  eq(al.get(e.id).title, "Find me");
});

t("get returns null for unknown id", function() {
  eq(new AuditLog().get("none"), null);
});

console.log("\n--- Stats ---");
t("stats returns correct counts", async function() {
  var al = new AuditLog();
  await al.log({ type: "publish", platform: "zhihu", title: "S1", status: "success" });
  await al.log({ type: "publish", platform: "douyin", title: "S2", status: "success" });
  await al.log({ type: "publish", platform: "zhihu", title: "F1", status: "failed", error: "err" });
  await al.log({ type: "schedule", platform: ["zhihu"], title: "Sc", status: "success" });
  var s = al.stats();
  eq(s.total, 4); eq(s.success, 3); eq(s.failed, 1);
  eq(s.byType.publish, 3); eq(s.byType.schedule, 1);
});

console.log("\n--- Clear & Persist ---");
t("clear removes all entries", async function() {
  var al = new AuditLog();
  await al.log({ type: "publish", platform: "zhihu", title: "T", status: "success" });
  eq(al.list().length, 1);
  al.clear();
  eq(al.list().length, 0);
});

t("persists entries across instances", async function() {
  var sf = path.join(__dirname, ".audit-persist-" + Date.now() + ".json");
  var al1 = new AuditLog({ storageFile: sf });
  await al1.log({ type: "publish", platform: "zhihu", title: "Persist", status: "success" });
  var al2 = new AuditLog({ storageFile: sf });
  eq(al2.list().length, 1);
  eq(al2.list()[0].title, "Persist");
  try { fs.unlinkSync(sf); } catch(e) {}
});

console.log("\n========== Result: " + p + "/" + (p + f) + " ==========");
if (f) process.exit(1);
try { fs.unlinkSync(globalSf); } catch(e) {}