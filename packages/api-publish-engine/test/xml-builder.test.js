const assert = require("assert");
const { FinderXmlBuilder } = require("../src/xml-builder");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  \u2705 " + name); }
  catch (e) { failed++; console.log("  \u274C " + name + ": " + e.message); }
}
function assertEqual(a, b) { assert.deepStrictEqual(a, b); }

var builder = new FinderXmlBuilder();

console.log("--- buildContent ---");
test("valid XML with plain text", () => {
  const xml = builder.buildContent("hello world");
  assertEqual(xml.includes("<finder>"), true);
  assertEqual(xml.includes("</finder>"), true);
  assertEqual(xml.includes("hello world"), true);
});
test("version and valuecount", () => {
  const xml = builder.buildContent("test");
  assertEqual(xml.includes("<version>1</version>"), true);
  assertEqual(xml.includes("<valuecount>"), true);
});
test("#topic# becomes segment with raw attribute", () => {
  const xml = builder.buildContent("hello #科技# world");
  assertEqual(xml.includes("raw="), true);
  assertEqual(xml.includes("科技"), true);
});
test("@mention triggers <style><at>", () => {
  const xml = builder.buildContent("hello @user hi");
  assertEqual(xml.includes("<style><at>"), true);
});
test("empty content", () => {
  assertEqual(builder.buildContent("").includes("<valuecount>0</valuecount>"), true);
});
test("mixed content", () => {
  const xml = builder.buildContent("你好 #AI# 世界 @开发者 欢迎");
  assertEqual(xml.includes("AI"), true);
  assertEqual(xml.includes("开发者"), true);
  const matches = xml.match(/<\/value\d+>/g);
  assertEqual(matches.length >= 4, true);
});
test("special chars in CDATA", () => {
  assertEqual(builder.buildContent("a < b & c > d").includes("<![CDATA["), true);
});

console.log("\n--- _parse ---");
test("splits text and topics", () => {
  const segs = builder._parse("a #b# c");
  assertEqual(segs.length, 3);
  assertEqual(segs[0].t, "text");
  assertEqual(segs[1].t, "topic");
  assertEqual(segs[2].t, "text");
});
test("recognizes mentions", () => {
  assertEqual(builder._parse("a @b c")[1].t, "mention");
});
test("topic has raw name", () => {
  const segs = builder._parse("#科技#");
  assertEqual(segs[0].r.name, "科技");
});

console.log("\n========== Result ==========");
console.log("  Passed: " + passed + " / " + (passed + failed));
console.log("  Failed: " + failed + " / " + (passed + failed));
if (failed > 0) process.exit(1);