const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const { BaseTestRunner } = require("../src/runners/base-runner");

describe("BaseTestRunner", () => {
  it("summarize: empty array", () => {
    const r = new BaseTestRunner({ label: "t" });
    const s = r.summarize([]);
    assert.equal(s.total, 0);
    assert.equal(s.passRate, "N/A");
  });
  it("summarize: mixed status", () => {
    const r = new BaseTestRunner({ label: "t" });
    const s = r.summarize([{status:"PASSED"},{status:"FAILED"},{status:"PASSED"}]);
    assert.equal(s.total, 3);
    assert.equal(s.passed, 2);
    assert.equal(s.failed, 1);
    assert.equal(s.passRate, "66.7%");
  });
  it("generateReportFile: creates JSON", () => {
    const tmp = path.join(__dirname, ".tmp-br");
    const r = new BaseTestRunner({ label: "t", reportDir: tmp });
    const p = r.generateReportFile("x", { a: 1 });
    assert.ok(fs.existsSync(p));
    assert.equal(JSON.parse(fs.readFileSync(p, "utf8")).a, 1);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  it("runTests: not implemented throws", async () => {
    const r = new BaseTestRunner({ label: "t" });
    await assert.rejects(() => r.runTests(), /subclass must implement/);
  });
});
