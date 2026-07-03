// TDD: CoverCropper 单元测试
const assert = require("assert");
const { cropCover, REQUIREMENTS } = require("../src/cover-cropper");

function testRequirements() {
  assert(REQUIREMENTS.bilibili.width === 1146, "B站宽1146");
  assert(REQUIREMENTS.bilibili.height === 717, "B站高717");
  assert(REQUIREMENTS.weibo.width === 1080, "微博宽1080");
  assert(REQUIREMENTS.douyin.width === 1080, "抖音宽1080");
  assert(Object.keys(REQUIREMENTS).length >= 8, "至少8个平台");
  console.log("  [PASS] REQUIREMENTS");
}

console.log("=== CoverCropper Tests ===");
testRequirements();
console.log("All cover-cropper tests PASSED");