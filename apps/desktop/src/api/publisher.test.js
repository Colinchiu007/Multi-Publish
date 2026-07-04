import { describe, it, expect } from "vitest";

describe("publisher API", () => {
  it("publisher module exports functions", async () => {
    const pub = await import("./publisher.js");
    expect(pub.publishBatch).toBeDefined();
    expect(pub.offlineStatus).toBeDefined();
    expect(pub.offlineAddToCache).toBeDefined();
    expect(pub.onOfflineRestored).toBeDefined();
    expect(pub.offlineClearCache).toBeDefined();
  });

  it("offlineStatus exists", async () => {
    const pub = await import("./publisher.js");
    expect(typeof pub.offlineStatus).toBe("function");
  });
});
