const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const { findProjectRoot } = require("../src/utils/path-resolver");

describe("path-resolver", () => {
  it("findProjectRoot: from __dirname finds project root", () => {
    const root = findProjectRoot(__dirname);
    assert.ok(root);
  });

  it("findProjectRoot: limited depth returns fallback", () => {
    const root = findProjectRoot("Z:\\nonexistent", { maxDepth: 0 });
    assert.ok(typeof root === "string");
  });
});
