// TDD: 签名算法单元测试
const assert = require("assert");
const { getCsdnSign, getXiaohongshuSign, buildDouyinParams, getKuaishouSign } = require("../src/signer-local");

function testCsdnSign() {
  const sig = getCsdnSign("/api/test", { a: "1", b: "2" });
  assert(sig && sig.length > 10, "CSDN sign should produce base64 output");
  // 确定性: 相同输入应输出相同签名
  const sig2 = getCsdnSign("/api/test", { a: "1", b: "2" });
  assert(sig === sig2, "CSDN sign should be deterministic");
  console.log("  [PASS] CSDN HMAC-SHA256");
}

function testXiaohongshuSign() {
  const sig = getXiaohongshuSign("/api/galaxy/user/info");
  assert(sig, "XHS sign should return object");
  assert(sig["X-s"], "XHS sign should have X-s");
  assert(sig["X-t"], "XHS sign should have X-t");
  assert(sig["X-s"].length === 32, "X-s should be MD5 (32 hex chars)");
  // 带body版本
  const sigWithBody = getXiaohongshuSign("/api/publish", { title: "t" });
  assert(sigWithBody["X-s"], "XHS sign with body should work");
  console.log("  [PASS] Xiaohongshu X-s/X-t");
}

function testBuildDouyinParams() {
  const params = buildDouyinParams("Mozilla/5.0 Chrome/120");
  assert(params._signature === "_", "Douyin sig should be _");
  assert(params.aid === "1128", "Douyin aid should be 1128");
  assert(params.browser_version === "Mozilla/5.0 Chrome/120", "Should pass UA");
  console.log("  [PASS] Douyin browser params");
}

function testKuaishouSign() {
  const sig = getKuaishouSign({ title: "test" }, "api_ph_value");
  assert(sig && sig.length === 32, "KS sign should be MD5 hex");
  // 无 api_ph 时返回空
  const emptySig = getKuaishouSign({});
  assert(emptySig === "", "KS sign without api_ph should be empty");
  console.log("  [PASS] Kuaishou __NS_sig3");
}

console.log("=== signer-local.js Unit Tests ===");
testCsdnSign();
testXiaohongshuSign();
testBuildDouyinParams();
testKuaishouSign();
console.log("All signer-local tests PASSED");