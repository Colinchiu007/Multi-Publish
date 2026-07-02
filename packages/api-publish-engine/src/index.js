const ZhihuAdapter = require("./adapters/zhihu");
const DouyinAdapter = require("./adapters/douyin");
const XiaohongshuAdapter = require("./adapters/xiaohongshu");
const ShipinhaoAdapter = require("./adapters/shipinhao");
const KuaishouAdapter = require("./adapters/kuaishou");
const BaijiahaoAdapter = require("./adapters/baijiahao");

const REGISTRY = {
  zhihu: ZhihuAdapter,
  douyin: DouyinAdapter,
  xiaohongshu: XiaohongshuAdapter,
  tencent_video: ShipinhaoAdapter,
  kuaishou: KuaishouAdapter,
  baijiahao: BaijiahaoAdapter,
};

function getAdapter(platform) {
  const AdapterClass = REGISTRY[platform];
  if (!AdapterClass) return null;
  return new AdapterClass();
}

function supportsApi(platform) {
  return !!REGISTRY[platform];
}

async function publishViaApi(platform, taskData, cookie, opts) {
  const adapter = getAdapter(platform);
  if (!adapter) throw new Error("No API adapter for platform: " + platform);
  return adapter.execute(taskData, cookie, opts);
}

module.exports = { getAdapter, supportsApi, publishViaApi, REGISTRY };
