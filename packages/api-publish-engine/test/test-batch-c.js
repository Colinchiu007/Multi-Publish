// TDD: Batch C 平台适配器结构测试
// 先写测试，再实现
const assert = require("assert");

const platforms = [
  { name: "weishi", display: "WeiShi", apiBase: "https://media.weishi.qq.com", entry: "https://media.weishi.qq.com" }
, { name: "yidianhao", display: "YiDianHao", apiBase: "https://mp.yidianzixun.com", entry: "https://mp.yidianzixun.com" }
, { name: "souhu_shipin", display: "SouhuShipin", apiBase: "https://tv.sohu.com", entry: "https://tv.sohu.com" }
, { name: "pipixia", display: "PiPiXia", apiBase: "https://pipix.com", entry: "https://pipix.com/mp/upload" }
, { name: "meipai", display: "MeiPai", apiBase: "https://www.meipai.com", entry: "https://www.meipai.com" }
, { name: "acfun", display: "AcFun", apiBase: "https://member.acfun.cn", entry: "https://member.acfun.cn" }
, { name: "dewu", display: "DeWu", apiBase: "https://creator.dewu.com", entry: "https://creator.dewu.com/release" }
, { name: "chejiahao", display: "CheJiaHao", apiBase: "https://creator.autohome.com.cn", entry: "https://creator.autohome.com.cn" }
, { name: "yichehao", display: "YiCheHao", apiBase: "https://baa.yiche.com", entry: "https://baa.yiche.com" }
, { name: "meiyou", display: "MeiYou", apiBase: "https://mp.meiyou.com", entry: "https://mp.meiyou.com" }
, { name: "xhs_shangjia", display: "XhsShangjia", apiBase: "https://ark.xiaohongshu.com", entry: "https://ark.xiaohongshu.com" }
, { name: "xigua", display: "XiGua", apiBase: "https://ixigua.com", entry: "https://ixigua.com" }
, { name: "duoduo", display: "DuoDuo", apiBase: "https://live.pinduoduo.com", entry: "https://live.pinduoduo.com" }
];

platforms.forEach(p => {
  const AdapterClass = require("../src/adapters/" + p.name);
  const inst = new AdapterClass();
  assert(inst.name === p.name, p.name + " name mismatch");
  assert(typeof inst.publish === "function", p.name + " missing publish");
  assert(typeof inst.getReferer === "function", p.name + " missing getReferer");
  console.log("  [PASS] " + p.name);
});

console.log("All Batch C adapters structure OK");