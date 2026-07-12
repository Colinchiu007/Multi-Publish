const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { FixEngine, PatchFixStrategy } = require("../src/fix-engine");

describe("PatchFixStrategy", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "patch-test-"));
  const patchDir = path.join(tmpDir, "patches");

  it("constructor: creates PatchFixStrategy instance", () => {
    const p = new PatchFixStrategy({ workDir: tmpDir, patchDir });
    assert.ok(p);
    assert.equal(p.patchDir, patchDir);
  });

  it("apply: generates .patch and .sh files on dryRun", async () => {
    const p = new PatchFixStrategy({ workDir: tmpDir, patchDir, dryRun: true });
    const result = await p.apply({ testName: "login-button", error: "css missing" });
    assert.ok(result.action === "PATCH_TEMPLATE" || result.action === "PATCH_GENERATED");
    assert.ok(result.patchFile);
    assert.ok(result.shellFile);
    assert.ok(fs.existsSync(result.patchFile));
    assert.ok(fs.existsSync(result.shellFile));
  });

  it("apply: with LLM generates real patch", async () => {
    const p = new PatchFixStrategy({
      workDir: tmpDir, patchDir,
      llmFn: async () => "--- a/ui/button.js\n+++ b/ui/button.js\n@@ -1,3 +1,3 @@\n-.red { color: red }\n+.blue { color: blue }",
    });
    const result = await p.apply({
      testName: "css-fix", error: "wrong color", description: "Button color mismatch",
    }, { dryRun: false });
    assert.equal(result.action, "PATCH_GENERATED");
    const content = fs.readFileSync(result.patchFile, "utf8");
    assert.ok(content.includes("a/ui/button.js"));
    assert.ok(content.includes("b/ui/button.js"));
  });

  it("apply: without LLM generates template", async () => {
    const p = new PatchFixStrategy({ workDir: tmpDir, patchDir });
    const result = await p.apply({ testName: "template-fix" });
    assert.equal(result.action, "PATCH_TEMPLATE");
    const content = fs.readFileSync(result.patchFile, "utf8");
    assert.ok(content.includes("FIX:"));
    assert.ok(content.includes("template-fix"));
  });
});

describe("FixEngine - PatchFixStrategy integration", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fe-patch-"));
  const patchDir = path.join(tmpDir, "patches");

  it("strategies has patch type", () => {
    const fe = new FixEngine({ workDir: tmpDir, dryRun: false });
    assert.ok(fe.strategies.patch);
  });

  it("execute: patch fixes generate files", async () => {
    const fe = new FixEngine({ workDir: tmpDir, dryRun: false });
    const fixes = [{ type: "patch", testName: "test-fix", error: "test error" }];
    const result = await fe.execute(fixes);
    assert.ok(result.success);
    assert.equal(result.results.length, 1);
  });
});
