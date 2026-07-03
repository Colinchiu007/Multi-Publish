/**
 * ApiKeyManager 测试 — create/revoke/list/validate + scope checking
 */
const ApiKeyManager = require("../src/api-key-manager");
const fs = require("fs");
const path = require("path");

const TEST_KEYS_PATH = path.join(__dirname, ".test-api-keys.json");

function setup() {
  // Clean up before each test
  if (fs.existsSync(TEST_KEYS_PATH)) fs.unlinkSync(TEST_KEYS_PATH);
  const mgr = new ApiKeyManager(TEST_KEYS_PATH);
  mgr.load();
  return mgr;
}

function teardown() {
  if (fs.existsSync(TEST_KEYS_PATH)) fs.unlinkSync(TEST_KEYS_PATH);
}

// --- Tests ---
let fail = 0;
function assert(cond, msg) {
  if (!cond) { console.log("  FAIL " + msg); fail++; }
  else { console.log("  PASS " + msg); }
}

// 1. Create key
(function testCreateKey() {
  const mgr = setup();
  const result = mgr.createKey("test-key-1", ["publish:read"]);
  assert(result.key && result.key.startsWith("mp_"), "createKey returns key with mp_ prefix");
  assert(result.name === "test-key-1", "createKey returns correct name");
  assert(Array.isArray(result.scopes) && result.scopes[0] === "publish:read", "createKey returns scopes");
  assert(result.createdAt, "createKey returns createdAt");
  teardown();
})();

// 2. Create key default scope
(function testCreateKeyDefaultScope() {
  const mgr = setup();
  const result = mgr.createKey("default-scope");
  assert(result.scopes[0] === "*", "createKey default scope is *");
  teardown();
})();

// 3. Create key requires name
(function testCreateKeyRequiresName() {
  const mgr = setup();
  let threw = false;
  try { mgr.createKey(); } catch (e) { threw = true; }
  assert(threw, "createKey without name throws");
  teardown();
})();

// 4. Validate key
(function testValidateKey() {
  const mgr = setup();
  const created = mgr.createKey("valid-key", ["publish:write"]);
  const r = mgr.validateKey(created.key);
  assert(r.valid === true, "validateKey returns valid for active key");
  assert(r.name === "valid-key", "validateKey returns name");
  assert(r.scopes[0] === "publish:write", "validateKey returns scopes");
  teardown();
})();

// 5. Validate none existent key
(function testValidateNonexistent() {
  const mgr = setup();
  const r = mgr.validateKey("nonexistent_key_12345");
  assert(r.valid === false, "validateKey returns invalid for nonexistent key");
  assert(r.error, "validateKey returns error message");
  teardown();
})();

// 6. Validate empty key
(function testValidateEmpty() {
  const mgr = setup();
  const r = mgr.validateKey("");
  assert(r.valid === false, "validateKey returns invalid for empty key");
  teardown();
})();

// 7. Revoke key
(function testRevokeKey() {
  const mgr = setup();
  const created = mgr.createKey("to-revoke");
  const revoked = mgr.revokeKey(created.key);
  assert(revoked === true, "revokeKey returns true for active key");
  const r = mgr.validateKey(created.key);
  assert(r.valid === false, "validateKey returns invalid after revoke");
  assert(r.error.includes("revoked"), "error mentions revoked");
  teardown();
})();

// 8. Revoke nonexistent key
(function testRevokeNonexistent() {
  const mgr = setup();
  const r = mgr.revokeKey("no_such_key");
  assert(r === false, "revokeKey returns false for nonexistent key");
  teardown();
})();

// 9. List keys
(function testListKeys() {
  const mgr = setup();
  mgr.createKey("k1", ["read"]);
  mgr.createKey("k2", ["write"]);
  const list = mgr.listKeys();
  assert(list.length === 2, "listKeys returns 2 keys");
  assert(list[0].name && !list[0].key, "listKeys does not expose key by default");
  teardown();
})();

// 10. List keys include revoked
(function testListKeysIncludeRevoked() {
  const mgr = setup();
  const c1 = mgr.createKey("active");
  mgr.createKey("to-revoke");
  mgr.revokeKey(c1.key);
  const activeOnly = mgr.listKeys();
  assert(activeOnly.length === 1, "listKeys without includeRevoked shows 1");
  const withRevoked = mgr.listKeys(true);
  assert(withRevoked.length === 2, "listKeys with includeRevoked shows 2");
  teardown();
})();

// 11. List keys with keys exposed
(function testListKeysExposeKeys() {
  const mgr = setup();
  mgr.createKey("visible");
  const list = mgr.listKeys(false, true);
  assert(list[0].key && list[0].key.startsWith("mp_"), "listKeys with includeKeys exposes key");
  teardown();
})();

// 12. Scope checking
(function testScopeCheck() {
  const mgr = setup();
  const created = mgr.createKey("scoped", ["publish:read"]);
  const ok = mgr.validateKey(created.key, "publish:read");
  assert(ok.valid === true, "validateKey passes with matching scope");
  const fail = mgr.validateKey(created.key, "publish:write");
  assert(fail.valid === false, "validateKey fails with unmatching scope");
  assert(fail.error.includes("Scope"), "error message mentions scope");
  teardown();
})();

// 13. Wildcard scope passes any check
(function testWildcardScope() {
  const mgr = setup();
  const created = mgr.createKey("wildcard");
  const r1 = mgr.validateKey(created.key, "anything");
  assert(r1.valid === true, "wildcard scope passes any required scope");
  teardown();
})();

// 14. Persistence across instances
(function testPersistence() {
  const mgr1 = setup();
  const created = mgr1.createKey("persistent", ["read"]);
  mgr1.load(); // reload same file
  const mgr2 = new ApiKeyManager(TEST_KEYS_PATH);
  mgr2.load();
  const r = mgr2.validateKey(created.key);
  assert(r.valid === true, "key persists across instances");
  assert(r.name === "persistent", "name persists across instances");
  teardown();
})();

// Summary
console.log(`\n=== ${fail === 0 ? "ALL" : fail + " FAILED"}; ${fail > 0 ? "SOME FAILED" : "ALL PASSED"} ===`);
process.exit(fail > 0 ? 1 : 0);
