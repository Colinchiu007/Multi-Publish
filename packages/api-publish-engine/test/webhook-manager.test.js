const assert = require("assert");
const http = require("http");
const { WebhookManager } = require("../src/webhook-manager");

let p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log("  ✅ " + n); } catch (e) { f++; console.log("  ❌ " + n + ": " + e.message); } }
function eq(a, b) { assert.deepStrictEqual(a, b); }

console.log("--- Structure ---");
t("WebhookManager is exported", function() { eq(typeof WebhookManager, "function"); });

console.log("\n--- Register ---");
t("register returns webhook entry", async function() {
  var wm = new WebhookManager();
  var wh = await wm.register({ url: "http://example.com/hook" });
  eq(typeof wh.id, "string"); eq(wh.url, "http://example.com/hook"); eq(wh.events.length, 0);
});

t("register with events filter", async function() {
  var wm = new WebhookManager();
  var wh = await wm.register({ url: "http://example.com/hook", events: ["schedule.completed"] });
  eq(wh.events.length, 1); eq(wh.events[0], "schedule.completed");
});

t("register rejects invalid URL", async function() {
  var wm = new WebhookManager();
  var ok = false; try { await wm.register({ url: "not-a-url" }); } catch(e) { ok = true; } eq(ok, true);
});

console.log("\n--- List / Remove ---");
t("list returns all registered webhooks", async function() {
  var wm = new WebhookManager();
  await wm.register({ url: "http://a.com/h1" });
  await wm.register({ url: "http://b.com/h2" });
  eq(wm.list().length, 2);
});

t("remove deletes webhook", async function() {
  var wm = new WebhookManager();
  var wh = await wm.register({ url: "http://example.com/hook" });
  eq(wm.remove(wh.id), true); eq(wm.list().length, 0);
});

t("remove returns false for unknown id", function() {
  eq(new WebhookManager().remove("none"), false);
});

console.log("\n--- Fire ---");
t("fire sends POST to registered URL", async function() {
  // Start a local server to receive the webhook
  var received = null;
  var server = http.createServer(function(req, res) {
    var chunks = [];
    req.on("data", function(c) { chunks.push(c); });
    req.on("end", function() {
      received = JSON.parse(Buffer.concat(chunks).toString());
      res.writeHead(200);
      res.end("ok");
    });
  });
  await new Promise(function(r) { server.listen(0, r); });
  var port = server.address().port;

  var wm = new WebhookManager();
  await wm.register({ url: "http://127.0.0.1:" + port + "/hook" });
  await wm.fire("schedule.completed", { id: "sched-1", status: "success" });

  await new Promise(function(r) { setTimeout(r, 200); });
  try {
    eq(received.event, "schedule.completed");
    eq(received.data.id, "sched-1");
    eq(received.data.status, "success");
    eq(typeof received.timestamp, "string");
    console.log("  ✅ fire sends correct payload");
    p++;
  } catch(e) { f++; console.log("  ❌ fire sends correct payload: " + e.message); }

  server.close();
});

t("fire only matches registered events", async function() {
  var received = false;
  var server = http.createServer(function(req, res) { received = true; res.writeHead(200); res.end("ok"); });
  await new Promise(function(r) { server.listen(0, r); });
  var port = server.address().port;

  var wm = new WebhookManager();
  await wm.register({ url: "http://127.0.0.1:" + port + "/h", events: ["publish.completed"] });
  await wm.fire("schedule.completed", { id: "sched-1" });

  await new Promise(function(r) { setTimeout(r, 200); });
  try { eq(received, false); console.log("  ✅ fire skips non-matching events"); p++; } catch(e) { f++; console.log("  ❌ fire skips non-matching events: " + e.message); }

  server.close();
});

t("fire empty events matches all", async function() {
  var received = false;
  var server = http.createServer(function(req, res) { received = true; res.writeHead(200); res.end("ok"); });
  await new Promise(function(r) { server.listen(0, r); });
  var port = server.address().port;

  var wm = new WebhookManager();
  await wm.register({ url: "http://127.0.0.1:" + port + "/h", events: [] });
  await wm.fire("schedule.completed", {});

  await new Promise(function(r) { setTimeout(r, 200); });
  try { eq(received, true); console.log("  ✅ fire empty events matches all"); p++; } catch(e) { f++; console.log("  ❌ fire empty events matches all: " + e.message); }

  server.close();
});

t("fire handles unreachable URL gracefully", async function() {
  var wm = new WebhookManager();
  await wm.register({ url: "http://127.0.0.1:19999/nonexistent" });
  // Should not throw
  await wm.fire("schedule.completed", {});
  console.log("  ✅ fire handles unreachable URL gracefully");
  p++;  // If we got here, no exception
});

console.log("\n========== Result: " + p + "/" + (p + f) + " ==========");
if (f) process.exit(1);