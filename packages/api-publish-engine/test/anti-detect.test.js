const assert = require("assert");
const { randomUA, randomDelay, randomizeHeaders } = require("../src/anti-detect");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✅ " + name); }
  catch (e) { failed++; console.log("  ❌ " + name + ": " + e.message); }
}
function assertEqual(a, b) { assert.deepStrictEqual(a, b); }

// ---- randomUA ----
console.log("--- randomUA ---");
test("returns a string", () => {
  const ua = randomUA();
  assertEqual(typeof ua, "string");
  assertEqual(ua.length > 0, true);
});
test("returns Chrome UA", () => {
  const ua = randomUA();
  assertEqual(ua.includes("Chrome"), true);
});
test("returns varied results over multiple calls", () => {
  const results = new Set();
  for (let i = 0; i < 20; i++) results.add(randomUA());
  assertEqual(results.size > 1, true);
});

// ---- randomDelay ----
console.log("\n--- randomDelay ---");
test("resolves within range (100-200ms)", async () => {
  const start = Date.now();
  await randomDelay(100, 200);
  const elapsed = Date.now() - start;
  assertEqual(elapsed >= 50 && elapsed <= 500, true); // 给一点容差
});
test("min=max produces exact delay (approx)", async () => {
  const start = Date.now();
  await randomDelay(50, 50);
  const elapsed = Date.now() - start;
  assertEqual(elapsed >= 20 && elapsed <= 200, true);
});

// ---- randomizeHeaders ----
console.log("\n--- randomizeHeaders ---");
test("preserves all original keys", () => {
  const h = { a: "1", b: "2", c: "3" };
  const r = randomizeHeaders(h);
  assertEqual(Object.keys(r).sort(), ["a", "b", "c"]);
});
test("preserves all original values", () => {
  const h = { A: "x", B: "y" };
  const r = randomizeHeaders(h);
  assertEqual(r.A, "x");
  assertEqual(r.B, "y");
});
test("does not mutate original object", () => {
  const h = { a: "1", b: "2" };
  const r = randomizeHeaders(h);
  assertEqual(Object.keys(h), ["a", "b"]); // 顺序不变
});
test("handles empty headers", () => {
  const r = randomizeHeaders({});
  assertEqual(Object.keys(r).length, 0);
});
test("handles single header", () => {
  const r = randomizeHeaders({ "Content-Type": "text" });
  assertEqual(r["Content-Type"], "text");
});

console.log("\n========== Result ==========");
console.log("  Passed: " + passed + " / " + (passed + failed));
console.log("  Failed: " + failed + " / " + (passed + failed));
if (failed > 0) process.exit(1);