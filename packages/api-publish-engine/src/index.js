const ZhihuAdapter = require("./adapters/zhihu");
const DouyinAdapter = require("./adapters/douyin");
const XiaohongshuAdapter = require("./adapters/xiaohongshu");
const ShipinhaoAdapter = require("./adapters/shipinhao");
const KuaishouAdapter = require("./adapters/kuaishou");
const BaijiahaoAdapter = require("./adapters/baijiahao");
const WechatMpAdapter = require("./adapters/wechat_mp");
const BilibiliAdapter = require("./adapters/bilibili");
const WeiboAdapter = require("./adapters/weibo");
const ToutiaoAdapter = require("./adapters/toutiao");
const AiqiyiAdapter = require("./adapters/aiqiyi");
const DayuAdapter = require("./adapters/dayu");
const QiehaoAdapter = require("./adapters/qiehao");
const SouhuAdapter = require("./adapters/souhu");
const WangyiAdapter = require("./adapters/wangyi");
const TengxunShipinAdapter = require("./adapters/tengxun_shipin");

const REGISTRY = {
  zhihu: ZhihuAdapter,
  douyin: DouyinAdapter,
  xiaohongshu: XiaohongshuAdapter,
  tencent_video: ShipinhaoAdapter,
  kuaishou: KuaishouAdapter,
  baijiahao: BaijiahaoAdapter,
  wechat_mp: WechatMpAdapter,
  bilibili: BilibiliAdapter,
  weibo: WeiboAdapter,
  toutiao: ToutiaoAdapter,
  aiqiyi: AiqiyiAdapter,
  dayu: DayuAdapter,
  qiehao: QiehaoAdapter,
  souhu: SouhuAdapter,
  wangyi: WangyiAdapter,
  tengxun_shipin: TengxunShipinAdapter,
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
