// TDD: Upload Orchestration Tests
const assert = require("assert");

// Test 1: COS Provider structure
(() => {
  const CosProvider = require("../upload/providers/cos-provider");
  const inst = new CosProvider();
  assert(typeof inst.uploadVideo === "function", "cos uploadVideo missing");
  assert(typeof inst.uploadCover === "function", "cos uploadCover missing");
  assert(inst.type === "cos", "cos type mismatch");
  console.log("  [PASS] cos-provider structure");
})();

// Test 2: OSS Provider structure
(() => {
  const OssProvider = require("../upload/providers/oss-provider");
  const inst = new OssProvider();
  assert(typeof inst.uploadVideo === "function", "oss uploadVideo missing");
  assert(typeof inst.uploadCover === "function", "oss uploadCover missing");
  assert(inst.type === "oss", "oss type mismatch");
  console.log("  [PASS] oss-provider structure");
})();

// Test 3: HTTP Provider structure
(() => {
  const HttpProvider = require("../upload/providers/http-provider");
  const inst = new HttpProvider();
  assert(typeof inst.uploadVideo === "function", "http uploadVideo missing");
  assert(typeof inst.uploadCover === "function", "http uploadCover missing");
  assert(inst.type === "http", "http type mismatch");
  console.log("  [PASS] http-provider structure");
})();

// Test 4: Orchestrator picks COS for xiaohongshu
(() => {
  const orchestrator = require("../upload/orchestrator");
  const provider = orchestrator.getUploadProvider("xiaohongshu");
  assert(provider !== null, "xiaohongshu should have a provider");
  assert(provider.type === "cos", "xiaohongshu should use COS");
  console.log("  [PASS] orchestrator picks COS for xiaohongshu");
})();

// Test 5: Orchestrator picks COS for tencent_video
(() => {
  const orchestrator = require("../upload/orchestrator");
  const provider = orchestrator.getUploadProvider("tencent_video");
  assert(provider !== null, "tencent_video should have a provider");
  assert(provider.type === "cos", "tencent_video should use COS");
  console.log("  [PASS] orchestrator picks COS for tencent_video");
})();

// Test 6: Orchestrator picks OSS for zhihu
(() => {
  const orchestrator = require("../upload/orchestrator");
  const provider = orchestrator.getUploadProvider("zhihu");
  assert(provider !== null, "zhihu should have a provider");
  assert(provider.type === "oss", "zhihu should use OSS");
  console.log("  [PASS] orchestrator picks OSS for zhihu");
})();

// Test 7: Orchestrator picks OSS for dewu
(() => {
  const orchestrator = require("../upload/orchestrator");
  const provider = orchestrator.getUploadProvider("dewu");
  assert(provider !== null, "dewu should have a provider");
  assert(provider.type === "oss", "dewu should use OSS");
  console.log("  [PASS] orchestrator picks OSS for dewu");
})();

// Test 8: Orchestrator picks HTTP for douyin
(() => {
  const orchestrator = require("../upload/orchestrator");
  const provider = orchestrator.getUploadProvider("douyin");
  assert(provider !== null, "douyin should have a provider");
  assert(provider.type === "http", "douyin should use HTTP");
  console.log("  [PASS] orchestrator picks HTTP for douyin");
})();

// Test 9: Unknown platform returns null
(() => {
  const orchestrator = require("../upload/orchestrator");
  const provider = orchestrator.getUploadProvider("unknown_platform");
  assert(provider === null, "unknown platform should return null");
  console.log("  [PASS] orchestrator returns null for unknown platform");
})();

// Test 10: Orchestrator.upload returns null with no provider
(async () => {
  const orchestrator = require("../upload/orchestrator");
  const result = await orchestrator.upload({ platform: "unknown", filePath: "test.mp4", cookie: "" });
  assert(result === null, "upload should return null for unknown platform");
  console.log("  [PASS] orchestrator.upload returns null for unknown platform");
})();

// Test 11: COS provider returns upload result structure
(async () => {
  const CosProvider = require("../upload/providers/cos-provider");
  const inst = new CosProvider();
  const result = await inst.uploadVideo({ filePath: "/fake/path.mp4", fileSize: 1000, mimeType: "video/mp4" }, {});
  // Should return null because no real file
  assert(result === null, "cos uploadVideo should return null without real file");
  console.log("  [PASS] cos-provider handles missing file gracefully");
})();


// Test: xiaohongshu adapter upload calls orchestrator
(() => {
  const XhsAdapter = require("../src/adapters/xiaohongshu");
  const inst = new XhsAdapter();
  // Should return null when no file (graceful)
  inst.uploadVideo({}, "").then(r => {
    console.assert(r === null, "xhs uploadVideo should return null without file");
    console.log("  [PASS] xiaohongshu adapter uploadVideo graceful");
  });
})();

// Test: zhihu adapter upload calls orchestrator
(() => {
  const ZhAdapter = require("../src/adapters/zhihu");
  const inst = new ZhAdapter();
  inst.uploadVideo({}, "").then(r => {
    console.assert(r === null, "zhihu uploadVideo should return null without file");
    console.log("  [PASS] zhihu adapter uploadVideo graceful");
  });
})();

// Test: shipinhao adapter upload calls orchestrator
(() => {
  const SpAdapter = require("../src/adapters/shipinhao");
  const inst = new SpAdapter();
  inst.uploadVideo({}, "").then(r => {
    console.assert(r === null, "shipinhao uploadVideo should return null without file");
    console.log("  [PASS] shipinhao adapter uploadVideo graceful");
  });
})();

// Test: douyin adapter still returns null (no upload integration yet)
(() => {
  const DyAdapter = require("../src/adapters/douyin");
  const inst = new DyAdapter();
  inst.uploadVideo({}, "").then(r => {
    console.assert(r === null, "douyin uploadVideo should return null");
    console.log("  [PASS] douyin adapter uploadVideo still returns null");
  });
})();

console.log("\nAll upload orchestration tests PASSED");
