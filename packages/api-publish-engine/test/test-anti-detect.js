// TDD: AntiDetect 单元测试
const assert = require("assert");
const { randomUA, randomDelay, randomizeHeaders, UA_POOL } = require("../src/anti-detect");

function testRandomUA() {
  const ua = randomUA();
  assert(ua.includes("Chrome"), "UA should be a Chrome string");
  assert(UA_POOL.includes(ua), "UA should be from the pool");
  console.log("  [PASS] randomUA");
}

function testRandomizeHeaders() {
  const h = { "Content-Type": "json", "Authorization": "Bearer x", "Cookie": "a=b" };
  const h2 = randomizeHeaders(h);
  assert(Object.keys(h2).length === 3, "Should preserve all keys");
  assert(h2["Content-Type"] === "json", "Should preserve values");
  console.log("  [PASS] randomizeHeaders");
}

console.log("=== AntiDetect Tests ===");
testRandomUA();
testRandomizeHeaders();
console.log("All anti-detect tests PASSED");