// Enhanced features: cookie expiry detection, rich text placeholders, anti-detection
const assert = require("assert");
let p=0,f=0;
function t(n,fn){try{fn();p++;console.log("  "+String.fromCodePoint(0x2705)+" "+n);}catch(e){f++;console.log("  "+String.fromCodePoint(0x274C)+" "+n+": "+e.message);}}
function eq(a,b){assert.deepStrictEqual(a,b);}

console.log("=== Enhanced Features ===");

// 2. Cookie expiry detection per platform
var { isCookieExpired } = require("../src/base-adapter");
t("isCookieExpired exported", function() { eq(typeof isCookieExpired, "function"); });

t("douyin: 401 is expired", function() { eq(isCookieExpired({code:401},"douyin"), true); });
t("douyin: 200 is not expired", function() { eq(isCookieExpired({code:200},"douyin"), false); });
t("douyin: login message is expired", function() {
  eq(isCookieExpired({msg:"\u767b\u5f55\u5df2\u5931\u6548"},"douyin"), true);
});
t("kuaishou: result=1 is expired", function() {
  eq(isCookieExpired({data:{result:1}},"kuaishou"), true);
});
t("kuaishou: result=0 is not expired", function() {
  eq(isCookieExpired({data:{result:0}},"kuaishou"), false);
});
t("zhihu: not_logged_in is expired", function() {
  eq(isCookieExpired({error:{code:"not_logged_in"}},"zhihu"), true);
});
t("xiaohongshu: need_login is expired", function() {
  eq(isCookieExpired({msg:"\u64cd\u4f5c\u8fc7\u4e8e\u9891\u7e41", code:-1},"xiaohongshu"), false);
  eq(isCookieExpired({msg:"\u8bf7\u5148\u767b\u5f55"},"xiaohongshu"), true);
});
t("unknown platform: default to 401/403 check", function() {
  eq(isCookieExpired({status:401},"unknown"), true);
  eq(isCookieExpired({status:403},"unknown"), true);
  eq(isCookieExpired({status:200},"unknown"), false);
});

// 3. Rich text placeholder system
var { replacePlaceholders } = require("../src/content-formatter");
t("replacePlaceholders exported", function() { eq(typeof replacePlaceholders, "function"); });

t("replaces topic placeholder", function() {
  var r = replacePlaceholders("hello {tmp_h_1}", ["\u65c5\u884c"], []);
  eq(r.text.indexOf("#\u65c5\u884c#") >= 0, true);
});
t("replaces mention placeholder", function() {
  var r = replacePlaceholders("hello {tmp_f_1}", [], ["\u5c0f\u660e"]);
  eq(r.text.indexOf("@\u5c0f\u660e") >= 0, true);
});
t("replaces multiple placeholders", function() {
  var r = replacePlaceholders("{tmp_h_1} and {tmp_f_1}", ["A"], ["B"]);
  eq(r.text.indexOf("#A#") >= 0, true);
  eq(r.text.indexOf("@B") >= 0, true);
});
t("no placeholders returns unchanged", function() {
  eq(replacePlaceholders("hello world", [], []).text, "hello world");
});
t("returns topics and mentions arrays", function() {
  var r = replacePlaceholders("{tmp_h_1} @{tmp_f_1}", ["tag1"], ["user1"]);
  eq(Array.isArray(r.topics), true);
  eq(Array.isArray(r.mentions), true);
});

// 4. Comment auto-reply service - verify polling framework
var { CommentMessageService, EchoReplyGenerator, TemplateReplyGenerator } = require("../src/comment-service");
t("EchoReplyGenerator generates reply", function() {
  var g = new EchoReplyGenerator();
  var r = g.generateReply({content:"hello", author:"test"});
  eq(typeof r, "string");
  eq(r.indexOf("hello") >= 0, true);
});
t("TemplateReplyGenerator uses template", function() {
  var g = new TemplateReplyGenerator({template:"{author} said {content}"});
  var r = g.generateReply({content:"hi", author:"user"});
  eq(r, "user said hi");
});

// 5. Anti-detection randomization
var { randomUA, randomDelay, buildBrowserFingerprint } = require("../src/base-adapter");
t("randomUA exported", function() { eq(typeof randomUA, "function"); });
t("randomUA returns string", function() {
  var ua = randomUA();
  eq(typeof ua, "string");
  eq(ua.length > 20, true);
});
t("randomUA varies between calls", function() {
  var uas = new Set();
  for(var i=0;i<5;i++) uas.add(randomUA());
  eq(uas.size > 1, true);
});
t("randomDelay returns promise and resolves", async function() {
  var start = Date.now();
  await randomDelay(10, 20);
  var elapsed = Date.now() - start;
  eq(elapsed >= 10 && elapsed < 1000, true);
});
t("buildBrowserFingerprint returns object", function() {
  var fp = buildBrowserFingerprint();
  eq(typeof fp, "object");
  eq(typeof fp.screen_width, "string");
  eq(typeof fp.timezone_name, "string");
  eq(typeof fp.browser_language, "string");
});

console.log("\n========== "+p+"/"+(p+f)+" ==========");
if(f) process.exit(1);
