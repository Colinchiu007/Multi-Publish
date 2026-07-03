/**
 * Twitter adapter TDD ? interface validation
 */
const TwitterAdapter = require("../src/adapters/twitter");

describe("TwitterAdapter", function() {
  var adapter;

  beforeAll(function() {
    adapter = new TwitterAdapter();
  });

  test("has correct name", function() {
    expect(adapter.name).toBe("twitter");
  });

  test("execute returns result with platform", async function() {
    var result = await adapter.execute({ content: "Test tweet" }, null, { dryRun: true });
    expect(result).toBeDefined();
    expect(result.platform).toBe("twitter");
  });
});
