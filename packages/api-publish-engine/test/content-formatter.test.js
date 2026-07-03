const assert = require("assert");

// ---- TDD stubs (module may not exist yet) ----
let formatContent, formatTags, truncateContent, truncateTitle;
try {
  const m = require("../src/content-formatter");
  formatContent   = m.formatContent;
  formatTags      = m.formatTags;
  truncateContent = m.truncateContent;
  truncateTitle   = m.truncateTitle;
} catch (e) {
  formatContent = (p, td) => td;
  formatTags    = (p, tags) => tags;
  truncateContent = (p, s) => s;
  truncateTitle   = (p, s) => s;
  console.log("[INFO] content-formatter not yet implemented, using stub");
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✅ " + name); }
  catch (e) { failed++; console.log("  ❌ " + name + ": " + e.message); }
}
function assertEqual(a, b) { assert.deepStrictEqual(a, b); }

// ---- formatTags ----
console.log("\n--- formatTags ---");
test("douyin: #tag style", () => {
  assertEqual(formatTags("douyin", ["科技", "AI"]), ["#科技", "#AI"]);
});
test("xiaohongshu: #tag style", () => {
  assertEqual(formatTags("xiaohongshu", ["美食", "教程"]), ["#美食", "#教程"]);
});
test("kuaishou: #tag style", () => {
  assertEqual(formatTags("kuaishou", ["游戏"]), ["#游戏"]);
});
test("weibo: #tag# style", () => {
  assertEqual(formatTags("weibo", ["热门", "新闻"]), ["#热门#", "#新闻#"]);
});
test("zhihu: plain style", () => {
  assertEqual(formatTags("zhihu", ["科技", "互联网"]), ["科技", "互联网"]);
});
test("wechat_mp: plain style", () => {
  assertEqual(formatTags("wechat_mp", ["科技"]), ["科技"]);
});
test("bilibili: #tag style", () => {
  assertEqual(formatTags("bilibili", ["数码", "评测"]), ["#数码", "#评测"]);
});
test("toutiao: #tag style", () => {
  assertEqual(formatTags("toutiao", ["财经"]), ["#财经"]);
});
test("empty tags", () => {
  assertEqual(formatTags("douyin", []), []);
});
test("null/undefined tags", () => {
  assertEqual(formatTags("douyin", null), []);
  assertEqual(formatTags("douyin", undefined), []);
});
test("tags with object format", () => {
  assertEqual(formatTags("zhihu", [{ name: "科技" }, { name: "AI" }]), ["科技", "AI"]);
});

// ---- truncateContent ----
console.log("\n--- truncateContent ---");
test("douyin: 1000 chars max", () => {
  const r = truncateContent("douyin", "a".repeat(1500));
  assertEqual(r.length, 1000);
});
test("weibo: 2000 chars max", () => {
  const r = truncateContent("weibo", "b".repeat(3000));
  assertEqual(r.length, 2000);
});
test("zhihu: 100000 chars max (no truncation)", () => {
  const r = truncateContent("zhihu", "c".repeat(5000));
  assertEqual(r.length, 5000);
});
test("empty content", () => {
  assertEqual(truncateContent("douyin", ""), "");
});
test("null content", () => {
  assertEqual(truncateContent("douyin", null), "");
});
test("under limit", () => {
  assertEqual(truncateContent("douyin", "hello world"), "hello world");
});

// ---- truncateTitle ----
console.log("\n--- truncateTitle ---");
test("douyin: 30 chars max", () => {
  const r = truncateTitle("douyin", "a".repeat(50));
  assertEqual(r.length, 30);
});
test("bilibili: 80 chars max", () => {
  const r = truncateTitle("bilibili", "b".repeat(100));
  assertEqual(r.length, 80);
});
test("xiaohongshu: 40 chars max", () => {
  const r = truncateTitle("xiaohongshu", "c".repeat(60));
  assertEqual(r.length, 40);
});
test("null title", () => {
  assertEqual(truncateTitle("douyin", null), "");
});

// ---- formatContent full pipeline ----
console.log("\n--- formatContent ---");
test("formatContent: douyin full pipeline", () => {
  const td = formatContent("douyin", {
    title: "a".repeat(40), content: "b".repeat(1500), tags: ["科技", "AI"]
  });
  assertEqual(td.title.length, 30);
  assertEqual(td.content.length, 1000);
  assertEqual(td.tags, ["#科技", "#AI"]);
});
test("formatContent: weibo full pipeline", () => {
  const td = formatContent("weibo", {
    title: "test", content: "hello", tags: ["新闻", "热点"]
  });
  assertEqual(td.tags, ["#新闻#", "#热点#"]);
});
test("formatContent: unknown platform uses defaults", () => {
  const td = formatContent("unknown", {
    title: "test", content: "content", tags: ["tag1"]
  });
  assertEqual(td.title, "test");
  assertEqual(td.content, "content");
  assertEqual(td.tags, ["#tag1"]);
});

console.log("\n========== Result ==========");
console.log("  Passed: " + passed + " / " + (passed + failed));
console.log("  Failed: " + failed + " / " + (passed + failed));
if (failed > 0) process.exit(1);