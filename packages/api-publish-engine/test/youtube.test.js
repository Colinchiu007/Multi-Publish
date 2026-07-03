/**
 * YouTube adapter TDD ? interface validation
 */
const YouTubeAdapter = require("../src/adapters/youtube");

describe("YouTubeAdapter", function() {
  var adapter;

  beforeAll(function() {
    adapter = new YouTubeAdapter();
  });

  test("has correct name", function() {
    expect(adapter.name).toBe("youtube");
  });

  test("execute returns result with platform", async function() {
    var result = await adapter.execute({ title: "Test" }, null, { dryRun: true });
    expect(result).toBeDefined();
    expect(result.platform).toBe("youtube");
  });
});
