/**
 * ApiKeyManager 测试 — create/revoke/list/validate + scope checking
 */
const ApiKeyManager = require("../src/api-key-manager");
const crypto = require("crypto");
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

// 15. Reloaded hashed key can still be revoked
(function testRevokePersistedHash() {
  const mgr1 = setup();
  const created = mgr1.createKey("persisted-revoke", ["*"]);
  const mgr2 = new ApiKeyManager(TEST_KEYS_PATH);
  mgr2.load();
  assert(mgr2.revokeKey(created.key) === true, "revokeKey revokes a persisted hashed key");
  const mgr3 = new ApiKeyManager(TEST_KEYS_PATH);
  mgr3.load();
  const result = mgr3.validateKey(created.key);
  assert(result.valid === false && result.error.includes("revoked"), "revocation persists after reload");
  teardown();
})();

// 16. Ensure configured key is idempotent and preserves revocation
(function testEnsureConfiguredKey() {
  const mgr = setup();
  const first = mgr.ensureKey("configured-secret", "configured", ["*"]);
  const second = mgr.ensureKey("configured-secret", "configured", ["*"]);
  assert(first.created === true && second.created === false, "ensureKey is idempotent");
  assert(mgr.validateKey("configured-secret").valid === true, "ensureKey registers the configured key");
  assert(mgr.revokeKey("configured-secret") === true, "ensureKey key can be revoked");
  const third = mgr.ensureKey("configured-secret", "configured", ["*"]);
  assert(third.revoked === true && mgr.validateKey("configured-secret").valid === false,
    "ensureKey does not revive a revoked key");
  teardown();
})();

// 17. 定时任务 ownerSubject 保持 API Key 撤销边界
(function testValidateOwnerSubject() {
  const mgr = setup();
  const created = mgr.createKey("scheduled-owner", ["publish:submit"]);
  const ownerSubject = `api-key:${crypto.createHash("sha256").update(created.key).digest("hex")}`;
  const active = mgr.validateOwnerSubject(ownerSubject, "publish:submit");
  assert(active.valid === true, "validateOwnerSubject 接受有效的 API Key ownerSubject");
  assert(mgr.revokeKey(created.key) === true, "定时任务所属 API Key 可以被撤销");
  const revoked = mgr.validateOwnerSubject(ownerSubject, "publish:submit");
  assert(revoked.valid === false && revoked.code === "API_KEY_REVOKED",
    "validateOwnerSubject 拒绝已撤销的 API Key ownerSubject");
  teardown();
})();

// 18. API Key 管理器重启后仍以持久化撤销状态为准
(function testValidatePersistedOwnerSubject() {
  const mgr1 = setup();
  const created = mgr1.createKey("persisted-scheduled-owner", ["publish:submit"]);
  const ownerSubject = `api-key:${crypto.createHash("sha256").update(created.key).digest("hex")}`;
  assert(mgr1.revokeKey(created.key) === true, "持久化的定时任务所属 API Key 可以被撤销");
  const mgr2 = new ApiKeyManager(TEST_KEYS_PATH);
  const result = mgr2.validateOwnerSubject(ownerSubject, "publish:submit");
  assert(result.valid === false && result.code === "API_KEY_REVOKED",
    "重载后的管理器拒绝已撤销的定时任务 ownerSubject");
  teardown();
})();

// 19. 损坏的 Key 存储必须 fail closed，且不能被迁移逻辑覆盖
(function testCorruptStoreFailsClosed() {
  teardown();
  const corruptContent = "{invalid-json";
  fs.writeFileSync(TEST_KEYS_PATH, corruptContent, "utf-8");
  const mgr = new ApiKeyManager(TEST_KEYS_PATH);
  const ownerSubject = `api-key:${crypto.createHash("sha256").update("configured-secret").digest("hex")}`;
  const result = mgr.validateOwnerSubject(ownerSubject, "publish:submit");
  assert(result.valid === false && result.code === "API_KEY_STORE_UNAVAILABLE",
    "validateOwnerSubject 拒绝不可读的 API Key 存储");
  let migrationError = null;
  try { mgr.ensureKey("configured-secret", "configured", ["*"]); } catch (error) { migrationError = error; }
  assert(migrationError && migrationError.code === "API_KEY_STORE_UNAVAILABLE",
    "ensureKey 不会把损坏的 Key 存储当成空存储");
  assert(fs.readFileSync(TEST_KEYS_PATH, "utf-8") === corruptContent,
    "损坏的 Key 存储不会被静态配置覆盖");
  teardown();
})();

// Summary
console.log(`\n=== ${fail === 0 ? "ALL" : fail + " FAILED"}; ${fail > 0 ? "SOME FAILED" : "ALL PASSED"} ===`);
process.exit(fail > 0 ? 1 : 0);
