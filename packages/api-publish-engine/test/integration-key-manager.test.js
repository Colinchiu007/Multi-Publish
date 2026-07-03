
// Test that ApiKeyManager integrates correctly with PublishApiServer
const { PublishApiServer } = require("../src/publish-api-server");
const http = require("http");

let fail = 0;
function assert(cond, msg) {
  if (!cond) { console.log("  FAIL " + msg); fail++; }
  else { console.log("  PASS " + msg); }
}

// 1. Server can be constructed with key manager
const server = new PublishApiServer({ port: 0, keysPath: __dirname + "/.test-server-keys.json" });
assert(server._keyManager !== undefined, "server has _keyManager");
assert(typeof server._keyManager.createKey === "function", "_keyManager.createKey exists");
assert(typeof server._checkAuth === "function", "_checkAuth exists");

// 2. _checkAuth works with key manager
const mgr = server._keyManager;
mgr.load();
const key = mgr.createKey("test-server", ["admin"]);
const r1 = server._checkAuth({ headers: { authorization: "Bearer " + key.key } });
assert(r1.authorized === true, "_checkAuth returns authorized for valid key");

const r2 = server._checkAuth({ headers: { authorization: "Bearer invalid_key" } });
assert(r2.authorized === false, "_checkAuth returns unauthorized for invalid key");

const r3 = server._checkAuth({ headers: {} });
assert(r3.authorized === true, "_checkAuth allows requests without key when no apiKey set");

// 3. Check that auth works with scope
const scopedKey = mgr.createKey("scoped-server", ["publish:read"]);
const r4 = server._checkAuth({ headers: { authorization: "Bearer " + scopedKey.key } }, "admin");
assert(r4.authorized === false, "_checkAuth rejects scope mismatch");

// Cleanup
const fs = require("fs");
const path = require("path");
const f = __dirname + "/.test-server-keys.json";
if (fs.existsSync(f)) fs.unlinkSync(f);

console.log(`\n=== ${fail === 0 ? "ALL PASSED" : fail + " FAILED"} ===`);
process.exit(fail > 0 ? 1 : 0);
