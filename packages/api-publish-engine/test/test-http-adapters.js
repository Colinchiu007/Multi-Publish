// TDD: HTTP Adapter upload integration tests
const assert = require("assert");

const httpAdapters = [
  "acfun", "aiqiyi", "baijiahao", "bilibili", "chejiahao", "dayu",
  "douyin", "duoduo", "kuaishou", "meipai", "meiyou", "pipixia",
  "qiehao", "souhu", "souhu_shipin", "tengxun_shipin", "toutiao",
  "wangyi", "wechat_mp", "weibo", "weishi", "xhs_shangjia", "xigua", "yichehao"
];

let pass = 0;
httpAdapters.forEach(name => {
  try {
    const AdapterClass = require("../src/adapters/" + name);
    const inst = new AdapterClass();
    assert(typeof inst.publish === "function", name + " missing publish");
    assert(typeof inst.getReferer === "function", name + " missing getReferer");
    assert(typeof inst.uploadVideo === "function", name + " missing uploadVideo");
    assert(typeof inst.uploadCover === "function", name + " missing uploadCover");
    assert(inst.name === name, name + " name mismatch");
    pass++;
    console.log("  [PASS] " + name);
  } catch(e) {
    console.log("  [FAIL] " + name + ": " + e.message);
  }
});

console.log("\n" + (pass === httpAdapters.length ? "All" : pass + "/" + httpAdapters.length) + " HTTP adapter tests " + (pass === httpAdapters.length ? "PASSED" : "FAILED"));
