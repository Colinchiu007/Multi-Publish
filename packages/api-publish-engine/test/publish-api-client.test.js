const assert = require("assert");
const http = require("http");

var mod;
try { mod = require("../src/publish-api-client"); } catch(e) { mod = null; }
var PublishApiClient = mod ? mod.PublishApiClient : null;

let p=0,f=0;
function t(n,fn){try{fn();p++;console.log("  OK "+n)}catch(e){f++;console.log("  FAIL "+n+": "+e.message)}}
function eq(a,b){assert.deepStrictEqual(a,b)}

console.log("--- Module exports ---");
t("PublishApiClient is exported", function() { eq(typeof PublishApiClient, "function"); });

console.log("\n--- Constructor ---");
t("creates client with baseUrl", function() {
  var c = new PublishApiClient({ baseUrl: "http://localhost:3000" });
  eq(c.baseUrl, "http://localhost:3000");
});

t("creates client with apiKey", function() {
  var c = new PublishApiClient({ baseUrl: "http://localhost:3000", apiKey: "test-key" });
  eq(c.apiKey, "test-key");
});

t("default timeout is 30000", function() {
  var c = new PublishApiClient({ baseUrl: "http://localhost:3000" });
  eq(c.timeout, 30000);
});

console.log("\n--- Method signatures ---");
t("health() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).health, "function"); });
t("platforms() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).platforms, "function"); });
t("publish() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).publish, "function"); });
t("batchPublish() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).batchPublish, "function"); });
t("schedule() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).schedule, "function"); });
t("listSchedules() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).listSchedules, "function"); });
t("cancelSchedule() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).cancelSchedule, "function"); });
t("registerWebhook() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).registerWebhook, "function"); });
t("listWebhooks() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).listWebhooks, "function"); });
t("removeWebhook() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).removeWebhook, "function"); });
t("getLogs() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).getLogs, "function"); });
t("clearLogs() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).clearLogs, "function"); });
t("createPlan() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).createPlan, "function"); });
t("listPlans() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).listPlans, "function"); });
t("executePlan() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).executePlan, "function"); });
t("deletePlan() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).deletePlan, "function"); });
t("metrics() is a function", function() { eq(typeof new PublishApiClient({baseUrl:"x"}).metrics, "function"); });

console.log("\n--- Integration test (with real server) ---");
// Start a real PublishApiServer for integration testing
var PublishApiServer = require("../src/publish-api-server").PublishApiServer;
var testServer = null;
var testPort = null;

t("starts test server", async function() {
  testServer = new PublishApiServer({ dryRun: true });
  testPort = await testServer.start(0);
  eq(typeof testPort, "number");
});

t("client health() returns ok", async function() {
  var client = new PublishApiClient({ baseUrl: "http://127.0.0.1:" + testPort });
  var result = await client.health();
  eq(result.status, "ok");
});

t("client platforms() returns list", async function() {
  var client = new PublishApiClient({ baseUrl: "http://127.0.0.1:" + testPort });
  var result = await client.platforms();
  eq(Array.isArray(result.platforms), true);
  eq(typeof result.count, "number");
});

t("client publish() works with dryRun", async function() {
  var client = new PublishApiClient({ baseUrl: "http://127.0.0.1:" + testPort });
  var result = await client.publish({ platform: "zhihu", title: "test", content: "hello", cookie: "c" });
  eq(result.success, true);
});

t("client batchPublish() works", async function() {
  var client = new PublishApiClient({ baseUrl: "http://127.0.0.1:" + testPort });
  var result = await client.batchPublish({ platforms: ["zhihu", "douyin"], title: "test", content: "hello", cookie: "c" });
  eq(Array.isArray(result), true);
  eq(result.length, 2);
});

t("client logs() returns log data", async function() {
  var client = new PublishApiClient({ baseUrl: "http://127.0.0.1:" + testPort });
  // Publish first to create a log entry
  await client.publish({ platform: "zhihu", title: "log-test", content: "test", cookie: "c" });
  var result = await client.getLogs();
  eq(typeof result.stats, "object");
  eq(result.stats.total >= 1, true);
});

t("client metrics() returns stats", async function() {
  var client = new PublishApiClient({ baseUrl: "http://127.0.0.1:" + testPort });
  var result = await client.metrics();
  eq(typeof result.uptime, "number");
  eq(typeof result.platforms, "number");
});

t("client throws on network error", async function() {
  var client = new PublishApiClient({ baseUrl: "http://127.0.0.1:1", timeout: 1000 });
  var threw = false;
  try { await client.health(); } catch(e) { threw = true; }
  eq(threw, true);
});

t("stops test server", async function() {
  await testServer.stop();
  eq(testServer._server, null);
});

console.log("\n--- Error handling ---");
t("client uses apiKey in Authorization header", function() {
  var client = new PublishApiClient({ baseUrl: "http://localhost:3000", apiKey: "secret-123" });
  eq(client._headers()["Authorization"], "Bearer secret-123");
});

t("client without apiKey has no Authorization header", function() {
  var client = new PublishApiClient({ baseUrl: "http://localhost:3000" });
  eq(client._headers()["Authorization"], undefined);
});

t("client sets Content-Type header", function() {
  var client = new PublishApiClient({ baseUrl: "http://localhost:3000" });
  eq(client._headers()["Content-Type"], "application/json");
});

console.log("\n========== Result: "+p+"/"+(p+f)+" ==========");
if(f)process.exit(1);