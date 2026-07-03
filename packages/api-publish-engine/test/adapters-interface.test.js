/**
 * Adapter interface batch test
 * Tests that all 29 platform adapters construct, export, and respond to execute()
 */
const acfunAdapter = require("../src/adapters/acfun");
const aiqiyiAdapter = require("../src/adapters/aiqiyi");
const baijiahaoAdapter = require("../src/adapters/baijiahao");
const bilibiliAdapter = require("../src/adapters/bilibili");
const chejiahaoAdapter = require("../src/adapters/chejiahao");
const dayuAdapter = require("../src/adapters/dayu");
const dewuAdapter = require("../src/adapters/dewu");
const douyinAdapter = require("../src/adapters/douyin");
const duoduoAdapter = require("../src/adapters/duoduo");
const kuaishouAdapter = require("../src/adapters/kuaishou");
const meipaiAdapter = require("../src/adapters/meipai");
const meiyouAdapter = require("../src/adapters/meiyou");
const pipixiaAdapter = require("../src/adapters/pipixia");
const qiehaoAdapter = require("../src/adapters/qiehao");
const shipinhaoAdapter = require("../src/adapters/shipinhao");
const souhuAdapter = require("../src/adapters/souhu");
const souhu_shipinAdapter = require("../src/adapters/souhu_shipin");
const tengxun_shipinAdapter = require("../src/adapters/tengxun_shipin");
const toutiaoAdapter = require("../src/adapters/toutiao");
const wangyiAdapter = require("../src/adapters/wangyi");
const wechat_mpAdapter = require("../src/adapters/wechat_mp");
const weiboAdapter = require("../src/adapters/weibo");
const weishiAdapter = require("../src/adapters/weishi");
const xhs_shangjiaAdapter = require("../src/adapters/xhs_shangjia");
const xiaohongshuAdapter = require("../src/adapters/xiaohongshu");
const xiguaAdapter = require("../src/adapters/xigua");
const yichehaoAdapter = require("../src/adapters/yichehao");
const yidianhaoAdapter = require("../src/adapters/yidianhao");
const zhihuAdapter = require("../src/adapters/zhihu");

const ALL = [
  { name: "acfun", Ctor: acfunAdapter },
  { name: "aiqiyi", Ctor: aiqiyiAdapter },
  { name: "baijiahao", Ctor: baijiahaoAdapter },
  { name: "bilibili", Ctor: bilibiliAdapter },
  { name: "chejiahao", Ctor: chejiahaoAdapter },
  { name: "dayu", Ctor: dayuAdapter },
  { name: "dewu", Ctor: dewuAdapter },
  { name: "douyin", Ctor: douyinAdapter },
  { name: "duoduo", Ctor: duoduoAdapter },
  { name: "kuaishou", Ctor: kuaishouAdapter },
  { name: "meipai", Ctor: meipaiAdapter },
  { name: "meiyou", Ctor: meiyouAdapter },
  { name: "pipixia", Ctor: pipixiaAdapter },
  { name: "qiehao", Ctor: qiehaoAdapter },
  { name: "shipinhao", Ctor: shipinhaoAdapter },
  { name: "souhu", Ctor: souhuAdapter },
  { name: "souhu_shipin", Ctor: souhu_shipinAdapter },
  { name: "tengxun_shipin", Ctor: tengxun_shipinAdapter },
  { name: "toutiao", Ctor: toutiaoAdapter },
  { name: "wangyi", Ctor: wangyiAdapter },
  { name: "wechat_mp", Ctor: wechat_mpAdapter },
  { name: "weibo", Ctor: weiboAdapter },
  { name: "weishi", Ctor: weishiAdapter },
  { name: "xhs_shangjia", Ctor: xhs_shangjiaAdapter },
  { name: "xiaohongshu", Ctor: xiaohongshuAdapter },
  { name: "xigua", Ctor: xiguaAdapter },
  { name: "yichehao", Ctor: yichehaoAdapter },
  { name: "yidianhao", Ctor: yidianhaoAdapter },
  { name: "zhihu", Ctor: zhihuAdapter },
];

describe("Platform Adapters", function() {
  var adapters;

  beforeAll(function() {
    adapters = ALL.map(function(a) { return { name: a.name, instance: new a.Ctor() }; });
  });

  test("all 29 adapters construct without error", function() {
    expect(adapters.length).toBe(29);
    adapters.forEach(function(a) {
      expect(a.instance).not.toBeNull();
    });
  });

  test("execute returns result for null input", async function() {
    for (var i = 0; i < adapters.length; i++) {
      var result = await adapters[i].instance.execute(null, null, { dryRun: true });
      expect(result).not.toBeNull();
    }
  });

});
