/**
 * 发布器注册中心 — 平台 → 类映射
 * 加新平台只需要在这里注册一行
 */
const WeChatMPPublisher = require('./wechat-mp-rpa')
const ZhihuPublisher = require('./zhihu-rpa')
const WeiboPublisher = require('./weibo-rpa')
const DouyinPublisher = require('./douyin-rpa')
const XiaohongshuPublisher = require('./xiaohongshu-rpa')
const TencentVideoPublisher = require('./tencent-video-rpa')
const KuaishouPublisher = require('./kuaishou-rpa')
const ToutiaoPublisher = require('./toutiao-rpa')
const YouTubePublisher = require('./youtube-rpa')
const TikTokPublisher = require('./tiktok-rpa')

const registry = {
  wechat_mp: WeChatMPPublisher,
  zhihu: ZhihuPublisher,
  weibo: WeiboPublisher,
  douyin: DouyinPublisher,
  xiaohongshu: XiaohongshuPublisher,
  tencent_video: TencentVideoPublisher,
  kuaishou: KuaishouPublisher,
  toutiao: ToutiaoPublisher,
  youtube: YouTubePublisher,
  tiktok: TikTokPublisher,
}

/**
 * 获取指定平台的发布器类
 * @param {string} platform - 平台标识
 * @returns {typeof import('./base-rpa-publisher')} 发布器类
 */
function getPublisherClass (platform) {
  const cls = registry[platform]
  if (!cls) {
    throw new Error(`不支持的平台: ${platform}`)
  }
  return cls
}

/**
 * 获取所有已注册的平台 ID
 * @returns {string[]}
 */
function listPlatforms () {
  return Object.keys(registry)
}

module.exports = { getPublisherClass, listPlatforms }