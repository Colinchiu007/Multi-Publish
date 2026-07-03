/**
 * Signer TDD
 */
const signer = require("../src/signer");

describe("Signer", function() {
  test("exports SIGNER_PORTS mapping", function() {
    expect(signer.SIGNER_PORTS).toBeDefined();
    expect(signer.SIGNER_PORTS.douyin).toBe(5042);
    expect(signer.SIGNER_PORTS.kuaishou).toBe(5009);
    expect(signer.SIGNER_PORTS.xiaohongshu).toBe(5062);
    expect(signer.SIGNER_PORTS.baijiahao).toBe(5012);
    expect(signer.SIGNER_PORTS.toutiao).toBe(5032);
  });

  test("getRemoteSign throws for unknown platform", async function() {
    await expect(signer.getRemoteSign("nonexistent")).rejects.toThrow("No signer port");
  });

  test("exports all functions", function() {
    expect(typeof signer.getRemoteSign).toBe("function");
    expect(typeof signer.getDouyinSignature).toBe("function");
    expect(typeof signer.getKuaishouSignature).toBe("function");
    expect(typeof signer.getXiaohongshuToken).toBe("function");
    expect(typeof signer.getBaijiahaoSignature).toBe("function");
  });
});
