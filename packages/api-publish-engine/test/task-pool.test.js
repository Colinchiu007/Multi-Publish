const assert = require("assert");
const { TaskPool } = require("../src/task-pool");
let passed = 0, failed = 0;
function test(n, fn) { try { fn(); passed++; } catch(e) { failed++; console.error(n + ': ' + e.message); } }
test("default concurrency", () => { assert.strictEqual(new TaskPool().concurrency, 3); });
test("custom concurrency", () => { assert.strictEqual(new TaskPool({ concurrency: 5 }).concurrency, 5); });
test("runs tasks", async () => {
  const p = new TaskPool({ concurrency: 2 });
  p.add(() => Promise.resolve(1)); p.add(() => Promise.resolve(2));
  const r = await p.waitAll();
  assert.strictEqual(r.length, 2);
});
test("handles errors", async () => {
  const p = new TaskPool({ concurrency: 1 });
  p.add(() => Promise.reject(new Error("fail"))); p.add(() => Promise.resolve("ok"));
  const r = await p.waitAll();
  assert.ok(r[0].error); assert.strictEqual(r[1], "ok");
});
console.log("task-pool: " + passed + "/" + (passed + failed) + " passed" + (failed ? " FAILED" : ""));
if (failed) process.exit(1);