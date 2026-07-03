// TDD: COS 上传器结构测试
const assert = require("assert");
const { CosUploader, CHUNK } = require("../src/cos-uploader");

function testConstructor() {
  const u = new CosUploader();
  assert(u, "CosUploader should construct");
  assert(typeof u.upload === "function", "Should have upload method");
  console.log("  [PASS] CosUploader structure");
}

function testChunkSize() {
  assert(CHUNK === 8 * 1024 * 1024, "Chunk should be 8MB");
  console.log("  [PASS] CHUNK size");
}

console.log("=== cos-uploader.js Unit Tests ===");
testConstructor();
testChunkSize();
console.log("All cos-uploader tests PASSED");