const assert = require("assert");
const { createProxyAgent } = require("../src/proxy-manager");
let passed = 0, failed = 0;
function test(n, fn) { try { fn(); passed++; } catch(e) { failed++; console.error(n + ': ' + e.message); } }
test("valid config", () => {
  const r = createProxyAgent({ host: "127.0.0.1", port: 8080 });
  assert.ok(r.httpAgent); assert.ok(r.httpsAgent);
});
test("null input", () => { assert.strictEqual(createProxyAgent(null), null); });
test("missing host", () => { assert.strictEqual(createProxyAgent({ port: 8080 }), null); });
test("with auth", () => {
  const r = createProxyAgent({ host: "p.com", port: 3128, username: "u", password: "p" });
  assert.ok(r);
});
console.log("proxy-manager: " + passed + "/" + (passed + failed) + " passed" + (failed ? " FAILED" : ""));
if (failed) process.exit(1);