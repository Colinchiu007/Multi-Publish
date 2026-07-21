const http = require("http");
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const { createHarness } = require('./harness');
const TEST_KEYS = __dirname + "/.test-open-api-keys.json";
try { fs.unlinkSync(TEST_KEYS); } catch(e) {}

var mod;
try { mod = require("../src/publish-api-server"); } catch(e) { mod = null; }
var PublishApiServer = mod ? mod.PublishApiServer : null;

const harness = createHarness({ successMark: '\u2705', failureMark: '\u274C' });
const t = harness.test;
function eq(a,b){ assert.deepStrictEqual(a,b) }
function ok(v,msg){ assert.ok(v, msg) }

function request(port, method, path, body, headers) {
  return new Promise(function(resolve, reject) {
    var opts = {
      hostname: "127.0.0.1", port: port, path: path, method: method,
      headers: Object.assign({ "Content-Type": "application/json" }, headers || {})
    };
    var req = http.request(opts, function(res) {
      var data = "";
      res.on("data", function(chunk) { data += chunk; });
      res.on("end", function() {
        try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); }
        catch(e) { resolve({ status: res.statusCode, body: data, headers: res.headers }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

console.log("--- API Open Platform - Key Management Endpoints ---");

t("GET /api/v1/keys returns empty list initially", async function() {
  var server = new PublishApiServer({ dryRun: true, keysPath: TEST_KEYS });
  await server.start(0); var port = server._server.address().port;
  var r = await request(port, "GET", "/api/v1/keys");
  eq(r.status, 200);
  eq(Array.isArray(r.body.keys), true);
  eq(r.body.keys.length, 0);
  await server.stop();
});

t("POST /api/v1/keys creates a new API key", async function() {
  var server = new PublishApiServer({ dryRun: true, keysPath: TEST_KEYS });
  await server.start(0); var port = server._server.address().port;
  var r = await request(port, "POST", "/api/v1/keys", { name: "test-key", scopes: ["publish"] });
  eq(r.status, 200);
  eq(r.body.success, true);
  ok(r.body.key && r.body.key.startsWith("mp_"), "key starts with mp_");
  eq(r.body.name, "test-key");
  eq(r.body.scopes[0], "publish");
  await server.stop();
});

t("POST /api/v1/keys requires name", async function() {
  var server = new PublishApiServer({ dryRun: true, keysPath: TEST_KEYS });
  await server.start(0); var port = server._server.address().port;
  var r = await request(port, "POST", "/api/v1/keys", { scopes: ["publish"] });
  eq(r.status, 400);
  eq(r.body.error, "name is required");
  await server.stop();
});

t("POST /api/v1/keys/revoke revokes a key", async function() {
  var server = new PublishApiServer({ dryRun: true, keysPath: TEST_KEYS });
  await server.start(0); var port = server._server.address().port;
  var c = await request(port, "POST", "/api/v1/keys", { name: "revoke-me", scopes: ["publish"] });
  var r = await request(port, "POST", "/api/v1/keys/revoke", { key: c.body.key });
  eq(r.status, 200);
  eq(r.body.success, true);
  // Verify revoked key not in active list: list only has keys from other tests
  var list = await request(port, "GET", "/api/v1/keys");
  var revokedInList = list.body.keys.find(function(k) { return k.name === "revoke-me"; });
  eq(revokedInList, undefined);
  await server.stop();
});

t("POST /api/v1/keys/revoke fails for nonexistent key", async function() {
  var server = new PublishApiServer({ dryRun: true, keysPath: TEST_KEYS });
  await server.start(0); var port = server._server.address().port;
  var r = await request(port, "POST", "/api/v1/keys/revoke", { key: "nonexistent" });
  eq(r.status, 404);
  eq(r.body.error, "Key not found");
  await server.stop();
});

console.log("\n--- API Open Platform - Plugin Management Endpoints ---");

t("GET /api/v1/plugins returns plugin list", async function() {
  var server = new PublishApiServer({ dryRun: true, keysPath: TEST_KEYS });
  await server.start(0); var port = server._server.address().port;
  var r = await request(port, "GET", "/api/v1/plugins");
  eq(r.status, 200);
  eq(Array.isArray(r.body.plugins), true);
  ok(typeof r.body.count === "number");
  await server.stop();
});

t("POST /api/v1/plugins/reload triggers reload", async function() {
  var server = new PublishApiServer({ dryRun: true, keysPath: TEST_KEYS });
  await server.start(0); var port = server._server.address().port;
  var r = await request(port, "POST", "/api/v1/plugins/reload");
  eq(r.status, 200);
  eq(r.body.success, true);
  eq(r.body.reloaded, true);
  await server.stop();
});

t("GET /api/v1/openapi.json returns valid spec", async function() {
  var server = new PublishApiServer({ dryRun: true, keysPath: TEST_KEYS });
  await server.start(0); var port = server._server.address().port;
  var r = await request(port, "GET", "/api/v1/openapi.json");
  eq(r.status, 200);
  eq(r.body.openapi, "3.0.3");
  ok(r.body.paths["/api/v1/keys"], "openapi includes /api/v1/keys");
  ok(r.body.paths["/api/v1/plugins"], "openapi includes /api/v1/plugins");
  ok(r.body.paths["/api/v1/plugins/reload"], "openapi includes /api/v1/plugins/reload");
  await server.stop();
});

console.log("\n--- API Open Platform - Standalone Config ---");

t("Server starts with configurable port", async function() {
  var server = new PublishApiServer({ dryRun: true, keysPath: TEST_KEYS });
  var port = await server.start(0);
  ok(typeof port === "number" && port > 0, "port is a positive number");
  await server.stop();
});

t("Server health includes version and platform count", async function() {
  var server = new PublishApiServer({ dryRun: true, keysPath: TEST_KEYS });
  await server.start(0); var port = server._server.address().port;
  var r = await request(port, "GET", "/api/v1/health");
  eq(r.status, 200);
  eq(r.body.status, "ok");
  ok(r.body.version, "health includes version");
  ok(typeof r.body.platforms === "number", "health includes platform count");
  await server.stop();
});

harness.run();
