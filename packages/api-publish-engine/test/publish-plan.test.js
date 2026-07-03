const assert = require("assert");
const path = require("path");
const fs = require("fs");
const { PublishingPlan } = require("../src/publish-plan");

var p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log("  ✅ " + n); } catch (e) { f++; console.log("  ❌ " + n + ": " + e.message); } }
function eq(a, b) { assert.deepStrictEqual(a, b); }
function wait(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

console.log("--- Structure ---");
t("PublishingPlan is exported", function() { eq(typeof PublishingPlan, "function"); });

console.log("\n--- Create Plan ---");
t("create returns plan with required fields", async function() {
  var pp = new PublishingPlan({ dryRun: true });
  var plan = await pp.create({ name: "My Plan", items: [{ platform: "zhihu", title: "Post 1", content: "Hello" }] });
  eq(typeof plan.id, "string"); eq(plan.name, "My Plan"); eq(plan.items.length, 1); eq(plan.status, "draft");
  eq(typeof plan.createdAt, "string");
});

t("create rejects empty name", async function() {
  var pp = new PublishingPlan({ dryRun: true });
  var ok = false; try { await pp.create({ name: "", items: [{ platform: "zhihu", title: "T", content: "C" }] }); } catch(e) { ok = true; } eq(ok, true);
});

t("create rejects empty items", async function() {
  var pp = new PublishingPlan({ dryRun: true });
  var ok = false; try { await pp.create({ name: "Plan", items: [] }); } catch(e) { ok = true; } eq(ok, true);
});

console.log("\n--- List / Get / Delete ---");
t("list returns all plans", async function() {
  var pp = new PublishingPlan({ dryRun: true });
  await pp.create({ name: "Plan A", items: [{ platform: "zhihu", title: "P1", content: "C" }] });
  await pp.create({ name: "Plan B", items: [{ platform: "douyin", title: "P2", content: "C" }] });
  eq(pp.list().length, 2);
});

t("get returns plan by id", async function() {
  var pp = new PublishingPlan({ dryRun: true });
  var plan = await pp.create({ name: "My Plan", items: [{ platform: "zhihu", title: "T", content: "C" }] });
  eq(pp.get(plan.id).name, "My Plan");
});

t("get returns null for unknown id", function() {
  eq(new PublishingPlan().get("none"), null);
});

t("delete removes plan", async function() {
  var pp = new PublishingPlan({ dryRun: true });
  var plan = await pp.create({ name: "Delete Me", items: [{ platform: "zhihu", title: "T", content: "C" }] });
  eq(pp.delete(plan.id), true); eq(pp.list().length, 0);
});

t("delete returns false for unknown id", function() {
  eq(new PublishingPlan().delete("none"), false);
});

console.log("\n--- Execute Plan ---");
t("execute runs all items and updates status", async function() {
  var pp = new PublishingPlan({ dryRun: true });
  var plan = await pp.create({ name: "Xmas Plan", items: [
    { platform: "zhihu", title: "Post 1", content: "Content 1" },
    { platform: "douyin", title: "Post 2", content: "Content 2" }
  ]});
  eq(plan.status, "draft");
  var result = await pp.execute(plan.id);
  eq(result.success, true);
  var updated = pp.get(plan.id);
  eq(updated.status, "completed");
  eq(updated.items[0].status, "published");
  eq(updated.items[1].status, "published");
});

t("execute handles partial failure", async function() {
  var pp = new PublishingPlan({ dryRun: true });
  var plan = await pp.create({ name: "Mixed Plan", items: [
    { platform: "zhihu", title: "OK", content: "C" },
    { platform: "unknown_platform_xyz", title: "Fail", content: "C" }
  ]});
  var result = await pp.execute(plan.id);
  var updated = pp.get(plan.id);
  eq(updated.status, "completed");
  eq(updated.items[0].status, "published");
});

console.log("\n========== Result: " + p + "/" + (p + f) + " ==========");
if (f) process.exit(1);