// Platform-specific HTTP upload endpoint configurations
// Extracted from 参考产品 4.0 reverse engineering analysis

// ⚠️ 2026-10-06 更正：uploadType 此前对 22 个平台标注 "chunk"，但
// providers/http-provider.js 的实现是「整文件 fs.readFileSync + 单次 POST」，
// **没有任何分片逻辑**。标注与实现不符 ⇒ 任何据该字段判断「该平台支持分片上传」
// 的下游（文档、盘点、路由决策）都会得出错误结论。
// 本仓无这批平台的分片协议取证切片，故不编造实现，改为如实标注 "single-post"。
// 真正实现分片的是 publish/platforms/ 下的新链（视频号 8MiB、B站 8MiB、
// 快手 fragment、抖音 aws4 分片），它们不走本文件。
const PLATFORM_CONFIG = {
  douyin: {
    uploadType: "single-post",
    apiDomain: "creator.douyin.com",
    uploadPath: "/web/api/media/aweme/upload/",
    referer: "https://creator.douyin.com/creator-micro/home",
    contentType: "video/mp4",
    needsSigning: true,
    signType: "douyin_signature"
  },
  kuaishou: {
    uploadType: "single-post",
    apiDomain: "cp.kuaishou.com",
    uploadPath: "/rest/cp/works/v2/video/pc/upload/finish",
    referer: "https://cp.kuaishou.com/article/publish/video",
    contentType: "video/mp4",
    needsSigning: true,
    signType: "kuaishou_signature"
  },
  baijiahao: {
    uploadType: "form",
    apiDomain: "baijiahao.baidu.com",
    uploadPath: "/api/video/upload",
    referer: "https://baijiahao.baidu.com/builder/rc/edit",
    contentType: "multipart/form-data"
  },
  bilibili: {
    uploadType: "single-post",
    apiDomain: "member.bilibili.com",
    uploadPath: "/api/video/upload",
    referer: "https://member.bilibili.com/platform/upload/video/frame",
    contentType: "video/mp4"
  },
  weibo: {
    uploadType: "single-post",
    apiDomain: "weibo.com",
    uploadPath: "/upload/video",
    referer: "https://weibo.com/upload/channel",
    contentType: "video/mp4"
  },
  toutiao: {
    uploadType: "single-post",
    apiDomain: "mp.toutiao.com",
    uploadPath: "/profile_v4/xigua/upload-video",
    referer: "https://mp.toutiao.com/profile_v4/xigua/upload-video",
    contentType: "video/mp4"
  },
  wechat_mp: {
    uploadType: "form",
    apiDomain: "mp.weixin.qq.com",
    uploadPath: "/cgi-bin/fileupload",
    referer: "https://mp.weixin.qq.com/",
    contentType: "multipart/form-data"
  },
  aiqiyi: {
    uploadType: "single-post",
    apiDomain: "mp.iqiyi.com",
    uploadPath: "/wemedia/publish/video/upload",
    referer: "https://mp.iqiyi.com/wemedia/publish/video",
    contentType: "video/mp4"
  },
  dayu: {
    uploadType: "single-post",
    apiDomain: "mp.dayu.com",
    uploadPath: "/dashboard/video/upload",
    referer: "https://mp.dayu.com/dashboard/video/write",
    contentType: "video/mp4"
  },
  qiehao: {
    uploadType: "single-post",
    apiDomain: "om.qq.com",
    uploadPath: "/main/creation/video/upload",
    referer: "https://om.qq.com/main/creation/video",
    contentType: "video/mp4"
  },
  souhu: {
    uploadType: "single-post",
    apiDomain: "mp.sohu.com",
    uploadPath: "/mpfe/v4/content/uploadVideo",
    referer: "https://mp.sohu.com/mpfe/v4/contentManagement",
    contentType: "video/mp4"
  },
  wangyi: {
    uploadType: "single-post",
    apiDomain: "mp.163.com",
    uploadPath: "/subscribe_v4/video/upload",
    referer: "https://mp.163.com/subscribe_v4",
    contentType: "video/mp4"
  },
  tengxun_shipin: {
    uploadType: "single-post",
    apiDomain: "mp.v.qq.com",
    uploadPath: "/publishVideo/upload",
    referer: "https://mp.v.qq.com/publishVideo",
    contentType: "video/mp4"
  },
  weishi: {
    uploadType: "single-post",
    apiDomain: "media.weishi.qq.com",
    uploadPath: "/api/upload",
    referer: "https://media.weishi.qq.com",
    contentType: "video/mp4"
  },
  souhu_shipin: {
    uploadType: "single-post",
    apiDomain: "tv.sohu.com",
    uploadPath: "/api/upload/video",
    referer: "https://tv.sohu.com",
    contentType: "video/mp4"
  },
  pipixia: {
    uploadType: "single-post",
    apiDomain: "pipix.com",
    uploadPath: "/mp/upload/video",
    referer: "https://pipix.com/mp/upload",
    contentType: "video/mp4"
  },
  meipai: {
    uploadType: "single-post",
    apiDomain: "www.meipai.com",
    uploadPath: "/api/upload/video",
    referer: "https://www.meipai.com",
    contentType: "video/mp4"
  },
  acfun: {
    uploadType: "single-post",
    apiDomain: "member.acfun.cn",
    uploadPath: "/api/upload/video",
    referer: "https://member.acfun.cn",
    contentType: "video/mp4"
  },
  chejiahao: {
    uploadType: "single-post",
    apiDomain: "creator.autohome.com.cn",
    uploadPath: "/api/video/upload",
    referer: "https://creator.autohome.com.cn",
    contentType: "video/mp4"
  },
  yichehao: {
    uploadType: "single-post",
    apiDomain: "baa.yiche.com",
    uploadPath: "/api/video/upload",
    referer: "https://baa.yiche.com",
    contentType: "video/mp4"
  },
  meiyou: {
    uploadType: "single-post",
    apiDomain: "mp.meiyou.com",
    uploadPath: "/api/upload",
    referer: "https://mp.meiyou.com",
    contentType: "video/mp4"
  },
  xhs_shangjia: {
    uploadType: "single-post",
    apiDomain: "ark.xiaohongshu.com",
    uploadPath: "/api/upload/video",
    referer: "https://ark.xiaohongshu.com",
    contentType: "video/mp4"
  },
  xigua: {
    uploadType: "single-post",
    apiDomain: "ixigua.com",
    uploadPath: "/api/upload/video",
    referer: "https://ixigua.com",
    contentType: "video/mp4"
  },
  duoduo: {
    uploadType: "single-post",
    apiDomain: "live.pinduoduo.com",
    uploadPath: "/api/upload",
    referer: "https://live.pinduoduo.com",
    contentType: "video/mp4"
  }
};

function getPlatformConfig(platform) {
  return PLATFORM_CONFIG[platform] || null;
}

module.exports = { PLATFORM_CONFIG, getPlatformConfig };
