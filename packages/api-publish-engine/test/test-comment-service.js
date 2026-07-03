// TDD: CommentMessageService tests
const assert = require("assert");
const { CommentMessageService, CommentProvider, EchoReplyGenerator } = require("../src/comment-service");

let pass = 0;
function ok(n) { pass++; console.log("  [PASS] " + n); }
function no(n, m) { console.log("  [FAIL] " + n + ": " + m); }

// Test 1: Module exports
try {
  assert(typeof CommentMessageService === "function", "CommentMessageService not exported");
  assert(typeof CommentProvider === "function", "CommentProvider not exported");
  assert(typeof EchoReplyGenerator === "function", "EchoReplyGenerator not exported");
  ok("comment-service exports classes");
} catch(e) { no("exports", e.message); }

// Test 2: Construction
try {
  var svc = new CommentMessageService({ platform: "zhihu", cookie: "test" });
  assert(svc.account.platform === "zhihu", "platform mismatch");
  assert(svc.account.cookie === "test", "cookie mismatch");
  assert(svc.interval === 30000, "default interval");
  assert(svc.maxDays === 7, "default maxDays");
  ok("CommentMessageService construction");
} catch(e) { no("construction", e.message); }

// Test 3: Custom interval and reply generator
try {
  var gen = new EchoReplyGenerator();
  var svc = new CommentMessageService({ platform: "douyin", cookie: "c" }, { interval: 60000, maxDays: 3, replyGenerator: gen });
  assert(svc.interval === 60000, "custom interval");
  assert(svc.maxDays === 3, "custom maxDays");
  assert(svc._replyGen === gen, "custom generator");
  ok("custom options");
} catch(e) { no("custom options", e.message); }

// Test 4: EchoReplyGenerator
try {
  var gen = new EchoReplyGenerator();
  var reply = gen.generateReply({ content: "测试评论", author: "用户A" });
  assert(typeof reply === "string", "reply should be string");
  assert(reply.includes("测试评论"), "reply should include original comment");
  ok("EchoReplyGenerator produces reply");
} catch(e) { no("EchoReplyGenerator", e.message); }

// Test 5: TemplateReplyGenerator
try {
  var { TemplateReplyGenerator } = require("../src/comment-service");
  var gen2 = new TemplateReplyGenerator({ template: "感谢支持: {content}" });
  var reply2 = gen2.generateReply({ content: "好文章！", author: "小明" });
  assert(reply2.includes("好文章！"), "template should include content");
  assert(reply2.includes("感谢支持"), "template prefix");
  ok("TemplateReplyGenerator");
} catch(e) { no("TemplateReplyGenerator", e.message); }

// Test 6: start/stop polling
(async () => {
  try {
    var comments = [{ id: "1", content: "测试", author: "用户", timestamp: Date.now() }];
    var provider = new (class extends CommentProvider {
      async getCommentList(cookie, params) { return comments; }
      async replyComment(cookie, commentId, content) { return { success: true }; }
    })();
    var svc = new CommentMessageService({ platform: "test", cookie: "c" }, { provider: provider, replyGenerator: new EchoReplyGenerator() });
    var replied = [];
    svc.onReply(function(c, r) { replied.push({ comment: c, reply: r }); });
    await svc.start(100); // poll every 100ms for testing
    await new Promise(function(r) { setTimeout(r, 350); }); // let it poll a few times
    await svc.stop();
    assert(replied.length > 0, "should have replied to at least 1 comment");
    ok("start/stop polling: " + replied.length + " replies");
  } catch(e) { no("start/stop polling: " + e.message); }
})();

setTimeout(function() {
  console.log("\n" + (pass === 6 ? "All" : pass + "/6") + " comment-service tests " + (pass === 6 ? "PASSED" : "FAILED"));
}, 500);
