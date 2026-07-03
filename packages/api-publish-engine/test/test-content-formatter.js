const assert = require("assert");
const { formatContent, truncateTitle, formatTags } = require("../src/content-formatter");
var pass = 0;
function ok(n) { pass++; console.log("  [PASS] " + n); }
function no(n, m) { console.log("  [FAIL] " + n + ": " + m); }
try { var t = truncateTitle("abcdefghijklmnopqrstuvwxyz0123456789", "dewu"); assert(t.length <= 30); ok("truncateTitle dewu limit 30"); } catch(e) { no("truncateTitle", e.message); }
try { var r = formatTags(["科技", "AI"], "douyin"); assert(r[0] === "#科技"); assert(r[1] === "#AI"); ok("formatTags douyin"); } catch(e) { no("formatTags douyin", e.message); }
try { var r = formatTags(["测试"], "zhihu"); assert(r[0] === "测试"); ok("formatTags zhihu"); } catch(e) { no("formatTags zhihu", e.message); }
try { var r = formatTags(["a"], "weibo"); assert(r[0] === "#a#"); ok("formatTags weibo"); } catch(e) { no("formatTags weibo", e.message); }
try { var r = formatContent({ title: "测试", content: "内容", tags: ["科技"] }, "douyin"); assert(r.title === "测试"); assert(r.tags[0] === "#科技"); ok("formatContent douyin"); } catch(e) { no("formatContent douyin", e.message); }
try { var r = formatContent({}, "weibo"); assert(r.title === ""); assert(r.content === ""); ok("formatContent empty"); } catch(e) { no("formatContent empty", e.message); }
try { var r = formatContent({ title: "长标题长标题长标题长标题长标题长标题长标题长标题长标题长标题", content: "c", tags: [] }, "douyin"); assert(r.title.length <= 50); ok("formatContent truncate"); } catch(e) { no("formatContent truncate", e.message); }
setTimeout(function() { console.log("\n" + (pass === 7 ? "All" : pass + "/7") + " content-formatter tests " + (pass === 7 ? "PASSED" : "FAILED")); }, 200);
