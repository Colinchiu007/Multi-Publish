/**
 * TikTok adapter TDD ? interface validation
 */
const TikTokAdapter = require("../src/adapters/tiktok");

describe("TikTokAdapter", function() {
  var adapter;

  beforeAll(function() {
    adapter = new TikTokAdapter();
  });

  test("has correct name", function() {
    expect(adapter.name).toBe("tiktok");
  });

  test("execute returns result with platform", async function() {
    var result = await adapter.execute({ title: "Test video" }, null, { dryRun: true });
    expect(result).toBeDefined();
    expect(result.platform).toBe("tiktok");
  });
});
