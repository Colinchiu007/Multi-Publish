const assert = require("assert");
const path = require("path");
const fs2 = require("fs");
var mod; try { mod = require("../src/scheduled-publish"); } catch(e) { mod = null; }
var ScheduledPublish = mod ? mod.ScheduledPublish : null;
var sf = path.join(__dirname, ".sched-" + Date.now() + ".json");
var p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log("  \u2705 " + n); } catch(e) { f++; console.log("  \u274C " + n + ": " + e.message); } }
function eq(a, b) { assert.deepStrictEqual(a, b); }
console.log("--- Structure ---");
t("ScheduledPublish is exported", function() { eq(typeof ScheduledPublish, "function"); });
if (!ScheduledPublish) { console.log("SKIP: module not loaded"); process.exit(1); }
console.log("\n--- Schedule operations ---");
t("schedule creates pending entry", async function() {
  var sp = new ScheduledPublish({ storageFile: sf, dryRun: true }); await sp.start();
  var e = await sp.schedule({ platforms: ["zhihu"], title: "T", content: "C", scheduledAt: new Date(Date.now() + 86400000).toISOString() });
  eq(e.status, "pending"); eq(e.platforms.length, 1); eq(typeof e.id, "string"); await sp.stop();
});
t("list returns all entries", async function() {
  var sp = new ScheduledPublish({ storageFile: sf, dryRun: true }); await sp.start();
  await sp.schedule({ platforms: ["zhihu"], title: "A", content: "a", scheduledAt: new Date(Date.now() + 86400000).toISOString() });
  await sp.schedule({ platforms: ["douyin"], title: "B", content: "b", scheduledAt: new Date(Date.now() + 86400000).toISOString() });
  eq(sp.list().length, 2); await sp.stop();
});
t("cancel pending entry", async function() {
  var sp = new ScheduledPublish({ storageFile: sf, dryRun: true }); await sp.start();
  var e = await sp.schedule({ platforms: ["zhihu"], title: "X", content: "x", scheduledAt: new Date(Date.now() + 86400000).toISOString() });
  eq(e.status, "pending"); eq(sp.cancel(e.id), true); eq(sp.get(e.id).status, "cancelled"); await sp.stop();
});
t("cancel unknown returns false", function() {
  eq(new ScheduledPublish({dryRun:true}).cancel("none"), false);
});
t("get unknown returns null", function() {
  eq(new ScheduledPublish({dryRun:true}).get("none"), null);
});
t("rejects empty platforms", async function() {
  var sp = new ScheduledPublish({ storageFile: sf, dryRun: true }); await sp.start();
  var ok = false; try { await sp.schedule({ platforms: [], title: "N" }); } catch(e) { ok = true; } eq(ok, true); await sp.stop();
});
t("rejects no scheduledAt", async function() {
  var sp = new ScheduledPublish({ storageFile: sf, dryRun: true }); await sp.start();
  var ok = false; try { await sp.schedule({ platforms: ["zhihu"], title: "T" }); } catch(e) { ok = true; } eq(ok, true); await sp.stop();
});
t("handles empty storage", async function() {
  fs2.writeFileSync(sf, "[]", "utf8");
  var sp = new ScheduledPublish({ storageFile: sf, dryRun: true }); await sp.start();
  eq(sp.list().length, 0); await sp.stop();
});
console.log("\n--- Auto-publish (sync check) ---");
t("_checkDue executes pending due tasks", async function() {
  var sp = new ScheduledPublish({ storageFile: sf, dryRun: true }); await sp.start();
  var e = await sp.schedule({ platforms: ["zhihu"], title: "Auto", content: "Test", scheduledAt: new Date(Date.now() - 5000).toISOString() });
  sp._checkDue();
  eq(sp.get(e.id).status !== "pending", true);
  await sp.stop();
});
t("ignores future entries", async function() {
  var sp = new ScheduledPublish({ storageFile: sf, dryRun: true }); await sp.start();
  await sp.schedule({ platforms: ["zhihu"], title: "F", content: "f", scheduledAt: new Date(Date.now() + 86400000).toISOString() });
  sp._checkDue();
  eq(sp.list().every(function(e) { return e.status === "pending"; }), true);
  await sp.stop();
});
t("all entry fields present", async function() {
  var sp = new ScheduledPublish({ storageFile: sf, dryRun: true }); await sp.start();
  var e = await sp.schedule({ platforms: ["bilibili"], title: "T", content: "C", tags: ["t1"], scheduledAt: new Date(Date.now() + 3600000).toISOString() });
  eq(typeof e.id, "string"); eq(e.platforms[0], "bilibili"); eq(e.taskData.title, "T"); eq(e.taskData.tags[0], "t1");
  eq(/^\d{4}-\d{2}-\d{2}T/.test(e.scheduledAt), true); eq(/^\d{4}-\d{2}-\d{2}T/.test(e.createdAt), true);
  await sp.stop();
});
console.log("\n========== Result: " + p + "/" + (p + f) + " ==========");
if(f)process.exit(1);
try { fs2.unlinkSync(sf); } catch(e) {}