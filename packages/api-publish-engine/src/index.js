const REGISTRY = {
  zhihu: require("./adapters/zhihu"),
  douyin: require("./adapters/douyin"),
  xiaohongshu: require("./adapters/xiaohongshu"),
  tencent_video: require("./adapters/shipinhao"),
  kuaishou: require("./adapters/kuaishou"),
  baijiahao: require("./adapters/baijiahao"),
  wechat_mp: require("./adapters/wechat_mp"),
  bilibili: require("./adapters/bilibili"),
  weibo: require("./adapters/weibo"),
  toutiao: require("./adapters/toutiao"),
  aiqiyi: require("./adapters/aiqiyi"),
  dayu: require("./adapters/dayu"),
  qiehao: require("./adapters/qiehao"),
  souhu: require("./adapters/souhu"),
  wangyi: require("./adapters/wangyi"),
  tengxun_shipin: require("./adapters/tengxun_shipin"),
  weishi: require("./adapters/weishi"),
  yidianhao: require("./adapters/yidianhao"),
  souhu_shipin: require("./adapters/souhu_shipin"),
  pipixia: require("./adapters/pipixia"),
  meipai: require("./adapters/meipai"),
  acfun: require("./adapters/acfun"),
  dewu: require("./adapters/dewu"),
  chejiahao: require("./adapters/chejiahao"),
  yichehao: require("./adapters/yichehao"),
  meiyou: require("./adapters/meiyou"),
  xhs_shangjia: require("./adapters/xhs_shangjia"),
  xigua: require("./adapters/xigua"),
  duoduo: require("./adapters/duoduo"),
};

function getAdapter(p) { var C = REGISTRY[p]; return C ? new C() : null; }
function supportsApi(p) { return !!REGISTRY[p]; }

async function publishViaApi(platform, taskData, cookie, opts) {
  var adapter = getAdapter(platform);
  if (!adapter) throw new Error("No API adapter for platform: " + platform);
  var result = await adapter.execute(taskData, cookie, opts);
  if (!result || !result.success) throw new Error((result && result.error) || "API publish failed for " + platform);
  return result;
}

module.exports = { getAdapter, supportsApi, publishViaApi, REGISTRY };
