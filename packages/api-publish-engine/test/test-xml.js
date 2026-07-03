// TDD: 视频号 XML 构建器测试
const assert = require("assert");
const { FinderXmlBuilder } = require("../src/xml-builder");

function testBuildContent() {
  const b = new FinderXmlBuilder();
  const xml = b.buildContent("Hello #world# @friend");
  assert(xml.includes("<finder>"), "Should have finder tag");
  assert(xml.includes("#world#"), "Should preserve topic text");
  assert(xml.includes("@friend"), "Should preserve mention text");
  console.log("  [PASS] XML basic content");
}

function testEmptyContent() {
  const b = new FinderXmlBuilder();
  const xml = b.buildContent("");
  assert(xml.includes("<finder>"), "Empty content should still produce valid XML");
  console.log("  [PASS] XML empty content");
}

function testNoTags() {
  const b = new FinderXmlBuilder();
  const xml = b.buildContent("Plain text only");
  assert(xml.includes("Plain text only"), "Should preserve plain text");
  console.log("  [PASS] XML plain text");
}

console.log("=== xml-builder.js Unit Tests ===");
testBuildContent();
testEmptyContent();
testNoTags();
console.log("All xml-builder tests PASSED");