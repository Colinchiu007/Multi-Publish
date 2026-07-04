/**
 * UsageTracker 测试 — record/stats/reset
 */
const UsageTracker = require("../src/usage-tracker");
const fs = require("fs");
const path = require("path");

const TEST_PATH = path.join(__dirname, ".test-usage.json");

function setup() {
  if (fs.existsSync(TEST_PATH)) fs.unlinkSync(TEST_PATH);
  const t = new UsageTracker(TEST_PATH);
  t.load();
  return t;
}

function teardown() {
  if (fs.existsSync(TEST_PATH)) fs.unlinkSync(TEST_PATH);
}

let fail = 0;
function assert(cond, msg) {
  if (!cond) { console.log("  FAIL " + msg); fail++; }
  else { console.log("  PASS " + msg); }
}

// 1. Record request
(function testRecord() {
  const t = setup();
  t.record("key-1", "192.168.1.1");
  t.record("key-1", "192.168.1.2");
  t.record("key-2", "10.0.0.1");
  const stats = t.getStats();
  assert(stats.totalRequests === 3, "totalRequests = 3");
  assert(stats.activeKeys === 2, "activeKeys = 2");
  assert(stats.topKeys[0].name === "key-1", "top key is key-1");
  assert(stats.topKeys[0].count === 2, "key-1 count = 2");
  teardown();
})();

// 2. IP dedup
(function testIpDedup() {
  const t = setup();
  t.record("key-1", "10.0.0.1");
  t.record("key-1", "10.0.0.1");
  const stats = t.getStats();
  assert(stats.topKeys[0].ips.length === 1, "IPs deduplicated");
  teardown();
})();

// 3. Empty tracker
(function testEmpty() {
  const t = setup();
  const stats = t.getStats();
  assert(stats.totalRequests === 0, "empty totalRequests = 0");
  assert(stats.activeKeys === 0, "empty activeKeys = 0");
  assert(stats.topKeys.length === 0, "empty topKeys = []");
  teardown();
})();

// 4. Reset
(function testReset() {
  const t = setup();
  t.record("test", "1.1.1.1");
  t.record("test", "2.2.2.2");
  t.reset();
  const stats = t.getStats();
  assert(stats.totalRequests === 0, "reset totalRequests = 0");
  assert(stats.activeKeys === 0, "reset activeKeys = 0");
  teardown();
})();

// 5. Persistence across instances
(function testPersistence() {
  const t1 = setup();
  t1.record("persist-key", "1.1.1.1");
  const t2 = new UsageTracker(TEST_PATH);
  t2.load();
  const stats = t2.getStats();
  assert(stats.totalRequests === 1, "persistence totalRequests = 1");
  assert(stats.topKeys[0].name === "persist-key", "persistence key name");
  teardown();
})();

// 6. Since timestamp
(function testSince() {
  const t = setup();
  assert(t.getStats().since, "since timestamp exists");
  teardown();
})();

console.log(`\n=== ${fail === 0 ? "ALL PASSED" : fail + " FAILED"} ===`);
process.exit(fail > 0 ? 1 : 0);
